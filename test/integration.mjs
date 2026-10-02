// 통합 시험: 실제 엔진으로 표본 폴더 일괄 변환·신구대조·엔진 설치(npm)·시험 변환을 앱과 같은 경로(Electron을 node로)로 실행
// 사용법: ELECTRON_RUN_AS_NODE=1 electron test/integration.mjs <표본 폴더> [설치 시험할 kordoc 버전]
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collect, plan } = require('../src/main/batch.js');
const { run, failure } = require('../src/main/runner.js');
const { createEngine } = require('../src/main/engine.js');

assert.ok(process.versions.electron, 'Electron을 node로 띄워 실행해야 앱과 같은 경로를 시험함');
const root = path.resolve(import.meta.dirname, '..');
const [sampleDir, installVersion] = process.argv.slice(2);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'docconverter-it-'));
const engine = createEngine({
  userData,
  bundledDir: path.join(root, 'engine'),
  npmCli: path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  smokeDir: path.join(root, 'resources', 'smoke'),
});

console.log('내장 엔진 시험 변환…');
await engine.smoke(engine.active().root);

console.log('표본 폴더 일괄 변환…');
const jobs = plan(collect([sampleDir]), { overwrite: true });
assert.ok(jobs.length > 0);
for (const j of jobs) {
  const r = await run(engine.active().cli, [j.src, '-o', j.out]);
  assert.strictEqual(r.code, 0, `${j.src}: ${failure(r.stdout, r.stderr)}`);
  assert.ok(fs.statSync(j.out).size > 0, `${j.out} 비어 있음`);
  console.log('  OK', path.relative(sampleDir, j.out));
}

console.log('신구대조…');
const [a, b] = jobs.map((j) => j.src);
const out = path.join(userData, '대조.md');
const r = await run(path.join(root, 'src', 'main', 'compare.mjs'), [engine.active().index, a, b, out]);
assert.strictEqual(r.code, 0, failure(r.stdout, r.stderr));
assert.match(fs.readFileSync(out, 'utf8'), /신구대조표/);

if (installVersion) {
  console.log(`엔진 ${installVersion} 설치·시험…`);
  await engine.install(installVersion);
  assert.strictEqual(engine.active().version, installVersion);
  assert.strictEqual(engine.active().bundled, false);
  engine.rollback();
  assert.strictEqual(engine.active().bundled, true);
}

fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5 });
console.log('통합 시험 통과');
