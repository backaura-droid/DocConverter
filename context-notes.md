# DocConverter v2 컨텍스트 노트

## 결정과 근거

- **Electron 채택**: kordoc이 JS 라이브러리이고, 드롭·웹 서체·frontend-design과 잘 맞는다. 구버전처럼 별도 node.exe를 쓰지 않고 Electron 실행 파일을 `ELECTRON_RUN_AS_NODE=1`로 node처럼 쓴다.
- **엔진은 CLI로 호출**: kordoc README가 실패 JSON(`code`)과 이미지 번들 형식을 "계약"으로 명시한다. 메이저 버전이 바뀌어도 내부 API보다 덜 깨진다. 신구대조만 CLI가 없어 라이브러리 `compare`를 쓴다.
- **엔진 업데이트만 자동화, 앱 업데이트는 제외**: 저장소가 비공개라 앱이 Releases를 읽으려면 토큰이 필요하다(사용자 확정 2026-10-02).
- **임시 파일 복사 제거**: 구버전 로그를 보면 원본을 `tmpXXXX.hwpx`로 복사해 변환했다. 4.18.3에서 한글·공백 경로를 직접 넘겨도 정상 변환되는 것을 확인했다.
- **같은 이름 충돌**: `보고서.hwp`와 `보고서.pdf`가 같은 폴더에 있으면 둘 다 `보고서.md`가 되어 하나가 덮이고, 그림 폴더도 섞인다. 이 경우 `_확장자` 접미사를 붙인다.

## 시행착오

- **`fill -j`에 BOM 있는 JSON을 주면 실패**: PowerShell `Out-File -Encoding utf8`로 만든 JSON을 넘기면 `[kordoc] 오류: 문서 처리 중 오류가 발생했습니다`(exit 1)가 난다. BOM 없는 UTF-8로 쓰면 정상이다. 앱은 값 JSON을 직접(BOM 없이) 쓰고, 사용자가 불러온 JSON은 BOM을 제거한 뒤 다시 쓴다.

- **Electron을 node로 띄우면 commander가 스크립트 경로를 입력 파일로 오인**: `ELECTRON_RUN_AS_NODE=1 electron cli.js 파일 -o x.md`가 `cli.js`까지 파일로 보고 `-o`를 무시한다(`[1/2] cli.js (unknown) ... FAIL`). commander는 `process.versions.electron`이 있고 `process.defaultApp`이 없으면 Electron 앱 방식으로 `argv[1]`부터 사용자 인자로 본다. 해결은 `src/main/node-shim.cjs`다. 이 래퍼가 `process.defaultApp = true`로 바꾸고 argv를 node 형태로 고친 뒤 대상 스크립트를 import한다. 엔진 실행은 모두 이 래퍼를 거친다.
- **VSCode 안의 셸은 `ELECTRON_RUN_AS_NODE=1`을 물려받는다**: `npx electron --version`이 Electron 버전 대신 node 버전(v24.21.0)을 출력했다. 앱·화면 시험을 띄울 때는 이 변수를 지운다(`test/ui.mjs`는 env에서 삭제한다).
- **`hidden` 속성이 `.btn{display:inline-flex}`에 덮여 보임**: 변환이 끝나도 취소 버튼이 남았다. 전역으로 `[hidden]{display:none !important}`를 넣었다.
- **contextBridge 전역과 같은 이름의 최상위 `const` 금지**: `const api = window.api`가 `Identifier 'api' has already been declared`로 렌더러 스크립트 전체를 멈췄다. 전역 `api`를 그대로 쓴다.
- **PowerShell 5.1로 UTF-8 파일을 고치지 말 것**: `Get-Content`가 BOM 없는 UTF-8을 ANSI로 읽어 package.json의 한글이 깨졌다. 파일 수정은 Edit 도구로 하거나 `[IO.File]::ReadAllText/WriteAllText`(UTF8 BOM 없음)를 쓴다.
- **화면 캡처는 색 전환이 끝난 뒤에**: `emulateMedia` 직후 바로 캡처하면 transition 중간색(다크인데 흰 상자)이 찍힌다. 400ms 기다린 뒤 캡처한다.

- **electron-builder `extraResources`는 안쪽 `node_modules`를 빼고 복사한다**: 설치본에서 `resources/npm`만 깨져 `Cannot find module 'graceful-fs'`가 났다(개발 환경에서는 통과). `node_modules/npm/node_modules`를 별도 항목으로 추가해 해결했다. 내장 엔진은 `from`이 `node_modules` 자체라 중첩 폴더 4개가 그대로 들어갔다. 설치본을 만들면 반드시 **설치된 exe**로 npm과 엔진을 한 번씩 실행해 본다.

## kordoc 4.18.3 출력 형식 메모

- `fill <파일> --dry-run --silent`는 stdout에 `{fields:[...], confidence, clickHereFields:[{name, placeholder, value, section}]}`를 낸다. 필드가 없으면 stderr에 `서식 필드를 찾을 수 없습니다.`를 내고 exit 1로 끝난다.
- `compare(a, b)`는 `{stats:{added,removed,modified,unchanged}, diffs:[{type, before, after, similarity, cellDiffs?}]}`를 반환한다.
- 변환 진행 메시지는 stderr(`[kordoc] 파일 (형식) [i/n] OK`)로, 실패 JSON은 stdout으로 나온다.
