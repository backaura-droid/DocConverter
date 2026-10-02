// Electron 실행 파일을 node로 쓸 때 대상 스크립트가 일반 node처럼 인자를 읽게 맞춘 뒤 실행하는 래퍼
// commander 등은 process.versions.electron이 있으면 argv[1]부터 사용자 인자로 보므로 defaultApp을 켜 node 방식(argv[2]부터)으로 되돌린다
const { pathToFileURL } = require('node:url');

const [, , script, ...args] = process.argv;
process.argv = [process.argv[0], script, ...args];
process.defaultApp = true;
import(pathToFileURL(script).href).catch((err) => {
  console.error(err);
  process.exit(1);
});
