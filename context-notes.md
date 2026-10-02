# DocConverter v2 컨텍스트 노트

## 결정과 근거

- **Electron 채택**: kordoc이 JS 라이브러리이고, 드롭·웹 서체·frontend-design과 잘 맞는다. 구버전처럼 별도 node.exe를 쓰지 않고 Electron 실행 파일을 `ELECTRON_RUN_AS_NODE=1`로 node처럼 쓴다.
- **엔진은 CLI로 호출**: kordoc README가 실패 JSON(`code`)과 이미지 번들 형식을 "계약"으로 명시한다. 메이저 버전이 바뀌어도 내부 API보다 덜 깨진다. 신구대조만 CLI가 없어 라이브러리 `compare`를 쓴다.
- **엔진 업데이트만 자동화, 앱 업데이트는 제외**: 저장소가 비공개라 앱이 Releases를 읽으려면 토큰이 필요하다(사용자 확정 2026-10-02).
- **임시 파일 복사 제거**: 구버전 로그를 보면 원본을 `tmpXXXX.hwpx`로 복사해 변환했다. 4.18.3에서 한글·공백 경로를 직접 넘겨도 정상 변환되는 것을 확인했다.
- **같은 이름 충돌**: `보고서.hwp`와 `보고서.pdf`가 같은 폴더에 있으면 둘 다 `보고서.md`가 되어 하나가 덮이고, 그림 폴더도 섞인다. 이 경우 `_확장자` 접미사를 붙인다.

## 시행착오

- **`fill -j`에 BOM 있는 JSON을 주면 실패**: PowerShell `Out-File -Encoding utf8`로 만든 JSON을 넘기면 `[kordoc] 오류: 문서 처리 중 오류가 발생했습니다`(exit 1)가 난다. BOM 없는 UTF-8로 쓰면 정상이다. 앱은 값 JSON을 직접(BOM 없이) 쓰고, 사용자가 불러온 JSON은 BOM을 제거한 뒤 다시 쓴다.

## kordoc 4.18.3 출력 형식 메모

- `fill <파일> --dry-run --silent`는 stdout에 `{fields:[...], confidence, clickHereFields:[{name, placeholder, value, section}]}`를 낸다. 필드가 없으면 stderr에 `서식 필드를 찾을 수 없습니다.`를 내고 exit 1로 끝난다.
- `compare(a, b)`는 `{stats:{added,removed,modified,unchanged}, diffs:[{type, before, after, similarity, cellDiffs?}]}`를 반환한다.
- 변환 진행 메시지는 stderr(`[kordoc] 파일 (형식) [i/n] OK`)로, 실패 JSON은 stdout으로 나온다.
