//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { WorldNode } from "../../libs/vanilla.js/src/core/node/worldnode.js";
import { Object } from "../../libs/vanilla.js/src/base/object.js";
import { AudioBeepPlayer, BeepWaveform } from "../base/audiobeepplayer.js";
import { MountainSceneryNode } from "../base/mountainscenerynode.js";
import { CharacterSilhouetteNode } from "../base/charactersilhouettenode.js";


//==============================================================================
// 상수.
//==============================================================================
const SIDE_MARGIN = 24;
const TEXTBOX_HEIGHT = 260;
const TEXTBOX_BOTTOM_MARGIN = 32;
const NAME_BOX_HEIGHT = 44;
const NAME_BOX_PADDING_X = 22;
const NAME_BOX_MIN_WIDTH = 96;
const NAME_BOX_FONT = "bold 22px sans-serif";
const TEXT_FONT = "24px sans-serif";
const TYPING_CHARS_PER_SECOND = 32;
const FAST_FORWARD_SPEED_MULTIPLIER = 8;
const CONTINUE_ICON_BOB_AMPLITUDE = 4;
const CONTINUE_ICON_BOB_FREQUENCY = 1.6;
const CONTINUE_ICON_GAP = 12;


//==============================================================================
// 단일 대사 행 (dialoguetable.json 의 한 줄).
//==============================================================================
class DialogueLine extends Object {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @type { number } */ id;
	/** @type { string } */ scene;
	/** @type { number } */ sequence;
	/** @type { string } */ speaker;
	/** @type { string } */ text;
	/** @type { string } */ characterPreset;
	/** @type { string } */ timeOfDay;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor(id, scene, sequence, speaker, text, characterPreset, timeOfDay) {
		super();
		this.id = id;
		this.scene = scene;
		this.sequence = sequence;
		this.speaker = speaker;
		this.text = text;
		this.characterPreset = characterPreset;
		this.timeOfDay = timeOfDay;
	}
}


