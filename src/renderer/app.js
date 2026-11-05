// DocConverter 화면 동작: 탭 전환·끌어다 놓기·각 도구 실행·엔진 업데이트
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
// api는 preload가 contextBridge로 만든 전역(window.api)이라 다시 선언하지 않는다

const DOC_FILTER = [{ name: '문서', extensions: ['hwp', 'hwpx', 'pdf', 'docx', 'xlsx'] }];
const HWPX_FILTER = [{ name: 'HWPX', extensions: ['hwpx'] }];
const FORM_FILTER = [{ name: '양식', extensions: ['hwpx', 'hwp'] }];
const MD_FILTER = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }];

// 경로는 끝(파일명)이 보이도록 오른쪽 정렬로 자른다. LRM은 괄호가 뒤집히지 않게 막는다
function setPath(el, p, empty) {
  el.textContent = p ? `‎${p}‎` : empty ?? el.textContent;
  el.title = p || '';
}
const base = (p) => p.split(/[\\/]/).pop();
const dir = (p) => p.slice(0, p.length - base(p).length);
const stem = (p) => base(p).replace(/\.[^.]+$/, '');
const errText = (err) => String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

function showResult(el, msg, { error, reveal } = {}) {
  el.hidden = false;
  el.classList.toggle('error', !!error);
  el.textContent = msg;
  if (reveal) {
    const b = document.createElement('button');
    b.className = 'link';
    b.textContent = '폴더에서 보기';
    b.onclick = () => api.reveal(reveal);
    el.append(b);
  }
}

// 버튼을 잠그고 작업을 실행한다
async function busy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } finally {
    btn.textContent = old;
    btn.disabled = false;
  }
}

/* ── 탭 ── */
let activeTab = 'convert';
for (const tab of $$('[role=tab]')) {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    for (const t of $$('[role=tab]')) t.setAttribute('aria-selected', String(t === tab));
    for (const p of $$('[role=tabpanel]')) p.hidden = p.id !== `panel-${activeTab}`;
  });
}

// 왼쪽 메뉴 호버 설명: README의 기능 절을 그대로 보여 준다
api.help().then((help) => {
  for (const tab of $$('[role=tab]')) {
    const name = tab.firstChild.textContent.trim();
    const h = help[name];
    if (!h) continue;
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.id = `tip-${tab.dataset.tab}`;
    tip.setAttribute('aria-hidden', 'true');
    tip.append(Object.assign(document.createElement('p'), { textContent: h.summary }));
    if (h.bullets.length) {
      const ul = document.createElement('ul');
      for (const b of h.bullets) ul.append(Object.assign(document.createElement('li'), { textContent: b }));
      tip.append(ul);
    }
    tab.append(tip);
    tab.setAttribute('aria-describedby', tip.id);
  }
});

/* ── 끌어다 놓기 ── */
// 창 아무 곳에 놓아도 브라우저가 파일을 열지 않게 막고, 현재 탭의 기본 입력으로 보낸다
const dropTargets = new Map(); // 요소 → (경로 목록) 처리 함수
const tabDefault = {};

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const paths = [...e.dataTransfer.files].map(api.pathOf).filter(Boolean);
  if (!paths.length) return;
  const zone = e.target.closest?.('.drop');
  const handler = (zone && dropTargets.get(zone)) || tabDefault[activeTab];
  handler?.(paths);
  for (const z of $$('.drop.over')) z.classList.remove('over');
});

function makeDrop(el, handler) {
  dropTargets.set(el, handler);
  let depth = 0;
  el.addEventListener('dragenter', () => (++depth, el.classList.add('over')));
  el.addEventListener('dragleave', () => --depth <= 0 && ((depth = 0), el.classList.remove('over')));
  el.addEventListener('drop', () => ((depth = 0), el.classList.remove('over')));
}

/* ── 문서 변환 ── */
const convert = { items: [], outDir: null, running: false };

async function addInputs(paths) {
  const stats = await api.stat(paths);
  for (const s of stats) if (!convert.items.some((i) => i.path === s.path)) convert.items.push(s);
  renderQueue();
}

