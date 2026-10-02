# DocConverter

HWP·HWPX·PDF·DOCX·XLSX 문서를 Markdown으로 바꾸고, 신구대조·양식 채우기·HWPX 생성까지 하는 Windows 데스크톱 앱입니다. 변환 엔진은 [kordoc](https://github.com/chrisryugj/kordoc)이며, 새 버전이 나오면 앱 안에서 엔진만 교체합니다.

## 설치

공개 배포 저장소 [DocConverter-release](https://github.com/backaura-droid/DocConverter-release/releases/latest)에서 `DocConverter-Setup-<버전>.exe`를 받아 실행합니다. Node.js를 따로 설치할 필요는 없습니다. 이 저장소는 비공개이므로, 다른 사람에게는 배포 저장소 주소를 알려 줍니다.

## 기능

아래 각 기능 설명은 앱 왼쪽 메뉴에 마우스를 올렸을 때도 그대로 표시됩니다.

### 문서 변환

문서를 Markdown(.md)으로 바꿉니다.

- 탐색기에서 파일이나 폴더를 창에 끌어다 놓거나, 파일 선택·폴더 선택으로 넣습니다.
- 폴더를 넣으면 하위 폴더까지 HWP·HWPX·PDF·DOCX·XLSX를 모두 찾아 각 문서 옆에 .md를 만듭니다.
- 이미 .md가 있으면 건너뜁니다. 다시 만들려면 "덮어쓰기"를 켭니다.
- 문서 속 그림은 images/<문서 이름>/ 폴더에 저장되고, 글자층이 없는 스캔 PDF는 OCR로 읽습니다.
- OCR은 오래 걸립니다. "OCR이 필요한 스캔 문서는 건너뛰기"를 켜면 스캔 PDF를 건너뜁니다. 변환 중에 켜도 남은 문서부터 적용됩니다.
- 변환 중에 "이 파일 건너뛰기"를 누르면 지금 문서만 멈추고 다음 문서로 넘어갑니다.

### 신구대조

현행 문서와 개정 문서를 비교해 바뀐 부분만 대조표(.md)로 만듭니다.

- 두 문서를 각 칸에 끌어다 놓습니다. 한꺼번에 두 개를 놓으면 순서대로 현행·개정이 됩니다.
- 문단은 신설·삭제·수정으로, 표는 바뀐 칸의 위치(행·열)까지 보여 줍니다.
- HWP와 HWPX처럼 형식이 다른 문서끼리도 비교합니다.

### 양식 추출

양식 문서에서 채워 넣을 칸(빈칸·누름틀) 목록을 뽑습니다.

- 칸 이름, 현재 값, 안내문을 표로 보여 줍니다.
- "JSON으로 저장"으로 칸 목록을 파일로 남기고, 값을 채워 양식 채우기에서 불러올 수 있습니다.

### 양식 채우기

양식의 칸에 값을 넣어 서식을 그대로 살린 HWPX를 만듭니다.

- 내 양식 파일을 쓰거나, 내장 일반기안문·간이기안문을 고릅니다.
- "칸 불러오기"로 칸 목록을 띄운 뒤 값을 입력하거나, 값 JSON을 불러옵니다.

### HWPX 생성

Markdown 문서를 공문서 서식의 HWPX로 만듭니다.

- 서식은 기안문·보고서·계획서·통지·회의록·개조식·업무보고·서울방침·보도자료 중에서 고릅니다.
- 표지가 있는 서식은 기관명을 넣으면 표지에 들어갑니다.

## 엔진 업데이트

- 앱을 켤 때마다 npm에서 kordoc 최신 버전을 확인합니다. 새 버전이 있으면 왼쪽 아래에 "엔진 업데이트" 버튼이 나타납니다.
- 업데이트는 새 엔진을 `%APPDATA%\DocConverter\engines\<버전>\`에 내려받아 시험 변환을 통과해야 적용됩니다. 실패하면 기존 엔진을 그대로 씁니다.
- 새 엔진이 마음에 들지 않으면 "이전 엔진으로 되돌리기"로 돌아갑니다. 인터넷이 없으면 앱에 들어 있는 엔진으로 동작합니다.

## 개발

```bash
npm install                 # 앱 의존성
npm run engine              # 내장 엔진(engine/) 설치
npm start                   # 실행
npm test                    # 단위 시험
npm run dist                # 설치본 생성 → dist/
```

새 버전을 배포할 때는 `package.json`의 `version`을 올리고 `npm run dist`로 설치본을 만듭니다. 그다음 이 저장소와 공개 배포 저장소(`backaura-droid/DocConverter-release`) 양쪽 Releases에 같은 태그로 올립니다. 공개 쪽에는 설치파일만 올립니다.

통합 시험과 화면 시험은 실제 문서가 든 폴더가 필요합니다.

```bash
ELECTRON_RUN_AS_NODE=1 npx electron test/integration.mjs <문서 폴더> [설치 시험할 kordoc 버전]
node test/ui.mjs <문서 폴더> <캡처 저장 폴더>
```

VSCode 안의 터미널은 `ELECTRON_RUN_AS_NODE=1`을 물려받는 경우가 있습니다. 그러면 `npm start`가 창 없이 node로 실행되므로, 이 변수를 지운 뒤 실행합니다.

## 라이선스

- 변환 엔진: kordoc (MIT)
- 서체: SUIT (SIL Open Font License 1.1, `src/renderer/fonts/SUIT-LICENSE.txt`)
- 엔진 업데이트용 내장 npm (Artistic-2.0)
