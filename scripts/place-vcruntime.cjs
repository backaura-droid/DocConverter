// 빌드 전에 내장 엔진의 OCR 모듈 옆에 VC++ 런타임 DLL을 넣는다(런타임 없는 PC 대비)
const path = require('node:path');
const { placeVcRuntime } = require('../src/main/engine');

const root = path.join(__dirname, '..');
const n = placeVcRuntime(path.join(root, 'engine'), path.join(root, 'vcruntime'));
if (!n) throw new Error('내장 엔진에서 onnxruntime-node를 찾지 못했습니다');
console.log(`VC++ 런타임 DLL 배치: onnxruntime 폴더 ${n}곳`);