function renderQueue() {
  const q = $('#convert-queue');
  q.replaceChildren(
    ...convert.items.map((it, idx) => {
      const li = document.createElement('li');
      const kind = document.createElement('span');
      kind.className = `kind${it.dir ? ' dir' : ''}`;
      kind.textContent = it.dir ? '폴더' : base(it.path).split('.').pop().toUpperCase();
      const p = document.createElement('code');
      p.className = 'path';
      setPath(p, it.path);
      const rm = document.createElement('button');
      rm.className = 'remove';
      rm.textContent = '×';
      rm.setAttribute('aria-label', `${base(it.path)} 빼기`);
      rm.onclick = () => (convert.items.splice(idx, 1), renderQueue());
      li.append(kind, p, rm);
      return li;
    }),
  );
  const has = convert.items.length > 0;
  q.hidden = !has;
  $('#convert-queue-actions').hidden = !has;
  $('#convert-empty').hidden = has;
  updateConvertRun();
}

function updateConvertRun() {
  const needFolder = $('input[name=dest]:checked').value === 'folder' && !convert.outDir;
  $('#convert-run').disabled = convert.running || !convert.items.length || needFolder;
}

makeDrop($('#convert-drop'), addInputs);
tabDefault.convert = addInputs;

for (const b of $$('[data-pick]')) {
  b.addEventListener('click', async () => {
    const kind = b.dataset.pick;
    addInputs(await api.pick({ kind, filters: kind === 'files' ? DOC_FILTER : undefined }));
  });
}
$('#convert-clear').onclick = () => ((convert.items = []), renderQueue());

for (const r of $$('input[name=dest]')) {
  r.addEventListener('change', () => {
    const folder = $('input[name=dest]:checked').value === 'folder';
    $('#dest-folder-line').hidden = !folder;
    $('#dest-hint').textContent = folder ? '넣은 폴더의 하위 구조를 그대로 옮겨 저장합니다.' : '폴더를 넣으면 하위 폴더 구조를 유지합니다.';
    updateConvertRun();
  });
}
$('#dest-pick').onclick = async () => {
  const [p] = await api.pick({ kind: 'folder' });
  if (!p) return;
  convert.outDir = p;
  setPath($('#dest-folder'), p);
  updateConvertRun();
};

api.onProgress((m) => {
  const done = m.status === 'running' ? m.i : m.i + 1;
  $('#convert-bar').style.width = `${(done / m.total) * 100}%`;
  const label = { running: m.note === 'OCR' ? 'OCR로 다시 읽는 중' : '변환 중', done: '완료', skipped: `건너뜀(${m.reason || '이미 있음'})`, failed: '실패' }[m.status];
  $('#convert-status').textContent = `${m.i + 1} / ${m.total} · ${label} · ${base(m.src)}`;
  if (m.status === 'failed' || (m.status === 'skipped' && m.reason)) addFailure(m.src, m.reason, m.status);
  // 결재란은 진행 중에도 그 자리에서 숫자가 바뀐다
  $('#g-total').textContent = m.total;
  if (m.status === 'done') $('#g-ok').textContent = ++convert.ok;
  $('#g-check').textContent = $('#convert-failures').childElementCount;
});

function addFailure(src, reason, status) {
  const li = document.createElement('li');
  li.className = status;
  const p = document.createElement('code');
  p.className = 'path';
  setPath(p, src);
  const r = document.createElement('span');
  r.className = 'reason';
  r.textContent = reason;
  li.append(p, r);
  $('#convert-failures').append(li);
}

