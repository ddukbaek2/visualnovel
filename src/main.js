//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { Vector2 } from "../libs/vanilla.js/src/base/vector2.js";
import { Color } from "../libs/vanilla.js/src/base/color.js";
import { EngineConfiguration, Engine } from "../libs/vanilla.js/src/core/engine.js";
import { Graphic } from "../libs/vanilla.js/src/core/graphic.js";
import { JsonAsset } from "../libs/vanilla.js/src/resource/jsonasset.js";
import { ViewScaleMode } from "../libs/vanilla.js/src/core/viewmanager.js";
import { GameScene } from "../libs/vanilla.js/src/game/gamescene.js";
import { AudioBeepPlayer } from "./base/audiobeepplayer.js";
import { DialoguePartNode } from "./part/dialoguepartnode.js";
import { ChoicePartNode } from "./part/choicepartnode.js";
import { TitlePartNode } from "./part/titlepartnode.js";


//==============================================================================
// 활성 파트 식별자.
//==============================================================================
const PartKey = System.Object.freeze({
	title: "title",
	dialogue: "dialogue",
	choice: "choice",
});


//==============================================================================
// JSON 데이터 애셋 식별자.
//==============================================================================
const JsonId = System.Object.freeze({
	dialogueTable: 1,
	choiceTable: 2,
});


//==============================================================================
// 비주얼노벨 메인 씬.
// - GameScene 을 상속해 로딩 화면 / DEVTools / 캔버스 배경 클리어 / viewSize 변화 자동 감지를
//   기반에서 받는다.
// - 파트 (타이틀 / 대사 / 선택지) 등록 및 활성 전환.
// - 시나리오 라우팅:
//   타이틀 → 대사(intro) → 선택지(after_intro) → 대사(path_trust|path_doubt) → 대사(epilogue) → 타이틀.
//==============================================================================
export class VisualNovelScene extends GameScene {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @private @type { System.Map<number, JsonAsset> } */ #loadedJsonAssets;
	/** @private @type { Array<{ id: number, path: string }> } */ #pendingJsonLoads;
	/** @private @type { TitlePartNode } */ #titlePart;
	/** @private @type { DialoguePartNode } */ #dialoguePart;
	/** @private @type { ChoicePartNode } */ #choicePart;
	/** @private @type { AudioBeepPlayer | null } */ #audioBeepPlayer;
	/** @private @type { string } */ #activePartKey;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
		this.#loadedJsonAssets = new System.Map();
		this.#pendingJsonLoads = [];
		this.#titlePart = new TitlePartNode();
		this.#dialoguePart = new DialoguePartNode();
		this.#choicePart = new ChoicePartNode();
		this.#audioBeepPlayer = null;
		this.#activePartKey = PartKey.title;

