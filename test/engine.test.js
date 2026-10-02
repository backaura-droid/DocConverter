// engine.js의 버전 비교·엔진 결정·되돌리기 상태 시험
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { newer, createEngine } = require('../src/main/engine');
const { failure } = require('../src/main/runner');

test('버전 비교', () => {
  assert.strictEqual(newer('4.19.0', '4.18.3'), true);
  assert.strictEqual(newer('4.18.10', '4.18.9'), true);
  assert.strictEqual(newer('5.0.0', '4.99.99'), true);
  assert.strictEqual(newer('4.18.3', '4.18.3'), false);
  assert.strictEqual(newer('4.18.2', '4.18.3'), false);
});

function fakeEngine(root, version) {
  const dir = path.join(root, 'node_modules', 'kordoc');
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'cli.js'), '');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
}

test('설치 엔진이 없거나 깨졌으면 내장 엔진을 쓰고, 되돌리기는 이전 엔진과 맞바꾼다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '엔진-'));
  const bundledDir = path.join(tmp, 'bundled');
  const userData = path.join(tmp, 'user');
  fakeEngine(bundledDir, '4.18.3');
  const e = createEngine({ userData, bundledDir });

  assert.strictEqual(e.active().version, '4.18.3');
  assert.strictEqual(e.active().bundled, true);
  assert.strictEqual(e.active().canRollback, false);

  fakeEngine(path.join(userData, 'engines', '4.19.0'), '4.19.0');
  e.switchTo('4.19.0');
  assert.strictEqual(e.active().version, '4.19.0');
  assert.strictEqual(e.active().canRollback, true);

  e.rollback();
  assert.strictEqual(e.active().version, '4.18.3');
  e.rollback();
  assert.strictEqual(e.active().version, '4.19.0');

  fs.rmSync(path.join(userData, 'engines', '4.19.0'), { recursive: true });
  assert.strictEqual(e.active().bundled, true);
});

test('VC++ 런타임 DLL을 onnxruntime 모듈 옆마다 둔다', () => {
  const { placeVcRuntime } = require('../src/main/engine');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-'));
  const vcDir = path.join(tmp, 'vc');
  fs.mkdirSync(vcDir);
  fs.writeFileSync(path.join(vcDir, 'VCRUNTIME140.dll'), 'x');
  const x64 = path.join(tmp, 'eng', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'win32', 'x64');
  fs.mkdirSync(x64, { recursive: true });
  assert.strictEqual(placeVcRuntime(path.join(tmp, 'eng'), vcDir), 1);
  assert.ok(fs.existsSync(path.join(x64, 'VCRUNTIME140.dll')));
  assert.strictEqual(placeVcRuntime(path.join(tmp, '없는엔진'), vcDir), 0);
});

test('실패 JSON의 code를 한국어 사유로 바꾼다', () => {
  const out = '{"success":false,"fileType":"hwpx","file":"a.hwpx","error":"암호화된 문서입니다","code":"ENCRYPTED"}\n';
  assert.match(failure(out, ''), /암호/);
  assert.strictEqual(failure('', '[kordoc] 오류: 무언가 잘못됨\n'), '오류: 무언가 잘못됨');
  assert.strictEqual(failure('', ''), '알 수 없는 오류');
});
