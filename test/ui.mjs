// 화면 시험: 앱을 띄워 폴더 드롭 → 일괄 변환 → 도장 표시를 확인하고 라이트·다크 화면을 캡처
// 사용법: node test/ui.mjs <표본 폴더> <캡처 저장 폴더> [설치된 DocConverter.exe — 없으면 개발 소스로 실행]
import { _electron as electron } from 'playwright';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
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

// 테마 스위치: 오른쪽(체크) = 다크, 왼쪽 = 라이트. 화면 색이 실제로 바뀌는지 본다
// Playwright는 기본으로 라이트 색 구성표를 흉내 내 nativeTheme 변경을 가리므로 흉내를 끈다
await page.emulateMedia({ colorScheme: null });
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeBefore = await page.evaluate(() => api.theme());
for (const theme of ['dark', 'light']) {
  if ((await page.isChecked('[data-testid=theme-toggle]')) !== (theme === 'dark')) await page.click('[data-testid=theme-toggle]');
  await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(() => api.theme()), theme);
  assert.strictEqual(await bg(), theme === 'dark' ? 'rgb(18, 21, 27)' : 'rgb(238, 240, 242)', `${theme} 배경색`);
  await page.screenshot({ path: path.join(shotDir, `00-테마스위치-${theme}.png`) });
}
await page.evaluate((t) => api.setTheme(t), themeBefore);

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
await page.emulateMedia({ colorScheme: 'light' });

// 스캔 PDF 두 개: 첫 파일 OCR 중에 'OCR 건너뛰기'를 켜고 '이 파일 건너뛰기' → 둘째는 OCR 없이 건너뛰어야 함
const scanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docconverter-scan-'));
for (const n of ['scan1.pdf', 'scan2.pdf']) fs.copyFileSync(path.join(import.meta.dirname, 'fixtures', 'scan.pdf'), path.join(scanDir, n));
await page.click('#convert-clear');
for (const type of ['dragEnter', 'dragOver', 'drop']) {
  await cdp.send('Input.dispatchDragEvent', { type, ...at, data: { ...data, files: [scanDir] } });
}
await page.waitForSelector('[data-testid=convert-queue] li');
await page.uncheck('[data-testid=skip-ocr]');
await page.click('[data-testid=convert-run]');
// 모델이 캐시돼 있으면 첫 변환에서 바로 OCR한다(4쪽에 약 20초). 시작하고 잠시 뒤 끊는다
await page.waitForFunction(() => /(변환 중|OCR).*scan1\.pdf/.test(document.querySelector('#convert-status').textContent), null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.check('[data-testid=skip-ocr]');
const skippedAt = Date.now();
await page.click('[data-testid=convert-skip]');
await page.waitForSelector('#convert-summary:not([hidden])', { timeout: 60000 });
const reasons = await page.locator('#convert-failures li').allTextContents();
console.log('건너뛴 문서:', reasons, `건너뛰기 후 ${Date.now() - skippedAt}ms에 끝남`);
assert.ok(Date.now() - skippedAt < 10000, '둘째 파일은 OCR 없이 금방 끝나야 함');
assert.match(await page.textContent('#summary-sub'), /건너뜀 2건/);
assert.ok(reasons[0].includes('scan1.pdf') && reasons[0].includes('사용자가 건너뜀'), '첫 파일은 사용자가 건너뜀');
assert.ok(reasons[1].includes('scan2.pdf') && reasons[1].includes('OCR이 필요해 건너뜀'), '둘째 파일은 OCR 없이 건너뜀');
assert.ok(await page.locator('[data-testid=convert-skip]').isHidden(), '변환이 끝나면 건너뛰기 버튼이 숨어야 함');
assert.strictEqual(await page.textContent('#seal span'), '확인', '건너뛴 문서가 있으면 도장은 확인');
await page.screenshot({ path: path.join(shotDir, '02-스캔건너뛰기.png') });
fs.rmSync(scanDir, { recursive: true, force: true });

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
const sw = await page.locator('[data-testid=theme-toggle]').boundingBox();
const vp = await page.evaluate(() => [innerWidth, innerHeight]);
assert.ok(sw && sw.x + sw.width <= vp[0] && sw.y + sw.height <= vp[1], '최소 창에서도 테마 스위치가 화면 안에 보여야 함');

await app.close();
console.log('화면 시험 통과');
