// 일괄 변환 입력 수집(하위 폴더 재귀)·출력 경로 계산·건너뛰기 판정
const fs = require('node:fs');
const path = require('node:path');

const EXTS = ['.hwp', '.hwpx', '.pdf', '.docx', '.xlsx'];

const supported = (p) => EXTS.includes(path.extname(p).toLowerCase()) && !path.basename(p).startsWith('~$');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'images' && !e.name.startsWith('.')) walk(p, out);
    } else if (supported(p)) {
      out.push(p);
    }
  }
}

// 입력(파일·폴더 경로 목록) → [{src, base}]. base는 저장 폴더로 구조를 옮길 때의 기준
function collect(inputs) {
  const seen = new Map();
  for (const input of inputs) {
    if (fs.statSync(input).isDirectory()) {
      const files = [];
      walk(input, files);
      for (const f of files) if (!seen.has(f)) seen.set(f, { src: f, base: input });
    } else if (supported(input) && !seen.has(input)) {
      seen.set(input, { src: input, base: path.dirname(input) });
    }
  }
  return [...seen.values()];
}

// [{src, base}] → [{src, out, skip}]
function plan(items, { outDir, overwrite } = {}) {
  const key = (i) => path.join(path.dirname(i.src), path.parse(i.src).name).toLowerCase();
  const count = new Map();
  for (const i of items) count.set(key(i), (count.get(key(i)) || 0) + 1);

  return items.map((i) => {
    const { name, ext } = path.parse(i.src);
    const file = count.get(key(i)) > 1 ? `${name}_${ext.slice(1).toLowerCase()}.md` : `${name}.md`;
    const dir = outDir ? path.join(outDir, path.relative(i.base, path.dirname(i.src))) : path.dirname(i.src);
    const out = path.join(dir, file);
    return { src: i.src, out, skip: !overwrite && fs.existsSync(out) };
  });
}

// 우클릭 변환용: out이 이미 있으면 덮어쓰지 않고 "이름 (1).md", "이름 (2).md"… 중 빈 이름을 준다
function freeName(out) {
  const { dir, name, ext } = path.parse(out);
  let p = out;
  for (let n = 1; fs.existsSync(p); n++) p = path.join(dir, `${name} (${n})${ext}`);
  return p;
}

module.exports = { EXTS, collect, plan, freeName, supported };
