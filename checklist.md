# DocConverter v2 체크리스트

- [ ] 1. 프로젝트 골격(package.json·.gitignore·engine/·SUIT) → 검증: `npm install` 성공
- [ ] 2. batch.js 규칙 TDD → 검증: `npm test` 통과
- [ ] 3. runner.js + 실패 JSON 해석 → 검증: 통합 시험에서 한글 경로 변환
- [ ] 4. engine.js(결정·확인·설치·시험·되돌리기) + 버전 비교 TDD → 검증: `npm test`, 실제 업데이트 설치 1회
- [ ] 5. compare.mjs → 검증: 표본 두 개 비교 결과 md 확인
- [ ] 6. main.js·preload.js IPC → 검증: `npm start`로 창 표시
- [ ] 7. 화면(frontend-design, SUIT, 다섯 탭, 드롭) → 검증: Playwright 라이트·다크 캡처
- [ ] 8. 설치본 빌드(electron-builder NSIS) → 검증: 설치본에서 변환·엔진 확인
- [ ] 9. 커밋·푸시·GitHub Releases v2.0.0 업로드 → 검증: 릴리스 첨부 파일 확인
- [ ] 10. 위키 기록(04_앱개발실) → 검증: index·log 반영
