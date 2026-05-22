//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { WorldNode } from "../../libs/vanilla.js/src/core/node/worldnode.js";
import { Object } from "../../libs/vanilla.js/src/base/object.js";
import { AudioBeepPlayer } from "../base/audiobeepplayer.js";


//==============================================================================
// 상수.
//==============================================================================
const CHOICE_LABEL_FONT = "16px sans-serif";
const CHOICE_BUTTON_FONT = "22px sans-serif";
const CHOICE_BUTTON_WIDTH_RATIO = 0.78;
const CHOICE_BUTTON_HEIGHT = 88;
const CHOICE_BUTTON_GAP = 22;

// DialoguePartNode 의 TEXTBOX_HEIGHT(260) + TEXTBOX_BOTTOM_MARGIN(32) 와 일치.
// 대사창 위쪽 여백을 선택지 영역으로 사용.
const DIALOG_BOX_RESERVED_HEIGHT = 292;
const CHOICE_BOTTOM_MARGIN = 36;
const CHOICE_LABEL_GAP = 14;


//==============================================================================
// 선택지 단일 행 (choicetable.json 의 한 줄).
//==============================================================================
class ChoiceLine extends Object {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @type { number } */ id;
	/** @type { string } */ branch;
	/** @type { number } */ sequence;
	/** @type { string } */ label;
	/** @type { string } */ nextScene;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor(id, branch, sequence, label, nextScene) {
		super();
		this.id = id;
		this.branch = branch;
		this.sequence = sequence;
		this.label = label;
		this.nextScene = nextScene;
	}
}


//==============================================================================
// 선택지 버튼 hit-test 영역.
//==============================================================================
class ChoiceButtonLayout extends Object {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @type { ChoiceLine } */ choiceLine;
	/** @type { number } */ x;
	/** @type { number } */ y;
	/** @type { number } */ width;
	/** @type { number } */ height;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor(choiceLine, x, y, width, height) {
		super();
		this.choiceLine = choiceLine;
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
	}
}


