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
const requests = [];

page.on('request', (req) => {
  if (req.url().includes('clientes') || req.url().includes('_rsc')) {
    requests.push(`>> ${req.method()} ${req.url()}`);
  }
});
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('clientes') || url.includes('_rsc')) {
    requests.push(`<< ${res.status()} ${url}`);
  }
});
page.on('console', (msg) => {
  if (msg.type() === 'error') requests.push(`ERR ${msg.text()}`);
});

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"], input[type="email"]', email);
await page.fill('input[name="password"], input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**');
await page.goto(`${base}/admin/usuarios`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

requests.length = 0;
console.log('=== Click clientes from usuarios ===');
await page.locator('nav a[href="/admin/clientes"]').click();
await page.waitForTimeout(4000);
console.log('Final URL:', page.url());
requests.forEach((r) => console.log(r));

// Compare with usuarios click from admin
await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);
requests.length = 0;
console.log('\n=== Click usuarios from admin (control) ===');
await page.locator('nav a[href="/admin/usuarios"]').click();
await page.waitForTimeout(4000);
console.log('Final URL:', page.url());
requests.forEach((r) => console.log(r));

// Load clientes JS chunk directly
requests.length = 0;
console.log('\n=== Click clientes from admin ===');
await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
await page.locator('nav a[href="/admin/clientes"]').click();
await page.waitForTimeout(4000);
console.log('Final URL:', page.url());
requests.forEach((r) => console.log(r));

// Check chunk loads
const chunkStatus = await page.evaluate(async () => {
  const res = await fetch('/_next/static/chunks/app/admin/clientes/page-ab6a3398577c86f8.js');
  return res.status;
});
console.log('\nClientes chunk fetch status:', chunkStatus);

await browser.close();
