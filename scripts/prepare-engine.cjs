// 빌드 전 내장 엔진 준비: 쓰지 않는 OCR 런타임을 지우고, OCR 모듈 옆에 VC++ 런타임 DLL을 넣는다(런타임 없는 PC 대비)
const path = require('node:path');
const { placeVcRuntime, pruneEngine } = require('../src/main/engine');

const root = path.join(__dirname, '..');
const engine = path.join(root, 'engine');
pruneEngine(engine);
const n = placeVcRuntime(engine, path.join(root, 'vcruntime'));
if (!n) throw new Error('내장 엔진에서 onnxruntime-node를 찾지 못했습니다');
console.log(`엔진 정리 완료, VC++ 런타임 DLL 배치: onnxruntime 폴더 ${n}곳`);
