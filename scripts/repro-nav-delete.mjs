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

const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

async function login() {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**');
}

await login();
await page.goto(`${base}/admin/usuarios`, { waitUntil: 'networkidle' });
console.log('URL after goto usuarios:', page.url());

const clientesLink = page.locator('nav a[href="/admin/clientes"]');
console.log('Clientes link count:', await clientesLink.count());
console.log('Clientes link visible:', await clientesLink.isVisible());
console.log('Clientes link box:', await clientesLink.boundingBox());

// Check for overlays blocking clicks
const overlayCount = await page.locator('.fixed.inset-0').count();
console.log('Fixed overlays on page:', overlayCount);

await clientesLink.click({ timeout: 5000 }).catch((e) => console.log('Click error:', e.message));
await page.waitForTimeout(2000);
console.log('URL after click clientes:', page.url());
console.log('Hero:', await page.locator('.font-display.text-2xl').first().textContent().catch(() => null));

// Force navigation via href
await page.goto(`${base}/admin/clientes`, { waitUntil: 'networkidle' });
console.log('URL after hard goto clientes:', page.url());
console.log('Hero after hard goto:', await page.locator('.font-display.text-2xl').first().textContent().catch(() => null));

console.log('\nConsole logs:');
logs.slice(-20).forEach((l) => console.log(l));

await browser.close();
