//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { WorldNode } from "../../libs/vanilla.js/src/core/node/worldnode.js";
import { Object } from "../../libs/vanilla.js/src/base/object.js";
import { AudioBeepPlayer } from "../base/audiobeepplayer.js";
import { MountainSceneryNode } from "../base/mountainscenerynode.js";


//==============================================================================
// 상수.
//==============================================================================
const TITLE_FONT = "bold 64px sans-serif";
const SUBTITLE_FONT = "22px sans-serif";
const BUTTON_FONT = "bold 24px sans-serif";
const BUTTON_WIDTH = 360;
const BUTTON_HEIGHT = 72;


//==============================================================================
// 타이틀 버튼 hit-test 영역.
//==============================================================================
class TitleButtonLayout extends Object {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @type { number } */ x;
	/** @type { number } */ y;
	/** @type { number } */ width;
	/** @type { number } */ height;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor(x, y, width, height) {
		super();
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
	}
}


//==============================================================================
// 타이틀 파트.
// - 게임 첫 화면. 큰 타이틀 + "시작" 버튼.
// - 시작 버튼 클릭 시 onStart 콜백을 호출하여 외부 매니저가 대사 파트로 전환.
//==============================================================================
export class TitlePartNode extends WorldNode {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @private @type { string } */ #titleText;
	/** @private @type { string } */ #subtitleText;
	/** @private @type { string } */ #startButtonLabel;
	/** @private @type { TitleButtonLayout | null } */ #startButtonLayout;
	/** @private @type { number } */ #elapsedTime;
	/** @private @type { boolean } */ #wasTouchPressed;
	/** @private @type { boolean } */ #wasConfirmKeyPressed;
	/** @private @type { (() => void) | null } */ #onStart;
	/** @private @type { AudioBeepPlayer | null } */ #audioBeepPlayer;
	/** @private @type { InputManager | null } */ #inputManager;
	/** @private @type { { x: number, y: number, width: number, height: number } | null } */ #popupRect;
	/** @private @type { MountainSceneryNode } */ #mountainSceneryNode;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
		this.#titleText = "비주얼노벨 샘플";
		this.#subtitleText = "Visual Novel Sample";
		this.#startButtonLabel = "이야기 시작";
		this.#startButtonLayout = null;
		this.#elapsedTime = 0;
		this.#wasTouchPressed = false;
		this.#wasConfirmKeyPressed = false;
		this.#onStart = null;
		this.#audioBeepPlayer = null;
		this.#inputManager = null;
		this.#popupRect = null;
		this.#mountainSceneryNode = new MountainSceneryNode();
		this.#mountainSceneryNode.applySunsetPreset();
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
	// 시작 콜백 설정.
	//==============================================================================
	/**
	 * @param { (() => void) | null } callback
	 */
	setOnStart(callback) {
		this.#onStart = callback;
	}

	//==============================================================================
	// 시작 콜백 반환.
	//==============================================================================
	/**
	 * @returns { (() => void) | null }
	 */
	getOnStart() {
		return this.#onStart;
	}