//==============================================================================
// 대사 파트.
// - 외부에서 dialoguetable 의 모든 행을 setDialogues 로 받아둠.
// - playScene(sceneName) 으로 특정 장면의 대사들만 sequence 순으로 추출해 시작.
// - 대사 한 줄씩 타이핑 효과로 출력 + 비프 효과음.
// - speaker 가 비어 있으면 나레이션 — 이름 박스를 출력하지 않는다.
// - characterPreset / timeOfDay 가 있으면 배경 / 캐릭터 외형을 자동 갱신.
// - 누르면 진행. 타이핑 중이면 즉시 완성, 완성이면 다음 대사. 마지막 다음엔 isFinished = true.
//==============================================================================
export class DialoguePartNode extends WorldNode {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @private @type { DialogueLine[] } */ #allDialogues;
	/** @private @type { DialogueLine[] } */ #dialogues;
	/** @private @type { string } */ #currentScene;
	/** @private @type { number } */ #currentIndex;
	/** @private @type { number } */ #revealedChars;
	/** @private @type { boolean } */ #isFinished;
	/** @private @type { boolean } */ #wasTouchPressed;
	/** @private @type { boolean } */ #wasConfirmKeyPressed;
	/** @private @type { boolean } */ #hasReceivedFirstInput;
	/** @private @type { number } */ #elapsedTime;
	/** @private @type { string } */ #appliedTimeOfDay;
	/** @private @type { string } */ #appliedCharacterPreset;
	/** @private @type { AudioBeepPlayer | null } */ #audioBeepPlayer;
	/** @private @type { InputManager | null } */ #inputManager;
	/** @private @type { { x: number, y: number, width: number, height: number } | null } */ #popupRect;
	/** @private @type { MountainSceneryNode } */ #mountainSceneryNode;
	/** @private @type { CharacterSilhouetteNode } */ #characterSilhouetteNode;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
		this.#allDialogues = [];
		this.#dialogues = [];
		this.#currentScene = "";
		this.#currentIndex = 0;
		this.#revealedChars = 0;
		this.#isFinished = false;
		this.#wasTouchPressed = false;
		this.#wasConfirmKeyPressed = false;
		this.#hasReceivedFirstInput = false;
		this.#elapsedTime = 0;
		this.#appliedTimeOfDay = "";
		this.#appliedCharacterPreset = "";
		this.#audioBeepPlayer = null;
		this.#inputManager = null;
		this.#popupRect = null;
		this.#mountainSceneryNode = new MountainSceneryNode();
		this.#characterSilhouetteNode = new CharacterSilhouetteNode();
	}

	//==============================================================================
	// 외부에서 대사 테이블 (모든 행) 주입. plain object 배열을 DialogueLine 배열로 정규화.
	//==============================================================================
	/**
	 * @param { Array<{ id: number, scene: string, sequence: number, speaker: string, text: string, characterPreset?: string, timeOfDay?: string }> } allDialogues
	 */
	setDialogues(allDialogues) {
		const sourceArray = System.Array.isArray(allDialogues) ? allDialogues : [];
		const normalizedDialogues = [];
		for (const sourceRow of sourceArray) {
			const rowId = typeof sourceRow.id === "number" ? sourceRow.id : 0;
			const rowScene = typeof sourceRow.scene === "string" ? sourceRow.scene : "";
			const rowSequence = typeof sourceRow.sequence === "number" ? sourceRow.sequence : 0;
			const rowSpeaker = typeof sourceRow.speaker === "string" ? sourceRow.speaker : "";
			const rowText = typeof sourceRow.text === "string" ? sourceRow.text : "";
			const rowCharacterPreset = typeof sourceRow.characterPreset === "string" ? sourceRow.characterPreset : "";
			const rowTimeOfDay = typeof sourceRow.timeOfDay === "string" ? sourceRow.timeOfDay : "";
			normalizedDialogues.push(new DialogueLine(rowId, rowScene, rowSequence, rowSpeaker, rowText, rowCharacterPreset, rowTimeOfDay));
		}
		this.#allDialogues = normalizedDialogues;
		const currentScene = this.getCurrentScene();
		if (currentScene && currentScene.length > 0) {
			this.playScene(currentScene);
		}
	}

	//==============================================================================
	// 특정 장면의 대사들을 sequence 오름차순으로 추출해 처음부터 시작.
	//==============================================================================
	/**
	 * @param { string } sceneName
	 */
	playScene(sceneName) {
		this.#currentScene = sceneName;
		const allDialogues = this.getAllDialogues();
		const filtered = allDialogues.filter((dialogueLine) => dialogueLine.scene === sceneName);
		filtered.sort((leftLine, rightLine) => {
			const leftSequence = typeof leftLine.sequence === "number" ? leftLine.sequence : 0;
			const rightSequence = typeof rightLine.sequence === "number" ? rightLine.sequence : 0;
			return leftSequence - rightSequence;
		});
		this.#dialogues = filtered;
		this.#currentIndex = 0;
		this.#revealedChars = 0;
		this.#isFinished = filtered.length === 0;
		this.#wasTouchPressed = false;
		this.#wasConfirmKeyPressed = false;
		this.applyDialogueAppearance();
	}

	//==============================================================================
	// 입력 컨텍스트 주입 (매 프레임 tick 전에 호출).
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
	// 처음으로 (현재 장면을 다시 처음부터). 장면이 비어 있으면 즉시 종료 상태.
	//==============================================================================
	reset() {
		const dialogues = this.getDialogues();
		this.#currentIndex = 0;
		this.#revealedChars = 0;
		this.#isFinished = dialogues.length === 0;
		this.#wasTouchPressed = false;
		this.#wasConfirmKeyPressed = false;
		this.applyDialogueAppearance();
	}

	//==============================================================================
	// 외부에서 이미 첫 사용자 제스처를 받은 경우 호출.
	// 호출 시 "▼ 클릭하여 시작" 대기 상태를 건너뛰고 즉시 타이핑이 시작된다.
	//==============================================================================
	markFirstInputReceived() {
		this.#hasReceivedFirstInput = true;
	}

	//==============================================================================
	// 종료 여부 (모든 대사 끝남).
	//==============================================================================
	/**
	 * @returns { boolean }
	 */
	isFinished() {
		return this.#isFinished;
	}

	//==============================================================================
	// 현재 재생 중인 (혹은 마지막으로 재생한) 씬 이름.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getCurrentScene() {
		return this.#currentScene;
	}

	//==============================================================================
	// 전체 대사 행 목록 반환.
	//==============================================================================
	/**
	 * @returns { DialogueLine[] }
	 */
	getAllDialogues() {
		return this.#allDialogues;
	}

	//==============================================================================
	// 현재 장면의 대사 행 목록 반환.
	//==============================================================================
	/**
	 * @returns { DialogueLine[] }
	 */
	getDialogues() {
		return this.#dialogues;
	}

	//==============================================================================
	// 현재 대사 인덱스 반환.
	//==============================================================================
	/**
	 * @returns { number }
	 */
	getCurrentIndex() {
		return this.#currentIndex;
	}

	//==============================================================================
	// 현재까지 드러난 글자 수 반환.
	//==============================================================================
	/**
	 * @returns { number }
	 */
	getRevealedChars() {
		return this.#revealedChars;
	}

	//==============================================================================
	// 첫 입력 수신 여부 반환.
	//==============================================================================
	/**
	 * @returns { boolean }
	 */
	hasReceivedFirstInput() {
		return this.#hasReceivedFirstInput;
	}

	//==============================================================================
	// 대사 줄별로 지정된 timeOfDay / characterPreset 을 배경/캐릭터 노드에 반영.
	// - 마지막으로 적용된 값과 동일하면 재호출 비용을 아끼기 위해 건너뛴다.
	//==============================================================================
	applyDialogueAppearance() {
		const dialogues = this.getDialogues();
		const currentIndex = this.getCurrentIndex();
		if (currentIndex >= dialogues.length) {
			return;
		}
		const currentDialogue = dialogues[currentIndex];
		const desiredTimeOfDay = currentDialogue.timeOfDay && currentDialogue.timeOfDay.length > 0 ? currentDialogue.timeOfDay : "night";
		const appliedTimeOfDay = this.#appliedTimeOfDay;
		if (desiredTimeOfDay !== appliedTimeOfDay) {
			const mountainSceneryNode = this.getMountainSceneryNode();
			if (desiredTimeOfDay === "day") {
				mountainSceneryNode.applyDayPreset();
			}
			else if (desiredTimeOfDay === "sunset") {
				mountainSceneryNode.applySunsetPreset();
			}
			else {
				mountainSceneryNode.applyNightPreset();
			}
			this.#appliedTimeOfDay = desiredTimeOfDay;
		}
		const desiredCharacterPreset = currentDialogue.characterPreset && currentDialogue.characterPreset.length > 0 ? currentDialogue.characterPreset : "";
		const appliedCharacterPreset = this.#appliedCharacterPreset;
		if (desiredCharacterPreset !== appliedCharacterPreset) {
			const characterSilhouetteNode = this.getCharacterSilhouetteNode();
			if (desiredCharacterPreset === "swordsman") {
				characterSilhouetteNode.applySwordsmanPreset();
			}
			else if (desiredCharacterPreset === "elder") {
				characterSilhouetteNode.applyElderPreset();
			}
			else if (desiredCharacterPreset === "taoist") {
				characterSilhouetteNode.applyTaoistPreset();
			}
			this.#appliedCharacterPreset = desiredCharacterPreset;
		}
		const speakerName = currentDialogue.speaker ? currentDialogue.speaker : "";
		const characterSilhouetteNode = this.getCharacterSilhouetteNode();
		characterSilhouetteNode.setCharacterName(speakerName);
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
		const inputManager = this.#inputManager;
		if (!inputManager) {
			return;
		}
		this.#elapsedTime += timeDelta;
		if (this.isFinished()) {
			return;
		}
		const dialogues = this.getDialogues();
		if (dialogues.length === 0) {
			this.#isFinished = true;
			return;
		}

		// 첫 입력 대기. 브라우저 자동재생 정책으로 AudioContext 잠금 해제용.
		const hasReceivedFirstInput = this.hasReceivedFirstInput();
		if (!hasReceivedFirstInput) {
			const firstIsTouchPressed = inputManager.isTouchPressed();
			const firstIsConfirmKeyPressed = inputManager.isKeyPressed("Enter") || inputManager.isKeyPressed("Space");
			const firstWasTouchPressed = this.#wasTouchPressed;
			const firstWasConfirmKeyPressed = this.#wasConfirmKeyPressed;
			const firstIsAdvanceJustPressed = (firstIsTouchPressed && !firstWasTouchPressed) || (firstIsConfirmKeyPressed && !firstWasConfirmKeyPressed);
			if (firstIsAdvanceJustPressed) {
				this.#hasReceivedFirstInput = true;
				const startupAudioBeepPlayer = this.getAudioBeepPlayer();
				if (startupAudioBeepPlayer) {
					const startupAudioContext = startupAudioBeepPlayer.getAudioContext();
					if (startupAudioContext && startupAudioContext.state === "suspended") {
						startupAudioContext.resume();
					}
				}
			}
			this.#wasTouchPressed = firstIsTouchPressed;
			this.#wasConfirmKeyPressed = firstIsConfirmKeyPressed;
			return;
		}

		// Control 키를 누르고 있으면 고속 재생 (타이핑 가속 + 자동 진행, 비프 묵음).
		const isFastForward = inputManager.isKeyPressed("ControlLeft") || inputManager.isKeyPressed("ControlRight");
		const typingCharsPerSecond = isFastForward ? TYPING_CHARS_PER_SECOND * FAST_FORWARD_SPEED_MULTIPLIER : TYPING_CHARS_PER_SECOND;

		// 타이핑 진행.
		const currentIndex = this.getCurrentIndex();
		const currentDialogue = dialogues[currentIndex];
		const previousRevealedChars = this.getRevealedChars();
		const previousRevealedCharIndex = System.Math.floor(previousRevealedChars);
		if (previousRevealedChars < currentDialogue.text.length) {
			const advancedRevealedChars = previousRevealedChars + typingCharsPerSecond * timeDelta;
			if (advancedRevealedChars > currentDialogue.text.length) {
				this.#revealedChars = currentDialogue.text.length;
			}
			else {
				this.#revealedChars = advancedRevealedChars;
			}
		}

		// 새로 드러난 글자마다 타이핑 비프 (공백/구두점 제외, 고속 재생 중에는 묵음).
		const nextRevealedChars = this.getRevealedChars();
		const nextRevealedCharIndex = System.Math.floor(nextRevealedChars);
		if (!isFastForward && nextRevealedCharIndex > previousRevealedCharIndex) {
			const typingAudioBeepPlayer = this.getAudioBeepPlayer();
			if (typingAudioBeepPlayer) {
				for (let charIndex = previousRevealedCharIndex; charIndex < nextRevealedCharIndex; ++charIndex) {
					const typedCharacter = currentDialogue.text.charAt(charIndex);
					if (this.isTypingBeepCharacter(typedCharacter)) {
						typingAudioBeepPlayer.playTone(720, 18, BeepWaveform.square, 0.12, 0.0);
					}
				}
			}
		}

		const fullyRevealed = this.getRevealedChars() >= currentDialogue.text.length;

		// Control 고속 재생 중 완성된 대사는 입력 없이 자동 진행.
		if (isFastForward && fullyRevealed) {
			if (currentIndex + 1 < dialogues.length) {
				this.#currentIndex = currentIndex + 1;
				this.#revealedChars = 0;
				this.applyDialogueAppearance();
			}
			else {
				this.#isFinished = true;
			}
			this.#wasTouchPressed = inputManager.isTouchPressed();
			return;
		}

		// 입력 처리 (just-pressed 트리거).
		const isTouchPressed = inputManager.isTouchPressed();
		const isConfirmKeyPressed = inputManager.isKeyPressed("Enter") || inputManager.isKeyPressed("Space");
		const wasTouchPressed = this.#wasTouchPressed;
		const wasConfirmKeyPressed = this.#wasConfirmKeyPressed;
		const isAdvanceJustPressed = (isTouchPressed && !wasTouchPressed) || (isConfirmKeyPressed && !wasConfirmKeyPressed);
		if (isAdvanceJustPressed) {
			const advanceAudioBeepPlayer = this.getAudioBeepPlayer();
			if (!fullyRevealed) {
				// 타이핑 중이면 즉시 완성.
				this.#revealedChars = currentDialogue.text.length;
				if (advanceAudioBeepPlayer) {
					advanceAudioBeepPlayer.playClick();
				}
			}
			else {
				if (currentIndex + 1 < dialogues.length) {
					this.#currentIndex = currentIndex + 1;
					this.#revealedChars = 0;
					this.applyDialogueAppearance();
					if (advanceAudioBeepPlayer) {
						advanceAudioBeepPlayer.playClick();
					}
				}
				else {
					this.#isFinished = true;
					if (advanceAudioBeepPlayer) {
						advanceAudioBeepPlayer.playConfirm();
					}
				}
			}
		}
		this.#wasTouchPressed = isTouchPressed;
		this.#wasConfirmKeyPressed = isConfirmKeyPressed;
	}

	//==============================================================================
	// 출력.
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
		const canvasRenderingContext = graphic.getCanvasRenderingContext();

		// 배경 (산 + 하늘).
		const mountainSceneryNode = this.getMountainSceneryNode();
		mountainSceneryNode.setRect(popupRect);
		mountainSceneryNode.draw(graphic);

		const dialogues = this.getDialogues();
		const currentIndex = this.getCurrentIndex();

		// 대사 박스 영역 계산.
		const textBoxX = popupRect.x + SIDE_MARGIN;
		const textBoxY = popupRect.y + popupRect.height - TEXTBOX_HEIGHT - TEXTBOX_BOTTOM_MARGIN;
		const textBoxWidth = popupRect.width - SIDE_MARGIN * 2;

		// 캐릭터 실루엣 (대사 박스 바로 위로 꽉 차게 배치).
		if (currentIndex < dialogues.length) {
			const currentDialogue = dialogues[currentIndex];
			const hasCharacterPreset = currentDialogue.characterPreset && currentDialogue.characterPreset.length > 0;
			if (hasCharacterPreset) {
				const characterTopY = popupRect.y + 48;
				const characterBottomY = textBoxY - 24;
				const characterAvailableHeight = characterBottomY - characterTopY;
				const characterAspectRatio = 0.66;
				const characterMaxWidth = popupRect.width * 0.7;
				const characterWidthByHeight = characterAvailableHeight * characterAspectRatio;
				const characterWidth = System.Math.min(characterMaxWidth, characterWidthByHeight);
				const characterHeight = characterWidth / characterAspectRatio;
				const characterCenterX = popupRect.x + popupRect.width * 0.5;
				const characterX = characterCenterX - characterWidth * 0.5;
				const characterY = characterBottomY - characterHeight;
				const characterRect = {
					x: characterX,
					y: characterY,
					width: characterWidth,
					height: characterHeight,
				};
				const characterSilhouetteNode = this.getCharacterSilhouetteNode();
				characterSilhouetteNode.setRect(characterRect);
				characterSilhouetteNode.draw(graphic);
			}
		}

		// 장면 라벨 (상단 가운데).
		const popupCenterX = popupRect.x + popupRect.width * 0.5;
		canvasRenderingContext.fillStyle = "#cccccc";
		canvasRenderingContext.font = "18px sans-serif";
		canvasRenderingContext.textAlign = "center";
		canvasRenderingContext.textBaseline = "top";
		const currentScene = this.getCurrentScene();
		const sceneTitle = this.translateSceneTitle(currentScene);
		canvasRenderingContext.fillText(sceneTitle, popupCenterX, popupRect.y + 28);

		if (dialogues.length === 0) {
			return;
		}

		const currentDialogue = dialogues[currentIndex];
		const revealedChars = this.getRevealedChars();
		const visibleText = currentDialogue.text.slice(0, System.Math.floor(revealedChars));

		// 대사 박스 배경 + 테두리.
		canvasRenderingContext.fillStyle = "rgba(20, 20, 30, 0.92)";
		canvasRenderingContext.fillRect(textBoxX, textBoxY, textBoxWidth, TEXTBOX_HEIGHT);
		canvasRenderingContext.strokeStyle = "#d4b46a";
		canvasRenderingContext.lineWidth = 2;
		canvasRenderingContext.strokeRect(textBoxX, textBoxY, textBoxWidth, TEXTBOX_HEIGHT);

		// 화자 이름 박스 (대사 박스 좌상단 위로). 폭은 이름 길이에 맞춰 가변.
		const speakerName = typeof currentDialogue.speaker === "string" ? currentDialogue.speaker : "";
		if (speakerName.length > 0) {
			canvasRenderingContext.font = NAME_BOX_FONT;
			const nameMetrics = canvasRenderingContext.measureText(speakerName);
			const nameBoxWidth = System.Math.max(NAME_BOX_MIN_WIDTH, System.Math.ceil(nameMetrics.width) + NAME_BOX_PADDING_X * 2);
			const nameBoxX = textBoxX + 28;
			const nameBoxY = textBoxY - NAME_BOX_HEIGHT * 0.5;
			canvasRenderingContext.fillStyle = "#d4b46a";
			canvasRenderingContext.fillRect(nameBoxX, nameBoxY, nameBoxWidth, NAME_BOX_HEIGHT);
			canvasRenderingContext.fillStyle = "#1a1a14";
			canvasRenderingContext.textAlign = "center";
			canvasRenderingContext.textBaseline = "middle";
			canvasRenderingContext.fillText(speakerName, nameBoxX + nameBoxWidth * 0.5, nameBoxY + NAME_BOX_HEIGHT * 0.5);
		}

		// 대사 본문 (자동 줄바꿈).
		canvasRenderingContext.fillStyle = "#ffffff";
		canvasRenderingContext.font = TEXT_FONT;
		canvasRenderingContext.textAlign = "left";
		canvasRenderingContext.textBaseline = "top";
		const textPaddingX = 32;
		const textPaddingY = 42;
		const textMaxWidth = textBoxWidth - textPaddingX * 2;
		const lineList = this.wrapTextByWidth(canvasRenderingContext, visibleText, textMaxWidth);
		const lineHeight = 36;
		for (let lineIndex = 0; lineIndex < lineList.length; ++lineIndex) {
			const lineText = lineList[lineIndex];
			canvasRenderingContext.fillText(lineText, textBoxX + textPaddingX, textBoxY + textPaddingY + lineIndex * lineHeight);
		}

		// 진행 안내.
		// 입력이 주입되지 않은 상태(예: 선택지 모드에서 대사창만 배경처럼 멈춰 있을 때)에서는
		// 진행 가능한 것처럼 보이지 않도록 안내 아이콘을 그리지 않는다.
		const hasReceivedFirstInputForHint = this.hasReceivedFirstInput();
		const isInputAttachedForHint = this.#inputManager !== null;
		if (!hasReceivedFirstInputForHint && isInputAttachedForHint) {
			canvasRenderingContext.fillStyle = "#aaaaaa";
			canvasRenderingContext.font = "16px sans-serif";
			canvasRenderingContext.textAlign = "right";
			canvasRenderingContext.textBaseline = "bottom";
			canvasRenderingContext.fillText("▼ 탭하여 시작", textBoxX + textBoxWidth - 20, textBoxY + TEXTBOX_HEIGHT - 14);
		}
		else if (hasReceivedFirstInputForHint && isInputAttachedForHint) {
			const fullyRevealed = revealedChars >= currentDialogue.text.length;
			if (fullyRevealed && lineList.length > 0) {
				canvasRenderingContext.font = TEXT_FONT;
				canvasRenderingContext.textAlign = "left";
				canvasRenderingContext.textBaseline = "top";
				const lastLineIndex = lineList.length - 1;
				const lastLineText = lineList[lastLineIndex];
				const lastLineMetrics = canvasRenderingContext.measureText(lastLineText);
				const lastLineWidth = lastLineMetrics.width;
				const continueIconX = textBoxX + textPaddingX + lastLineWidth + CONTINUE_ICON_GAP;
				const continueIconBaseY = textBoxY + textPaddingY + lastLineIndex * lineHeight;
				const elapsedTime = this.#elapsedTime;
				const continueIconBobOffset = System.Math.sin(elapsedTime * CONTINUE_ICON_BOB_FREQUENCY * System.Math.PI * 2) * CONTINUE_ICON_BOB_AMPLITUDE;
				canvasRenderingContext.fillStyle = "#d4b46a";
				canvasRenderingContext.fillText("▼", continueIconX, continueIconBaseY + continueIconBobOffset);
			}
		}

		// 페이지 표시 (우상단).
		canvasRenderingContext.fillStyle = "#888888";
		canvasRenderingContext.font = "14px sans-serif";
		canvasRenderingContext.textAlign = "right";
		canvasRenderingContext.textBaseline = "top";
		const pageText = `${currentIndex + 1} / ${dialogues.length}`;
		canvasRenderingContext.fillText(pageText, popupRect.x + popupRect.width - 28, popupRect.y + 28);
	}

	//==============================================================================
	// 한국어 자동 줄바꿈 (글자 단위 + 개행 문자).
	//==============================================================================
	/**
	 * @param { CanvasRenderingContext2D } canvasRenderingContext
	 * @param { string } text
	 * @param { number } maxWidth
	 * @returns { string[] }
	 */
	wrapTextByWidth(canvasRenderingContext, text, maxWidth) {
		const lineList = [];
		let currentLine = "";
		for (const character of text) {
			if (character === "\n") {
				lineList.push(currentLine);
				currentLine = "";
				continue;
			}
			const tentativeLine = currentLine + character;
			const tentativeMetrics = canvasRenderingContext.measureText(tentativeLine);
			if (tentativeMetrics.width > maxWidth && currentLine.length > 0) {
				lineList.push(currentLine);
				currentLine = character;
			}
			else {
				currentLine = tentativeLine;
			}
		}
		if (currentLine.length > 0) {
			lineList.push(currentLine);
		}
		return lineList;
	}

	//==============================================================================
	// 씬 이름을 화면용 한국어 라벨로 변환.
	//==============================================================================
	/**
	 * @param { string } sceneName
	 * @returns { string }
	 */
	translateSceneTitle(sceneName) {
		if (sceneName === "intro") {
			return "산문 앞";
		}
		if (sceneName === "after_intro") {
			return "선택의 순간";
		}
		if (sceneName === "path_trust") {
			return "신뢰의 길";
		}
		if (sceneName === "path_doubt") {
			return "의심의 길";
		}
		if (sceneName === "epilogue") {
			return "에필로그";
		}
		return "";
	}

	//==============================================================================
	// 산 풍경 노드 반환.
	//==============================================================================
	/**
	 * @returns { MountainSceneryNode }
	 */
	getMountainSceneryNode() {
		return this.#mountainSceneryNode;
	}

	//==============================================================================
	// 캐릭터 실루엣 노드 반환.
	//==============================================================================
	/**
	 * @returns { CharacterSilhouetteNode }
	 */
	getCharacterSilhouetteNode() {
		return this.#characterSilhouetteNode;
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

	//==============================================================================
	// 타이핑 비프 대상 글자 여부 (공백 / 개행 / 구두점은 묵음).
	//==============================================================================
	/**
	 * @param { string } character
	 * @returns { boolean }
	 */
	isTypingBeepCharacter(character) {
		if (character === " " || character === "\n" || character === "\t") {
			return false;
		}
		const punctuationCharacters = ".,!?:;\"`~()[]{}<>…—·";
		if (punctuationCharacters.indexOf(character) >= 0) {
			return false;
		}
		return true;
	}
}


//==============================================================================
// 외부 사용을 위한 클래스 재공개.
//==============================================================================
export { DialogueLine };
