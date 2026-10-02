// 화면 시험: 앱을 띄워 폴더 드롭 → 일괄 변환 → 도장 표시를 확인하고 라이트·다크 화면을 캡처
// 사용법: node test/ui.mjs <표본 폴더> <캡처 저장 폴더> [설치된 DocConverter.exe — 없으면 개발 소스로 실행]
import { _electron as electron } from 'playwright';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const [sampleDir, shotDir, exe] = process.argv.slice(2);
fs.mkdirSync(shotDir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // VSCode 안의 셸은 이 값을 물려받아 Electron이 node로 뜬다

const app = await electron.launch(exe ? { executablePath: exe, env } : { args: ['.'], env });
const page = await app.firstWindow();
page.on('pageerror', (e) => console.error('화면 오류:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('콘솔:', m.text()));
app.process().stderr.on('data', (d) => console.error('메인:', String(d).trim()));
await page.waitForSelector('[data-testid=engine]');
await page.waitForFunction(() => document.querySelector('#engine-version').textContent !== '—');

// 색 전환 애니메이션이 끝난 뒤 캡처한다
async function shot(name, scheme = 'light') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}
await shot('01-빈화면-light');
await shot('01-빈화면-dark', 'dark');

// 메뉴 호버 설명(README 기능 절)
await page.hover('[data-testid=tab-compare]');
await page.waitForTimeout(600);
const tip = page.locator('#tip-compare');
assert.ok(await tip.isVisible(), '신구대조 메뉴에 올리면 설명이 보여야 함');
assert.match(await tip.textContent(), /현행 문서와 개정 문서/);
await shot('01-호버설명-light');
await shot('01-호버설명-dark', 'dark');
await page.mouse.move(600, 650);
await page.emulateMedia({ colorScheme: 'light' });

// 탐색기에서 폴더를 끌어다 놓는 것과 같은 드래그 이벤트(디스크 경로를 실은 File)를 보낸다
const cdp = await page.context().newCDPSession(page);
const box = await page.locator('[data-testid=convert-drop]').boundingBox();
const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
const data = { items: [], files: [sampleDir], dragOperationsMask: 1 };
for (const type of ['dragEnter', 'dragOver', 'drop']) {
  await cdp.send('Input.dispatchDragEvent', { type, ...at, data });
}
await page.waitForSelector('[data-testid=convert-queue] li');
const kind = await page.locator('[data-testid=convert-queue] .kind').first().textContent();
assert.strictEqual(kind, '폴더', '드롭한 폴더가 목록에 폴더로 들어가야 함');

await page.check('[data-testid=overwrite]');
await page.click('[data-testid=convert-run]');
await page.waitForSelector('#convert-summary:not([hidden])', { timeout: 180000 });
const title = await page.textContent('#summary-title');
const sub = await page.textContent('#summary-sub');
console.log('요약:', title, '/', sub);
assert.ok(await page.locator('#convert-cancel').isHidden(), '변환이 끝나면 취소 버튼이 숨어야 함');
await shot('02-변환완료-light');
await shot('02-변환완료-dark', 'dark');

// 다른 탭 화면도 캡처
for (const tab of ['compare', 'extract', 'fill', 'generate']) {
  await page.click(`[data-testid=tab-${tab}]`);
  await page.mouse.move(600, 650);
  await shot(`03-${tab}`);
}

// 내장 기안문 칸 불러오기
await page.click('[data-testid=tab-fill]');
await page.check('input[name=fill-src][value=gian]');
await page.click('[data-testid=fill-load]');
await page.waitForSelector('[data-testid=fill-grid] input');
const n = await page.locator('[data-testid=fill-grid] input').count();
assert.ok(n >= 5, `기안문 칸이 5개 이상이어야 함(실제 ${n})`);
await page.screenshot({ path: path.join(shotDir, '04-기안문-칸.png') });

// 작은 창(모바일 대응 대신 최소 창 크기)에서도 깨지지 않는지
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 560));
await page.click('[data-testid=tab-convert]');
await page.screenshot({ path: path.join(shotDir, '05-최소창.png') });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
assert.strictEqual(overflow, false, '최소 창에서 가로 스크롤이 생기면 안 됨');

await app.close();
console.log('화면 시험 통과');
