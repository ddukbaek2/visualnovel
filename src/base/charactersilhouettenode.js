//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { WorldNode } from "../../libs/vanilla.js/src/core/node/worldnode.js";


//==============================================================================
// 캐릭터 실루엣 노드.
// - 주어진 사각형 영역(rect) 안에 머리(원) + 어깨(사다리꼴) + 몸통(직사각형) 으로 구성된
//   상반신 실루엣을 그린다.
// - 색상 / 그림자 등을 setter 로 조절. 외형이 다른 캐릭터는 색상 프리셋으로 구분.
//==============================================================================
export class CharacterSilhouetteNode extends WorldNode {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @private @type { { x: number, y: number, width: number, height: number } | null } */ #rect;
	/** @private @type { string } */ #characterName;
	/** @private @type { string } */ #robeColor;
	/** @private @type { string } */ #robeShadowColor;
	/** @private @type { string } */ #robeAccentColor;
	/** @private @type { string } */ #skinColor;
	/** @private @type { string } */ #hairColor;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
		this.#rect = null;
		this.#characterName = "";
		this.#robeColor = "#2a3a52";
		this.#robeShadowColor = "#16223a";
		this.#robeAccentColor = "#d4b46a";
		this.#skinColor = "#e8d3b8";
		this.#hairColor = "#1a1a22";
	}

	//==============================================================================
	// 그리기 영역 설정.
	//==============================================================================
	/**
	 * @param { { x: number, y: number, width: number, height: number } | null } rect
	 */
	setRect(rect) {
		this.#rect = rect;
	}

	//==============================================================================
	// 그리기 영역 반환.
	//==============================================================================
	/**
	 * @returns { { x: number, y: number, width: number, height: number } | null }
	 */
	getRect() {
		return this.#rect;
	}

	//==============================================================================
	// 캐릭터 이름 설정.
	//==============================================================================
	/**
	 * @param { string } characterName
	 */
	setCharacterName(characterName) {
		this.#characterName = characterName;
	}

	//==============================================================================
	// 캐릭터 이름 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getCharacterName() {
		return this.#characterName;
	}

	//==============================================================================
	// 의상 색상 설정.
	//==============================================================================
	/**
	 * @param { string } robeColor
	 * @param { string } robeShadowColor
	 * @param { string } robeAccentColor
	 */
	setRobeColors(robeColor, robeShadowColor, robeAccentColor) {
		this.#robeColor = robeColor;
		this.#robeShadowColor = robeShadowColor;
		this.#robeAccentColor = robeAccentColor;
	}

	//==============================================================================
	// 피부 색상 설정.
	//==============================================================================
	/**
	 * @param { string } skinColor
	 */
	setSkinColor(skinColor) {
		this.#skinColor = skinColor;
	}

	//==============================================================================
	// 머리 색상 설정.
	//==============================================================================
	/**
	 * @param { string } hairColor
	 */
	setHairColor(hairColor) {
		this.#hairColor = hairColor;
	}

	//==============================================================================
	// 출력. rect 가 설정되어 있을 때만 그린다.
	//==============================================================================
	/**
	 * @override
	 * @param { Graphic } graphic
	 */
	draw(graphic) {
		if (!this.isActive()) {
			return;
		}
		const rect = this.getRect();
		if (!rect) {
			return;
		}
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		const canvasRenderingContext = graphic.getCanvasRenderingContext();

		const centerX = rect.x + rect.width * 0.5;
		const headRadius = rect.width * 0.18;
		const headCenterX = centerX;
		const headCenterY = rect.y + headRadius * 1.4;

		// 헤어 (머리 위쪽 반원).
		const hairColor = this.#hairColor;
		canvasRenderingContext.fillStyle = hairColor;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.arc(headCenterX, headCenterY - headRadius * 0.08, headRadius * 1.08, System.Math.PI * 1.0, System.Math.PI * 2.0);
		canvasRenderingContext.closePath();
		canvasRenderingContext.fill();

		// 머리 (피부 영역).
		const skinColor = this.#skinColor;
		canvasRenderingContext.fillStyle = skinColor;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.arc(headCenterX, headCenterY, headRadius, 0, System.Math.PI * 2);
		canvasRenderingContext.fill();

		// 헤어 (머리 위쪽 절반에 다시 한 번 — 정수리 강조).
		canvasRenderingContext.fillStyle = hairColor;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.arc(headCenterX, headCenterY - headRadius * 0.18, headRadius * 0.96, System.Math.PI * 1.0, System.Math.PI * 2.0);
		canvasRenderingContext.closePath();
		canvasRenderingContext.fill();

		// 어깨/목 사다리꼴.
		const shoulderTopY = headCenterY + headRadius * 0.85;
		const shoulderTopHalfWidth = headRadius * 0.55;
		const shoulderBottomY = headCenterY + headRadius * 1.7;
		const shoulderBottomHalfWidth = rect.width * 0.38;
		const robeColor = this.#robeColor;
		canvasRenderingContext.fillStyle = robeColor;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.moveTo(centerX - shoulderTopHalfWidth, shoulderTopY);
		canvasRenderingContext.lineTo(centerX + shoulderTopHalfWidth, shoulderTopY);
		canvasRenderingContext.lineTo(centerX + shoulderBottomHalfWidth, shoulderBottomY);
		canvasRenderingContext.lineTo(centerX - shoulderBottomHalfWidth, shoulderBottomY);
		canvasRenderingContext.closePath();
		canvasRenderingContext.fill();

		// 몸통 (어깨 아래부터 rect 하단까지).
		const torsoTopY = shoulderBottomY;
		const torsoBottomY = rect.y + rect.height;
		const torsoLeftX = centerX - shoulderBottomHalfWidth;
		const torsoRightX = centerX + shoulderBottomHalfWidth;
		canvasRenderingContext.fillStyle = robeColor;
		canvasRenderingContext.fillRect(torsoLeftX, torsoTopY, torsoRightX - torsoLeftX, torsoBottomY - torsoTopY);

		// 몸통 중앙 그림자 (의상 주름).
		const robeShadowColor = this.#robeShadowColor;
		const shadowWidth = (torsoRightX - torsoLeftX) * 0.22;
		const shadowLeftX = centerX - shadowWidth * 0.5;
		canvasRenderingContext.fillStyle = robeShadowColor;
		canvasRenderingContext.fillRect(shadowLeftX, torsoTopY, shadowWidth, torsoBottomY - torsoTopY);

		// 의상 깃 (V 형).
		const robeAccentColor = this.#robeAccentColor;
		const collarTopY = shoulderBottomY;
		const collarBottomY = shoulderBottomY + (torsoBottomY - shoulderBottomY) * 0.25;
		const collarHalfWidth = shoulderBottomHalfWidth * 0.22;
		canvasRenderingContext.fillStyle = robeAccentColor;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.moveTo(centerX - collarHalfWidth, collarTopY);
		canvasRenderingContext.lineTo(centerX + collarHalfWidth, collarTopY);
		canvasRenderingContext.lineTo(centerX, collarBottomY);
		canvasRenderingContext.closePath();
		canvasRenderingContext.fill();

		// 의상 띠 (몸통 가로 줄).
		const beltY = torsoTopY + (torsoBottomY - torsoTopY) * 0.55;
		const beltHeight = (torsoBottomY - torsoTopY) * 0.06;
		canvasRenderingContext.fillStyle = robeAccentColor;
		canvasRenderingContext.fillRect(torsoLeftX, beltY, torsoRightX - torsoLeftX, beltHeight);
	}

	//==============================================================================
	// 검객 프리셋 (한두백 — 푸른 의상 + 흑발).
	//==============================================================================
	applySwordsmanPreset() {
		this.setRobeColors("#2a3a52", "#16223a", "#d4b46a");
		this.setSkinColor("#e8d3b8");
		this.setHairColor("#1a1a22");
	}

	//==============================================================================
	// 장로 프리셋 (검종 장로 — 진초록 의상 + 백발).
	//==============================================================================
	applyElderPreset() {
		this.setRobeColors("#244238", "#142822", "#d4b46a");
		this.setSkinColor("#dcc2a2");
		this.setHairColor("#e8e2d0");
	}

	//==============================================================================
	// 도사 프리셋 (도반 — 자주색 의상 + 갈발).
	//==============================================================================
	applyTaoistPreset() {
		this.setRobeColors("#52283e", "#321828", "#f0c870");
		this.setSkinColor("#e8d3b8");
		this.setHairColor("#3a2818");
	}
}