$('#convert-run').onclick = async () => {
  const toFolder = $('input[name=dest]:checked').value === 'folder';
  convert.running = true;
  updateConvertRun();
  $('#convert-cancel').hidden = false;
  $('#convert-skip').hidden = false;
  $('#convert-report').hidden = false;
  $('#convert-summary').hidden = true;
  $('#convert-failures').replaceChildren();
  convert.ok = 0;
  for (const id of ['#g-total', '#g-ok', '#g-check']) $(id).textContent = '0';
  $('#seal').hidden = true;
  $('#convert-bar').style.width = '0';
  $('#convert-status').textContent = '변환할 문서를 찾는 중…';
  try {
    const r = await api.convert({
      inputs: convert.items.map((i) => i.path),
      outDir: toFolder ? convert.outDir : null,
      pages: $('#pages').value.trim() || null,
      overwrite: $('#overwrite').checked,
      skipOcr: $('#skip-ocr').checked,
    });
    showSummary(r);
  } catch (err) {
    $('#convert-status').textContent = `변환을 시작하지 못했습니다: ${errText(err)}`;
  } finally {
    convert.running = false;
    $('#convert-cancel').hidden = true;
    $('#convert-skip').hidden = true;
    updateConvertRun();
  }
};
$('#convert-cancel').onclick = () => api.cancelConvert();
$('#convert-skip').onclick = () => api.skipFile();
// 변환 중에 바꿔도 남은 문서에 바로 적용한다
$('#skip-ocr').onchange = () => api.setSkipOcr($('#skip-ocr').checked);

/* ── 화면 테마 ── */
const themeSwitch = $('#theme');
api.theme().then((t) => (themeSwitch.checked = t === 'dark'));
themeSwitch.onchange = () => api.setTheme(themeSwitch.checked ? 'dark' : 'light');

function showSummary(r) {
  if (!r.total) {
    $('#convert-status').textContent = '변환할 문서(HWP·HWPX·PDF·DOCX·XLSX)를 찾지 못했습니다.';
    return;
  }
  const failed = r.failed.length;
  const listed = $('#convert-failures').childElementCount; // 실패 + 사유 있는 건너뜀(OCR·사용자)
  $('#convert-status').textContent = r.canceled ? '변환을 취소했습니다.' : '변환을 마쳤습니다.';
  $('#summary-title').textContent = r.canceled ? `${r.ok}건 변환 후 취소` : `${r.ok}건 변환`;
  $('#summary-sub').textContent = [`전체 ${r.total}건`, r.skipped && `건너뜀 ${r.skipped}건`, failed && `실패 ${failed}건`].filter(Boolean).join(' · ');
  const seal = $('#seal');
  seal.classList.toggle('partial', listed > 0 || r.canceled);
  $('span', seal).textContent = r.canceled ? '취소' : listed ? '확인' : '완료';
  $('#convert-summary').hidden = false;
  $('#g-total').textContent = r.total;
  $('#g-ok').textContent = r.ok;
  $('#g-check').textContent = listed;
  seal.hidden = false;
  seal.classList.remove('stamp');
  void seal.offsetWidth; // 애니메이션 다시 시작
  seal.classList.add('stamp');
}

/* ── 단일 파일 슬롯 공통 ── */
const slots = {};
function makeSlot(name, filters, onSet) {
  const el = $(`[data-slot="${name}"]`);
  const set = (p) => {
    slots[name] = p;
    setPath($('[data-path]', el), p);
    el.classList.add('filled');
    onSet?.(p);
  };
  makeDrop(el, (paths) => set(paths[0]));
  $('[data-pick-slot]', el).onclick = async () => {
    const [p] = await api.pick({ kind: 'files', filters });
    if (p) set(p);
  };
  return set;
}

const outs = {};
function setOut(name, p) {
  outs[name] = p;
  setPath($(`#${name}-out`), p);
}
for (const b of $$('[data-change-out]')) {
  b.onclick = async () => {
    const name = b.dataset.changeOut;
    const filters = name === 'compare' ? MD_FILTER : HWPX_FILTER;
    const [p] = await api.pick({ kind: 'save', defaultPath: outs[name], filters });
    if (p) setOut(name, p);
    refreshButtons();
  };
}

function refreshButtons() {
  $('#compare-run').disabled = !(slots['compare-a'] && slots['compare-b'] && outs.compare);
  $('#extract-run').disabled = !slots.extract;
  $('#fill-run').disabled = !(fillState.loaded && outs.fill);
  $('#generate-run').disabled = !(slots.generate && outs.generate);
}

