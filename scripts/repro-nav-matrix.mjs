import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, '.env.api'), 'utf8');
const email = env.match(/^AUTH_BOOTSTRAP_EMAIL=(.+)$/m)?.[1]?.trim();
const password = env.match(/^AUTH_BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]?.trim();
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8088';

async function testNav(from, to) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  await page.goto(`${base}${from}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const before = page.url();
  const link = page.locator(`nav a[href="${to}"]`);
  if ((await link.count()) === 0) {
    console.log(`${from} -> ${to}: SKIP (no link)`);
    await browser.close();
    return;
  }
  await link.click();
  await page.waitForTimeout(1500);
  const after = page.url();
  console.log(`${from.padEnd(20)} -> ${to.padEnd(18)} : ${after.includes(to) ? 'OK  ' : 'FAIL'} (${before.split('/').pop()} -> ${after.split('/').pop()})`);
  await browser.close();
}

const routes = ['/admin', '/admin/usuarios', '/admin/permissoes', '/admin/clientes', '/dashboard', '/nodes', '/audit'];
const targets = ['/admin/clientes', '/admin/usuarios', '/admin', '/dashboard', '/nodes'];

for (const from of routes) {
  for (const to of targets) {
    if (from === to) continue;
    await testNav(from, to);
  }
}
