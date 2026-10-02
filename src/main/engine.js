// kordoc 엔진 위치 결정·최신 버전 확인·설치·시험 변환·되돌리기
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, failure } = require('./runner');

// a가 b보다 새 버전이면 true (x.y.z 숫자만 비교, npm latest 태그는 정식판만 가리킴)
function newer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

function createEngine({ userData, bundledDir, npmCli, smokeDir }) {
  const enginesDir = path.join(userData, 'engines');
  const stateFile = path.join(userData, 'engine.json');
  const pkgDir = (root) => path.join(root, 'node_modules', 'kordoc');
  const dirOf = (v) => (v ? path.join(enginesDir, v) : bundledDir); // null = 내장 엔진
  const valid = (root) => fs.existsSync(path.join(pkgDir(root), 'dist', 'cli.js'));

  const readState = () => {
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
      return { current: null };
    }
  };
  const writeState = (s) => {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(s));
  };

  function describe(root) {
    const dir = pkgDir(root);
    return {
      root,
      version: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version,
      bundled: root === bundledDir,
      cli: path.join(dir, 'dist', 'cli.js'),
      index: path.join(dir, 'dist', 'index.js'),
    };
  }

  function active() {
    const s = readState();
    const root = s.current && valid(dirOf(s.current)) ? dirOf(s.current) : bundledDir;
    return { ...describe(root), canRollback: 'previous' in s && valid(dirOf(s.previous)) };
  }

  function switchTo(version) {
    const s = readState();
    writeState({ current: version, previous: s.current ?? null });
  }

  function rollback() {
    const s = readState();
    if ('previous' in s) writeState({ current: s.previous, previous: s.current });
  }

  async function latest() {
    const res = await fetch('https://registry.npmjs.org/kordoc/latest', { signal: AbortSignal.timeout(5000) });
    return (await res.json()).version;
  }

  // 표본 문서를 실제로 변환해 엔진이 동작하는지 확인
  async function smoke(root) {
    const { cli } = describe(root);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docconverter-smoke-'));
    try {
      for (const f of fs.readdirSync(smokeDir)) {
        const out = path.join(tmp, `${f}.md`);
        const r = await run(cli, [path.join(smokeDir, f), '-o', out, '--silent']);
        if (r.code !== 0) throw new Error(`${f} 시험 변환 실패: ${failure(r.stdout, r.stderr)}`);
        if (!fs.readFileSync(out, 'utf8').includes('SMOKE')) throw new Error(`${f} 시험 변환 결과가 비었습니다`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    }
  }

  async function install(version) {
    const tmp = path.join(enginesDir, `${version}.tmp`);
    const dest = dirOf(version);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true}');
    try {
      // 스크립트 없이 설치: Windows용 네이티브 모듈은 미리 빌드된 바이너리가 패키지에 들어 있음
      const r = await run(npmCli, ['install', `kordoc@${version}`, '--no-audit', '--no-fund', '--ignore-scripts', '--prefix', tmp], { cwd: tmp });
      if (r.code !== 0) throw new Error(`엔진 내려받기 실패: ${r.stderr.trim().split('\n').pop()}`);
      await smoke(tmp);
      fs.rmSync(dest, { recursive: true, force: true, maxRetries: 5 });
      fs.renameSync(tmp, dest);
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
      throw err;
    }
    switchTo(version);
    prune();
  }

  // 현재·이전 엔진만 남긴다
  function prune() {
    const s = readState();
    const keep = new Set([s.current, s.previous].filter(Boolean));
    for (const d of fs.readdirSync(enginesDir)) if (!keep.has(d)) fs.rmSync(path.join(enginesDir, d), { recursive: true, force: true, maxRetries: 5 });
  }

  return { active, switchTo, rollback, latest, smoke, install };
}

module.exports = { newer, createEngine };