		// GameScene 설정 — 뷰 스케일 / 씬 배경색 / 로딩 최소 시간.
		this.setViewScaleMode(ViewScaleMode.stretchHeightExpandWidth);
		this.setSceneBackgroundColor(Color.createFromHEX("#101018"));
		this.setLoadingMinDurationMs(500);
	}

	//==============================================================================
	// 자산 로드 hook (GameScene.load 가 호출).
	//==============================================================================
	/**
	 * @override
	 */
	async loadAssets() {
		await super.loadAssets();

		// 데이터 테이블 예약.
		this.loadJsonAsset(JsonId.dialogueTable, "./assets/data/table/dialoguetable.json");
		this.loadJsonAsset(JsonId.choiceTable, "./assets/data/table/choicetable.json");

		// 예약된 모든 자산 순차 로드.
		await this.loadAllAssets();
	}

	//==============================================================================
	// 초기화.
	//==============================================================================
	/**
	 * @override
	 * @param { Engine } engine
	 */
	initialize(engine) {
		super.initialize(engine);

		const root = this.getRoot();

		// 씬 그래프에 파트 등록 (드로우 순서 = 등록 순서).
		// 타이틀 → 대사 → 선택지 (선택지는 대사 위로 덮인다).
		const titlePart = this.getTitlePart();
		root.addChild(titlePart);
		titlePart.setName("titlePart");

		const dialoguePart = this.getDialoguePart();
		root.addChild(dialoguePart);
		dialoguePart.setName("dialoguePart");

		const choicePart = this.getChoicePart();
		root.addChild(choicePart);
		choicePart.setName("choicePart");

		// 오디오 비프 플레이어 생성 후 각 파트에 주입.
		// createAudioPlayer 를 한 번 호출해 AudioContext 의 lazy 생성을 강제한다.
		// (사용자 제스처 전에 호출되면 브라우저 경고가 뜨지만 컨텍스트는 생성된다.)
		const audioManager = engine.getAudioManager();
		audioManager.createAudioPlayer();
		const audioContext = audioManager.getAudioContext();
		this.#audioBeepPlayer = new AudioBeepPlayer(audioContext);
		const audioBeepPlayer = this.getAudioBeepPlayer();
		titlePart.setAudioBeepPlayer(audioBeepPlayer);
		dialoguePart.setAudioBeepPlayer(audioBeepPlayer);
		choicePart.setAudioBeepPlayer(audioBeepPlayer);

		// 데이터 테이블 주입.
		const dialogueTableAsset = this.getLoadedJsonAsset(JsonId.dialogueTable);
		if (dialogueTableAsset && System.Array.isArray(dialogueTableAsset.data)) {
			dialoguePart.setDialogues(dialogueTableAsset.data);
		}
		const choiceTableAsset = this.getLoadedJsonAsset(JsonId.choiceTable);
		if (choiceTableAsset && System.Array.isArray(choiceTableAsset.data)) {
			choicePart.setChoices(choiceTableAsset.data);
		}

		// 타이틀 시작 버튼 → 인트로 대사 파트로 전환.
		// 타이틀 클릭이 첫 사용자 제스처가 되므로 대사 파트의 첫 입력 대기는 건너뛴다.
		titlePart.setOnStart(() => {
			dialoguePart.playScene("intro");
			dialoguePart.markFirstInputReceived();
			this.setActivePartKey(PartKey.dialogue);
		});

		// 선택지 선택 → 해당 nextScene 대사 파트로 전환.
		choicePart.setOnSelected((choiceLine) => {
			const nextScene = choiceLine.nextScene;
			if (nextScene && nextScene.length > 0) {
				dialoguePart.playScene(nextScene);
				dialoguePart.markFirstInputReceived();
				this.setActivePartKey(PartKey.dialogue);
			}
		});
	}

	//==============================================================================
	// 갱신.
	//==============================================================================
	/**
	 * @override
	 * @param { number } timeDelta
	 */
	tick(timeDelta) {
		const engine = this.getEngine();
		const viewManager = engine.getViewManager();
		const viewSize = viewManager.getViewSize();
		const popupRect = this.computePopupRect(viewSize);

		const titlePart = this.getTitlePart();
		const dialoguePart = this.getDialoguePart();
		const choicePart = this.getChoicePart();
		const activePartKey = this.getActivePartKey();

		// 선택지 모드에서도 대사 파트는 활성 상태로 두어 배경 / 캐릭터 / 대사창이 계속 보이도록 한다.
		// 입력은 아래쪽에서 활성 파트에만 주입되므로 대사 파트는 그대로 멈춰 있는다.
		const isDialogueVisible = activePartKey === PartKey.dialogue || activePartKey === PartKey.choice;
		titlePart.setActive(activePartKey === PartKey.title);
		dialoguePart.setActive(isDialogueVisible);
		choicePart.setActive(activePartKey === PartKey.choice);

		// 모든 파트에 popupRect 주입 (inputManager 는 활성 파트에만).
		titlePart.setInputContext(null, popupRect);
		dialoguePart.setInputContext(null, popupRect);
		choicePart.setInputContext(null, popupRect);

		const inputManager = engine.getInputManager();
		const isDevToolsCapturingInput = this.isDevToolsCapturingInput();
		if (!isDevToolsCapturingInput) {
			if (activePartKey === PartKey.title) {
				titlePart.setInputContext(inputManager, popupRect);
			}
			else if (activePartKey === PartKey.dialogue) {
				dialoguePart.setInputContext(inputManager, popupRect);
			}
			else if (activePartKey === PartKey.choice) {
				choicePart.setInputContext(inputManager, popupRect);
			}
		}

		// 씬 그래프 tick (GameScene 이 DEVTools tick / viewSize 변화 layout 도 처리).
		super.tick(timeDelta);

		// post-tick 라우팅: 대사 파트 완료 처리.
		if (activePartKey === PartKey.dialogue && dialoguePart.isFinished()) {
			const finishedSceneName = dialoguePart.getCurrentScene();
			this.onDialogueSceneFinished(finishedSceneName);
		}
	}

	//==============================================================================
	// 활성 파트 식별자 설정. 전환 시 대상 파트를 처음 상태로 reset.
	//==============================================================================
	/**
	 * @param { string } partKey
	 */
	setActivePartKey(partKey) {
		this.#activePartKey = partKey;
		if (partKey === PartKey.title) {
			const titlePart = this.getTitlePart();
			titlePart.reset();
		}
		else if (partKey === PartKey.dialogue) {
			const dialoguePart = this.getDialoguePart();
			dialoguePart.reset();
		}
		else if (partKey === PartKey.choice) {
			const choicePart = this.getChoicePart();
			choicePart.reset();
		}
	}

	//==============================================================================
	// 대사 장면 종료 시 라우팅.
	// - intro 끝 → 선택지(after_intro).
	// - path_trust / path_doubt 끝 → epilogue.
	// - epilogue 끝 → 타이틀로 복귀.
	//==============================================================================
	/**
	 * @param { string } finishedSceneName
	 */
	onDialogueSceneFinished(finishedSceneName) {
		const dialoguePart = this.getDialoguePart();
		const choicePart = this.getChoicePart();
		if (finishedSceneName === "intro") {
			choicePart.playBranch("after_intro", "그대는 어떤 마음으로 검을 잡으려 하는가?");
			this.#activePartKey = PartKey.choice;
		}
		else if (finishedSceneName === "path_trust" || finishedSceneName === "path_doubt") {
			dialoguePart.playScene("epilogue");
			dialoguePart.markFirstInputReceived();
			this.#activePartKey = PartKey.dialogue;
		}
		else if (finishedSceneName === "epilogue") {
			this.setActivePartKey(PartKey.title);
		}
	}

	//==============================================================================
	// 팝업 사각 영역 계산 — 뷰 전체.
	//==============================================================================
	/**
	 * @param { Vector2 } viewSize
	 * @returns { { x: number, y: number, width: number, height: number } }
	 */
	computePopupRect(viewSize) {
		return { x: 0, y: 0, width: viewSize.x, height: viewSize.y };
	}

	//==============================================================================
	// JSON 자산 예약.
	//==============================================================================
	/**
	 * @param { number } jsonId
	 * @param { string } assetPath
	 */
	loadJsonAsset(jsonId, assetPath) {
		let normalizedJsonId = jsonId;
		if (typeof normalizedJsonId === "string") {
			normalizedJsonId = System.Number.parseInt(normalizedJsonId);
		}
		this.#pendingJsonLoads.push({ id: normalizedJsonId, path: assetPath });
	}

	//==============================================================================
	// 로드된 JSON 자산 반환.
	//==============================================================================
	/**
	 * @param { number } jsonId
	 * @returns { JsonAsset | undefined }
	 */
	getLoadedJsonAsset(jsonId) {
		let normalizedJsonId = jsonId;
		if (typeof normalizedJsonId === "string") {
			normalizedJsonId = System.Number.parseInt(normalizedJsonId);
		}
		const loadedJsonAssets = this.#loadedJsonAssets;
		const loadedJsonAsset = loadedJsonAssets.get(normalizedJsonId);
		return loadedJsonAsset;
	}

	//==============================================================================
	// 예약된 모든 자산을 순차적으로 로드.
	//==============================================================================
	async loadAllAssets() {
		const pendingJsonLoads = this.#pendingJsonLoads;
		for (const pendingJson of pendingJsonLoads) {
			const jsonAsset = new JsonAsset();
			await jsonAsset.load(pendingJson.path);
			this.#loadedJsonAssets.set(pendingJson.id, jsonAsset);
		}
		this.#pendingJsonLoads = [];
	}

	//==============================================================================
	// 타이틀 파트 반환.
	//==============================================================================
	/**
	 * @returns { TitlePartNode }
	 */
	getTitlePart() {
		return this.#titlePart;
	}

	//==============================================================================
	// 대사 파트 반환.
	//==============================================================================
	/**
	 * @returns { DialoguePartNode }
	 */
	getDialoguePart() {
		return this.#dialoguePart;
	}

	//==============================================================================
	// 선택지 파트 반환.
	//==============================================================================
	/**
	 * @returns { ChoicePartNode }
	 */
	getChoicePart() {
		return this.#choicePart;
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
	// 활성 파트 키 반환.
	//==============================================================================
	/**
	 * @returns { string }
	 */
	getActivePartKey() {
		return this.#activePartKey;
	}
}


//==============================================================================
// 엔진 기동.
//==============================================================================
const engineConfiguration = new EngineConfiguration();
engineConfiguration.useStatistics = false;
engineConfiguration.referenceResolutionSize = Vector2.create(800, 1280);
engineConfiguration.autoResizeOnWindowResize = true;
engineConfiguration.title = "visualnovel-sample";
const visualNovelScene = new VisualNovelScene();
const engine = new Engine(engineConfiguration);
engine.run(visualNovelScene);
