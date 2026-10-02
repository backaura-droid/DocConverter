// DocConverter 메인 프로세스: 창 생성·IPC·엔진 관리·작업 실행
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collect, plan } = require('./batch');
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'DocConverter',
    backgroundColor: '#f6f5f2',
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

  // 일괄 변환: 파일 하나씩 차례로, 실패해도 계속, 취소 가능
  async convert(e, opts) {
    convertAbort = new AbortController();
    const { signal } = convertAbort;
    const jobs = plan(collect(opts.inputs), opts);
    const send = (m) => !e.sender.isDestroyed() && e.sender.send('convert:progress', { total: jobs.length, ...m });
    const result = { total: jobs.length, ok: 0, skipped: 0, failed: [], canceled: false };
    const { cli: cliPath } = engine.active();

    for (const [i, j] of jobs.entries()) {
      if (signal.aborted) break;
      if (j.skip) {
        result.skipped++;
        send({ i, src: j.src, out: j.out, status: 'skipped' });
        continue;
      }
      send({ i, src: j.src, status: 'running' });
      fs.mkdirSync(path.dirname(j.out), { recursive: true });
      const args = [j.src, '-o', j.out, ...(opts.pages ? ['-p', opts.pages] : [])];
      let r = await run(cliPath, args, { signal });
      // 스캔 PDF는 OCR로 한 번 더 시도(첫 사용 때 모델 약 18MB 내려받음)
      if (r.code !== 0 && failureCode(r.stdout) === 'IMAGE_BASED_PDF') {
        send({ i, src: j.src, status: 'running', note: 'OCR' });
        r = await run(cliPath, [...args, '--ocr'], { signal });
      }
      if (r.code === null) break;
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
};

let convertAbort;
for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
