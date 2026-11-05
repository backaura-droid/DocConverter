// DocConverter 메인 프로세스: 창 생성·IPC·엔진 관리·작업 실행
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Notification } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collect, plan, freeName, supported } = require('./batch');
const { run, failure, failureCode } = require('./runner');
const { newer, createEngine } = require('./engine');

const root = path.join(__dirname, '..', '..');
const res = (packaged, dev) => (app.isPackaged ? path.join(process.resourcesPath, packaged) : path.join(root, dev));

const engine = createEngine({
  userData: app.getPath('userData'),
  bundledDir: res('engine', 'engine'),
  npmCli: path.join(res('npm', 'node_modules/npm'), 'bin', 'npm-cli.js'),
  smokeDir: res('smoke', 'resources/smoke'),
  vcDir: res('vcruntime', 'vcruntime'),
});
const compareScript = path.join(__dirname, 'compare.mjs').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const noOcrCache = path.join(os.tmpdir(), 'docconverter-no-ocr-models'); // 늘 비어 있는 OCR 모델 캐시
fs.mkdirSync(noOcrCache, { recursive: true });

// 사용자가 고른 화면 테마('light'|'dark')를 창보다 먼저 적용한다. 고른 적 없으면 시스템 설정을 따른다
const themeFile = path.join(app.getPath('userData'), 'theme.json');
try {
  nativeTheme.themeSource = JSON.parse(fs.readFileSync(themeFile, 'utf8'));
} catch {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'DocConverter',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12151b' : '#eef0f2',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// 엔진 CLI 실행 후 실패면 한국어 사유로 예외를 던진다
async function cli(args, opts) {
  const r = await run(engine.active().cli, args, opts);
  if (r.code !== 0) throw new Error(failure(r.stdout, r.stderr));
  return r;
}

const handlers = {
  async pick(e, { kind, filters, defaultPath }) {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (kind === 'save') {
      const r = await dialog.showSaveDialog(win, { defaultPath, filters });
      return r.canceled ? [] : [r.filePath];
    }
    const properties = kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'];
    const r = await dialog.showOpenDialog(win, { properties, filters, defaultPath });
    return r.canceled ? [] : r.filePaths;
  },

  stat(e, paths) {
    return paths.filter((p) => fs.existsSync(p)).map((p) => ({ path: p, dir: fs.statSync(p).isDirectory() }));
  },

  readText(e, p) {
    return fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  },

  writeText(e, { path: p, text }) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  },

  reveal(e, p) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p);
    else shell.showItemInFolder(p);
  },

  // 일괄 변환: 파일 하나씩 차례로, 실패해도 계속, 취소·지금 파일 건너뛰기 가능
  async convert(e, opts) {
    convertAbort = new AbortController();
    skipOcr = !!opts.skipOcr;
    const { signal } = convertAbort;
    const jobs = plan(collect(opts.inputs), opts);
    const send = (m) => !e.sender.isDestroyed() && e.sender.send('convert:progress', { total: jobs.length, ...m });
    const result = { total: jobs.length, ok: 0, skipped: 0, failed: [], canceled: false };
    const { cli: cliPath } = engine.active();

    for (const [i, j] of jobs.entries()) {
      if (signal.aborted) break;
      const skip = (reason) => (result.skipped++, send({ i, src: j.src, out: j.out, status: 'skipped', reason }));
      if (j.skip) {
        skip();
        continue;
      }
      send({ i, src: j.src, status: 'running' });
      fs.mkdirSync(path.dirname(j.out), { recursive: true });
      fileAbort = new AbortController();
      const fileSignal = AbortSignal.any([signal, fileAbort.signal]);
      const pages = opts.pages ? ['-p', opts.pages] : [];
      const args = [j.src, '-o', j.out, ...pages];
      // OCR 건너뛰기: 엔진은 OCR 모델 캐시가 있으면 스캔 쪽을 자동 OCR한다(README). 빈 캐시 폴더를 주면 OCR 없이 읽는다
      const env = skipOcr ? { KORDOC_MODEL_CACHE: noOcrCache } : undefined;
      let r;
      if (env && path.extname(j.src).toLowerCase() === '.pdf') {
        // 스캔 PDF인지 출력 파일을 만들지 않고 먼저 본다(OCR 없는 읽기는 쪽당 0.04초)
        r = await run(cliPath, [j.src, '--format', 'json', '--no-images', '--silent', ...pages], { signal: fileSignal, env });
        if (r.code === 0 && r.stdout.includes('"isImageBased": true')) {
          skip('OCR이 필요해 건너뜀');
          continue;
        }
      }
      if (!r || r.code !== null) r = await run(cliPath, args, { signal: fileSignal, env });
      // 스캔 PDF는 OCR로 한 번 더 시도(첫 사용 때 모델 약 18MB 내려받음). skipOcr는 변환 중에도 바뀔 수 있다
      if (r.code !== 0 && failureCode(r.stdout) === 'IMAGE_BASED_PDF') {
        if (skipOcr) {
          skip('OCR이 필요해 건너뜀');
          continue;
        }
        send({ i, src: j.src, status: 'running', note: 'OCR' });
        r = await run(cliPath, [...args, '--ocr'], { signal: fileSignal });
      }
      if (r.code === null) {
        if (signal.aborted) break;
        skip('사용자가 건너뜀');
        continue;
      }
      if (r.code === 0) {
        result.ok++;
        send({ i, src: j.src, out: j.out, status: 'done' });
      } else {
        const reason = failure(r.stdout, r.stderr);
        result.failed.push({ src: j.src, reason });
        send({ i, src: j.src, status: 'failed', reason });
      }
    }
    result.canceled = signal.aborted;
    return result;
  },

  cancelConvert() {
    convertAbort?.abort();
  },

  skipFile() {
    fileAbort?.abort();
  },

  setSkipOcr(e, on) {
    skipOcr = !!on;
  },

  async compare(e, { a, b, out }) {
    const r = await run(compareScript, [engine.active().index, a, b, out]);
    if (r.code !== 0) throw new Error(failure(r.stdout, r.stderr));
    return JSON.parse(r.stdout);
  },

  // 양식 필드 목록: 표 라벨 필드와 누름틀을 {key, value, hint}로 합친다
  async formFields(e, { file, template }) {
    const src = file ? [file] : ['--template', template];
    const r = await cli(['fill', ...src, '--dry-run', '--silent']);
    const j = JSON.parse(r.stdout);
    const seen = new Map();
    for (const f of j.fields || []) if (!seen.has(f.label)) seen.set(f.label, { key: f.label, value: f.value || '', hint: '' });
    for (const f of j.clickHereFields || []) if (!seen.has(f.name)) seen.set(f.name, { key: f.name, value: f.value || '', hint: f.placeholder || '' });
    return [...seen.values()];
  },

  async fill(e, { file, template, values, out }) {
    // 값 JSON은 BOM 없이 써야 한다(BOM이 있으면 kordoc fill이 실패)
    const tmp = path.join(os.tmpdir(), `docconverter-fill-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(values));
    try {
      const src = file ? [file] : ['--template', template];
      const r = await cli(['fill', ...src, '-j', tmp, '-o', out]);
      return (r.stderr.match(/(\d+)개 필드 채움/) || [])[1] ?? null;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  },

  async generate(e, { md, out, preset, org }) {
    await cli(['generate', md, '-o', out, '--preset', preset, ...(org ? ['--org', org] : [])]);
  },

  // README의 "## 기능" 아래 "### 도구 이름" 절을 {이름: {summary, bullets}}로 돌려준다(호버 설명용)
  help() {
    const md = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const section = md.split(/^## /m).find((s) => s.startsWith('기능')) || '';
    const out = {};
    for (const part of section.split(/^### /m).slice(1)) {
      const [name, ...lines] = part.trim().split(/\r?\n/);
      const body = lines.map((l) => l.trim()).filter(Boolean);
      out[name.trim()] = {
        summary: body.filter((l) => !l.startsWith('- ')).join(' '),
        bullets: body.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)),
      };
    }
    return out;
  },

  engineInfo() {
    return engine.active();
  },

  // 지금 엔진보다 새 버전이 있으면 그 버전, 없거나 오프라인이면 null
  async engineLatest() {
    try {
      const latest = await engine.latest();
      return newer(latest, engine.active().version) ? latest : null;
    } catch {
      return null;
    }
  },

  engineUpdate(e, version) {
    return engine.install(version).then(() => engine.active());
  },

  engineRollback() {
    engine.rollback();
    return engine.active();
  },

  theme() {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  },

  version() {
    return app.getVersion();
  },

  setTheme(e, theme) {
    nativeTheme.themeSource = theme;
    fs.writeFileSync(themeFile, JSON.stringify(theme));
  },
};

let convertAbort;
let fileAbort;
let skipOcr = false;

// 탐색기 우클릭 "MD로 변환"(--to-md 파일): 창 없이 원본 옆에 .md를 만들고(같은 이름이 있으면 " (1)"…), 끝나면 알림 하나로 알린다
// 여러 파일을 골라 누르면 탐색기가 파일마다 프로세스를 띄운다. 먼저 뜬 프로세스가 나머지 파일을 받아 차례로 처리한다
function toMdMode(files) {
  if (!app.requestSingleInstanceLock({ files })) return app.quit();
  const queue = [...files];
  app.on('second-instance', (e, argv, cwd, data) => queue.push(...(data?.files || [])));
  app.setAppUserModelId('com.backaura.docconverter');

  async function toMd(src) {
    if (!fs.existsSync(src) || !supported(src)) throw new Error('지원하지 않는 형식입니다');
    const out = freeName(path.join(path.dirname(src), `${path.parse(src).name}.md`));
    const { cli: cliPath } = engine.active();
    let r = await run(cliPath, [src, '-o', out, '--silent']);
    // 스캔 PDF는 OCR로 한 번 더 시도(첫 사용 때 모델 약 18MB 내려받음)
    if (r.code !== 0 && failureCode(r.stdout) === 'IMAGE_BASED_PDF') r = await run(cliPath, [src, '-o', out, '--silent', '--ocr']);
    if (r.code !== 0) throw new Error(failure(r.stdout, r.stderr));
    return out;
  }

  app.whenReady().then(async () => {
    const done = [];
    const failed = [];
    for (;;) {
      while (queue.length) {
        const src = queue.shift();
        try {
          done.push(await toMd(src));
        } catch (err) {
          failed.push(`${path.basename(src)}: ${err.message}`);
        }
      }
      // ponytail: 탐색기가 나머지 프로세스를 띄우는 동안 1.5초 더 받는다. 그 뒤에 뜬 프로세스는 스스로 첫 프로세스가 되어 따로 처리한다
      await new Promise((r) => setTimeout(r, 1500));
      if (!queue.length) break;
    }
    app.releaseSingleInstanceLock();

    const lines = failed.length ? failed : done.map((p) => path.basename(p));
    const more = lines.length > 5 ? `\n…외 ${lines.length - 5}개` : '';
    new Notification({
      title: failed.length ? `MD 변환: ${done.length}개 완료, ${failed.length}개 실패` : `MD 변환 완료 (${done.length}개)`,
      body: lines.slice(0, 5).join('\n') + more,
    }).show();
    setTimeout(() => app.quit(), 1000); // 알림이 전달될 시간을 둔다
  });
}

const toMdAt = process.argv.indexOf('--to-md');
if (toMdAt !== -1) {
  toMdMode(process.argv.slice(toMdAt + 1));
} else {
  for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