/* ── 신구대조 ── */
const setCompareA = makeSlot('compare-a', DOC_FILTER, refreshButtons);
const setCompareB = makeSlot('compare-b', DOC_FILTER, (p) => {
  setOut('compare', `${dir(p)}${stem(p)}_신구대조.md`);
  refreshButtons();
});
// 탭 아무 곳에 놓으면 빈 칸부터 채운다. 두 개를 한꺼번에 놓으면 순서대로 현행·개정
tabDefault.compare = (paths) => {
  if (paths.length > 1) return setCompareA(paths[0]), setCompareB(paths[1]);
  (!slots['compare-a'] ? setCompareA : setCompareB)(paths[0]);
};

$('#compare-run').onclick = (e) =>
  busy(e.target, '비교하는 중…', async () => {
    try {
      const r = await api.compare({ a: slots['compare-a'], b: slots['compare-b'], out: outs.compare });
      const s = r.stats;
      showResult($('#compare-result'), `대조표를 저장했습니다. 신설 ${s.added} · 삭제 ${s.removed} · 수정 ${s.modified} · 동일 ${s.unchanged}`, { reveal: outs.compare });
    } catch (err) {
      showResult($('#compare-result'), `비교하지 못했습니다: ${errText(err)}`, { error: true });
    }
  });

/* ── 양식 추출 ── */
let extracted = [];
tabDefault.extract = (paths) => setExtract(paths[0]);
const setExtract = makeSlot('extract', FORM_FILTER, refreshButtons);

$('#extract-run').onclick = (e) =>
  busy(e.target, '찾는 중…', async () => {
    $('#extract-table').hidden = true;
    $('#extract-save').hidden = true;
    try {
      extracted = await api.formFields({ file: slots.extract });
      const tbody = $('#extract-table tbody');
      tbody.replaceChildren(
        ...extracted.map((f) => {
          const tr = document.createElement('tr');
          for (const v of [f.key, f.value, f.hint]) tr.append(Object.assign(document.createElement('td'), { textContent: v }));
          return tr;
        }),
      );
      $('#extract-table').hidden = false;
      $('#extract-save').hidden = false;
      showResult($('#extract-result'), `채울 칸 ${extracted.length}개를 찾았습니다.`);
    } catch (err) {
      showResult($('#extract-result'), `칸을 찾지 못했습니다: ${errText(err)}`, { error: true });
    }
  });

