# DocConverter v2 컨텍스트 노트

## 결정과 근거

- **Electron 채택**: kordoc이 JS 라이브러리이고, 드롭·웹 서체·frontend-design과 잘 맞는다. 구버전처럼 별도 node.exe를 쓰지 않고 Electron 실행 파일을 `ELECTRON_RUN_AS_NODE=1`로 node처럼 쓴다.
- **엔진은 CLI로 호출**: kordoc README가 실패 JSON(`code`)과 이미지 번들 형식을 "계약"으로 명시한다. 메이저 버전이 바뀌어도 내부 API보다 덜 깨진다. 신구대조만 CLI가 없어 라이브러리 `compare`를 쓴다.
- **엔진 업데이트만 자동화, 앱 업데이트는 제외**: 저장소가 비공개라 앱이 Releases를 읽으려면 토큰이 필요하다(사용자 확정 2026-10-02).
- **임시 파일 복사 제거**: 구버전 로그를 보면 원본을 `tmpXXXX.hwpx`로 복사해 변환했다. 4.18.3에서 한글·공백 경로를 직접 넘겨도 정상 변환되는 것을 확인했다.
- **같은 이름 충돌**: `보고서.hwp`와 `보고서.pdf`가 같은 폴더에 있으면 둘 다 `보고서.md`가 되어 하나가 덮이고, 그림 폴더도 섞인다. 이 경우 `_확장자` 접미사를 붙인다.

- **VC++ 런타임 동봉**: 다른 PC에서도 동작하는지 사용자가 물어 네이티브 모듈의 가져오기 DLL을 조사했다. onnxruntime(OCR)만 `MSVCP140*.dll`·`VCRUNTIME140*.dll`에 의존하고, Electron·sharp·canvas는 의존하지 않는다. `vcruntime/`의 DLL 5개(System32 14.50.35719.0 사본)를 onnxruntime 모듈 옆에 둔다. 내장 엔진은 `npm run engine`에서, 업데이트 엔진은 `install()`에서 배치한다. PATH 추가 방식은 Chromium이 DLL 검색 경로를 제한할 수 있어 쓰지 않았다. 모듈과 같은 폴더에 두는 방식은 `onnxruntime.dll`이 이미 그렇게 로드되고 있어 확실하다.

- **v2.0.1 용량 정리(설치 폴더 787.5MB → 556.4MB, 설치파일 254MB → 170MB)**: 사용자가 "설치된 앱" 목록의 965MB(NSIS가 등록한 `EstimatedSize` 추정치)를 보고 물었다. 실측해 보니 엔진 407MB 중 `onnxruntime-web` 141MB와 `onnxruntime-node`의 리눅스·맥·ARM64 바이너리 약 47MB가 Windows x64에서는 쓰이지 않았다. `onnxruntime-web`은 수식 OCR용 `@huggingface/transformers`의 의존성이지만, node 빌드(`transformers.node.mjs`)는 그 코드를 내장하고 계산은 `onnxruntime-node`로 한다. `pruneEngine()`으로 지우고, 빌드(`scripts/prepare-engine.cjs`)와 엔진 업데이트(`install()`) 양쪽에 적용한다. Electron 언어 파일은 `electronLanguages: ["ko", "en-US"]`로 55개에서 2개로 줄였다(48MB → 1.2MB). 정리한 뒤 수식 OCR 모듈 불러오기, 이미지 OCR, 일괄 변환, 엔진 업데이트를 모두 다시 확인했다.

- **OCR 건너뛰기(2026-10-02)**: 엔진 4.18.x는 `--ocr` 없이도 OCR 모델 캐시가 있으면 스캔 쪽을 자동 OCR한다(README "기본값은 OCR 모델이 캐시에 있으면…"). 그래서 기존의 "`IMAGE_BASED_PDF` 실패 → `--ocr` 재시도" 경로는 모델을 한 번 받은 뒤로는 타지 않는다. CLI에는 OCR을 끄는 옵션이 없다(`--ocr`·`--ocr-force`만 있음). 끄는 방법은 `KORDOC_MODEL_CACHE`를 늘 빈 폴더로 주는 것이다. 이러면 자동 OCR이 꺼지고 모델 다운로드도 하지 않는다(실측 4쪽 19.5초 → 2.2초, 빈 폴더 그대로). 다만 OCR 없이 읽은 스캔 PDF는 실패가 아니라 그림 링크만 든 .md로 "성공"한다. 그래서 OCR 건너뛰기가 켜진 PDF는 먼저 `--format json --no-images --silent`로 읽어 `isImageBased`를 보고, 스캔이면 출력 파일을 만들지 않고 건너뛴다. 글자층과 스캔 쪽이 섞인 PDF는 스캔 쪽 글 없이 변환된다.
- **지금 파일 건너뛰기**: 파일마다 `AbortController`를 두고 `AbortSignal.any([전체 취소, 파일 취소])`로 엔진 프로세스를 끊는다. `skipOcr`는 모듈 변수로 두고 체크가 바뀔 때마다 `setSkipOcr` IPC로 갱신해 남은 파일부터 적용한다.
- **테마 스위치**: CSS는 이미 `prefers-color-scheme`로 다크 색을 갖고 있어서 `nativeTheme.themeSource`만 바꾼다. 선택은 `userData/theme.json`에 두고 창을 만들기 전에 적용한다(창 배경색도 맞춤). 처음엔 왼쪽 메뉴 아래에 뒀으나 최소 창(760×560)에서 "새 엔진" 안내가 뜨면 화면 밖으로 밀려 작업 영역 오른쪽 위로 옮겼다.

