---
version: 1
slug: "src-renderer-index-html"
primary_target: "src/renderer/index.html"
related_targets: ["src/renderer/style.css"]
---

# 작업 화면 (DocConverter 전체 창)

범위: Operate. 용역 연구원이 문서를 넣고 결과 파일을 얻는다. 기능·문구·IPC는 그대로 두고 시각 세계만 바꾼다.

## Direction contract

THESIS: 일괄 변환을 공항 출발 안내판처럼 읽는다. 상태가 바뀐 줄은 확인할 때까지 표시가 남는다. 회색 바탕에 남색 강조 하나뿐인 업무 앱 기본형을 거부한다.
OWN-WORLD: 숯색 안내판(#212429) 메뉴·표 머리, 신호 노랑(#ffc20e)은 선택·진행·주의에만, 상태는 안내판 글자판 같은 고정폭 배지. SUIT 한 서체, 숫자는 표 숫자. 인주 빨강은 도장에만.
STORY: 무엇을 넣었는지, 몇 건이 되고 몇 건을 확인해야 하는지가 한눈에 보이고, 문제 있는 줄만 따라가면 된다.
FIRST VIEWPORT: 왼쪽 숯색 메뉴(도구 5개, 선택 탭은 노랑 면) 아래에 엔진·테마 스위치가 있다. 오른쪽 위 제목 옆에 결재란(접수·변환·확인·완료)이 있고 완료 칸에 인주 도장이 찍힌다. 그 아래 끌어다 놓는 영역, 옵션, 실행 버튼, 결과 목록이 이어진다.
FORM: 도전안 vernacular-ephemera-boarding-pass-and-gate-board + 사용자 요청으로 결재판 시안의 결재란 이식. seed:bf2d9aeaa300d3d7
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