//==============================================================================
// 선택지 파트.
// - 외부에서 choicetable 의 모든 행을 setChoices 로 받아둠.
// - playBranch(branchName) 으로 특정 분기의 선택지들만 sequence 순으로 추출.
// - 사용자가 한 선택지를 클릭하면 onSelected(choiceLine) 콜백을 호출.
//==============================================================================
export class ChoicePartNode extends WorldNode {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @private @type { ChoiceLine[] } */ #allChoices;
	/** @private @type { ChoiceLine[] } */ #branchChoices;
	/** @private @type { string } */ #currentBranch;
	/** @private @type { string } */ #promptText;
	/** @private @type { ChoiceButtonLayout[] } */ #choiceButtonLayouts;
	/** @private @type { number } */ #hoveredIndex;
	/** @private @type { boolean } */ #wasTouchPressed;
	/** @private @type { boolean } */ #wasUpKeyPressed;
	/** @private @type { boolean } */ #wasDownKeyPressed;
	/** @private @type { boolean } */ #wasConfirmKeyPressed;
	/** @private @type { number } */ #elapsedTime;
	/** @private @type { ((choiceLine: ChoiceLine) => void) | null } */ #onSelected;
	/** @private @type { AudioBeepPlayer | null } */ #audioBeepPlayer;
	/** @private @type { InputManager | null } */ #inputManager;
	/** @private @type { { x: number, y: number, width: number, height: number } | null } */ #popupRect;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
		this.#allChoices = [];
		this.#branchChoices = [];
		this.#currentBranch = "";
		this.#promptText = "";
		this.#choiceButtonLayouts = [];
		this.#hoveredIndex = 0;
		this.#wasTouchPressed = false;
		this.#wasUpKeyPressed = false;
		this.#wasDownKeyPressed = false;
		this.#wasConfirmKeyPressed = false;
		this.#elapsedTime = 0;
		this.#onSelected = null;
		this.#audioBeepPlayer = null;
		this.#inputManager = null;
		this.#popupRect = null;
	}

	//==============================================================================
	// 외부에서 선택지 테이블 (모든 행) 주입.
	//==============================================================================
	/**
	 * @param { Array<{ id: number, branch: string, sequence: number, label: string, nextScene: string }> } allChoices
	 */
	setChoices(allChoices) {
		const sourceArray = System.Array.isArray(allChoices) ? allChoices : [];
		const normalizedChoices = [];
		for (const sourceRow of sourceArray) {
			const rowId = typeof sourceRow.id === "number" ? sourceRow.id : 0;
			const rowBranch = typeof sourceRow.branch === "string" ? sourceRow.branch : "";
			const rowSequence = typeof sourceRow.sequence === "number" ? sourceRow.sequence : 0;
			const rowLabel = typeof sourceRow.label === "string" ? sourceRow.label : "";
			const rowNextScene = typeof sourceRow.nextScene === "string" ? sourceRow.nextScene : "";
			normalizedChoices.push(new ChoiceLine(rowId, rowBranch, rowSequence, rowLabel, rowNextScene));
		}
		this.#allChoices = normalizedChoices;
	}

	//==============================================================================
	// 특정 분기의 선택지들을 sequence 오름차순으로 추출.
	//==============================================================================
	/**
	 * @param { string } branchName
	 * @param { string } promptText
	 */
	playBranch(branchName, promptText) {
		this.#currentBranch = branchName;
		this.#promptText = promptText ? promptText : "";
		const allChoices = this.getAllChoices();
		const filtered = allChoices.filter((choiceLine) => choiceLine.branch === branchName);
		filtered.sort((leftChoice, rightChoice) => {
			const leftSequence = typeof leftChoice.sequence === "number" ? leftChoice.sequence : 0;
			const rightSequence = typeof rightChoice.sequence === "number" ? rightChoice.sequence : 0;
			return leftSequence - rightSequence;
		});
		this.#branchChoices = filtered;
		this.#hoveredIndex = 0;
		this.#wasTouchPressed = false;
		this.#wasUpKeyPressed = false;
		this.#wasDownKeyPressed = false;
		this.#wasConfirmKeyPressed = false;
		this.#elapsedTime = 0;
	}

	//==============================================================================
	// 처음 상태로 되돌리기 — 현재 분기 다시 시작.
	//==============================================================================
	reset() {
		const currentBranch = this.getCurrentBranch();
		const promptText = this.getPromptText();
		if (currentBranch && currentBranch.length > 0) {
			this.playBranch(currentBranch, promptText);
		}
	}

	//==============================================================================
	// 입력 컨텍스트 주입.
	//==============================================================================
	/**
	 * @param { InputManager | null } inputManager
	 * @param { { x: number, y: number, width: number, height: number } | null } popupRect
	 */
	setInputContext(inputManager, popupRect) {
		this.#inputManager = inputManager;
		this.#popupRect = popupRect;
	}

	//==============================================================================
	// 선택 콜백 설정. 인자로 선택된 ChoiceLine 이 전달된다.
	//==============================================================================
	/**
	 * @param { ((choiceLine: ChoiceLine) => void) | null } callback
	 */
	setOnSelected(callback) {
		this.#onSelected = callback;
	}

	//==============================================================================
	// 선택 콜백 반환.
	//==============================================================================
	/**
	 * @returns { ((choiceLine: ChoiceLine) => void) | null }
	 */
	getOnSelected() {
		return this.#onSelected;
	}

	//==============================================================================
	// 갱신.
	//==============================================================================
	/**
	 * @override
	 * @param { number } timeDelta
	 */
	tick(timeDelta) {
		if (!this.isActive()) {
			return;
		}
		this.#elapsedTime += timeDelta;
		const inputManager = this.#inputManager;
		if (!inputManager) {
			return;
		}
		const branchChoices = this.getBranchChoices();
		if (branchChoices.length === 0) {
			return;
		}

		// 키보드 위/아래로 호버 인덱스 변경.
		const isUpKeyPressed = inputManager.isKeyPressed("ArrowUp") || inputManager.isKeyPressed("KeyW");
		const isDownKeyPressed = inputManager.isKeyPressed("ArrowDown") || inputManager.isKeyPressed("KeyS");
		const wasUpKeyPressed = this.#wasUpKeyPressed;
		const wasDownKeyPressed = this.#wasDownKeyPressed;
		const hoveredIndex = this.getHoveredIndex();
		if (isUpKeyPressed && !wasUpKeyPressed) {
			const newHoveredIndex = (hoveredIndex - 1 + branchChoices.length) % branchChoices.length;
			this.#hoveredIndex = newHoveredIndex;
			const hoverAudioBeepPlayer = this.getAudioBeepPlayer();
			if (hoverAudioBeepPlayer) {
				hoverAudioBeepPlayer.playClick();
			}
		}
		if (isDownKeyPressed && !wasDownKeyPressed) {
			const newHoveredIndex = (hoveredIndex + 1) % branchChoices.length;
			this.#hoveredIndex = newHoveredIndex;
			const hoverAudioBeepPlayer = this.getAudioBeepPlayer();
			if (hoverAudioBeepPlayer) {
				hoverAudioBeepPlayer.playClick();
			}
		}
		this.#wasUpKeyPressed = isUpKeyPressed;
		this.#wasDownKeyPressed = isDownKeyPressed;

		// 터치 / 마우스 hover (현재 좌표가 어떤 버튼 위인지 갱신).
		const viewInputPosition = inputManager.getViewInputPosition();
		const choiceButtonLayouts = this.getChoiceButtonLayouts();
		for (let layoutIndex = 0; layoutIndex < choiceButtonLayouts.length; ++layoutIndex) {
			const buttonLayout = choiceButtonLayouts[layoutIndex];
			const isInsideButton = this.isInsideRect(viewInputPosition, buttonLayout);
			if (isInsideButton) {
				const previousHoveredIndex = this.getHoveredIndex();
				if (previousHoveredIndex !== layoutIndex) {
					this.#hoveredIndex = layoutIndex;
				}
				break;
			}
		}

		// 입력 처리.
		const isTouchPressed = inputManager.isTouchPressed();
		const isConfirmKeyPressed = inputManager.isKeyPressed("Enter") || inputManager.isKeyPressed("Space");
		const wasTouchPressed = this.#wasTouchPressed;
		const wasConfirmKeyPressed = this.#wasConfirmKeyPressed;
		const isSelectJustPressed = (isTouchPressed && !wasTouchPressed) || (isConfirmKeyPressed && !wasConfirmKeyPressed);
		if (isSelectJustPressed) {
			let selectedIndex = -1;
			if (isTouchPressed && !wasTouchPressed) {
				for (let layoutIndex = 0; layoutIndex < choiceButtonLayouts.length; ++layoutIndex) {
					const buttonLayout = choiceButtonLayouts[layoutIndex];
					const isInsideButton = this.isInsideRect(viewInputPosition, buttonLayout);
					if (isInsideButton) {
						selectedIndex = layoutIndex;
						break;
					}
				}
			}
			else if (isConfirmKeyPressed && !wasConfirmKeyPressed) {
				selectedIndex = this.getHoveredIndex();
			}
			if (selectedIndex >= 0 && selectedIndex < branchChoices.length) {
				const selectedChoice = branchChoices[selectedIndex];
				const audioBeepPlayer = this.getAudioBeepPlayer();
				if (audioBeepPlayer) {
					audioBeepPlayer.playConfirm();
				}
				const onSelected = this.getOnSelected();
				if (onSelected) {
					onSelected(selectedChoice);
				}
			}
		}
		this.#wasTouchPressed = isTouchPressed;
		this.#wasConfirmKeyPressed = isConfirmKeyPressed;
	}

	//==============================================================================
	// 출력.
	// - 전체 화면을 가리지 않고, 대사창 바로 위 영역에 선택지 버튼을 스택으로 띄운다.
	// - 배경 / 캐릭터 / 대사창은 대사 파트가 그대로 그리고 있으므로 자연스럽게 비친다.
	//==============================================================================
	/**
	 * @override
	 * @param { Graphic } graphic
	 */
	draw(graphic) {
		if (!this.isActive()) {
			return;
		}
		const popupRect = this.#popupRect;
		if (!popupRect) {
			return;
		}
		const branchChoices = this.getBranchChoices();
		const numChoices = branchChoices.length;
		if (numChoices === 0) {
			return;
		}
		const canvasRenderingContext = graphic.getCanvasRenderingContext();

		const popupCenterX = popupRect.x + popupRect.width * 0.5;
		const buttonWidth = popupRect.width * CHOICE_BUTTON_WIDTH_RATIO;
		const totalChoicesHeight = numChoices * CHOICE_BUTTON_HEIGHT + (numChoices - 1) * CHOICE_BUTTON_GAP;
		const dialogBoxTopY = popupRect.y + popupRect.height - DIALOG_BOX_RESERVED_HEIGHT;
		const choiceAreaBottomY = dialogBoxTopY - CHOICE_BOTTOM_MARGIN;
		const choiceAreaTopY = choiceAreaBottomY - totalChoicesHeight;

		// 안내 라벨 (선택지 스택 위쪽).
		const elapsedTime = this.#elapsedTime;
		const labelPulseStrength = (System.Math.sin(elapsedTime * System.Math.PI * 2.0) + 1.0) * 0.5;
		const labelAlpha = 0.65 + labelPulseStrength * 0.30;
		canvasRenderingContext.fillStyle = `rgba(244, 232, 200, ${labelAlpha})`;
		canvasRenderingContext.font = CHOICE_LABEL_FONT;
		canvasRenderingContext.textAlign = "center";
		canvasRenderingContext.textBaseline = "bottom";
		const labelY = choiceAreaTopY - CHOICE_LABEL_GAP;
		canvasRenderingContext.fillText("▼ 선택해 주세요", popupCenterX, labelY);

		// 선택지 버튼.
		const newChoiceButtonLayouts = [];
		const hoveredIndex = this.getHoveredIndex();
		for (let choiceIndex = 0; choiceIndex < numChoices; ++choiceIndex) {
			const choiceLine = branchChoices[choiceIndex];
			const buttonX = popupCenterX - buttonWidth * 0.5;
			const buttonY = choiceAreaTopY + choiceIndex * (CHOICE_BUTTON_HEIGHT + CHOICE_BUTTON_GAP);
			const isHovered = hoveredIndex === choiceIndex;
			const pulseStrength = isHovered ? (System.Math.sin(elapsedTime * System.Math.PI * 2.0) + 1.0) * 0.5 : 0.0;

			// 그림자 (배경에 묻히지 않도록 살짝 띄움).
			canvasRenderingContext.fillStyle = "rgba(0, 0, 0, 0.45)";
			canvasRenderingContext.fillRect(buttonX + 4, buttonY + 5, buttonWidth, CHOICE_BUTTON_HEIGHT);

			// 버튼 본체.
			const buttonFillColor = isHovered ? `rgba(60, 48, 80, ${0.92 + pulseStrength * 0.06})` : "rgba(28, 24, 40, 0.92)";
			canvasRenderingContext.fillStyle = buttonFillColor;
			canvasRenderingContext.fillRect(buttonX, buttonY, buttonWidth, CHOICE_BUTTON_HEIGHT);
			const buttonStrokeColor = isHovered ? "#f4e8c8" : "#d4b46a";
			canvasRenderingContext.strokeStyle = buttonStrokeColor;
			canvasRenderingContext.lineWidth = isHovered ? 3 : 2;
			canvasRenderingContext.strokeRect(buttonX, buttonY, buttonWidth, CHOICE_BUTTON_HEIGHT);

			canvasRenderingContext.fillStyle = isHovered ? "#ffffff" : "#dddddd";
			canvasRenderingContext.font = CHOICE_BUTTON_FONT;
			canvasRenderingContext.textAlign = "center";
			canvasRenderingContext.textBaseline = "middle";
			canvasRenderingContext.fillText(choiceLine.label, buttonX + buttonWidth * 0.5, buttonY + CHOICE_BUTTON_HEIGHT * 0.5);

			newChoiceButtonLayouts.push(new ChoiceButtonLayout(choiceLine, buttonX, buttonY, buttonWidth, CHOICE_BUTTON_HEIGHT));
		}
		this.#choiceButtonLayouts = newChoiceButtonLayouts;
	}

	//==============================================================================
	// 좌표가 사각형 내부인지 검사.
	//==============================================================================
	/**
	 * @param { { x: number, y: number } } viewInputPosition
	 * @param { ChoiceButtonLayout } rect
	 * @returns { boolean }
	 */
	isInsideRect(viewInputPosition, rect) {
		const insideX = viewInputPosition.x >= rect.x && viewInputPosition.x <= rect.x + rect.width;
		const insideY = viewInputPosition.y >= rect.y && viewInputPosition.y <= rect.y + rect.height;
		return insideX && insideY;
	}

	//==============================================================================
	// 전체 선택지 행 반환.
	//==============================================================================
	/**
	 * @returns { ChoiceLine[] }
	 */
	getAllChoices() {
		return this.#allChoices;
	}

	//==============================================================================
	// 현재 분기 선택지 행 반환.
	//==============================================================================
	/**
	 * @returns { ChoiceLine[] }
	 */
	getBranchChoices() {
		return this.#branchChoices;
	}

	//==============================================================================
	// 현재 분기 이름 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getCurrentBranch() {
		return this.#currentBranch;
	}

	//==============================================================================
	// 프롬프트 텍스트 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getPromptText() {
		return this.#promptText;
	}

	//==============================================================================
	// 호버 중인 인덱스 반환.
	//==============================================================================
	/**
	 * @returns { number }
	 */
	getHoveredIndex() {
		return this.#hoveredIndex;
	}

	//==============================================================================
	// 선택지 버튼 레이아웃 목록 반환.
	//==============================================================================
	/**
	 * @returns { ChoiceButtonLayout[] }
	 */
	getChoiceButtonLayouts() {
		return this.#choiceButtonLayouts;
	}

	//==============================================================================
	// 오디오 비프 플레이어 설정.
	//==============================================================================
	/**
	 * @param { AudioBeepPlayer } audioBeepPlayer
	 */
	setAudioBeepPlayer(audioBeepPlayer) {
		this.#audioBeepPlayer = audioBeepPlayer;
	}

	//==============================================================================
	// 오디오 비프 플레이어 반환.
	//==============================================================================
	/**
	 * @returns { AudioBeepPlayer | null }
	 */
	getAudioBeepPlayer() {
		return this.#audioBeepPlayer;
	}
}


//==============================================================================
// 외부 사용을 위한 클래스 재공개.
//==============================================================================
export { ChoiceLine };