	//==============================================================================
	// 처음 상태로 되돌리기.
	//==============================================================================
	reset() {
		this.#elapsedTime = 0;
		this.#wasTouchPressed = false;
		this.#wasConfirmKeyPressed = false;
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

		const isTouchPressed = inputManager.isTouchPressed();
		const isConfirmKeyPressed = inputManager.isKeyPressed("Enter") || inputManager.isKeyPressed("Space");
		const wasTouchPressed = this.#wasTouchPressed;
		const wasConfirmKeyPressed = this.#wasConfirmKeyPressed;
		const isStartJustPressed = (isTouchPressed && !wasTouchPressed) || (isConfirmKeyPressed && !wasConfirmKeyPressed);

		if (isStartJustPressed) {
			const viewInputPosition = inputManager.getViewInputPosition();
			const startButtonLayout = this.#startButtonLayout;
			const isInsideStartButton = startButtonLayout && this.isInsideRect(viewInputPosition, startButtonLayout);
			const triggeredByKey = isConfirmKeyPressed && !wasConfirmKeyPressed;
			if (isInsideStartButton || triggeredByKey) {
				const audioBeepPlayer = this.getAudioBeepPlayer();
				if (audioBeepPlayer) {
					audioBeepPlayer.playConfirm();
				}
				const onStart = this.getOnStart();
				if (onStart) {
					onStart();
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

		// 배경.
		const mountainSceneryNode = this.getMountainSceneryNode();
		mountainSceneryNode.setRect(popupRect);
		mountainSceneryNode.draw(graphic);

		// 어두운 오버레이 (타이틀 텍스트 가독성 확보).
		canvasRenderingContext.fillStyle = "rgba(0, 0, 0, 0.35)";
		canvasRenderingContext.fillRect(popupRect.x, popupRect.y, popupRect.width, popupRect.height);

		const popupCenterX = popupRect.x + popupRect.width * 0.5;

		// 타이틀.
		canvasRenderingContext.fillStyle = "#f4e8c8";
		canvasRenderingContext.font = TITLE_FONT;
		canvasRenderingContext.textAlign = "center";
		canvasRenderingContext.textBaseline = "middle";
		const titleText = this.getTitleText();
		const titleY = popupRect.y + popupRect.height * 0.32;
		canvasRenderingContext.fillText(titleText, popupCenterX, titleY);

		// 서브타이틀.
		canvasRenderingContext.fillStyle = "#d4b46a";
		canvasRenderingContext.font = SUBTITLE_FONT;
		const subtitleText = this.getSubtitleText();
		const subtitleY = titleY + 56;
		canvasRenderingContext.fillText(subtitleText, popupCenterX, subtitleY);

		// 시작 버튼.
		const buttonX = popupCenterX - BUTTON_WIDTH * 0.5;
		const buttonY = popupRect.y + popupRect.height * 0.62;
		this.#startButtonLayout = new TitleButtonLayout(buttonX, buttonY, BUTTON_WIDTH, BUTTON_HEIGHT);

		const elapsedTime = this.#elapsedTime;
		const pulseStrength = (System.Math.sin(elapsedTime * System.Math.PI * 1.5) + 1.0) * 0.5;
		const buttonFillAlpha = 0.75 + pulseStrength * 0.20;
		canvasRenderingContext.fillStyle = `rgba(40, 28, 50, ${buttonFillAlpha})`;
		canvasRenderingContext.fillRect(buttonX, buttonY, BUTTON_WIDTH, BUTTON_HEIGHT);
		canvasRenderingContext.strokeStyle = "#d4b46a";
		canvasRenderingContext.lineWidth = 3;
		canvasRenderingContext.strokeRect(buttonX, buttonY, BUTTON_WIDTH, BUTTON_HEIGHT);

		canvasRenderingContext.fillStyle = "#ffffff";
		canvasRenderingContext.font = BUTTON_FONT;
		const startButtonLabel = this.getStartButtonLabel();
		canvasRenderingContext.fillText(startButtonLabel, buttonX + BUTTON_WIDTH * 0.5, buttonY + BUTTON_HEIGHT * 0.5);

		// 키 안내 (하단).
		canvasRenderingContext.fillStyle = "#aaaaaa";
		canvasRenderingContext.font = "16px sans-serif";
		canvasRenderingContext.textBaseline = "bottom";
		const hintText = "Enter / Space 또는 화면 탭으로 시작";
		canvasRenderingContext.fillText(hintText, popupCenterX, popupRect.y + popupRect.height - 36);
	}

	//==============================================================================
	// 좌표가 사각형 내부인지 검사.
	//==============================================================================
	/**
	 * @param { { x: number, y: number } } viewInputPosition
	 * @param { TitleButtonLayout } rect
	 * @returns { boolean }
	 */
	isInsideRect(viewInputPosition, rect) {
		const insideX = viewInputPosition.x >= rect.x && viewInputPosition.x <= rect.x + rect.width;
		const insideY = viewInputPosition.y >= rect.y && viewInputPosition.y <= rect.y + rect.height;
		return insideX && insideY;
	}

	//==============================================================================
	// 타이틀 텍스트 설정.
	//==============================================================================
	/**
	 * @param { string } titleText
	 */
	setTitleText(titleText) {
		this.#titleText = titleText;
	}

	//==============================================================================
	// 타이틀 텍스트 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getTitleText() {
		return this.#titleText;
	}

	//==============================================================================
	// 서브타이틀 텍스트 설정.
	//==============================================================================
	/**
	 * @param { string } subtitleText
	 */
	setSubtitleText(subtitleText) {
		this.#subtitleText = subtitleText;
	}

	//==============================================================================
	// 서브타이틀 텍스트 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getSubtitleText() {
		return this.#subtitleText;
	}

	//==============================================================================
	// 시작 버튼 라벨 설정.
	//==============================================================================
	/**
	 * @param { string } startButtonLabel
	 */
	setStartButtonLabel(startButtonLabel) {
		this.#startButtonLabel = startButtonLabel;
	}

	//==============================================================================
	// 시작 버튼 라벨 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getStartButtonLabel() {
		return this.#startButtonLabel;
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
