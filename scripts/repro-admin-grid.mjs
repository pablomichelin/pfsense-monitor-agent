import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, '.env.api'), 'utf8');
const email = env.match(/^AUTH_BOOTSTRAP_EMAIL=(.+)$/m)?.[1]?.trim();
const password = env.match(/^AUTH_BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]?.trim();
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8088';

async function go(from, to) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  await page.goto(`${base}${from}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.locator(`nav a[href="${to}"]`).click();
  await page.waitForTimeout(5000);
  const ok = page.url().includes(to);
  console.log(`${from.padEnd(22)} -> ${to.padEnd(20)} : ${ok ? 'OK' : 'FAIL'}`);
  await browser.close();
}

const admin = ['/admin', '/admin/usuarios', '/admin/clientes', '/admin/permissoes'];
for (const a of admin) for (const b of admin) if (a !== b) await go(a, b);
