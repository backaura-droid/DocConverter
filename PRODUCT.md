# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

용역 연구원(사용자 본인과 동료). 학술·원가 용역을 하면서 발주처가 준 HWP·HWPX·PDF·DOCX·XLSX 자료를 Markdown으로 바꿔 AI와 위키에 넣고, 개정 문서를 비교하거나 양식 빈칸을 채운다. Windows 데스크톱에서 업무 중에 하루에도 여러 번 짧게 쓴다.

## Product Purpose

한국 공문서 형식을 Markdown으로 바꾸고, 신구대조·양식 추출·양식 채우기·HWPX 생성까지 한 앱에서 처리한다. 성공은 파일을 넣고 결과 파일을 얻기까지 망설임이 없는 것이다.

## Positioning

변환 엔진 kordoc을 앱 안에서 최신 버전으로 교체하고 시험 변환으로 검증한 뒤 적용한다. 앱을 다시 설치하지 않아도 엔진이 계속 나아진다. 탐색기 우클릭 "MD로 변환"으로 앱을 열지 않고도 변환한다.

## Operating Context

탐색기에서 파일·폴더를 끌어다 놓거나 우클릭으로 쓴다. 결과 .md는 원본 옆에 저장되고 Obsidian 위키·AI 도구로 이어진다. 스캔 PDF는 OCR로 읽으며 오래 걸린다.

## Capabilities and Constraints

- 도구 5개: 문서 변환, 신구대조, 양식 추출, 양식 채우기, HWPX 생성. 기능은 지금 그대로 유지한다.
- Electron 데스크톱 앱, 최소 창 760×560, CSP로 외부 글꼴·스크립트 금지(글꼴은 동봉).
- 엔진 정보·업데이트·되돌리기가 왼쪽 아래에 있다.

## Brand Commitments

- 서체는 SUIT 계열을 유지한다(동봉 `SUIT-Variable.woff2`).
- 유지: 변환 완료 때 찍히는 인주 "완료" 도장, 왼쪽 세로 메뉴 구성(도구 목록 + 아래 엔진 정보), 라이트·다크 스위치.
- 바꿔도 됨: 남색 강조색, 그 밖의 색·면 구성. 사용자 판단으로 지금 디자인은 단조롭다.
- 모든 화면 글은 한국어.

## Evidence on Hand

화면 캡처 시험 `test/ui.mjs`, 표본 `resources/smoke`. 사용자 후기·사용 통계는 없다.

## Product Principles

- 파일을 넣고 결과를 얻는 길이 가장 짧아야 한다.
- 진행·실패·건너뜀 상태는 늘 사유와 함께 보인다.
- 업무 도구답게 익숙하고, 한국 공문서 세계의 성격은 세부에서 드러낸다.
