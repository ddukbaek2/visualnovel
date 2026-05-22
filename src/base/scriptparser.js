//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { Object } from "../../libs/vanilla.js/src/base/object.js";


//==============================================================================
// 비주얼노벨 스크립트 파서.
//
// 입력 형식:
// - 한 줄에 하나의 명령어. `/명령어 내용` 형태.
// - 빈 줄과 `//` 로 시작하는 줄은 주석으로 무시.
// - 명령어 외의 줄은 무시 (경고 로그).
//
// 지원 명령어:
// - /scene <sceneName>                : 새 장면 시작. 이후 /say, /narration 이 이 장면에 누적.
// - /branch <branchName>              : 새 선택지 분기 시작. 이후 /option 이 이 분기에 누적.
// - /speaker <name>                   : 화자 이름 설정. (이후 /say 에 적용)
// - /character <preset|none>          : 캐릭터 실루엣 프리셋 설정 (swordsman / elder / taoist / none).
// - /time <day|night|sunset>          : 시간대 설정.
// - /say <text>                       : 현재 화자 / 프리셋 / 시간대로 대사 줄 출력. (\n 으로 줄바꿈)
// - /narration <text>                 : 화자 없는 대사 줄 출력. (현재 프리셋 / 시간대는 그대로 적용)
// - /option <라벨> -> <nextScene>     : 선택지 항목 추가. (현재 분기에 누적)
//
// 출력:
// - parse() 가 { dialogueList, choiceList } 를 반환.
// - dialogueList: { id, scene, sequence, speaker, text, characterPreset, timeOfDay }[]
// - choiceList:   { id, branch, sequence, label, nextScene }[]
// - 그대로 DialoguePartNode.setDialogues / ChoicePartNode.setChoices 에 주입 가능.
//==============================================================================
export class ScriptParser extends Object {
	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
	}

	//==============================================================================
	// 스크립트 텍스트 파싱.
	//==============================================================================
	/**
	 * @param { string } scriptText
	 * @returns { { dialogueList: Array<object>, choiceList: Array<object> } }
	 */
	parse(scriptText) {
		const dialogueList = [];
		const choiceList = [];

		let dialogueIdCounter = 10000001;
		let choiceIdCounter = 20000001;

		let currentScene = "";
		let currentSceneSequence = 0;
		let currentBranch = "";
		let currentBranchSequence = 0;
		let currentSpeaker = "";
		let currentCharacterPreset = "";
		let currentTimeOfDay = "";

		const safeScriptText = typeof scriptText === "string" ? scriptText : "";
		const rawLineList = safeScriptText.split(/\r?\n/);
		for (let lineIndex = 0; lineIndex < rawLineList.length; ++lineIndex) {
			const rawLine = rawLineList[lineIndex];
			const trimmedLine = rawLine.trim();
			if (trimmedLine.length === 0) {
				continue;
			}
			if (trimmedLine.startsWith("//")) {
				continue;
			}
			if (!trimmedLine.startsWith("/")) {
				console.warn(`[ScriptParser] (${lineIndex + 1}) 명령어로 시작하지 않는 줄:`, rawLine);
				continue;
			}

			const spaceIndex = trimmedLine.indexOf(" ");
			let commandName;
			let commandContent;
			if (spaceIndex === -1) {
				commandName = trimmedLine.substring(1).toLowerCase();
				commandContent = "";
			}
			else {
				commandName = trimmedLine.substring(1, spaceIndex).toLowerCase();
				commandContent = trimmedLine.substring(spaceIndex + 1).trim();
			}

			if (commandName === "scene") {
				currentScene = commandContent;
				currentSceneSequence = 0;
				continue;
			}
			if (commandName === "branch") {
				currentBranch = commandContent;
				currentBranchSequence = 0;
				continue;
			}
			if (commandName === "speaker") {
				currentSpeaker = commandContent;
				continue;
			}
			if (commandName === "character") {
				if (commandContent === "none") {
					currentCharacterPreset = "";
				}
				else {
					currentCharacterPreset = commandContent;
				}
				continue;
			}
			if (commandName === "time") {
				currentTimeOfDay = commandContent;
				continue;
			}
			if (commandName === "say") {
				if (currentScene.length === 0) {
					console.warn(`[ScriptParser] (${lineIndex + 1}) /scene 없이 /say:`, rawLine);
					continue;
				}
				currentSceneSequence = currentSceneSequence + 1;
				const sayText = this.unescapeText(commandContent);
				dialogueList.push({
					id: dialogueIdCounter,
					scene: currentScene,
					sequence: currentSceneSequence,
					speaker: currentSpeaker,
					text: sayText,
					characterPreset: currentCharacterPreset,
					timeOfDay: currentTimeOfDay,
				});
				dialogueIdCounter = dialogueIdCounter + 1;
				continue;
			}
			if (commandName === "narration") {
				if (currentScene.length === 0) {
					console.warn(`[ScriptParser] (${lineIndex + 1}) /scene 없이 /narration:`, rawLine);
					continue;
				}
				currentSceneSequence = currentSceneSequence + 1;
				const narrationText = this.unescapeText(commandContent);
				dialogueList.push({
					id: dialogueIdCounter,
					scene: currentScene,
					sequence: currentSceneSequence,
					speaker: "",
					text: narrationText,
					characterPreset: currentCharacterPreset,
					timeOfDay: currentTimeOfDay,
				});
				dialogueIdCounter = dialogueIdCounter + 1;
				continue;
			}
			if (commandName === "option") {
				if (currentBranch.length === 0) {
					console.warn(`[ScriptParser] (${lineIndex + 1}) /branch 없이 /option:`, rawLine);
					continue;
				}
				currentBranchSequence = currentBranchSequence + 1;
				const arrowSeparator = " -> ";
				const arrowIndex = commandContent.lastIndexOf(arrowSeparator);
				let optionLabel;
				let optionNextScene;
				if (arrowIndex >= 0) {
					optionLabel = commandContent.substring(0, arrowIndex).trim();
					optionNextScene = commandContent.substring(arrowIndex + arrowSeparator.length).trim();
				}
				else {
					optionLabel = commandContent;
					optionNextScene = "";
				}
				choiceList.push({
					id: choiceIdCounter,
					branch: currentBranch,
					sequence: currentBranchSequence,
					label: optionLabel,
					nextScene: optionNextScene,
				});
				choiceIdCounter = choiceIdCounter + 1;
				continue;
			}

			console.warn(`[ScriptParser] (${lineIndex + 1}) 알 수 없는 명령어:`, commandName);
		}

		return { dialogueList: dialogueList, choiceList: choiceList };
	}

	//==============================================================================
	// 텍스트의 이스케이프 시퀀스를 실제 문자로 변환.
	// - \n → 줄바꿈, \t → 탭. 그 외는 그대로.
	//==============================================================================
	/**
	 * @param { string } text
	 * @returns { string }
	 */
	unescapeText(text) {
		const newlineReplaced = text.replace(/\\n/g, "\n");
		const tabReplaced = newlineReplaced.replace(/\\t/g, "\t");
		return tabReplaced;
	}
}
