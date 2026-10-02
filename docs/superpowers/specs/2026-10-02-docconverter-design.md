# DocConverter v2 설계 (2026-10-02 승인)

kordoc 엔진을 GUI로 쓰는 Windows 데스크톱 앱을 새로 만든다. 구버전(Tkinter·PyInstaller·kordoc 2.2.6) 소스가 유실되어 처음부터 다시 만든다.

## 목표

- kordoc 4.x 기반으로 다섯 탭(문서 변환·신구대조·양식 추출·양식 채우기·HWPX 생성)을 재현한다.
- 탐색기에서 파일·폴더를 끌어다 놓으면 입력으로 받는다.
- 폴더를 넣으면 하위 폴더까지 지원 형식을 모아 각 원본 옆에 `.md`를 만든다.
- 앱을 실행할 때마다 npm의 kordoc 최신 버전을 확인하고, 클릭 한 번으로 엔진만 교체한다.
- 화면은 SUIT 서체를 쓰고, 설치본은 GitHub Releases에 올린다.

## 범위 밖

앱 자체의 자동 업데이트(비공개 저장소라 토큰 필요), 병렬 변환(`--jobs`)·상주 워커, kordoc의 patch·seal·redact·render 기능.

## 구조

| 파일 | 역할 |
|---|---|
| `src/main/main.js` | 창 생성, IPC, 파일 대화상자 |
| `src/main/engine.js` | 엔진 결정·최신 버전 확인·설치·시험 변환·되돌리기 |
| `src/main/runner.js` | 엔진 CLI를 Electron 내장 node(`ELECTRON_RUN_AS_NODE`)로 실행 |
| `src/main/batch.js` | 입력 수집(재귀)·출력 경로 계산·건너뛰기 판정(순수 함수) |
| `src/main/compare.mjs` | 신구대조. CLI가 없어 엔진 라이브러리의 `compare`를 직접 호출 |
| `src/preload.js` | 렌더러용 API, 드롭 파일 경로(`webUtils.getPathForFile`) |
| `src/renderer/` | 순수 HTML·CSS·JS 화면, SUIT 가변 woff2 |
| `engine/` | 설치본에 넣을 내장 kordoc(빌드할 때 `npm ci`) |
| `resources/smoke/` | 엔진 시험 변환용 표본(직접 만든 HWPX·PDF) |

## 엔진

- 내장 엔진은 `resources/engine/node_modules/kordoc`이며, 인터넷이 없을 때와 최종 대체 수단으로 쓴다.
- 업데이트 엔진은 `%APPDATA%\DocConverter\engines\<버전>\`에 두고, `engine.json`에 `{current, previous}`를 기록한다.
- 업데이트 절차는 다음과 같다. `registry.npmjs.org/kordoc/latest` 조회(5초 제한, 실패하면 조용히 넘어감) → 새 버전이면 업데이트 띠 표시 → 앱 안의 npm으로 `<버전>.tmp`에 설치 → 표본 시험 변환 → 통과하면 이름을 바꾸고 전환, 실패하면 삭제. 엔진은 현재와 이전 버전 두 개만 남긴다.
- "이전 엔진으로 되돌리기"는 현재와 이전 버전을 맞바꾼다.

## 탭별 동작

| 탭 | 호출 | 출력 |
|---|---|---|
| 문서 변환 | `cli <파일> -o <md> [-p 범위]` | `.md`, 그림은 `images/<이름>/` |
| 신구대조 | `compare(구, 신)` | 변경 블록을 표로 정리한 `.md` |
| 양식 추출 | `cli fill <파일> --dry-run` | 필드 표 표시 + JSON 저장 |
| 양식 채우기 | `cli fill <파일 또는 --template> -j <임시 JSON> -o <hwpx>` | 서식을 보존한 HWPX |
| HWPX 생성 | `cli generate <md> -o <hwpx> --preset <프리셋> [--org]` | HWPX |

## 일괄 변환 규칙

- 지원 확장자는 `.hwp .hwpx .pdf .docx .xlsx`이다. `~$` 잠금 파일, `images` 폴더, 점(`.`)으로 시작하는 폴더는 제외한다.
- 저장 폴더 칸이 비어 있으면 원본 옆에 저장한다. 채워져 있으면 넣은 폴더 기준의 하위 구조를 그대로 옮긴다.
- 같은 폴더에 이름이 같고 확장자만 다른 원본(`보고서.hwp`, `보고서.pdf`)이 있으면 `보고서_hwp.md`, `보고서_pdf.md`로 저장한다.
- 출력이 이미 있으면 건너뛴다. "덮어쓰기"를 켜면 덮어쓴다.
- 파일 단위로 차례로 실행한다. 진행률과 취소 기능을 두고, 실패해도 계속 진행한다. 실패 사유는 kordoc 실패 JSON의 `code`를 한국어로 바꿔 보여 준다.

## 시험

- `node --test`로 batch 규칙과 버전 비교를 확인한다.
- `test/integration.mjs`로 한글 경로의 실제 문서를 실제 엔진으로 변환한다(표본은 저장소 밖에 둔다).
- Playwright Electron 모드로 화면 흐름을 확인하고, 라이트·다크 화면을 캡처한다.

## 배포

electron-builder NSIS로 설치본을 만들고 GitHub Releases에 `v2.0.0`으로 올린다.