## 시행착오

- **`fill -j`에 BOM 있는 JSON을 주면 실패**: PowerShell `Out-File -Encoding utf8`로 만든 JSON을 넘기면 `[kordoc] 오류: 문서 처리 중 오류가 발생했습니다`(exit 1)가 난다. BOM 없는 UTF-8로 쓰면 정상이다. 앱은 값 JSON을 직접(BOM 없이) 쓰고, 사용자가 불러온 JSON은 BOM을 제거한 뒤 다시 쓴다.

- **Electron을 node로 띄우면 commander가 스크립트 경로를 입력 파일로 오인**: `ELECTRON_RUN_AS_NODE=1 electron cli.js 파일 -o x.md`가 `cli.js`까지 파일로 보고 `-o`를 무시한다(`[1/2] cli.js (unknown) ... FAIL`). commander는 `process.versions.electron`이 있고 `process.defaultApp`이 없으면 Electron 앱 방식으로 `argv[1]`부터 사용자 인자로 본다. 해결은 `src/main/node-shim.cjs`다. 이 래퍼가 `process.defaultApp = true`로 바꾸고 argv를 node 형태로 고친 뒤 대상 스크립트를 import한다. 엔진 실행은 모두 이 래퍼를 거친다.
- **VSCode 안의 셸은 `ELECTRON_RUN_AS_NODE=1`을 물려받는다**: `npx electron --version`이 Electron 버전 대신 node 버전(v24.21.0)을 출력했다. 앱·화면 시험을 띄울 때는 이 변수를 지운다(`test/ui.mjs`는 env에서 삭제한다).
- **`hidden` 속성이 `.btn{display:inline-flex}`에 덮여 보임**: 변환이 끝나도 취소 버튼이 남았다. 전역으로 `[hidden]{display:none !important}`를 넣었다.
- **contextBridge 전역과 같은 이름의 최상위 `const` 금지**: `const api = window.api`가 `Identifier 'api' has already been declared`로 렌더러 스크립트 전체를 멈췄다. 전역 `api`를 그대로 쓴다.
- **PowerShell 5.1로 UTF-8 파일을 고치지 말 것**: `Get-Content`가 BOM 없는 UTF-8을 ANSI로 읽어 package.json의 한글이 깨졌다. 파일 수정은 Edit 도구로 하거나 `[IO.File]::ReadAllText/WriteAllText`(UTF8 BOM 없음)를 쓴다.
- **화면 캡처는 색 전환이 끝난 뒤에**: `emulateMedia` 직후 바로 캡처하면 transition 중간색(다크인데 흰 상자)이 찍힌다. 400ms 기다린 뒤 캡처한다.

- **electron-builder `extraResources`는 안쪽 `node_modules`를 빼고 복사한다**: 설치본에서 `resources/npm`만 깨져 `Cannot find module 'graceful-fs'`가 났다(개발 환경에서는 통과). `node_modules/npm/node_modules`를 별도 항목으로 추가해 해결했다. 내장 엔진은 `from`이 `node_modules` 자체라 중첩 폴더 4개가 그대로 들어갔다. 설치본을 만들면 반드시 **설치된 exe**로 npm과 엔진을 한 번씩 실행해 본다.

- **Playwright는 기본으로 라이트 색 구성표를 흉내 낸다**: 테마 스위치로 `nativeTheme`을 다크로 바꿔도 시험 화면은 라이트 그대로였다(`matchMedia('(prefers-color-scheme: dark)')`가 false). `page.emulateMedia({ colorScheme: null })`로 흉내를 끄면 실제 값이 보인다.
- **화면 시험 표본으로 `resources/smoke`를 넘기지 말 것**: 변환 결과 .md가 그 안에 생기고, 엔진 시험 변환(`smoke()`)이 폴더 안 파일을 전부 변환하므로 설치본까지 오염된다. 임시 사본을 넘긴다. 통합 시험은 `ELECTRON_RUN_AS_NODE=1 electron test/integration.mjs <표본>`으로 돌려야 하며 `npm run test:integration`(일반 node)은 첫 assert에서 멈춘다.

## kordoc 4.18.3 출력 형식 메모

- `fill <파일> --dry-run --silent`는 stdout에 `{fields:[...], confidence, clickHereFields:[{name, placeholder, value, section}]}`를 낸다. 필드가 없으면 stderr에 `서식 필드를 찾을 수 없습니다.`를 내고 exit 1로 끝난다.
- `compare(a, b)`는 `{stats:{added,removed,modified,unchanged}, diffs:[{type, before, after, similarity, cellDiffs?}]}`를 반환한다.
- 변환 진행 메시지는 stderr(`[kordoc] 파일 (형식) [i/n] OK`)로, 실패 JSON은 stdout으로 나온다.
