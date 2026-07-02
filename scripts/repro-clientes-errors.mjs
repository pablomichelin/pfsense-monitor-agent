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
const errors = [];
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.stack || err.message}`));

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"], input[type="email"]', email);
await page.fill('input[name="password"], input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**');
await page.goto(`${base}/admin/usuarios`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

errors.length = 0;
await page.locator('nav a[href="/admin/clientes"]').click();
await page.waitForTimeout(5000);
console.log('URL:', page.url());
console.log('Errors during clientes nav:');
errors.forEach((e) => console.log(e));

// Try evaluate chunk for syntax errors
const chunkOk = await page.evaluate(async () => {
  try {
    await import('/_next/static/chunks/app/admin/clientes/page-ab6a3398577c86f8.js');
    return 'import ok';
  } catch (e) {
    return `import fail: ${e.message}`;
  }
});
console.log('Dynamic import chunk:', chunkOk);

await browser.close();
