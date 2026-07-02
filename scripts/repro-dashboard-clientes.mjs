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
await page.fill('input[name="email"], input[type="email"]', email);
await page.fill('input[name="password"], input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**', { timeout: 15000 });
await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

await page.locator('nav a[href="/admin/clientes"]').click();
await page.waitForTimeout(5000);
const hero = await page.locator('.font-display.text-2xl').first().textContent().catch(() => null);
console.log('dashboard->clientes URL:', page.url());
console.log('hero:', hero?.trim());
console.log('OK?', page.url().includes('/admin/clientes') && hero?.includes('Clientes'));

await browser.close();
