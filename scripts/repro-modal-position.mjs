import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, '.env.api'), 'utf8');
const email = env.match(/^AUTH_BOOTSTRAP_EMAIL=(.+)$/m)?.[1]?.trim();
const password = env.match(/^AUTH_BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]?.trim();
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8088';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**');
await page.goto(`${base}/admin/clientes`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

// Scroll to bottom where delete buttons likely are
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);

const deleteBtn = page.locator('button:has-text("Excluir cliente")').last();
await deleteBtn.scrollIntoViewIfNeeded();
await deleteBtn.click();
await page.waitForTimeout(500);

const dialog = page.locator('[role="dialog"]');
const dialogBox = await dialog.boundingBox();
const confirmBtn = page.locator('[role="dialog"] button:has-text("Excluir")');
const confirmBox = await confirmBtn.boundingBox();
const vp = page.viewportSize();

console.log('Viewport height:', vp.height);
console.log('Dialog bbox:', dialogBox);
console.log('Confirm btn bbox:', confirmBox);
console.log('Confirm visible in viewport:', confirmBox ? confirmBox.y >= 0 && confirmBox.y < vp.height : false);
console.log('Dialog h2 text:', await page.locator('[role="dialog"] h2').textContent().catch(() => null));

await page.screenshot({ path: '/tmp/modal-viewport.png' });
await browser.close();