$('#extract-save').onclick = async () => {
  const p = slots.extract;
  const [out] = await api.pick({ kind: 'save', defaultPath: `${dir(p)}${stem(p)}_칸목록.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!out) return;
  const values = Object.fromEntries(extracted.map((f) => [f.key, f.value]));
  await api.writeText({ path: out, text: JSON.stringify(values, null, 2) });
  showResult($('#extract-result'), '칸 목록을 JSON으로 저장했습니다. 값을 채워 양식 채우기에서 불러오세요.', { reveal: out });
};

/* ── 양식 채우기 ── */
const fillState = { loaded: false };
const fillSource = () => $('input[name=fill-src]:checked').value;
const setFill = makeSlot('fill', FORM_FILTER, () => resetFill());
tabDefault.fill = (paths) => {
  $('input[name=fill-src][value=file]').checked = true;
  syncFillSource();
  setFill(paths[0]);
};

function resetFill() {
  fillState.loaded = false;
  $('#fill-grid').replaceChildren();
  $('#fill-result').hidden = true;
  refreshButtons();
}
function syncFillSource() {
  $('[data-slot=fill]').hidden = fillSource() !== 'file';
  resetFill();
}
for (const r of $$('input[name=fill-src]')) r.addEventListener('change', syncFillSource);

function renderFillGrid(fields) {
  $('#fill-grid').replaceChildren(
    ...fields.flatMap((f, i) => {
      const label = Object.assign(document.createElement('label'), { textContent: f.key, htmlFor: `fill-${i}` });
      const input = Object.assign(document.createElement('input'), { id: `fill-${i}`, value: f.value, placeholder: f.hint });
      input.dataset.key = f.key;
      return [label, input];
    }),
  );
  fillState.loaded = fields.length > 0;
  refreshButtons();
}

$('#fill-load').onclick = (e) =>
  busy(e.target, '불러오는 중…', async () => {
    const src = fillSource();
    if (src === 'file' && !slots.fill) return toast('양식 문서를 먼저 넣으세요.');
    try {
      const fields = await api.formFields(src === 'file' ? { file: slots.fill } : { template: src });
      renderFillGrid(fields);
      const p = slots.fill;
      setOut('fill', src === 'file' ? `${dir(p)}${stem(p)}_작성.hwpx` : `${src === 'gian' ? '일반기안문' : '간이기안문'}_작성.hwpx`);
      refreshButtons();
      $('#fill-result').hidden = true;
    } catch (err) {
      showResult($('#fill-result'), `칸을 불러오지 못했습니다: ${errText(err)}`, { error: true });
    }
  });

$('#fill-json').onclick = async () => {
  const [p] = await api.pick({ kind: 'files', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!p) return;
  try {
    const values = JSON.parse(await api.readText(p));
    const inputs = $$('#fill-grid input');
    if (!inputs.length) {
      renderFillGrid(Object.entries(values).map(([key, value]) => ({ key, value: String(value), hint: '' })));
    } else {
      for (const input of inputs) if (input.dataset.key in values) input.value = String(values[input.dataset.key]);
    }
    toast('값을 불러왔습니다.');
  } catch (err) {
    toast(`JSON을 읽지 못했습니다: ${errText(err)}`);
  }
};

$('#fill-run').onclick = (e) => {
  // 내장 서식은 저장 경로가 파일명만이면 저장 위치를 먼저 고른다
  if (!/[\\/]/.test(outs.fill)) return $('[data-change-out=fill]').click();
  return busy(e.target, '채우는 중…', async () => {
    const values = Object.fromEntries($$('#fill-grid input').map((i) => [i.dataset.key, i.value]));
    const src = fillSource();
    try {
      const n = await api.fill({ ...(src === 'file' ? { file: slots.fill } : { template: src }), values, out: outs.fill });
      showResult($('#fill-result'), n ? `칸 ${n}개를 채워 저장했습니다.` : '양식을 채워 저장했습니다.', { reveal: outs.fill });
    } catch (err) {
      showResult($('#fill-result'), `채우지 못했습니다: ${errText(err)}`, { error: true });
    }
  });
};

/* ── HWPX 생성 ── */
const setGenerate = makeSlot('generate', MD_FILTER, (p) => {
  setOut('generate', `${dir(p)}${stem(p)}.hwpx`);
  refreshButtons();
});
tabDefault.generate = (paths) => setGenerate(paths[0]);

$('#generate-run').onclick = (e) =>
  busy(e.target, '만드는 중…', async () => {
    try {
      await api.generate({ md: slots.generate, out: outs.generate, preset: $('#preset').value, org: $('#org').value.trim() });
      showResult($('#generate-result'), 'HWPX를 만들었습니다.', { reveal: outs.generate });
    } catch (err) {
      showResult($('#generate-result'), `만들지 못했습니다: ${errText(err)}`, { error: true });
    }
  });

/* ── 엔진 ── */
function renderEngine(info) {
  $('#engine-version').textContent = info.version;
  $('#engine-source').textContent = info.bundled ? '앱에 들어 있는 엔진' : '업데이트한 엔진';
  $('#engine-rollback').hidden = !info.canRollback;
}

async function checkEngine() {
  const info = await api.engineInfo();
  renderEngine(info);
  const latest = await api.engineLatest(); // 지금 엔진보다 새 버전일 때만 값이 온다
  $('#engine-update').hidden = !latest;
  if (latest) $('#engine-latest').textContent = latest;
}

$('#engine-update-btn').onclick = (e) =>
  busy(e.target, '설치·시험 중…', async () => {
    try {
      const info = await api.engineUpdate($('#engine-latest').textContent);
      renderEngine(info);
      $('#engine-update').hidden = true;
      toast(`엔진을 ${info.version}로 바꿨습니다.`);
    } catch (err) {
      toast(`엔진을 바꾸지 못했습니다. 기존 엔진을 그대로 씁니다. (${errText(err)})`);
    }
  });

$('#engine-rollback').onclick = async () => {
  const info = await api.engineRollback();
  renderEngine(info);
  toast(`엔진을 ${info.version}로 되돌렸습니다.`);
  checkEngine();
};

renderQueue();
refreshButtons();
checkEngine();
