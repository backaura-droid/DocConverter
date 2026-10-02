// batch.js의 입력 수집·출력 경로·건너뛰기 규칙 시험
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collect, plan } = require('../src/main/batch');

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '배치 시험-'));
  for (const f of files) {
    const p = path.join(root, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
  }
  return root;
}

test('폴더는 하위까지 지원 형식만 모으고 잠금 파일·images·숨김 폴더는 뺀다', () => {
  const root = tree([
    'a.hwp', 'b.HWPX', 'c.txt', '~$d.docx',
    '하위/e.pdf', '하위/더하위/f.xlsx',
    'images/g.pdf', '.git/h.pdf',
  ]);
  const got = collect([root]).map((i) => path.relative(root, i.src)).sort();
  assert.deepStrictEqual(got, ['a.hwp', 'b.HWPX', path.join('하위', 'e.pdf'), path.join('하위', '더하위', 'f.xlsx')].sort());
});

test('파일을 직접 넣으면 지원 형식만 받는다', () => {
  const root = tree(['a.docx', 'b.txt']);
  const got = collect([path.join(root, 'a.docx'), path.join(root, 'b.txt')]);
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].base, root);
});

test('저장 폴더가 없으면 원본 옆에 .md를 만든다', () => {
  const root = tree(['하위/보고서.hwp']);
  const [job] = plan(collect([root]), {});
  assert.strictEqual(job.out, path.join(root, '하위', '보고서.md'));
  assert.strictEqual(job.skip, false);
});

test('저장 폴더가 있으면 하위 구조를 그대로 옮긴다', () => {
  const root = tree(['하위/보고서.hwp']);
  const out = path.join(os.tmpdir(), '출력');
  const [job] = plan(collect([root]), { outDir: out });
  assert.strictEqual(job.out, path.join(out, '하위', '보고서.md'));
});

test('같은 폴더의 같은 이름 원본은 확장자 접미사로 구분한다', () => {
  const root = tree(['보고서.hwp', '보고서.pdf', '단독.pdf']);
  const outs = plan(collect([root]), {}).map((j) => path.basename(j.out)).sort();
  assert.deepStrictEqual(outs, ['단독.md', '보고서_hwp.md', '보고서_pdf.md']);
});

test('출력이 이미 있으면 건너뛰고, 덮어쓰기면 건너뛰지 않는다', () => {
  const root = tree(['a.hwp', 'a.md']);
  assert.strictEqual(plan(collect([root]), {})[0].skip, true);
  assert.strictEqual(plan(collect([root]), { overwrite: true })[0].skip, false);
});

test('같은 파일을 두 번 넣어도 한 번만 처리한다', () => {
  const root = tree(['a.hwp']);
  assert.strictEqual(collect([root, path.join(root, 'a.hwp')]).length, 1);
});
