// 신구대조: 엔진 라이브러리의 compare로 두 문서를 비교해 Markdown 표로 저장하고 통계를 stdout으로 낸다
// 사용법: compare.mjs <엔진 index.js> <구 문서> <신 문서> <출력 md>
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const [engineIndex, oldPath, newPath, outPath] = process.argv.slice(2);
const { compare } = await import(pathToFileURL(engineIndex).href);
const d = await compare(await readFile(oldPath), await readFile(newPath));

const cell = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const tableText = (t) => t.cells.map((row) => row.map((c) => c.text).join(' · ')).join('<br>');
const blockText = (b) => (!b ? '' : b.type === 'table' ? tableText(b.table) : b.text ?? '');

const LABEL = { added: '신설', removed: '삭제', modified: '수정' };
const rows = [];
for (const x of d.diffs) {
  if (x.type === 'unchanged') continue;
  if (x.type === 'modified' && x.cellDiffs) {
    // 표는 바뀐 칸만 "(행,열)" 위치와 함께 보여 준다
    x.cellDiffs.forEach((row, r) =>
      row.forEach((c, k) => {
        if (c.type !== 'unchanged') rows.push([`표 ${LABEL[c.type]} (${r + 1}행 ${k + 1}열)`, c.before, c.after]);
      }),
    );
  } else {
    rows.push([LABEL[x.type], blockText(x.before), blockText(x.after)]);
  }
}

const s = d.stats;
const md = [
  '# 신구대조표',
  '',
  `- 현행: ${basename(oldPath)}`,
  `- 개정: ${basename(newPath)}`,
  `- 신설 ${s.added} · 삭제 ${s.removed} · 수정 ${s.modified} · 동일 ${s.unchanged}`,
  '',
  '| 구분 | 현행 | 개정 |',
  '| --- | --- | --- |',
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  '',
].join('\n');

await writeFile(outPath, md);
process.stdout.write(JSON.stringify({ stats: s, rows: rows.length }));
