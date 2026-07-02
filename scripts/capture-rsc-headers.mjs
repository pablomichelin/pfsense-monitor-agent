import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
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
await page.goto(`${base}/admin/usuarios`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

const captured = [];
page.on('request', (req) => {
  if (req.url().includes('/admin/clientes')) {
    captured.push({
      url: req.url(),
      headers: req.headers(),
    });
  }
});

await page.locator('nav a[href="/admin/clientes"]').click();
await page.waitForTimeout(3000);

writeFileSync('/tmp/clientes-rsc-request.json', JSON.stringify(captured, null, 2));
console.log('Captured', captured.length, 'requests');
if (captured[0]) {
  console.log('Router state tree:', captured[0].headers['next-router-state-tree']?.slice(0, 200));
}

// Replay request with curl via node fetch
if (captured[0]) {
  const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(captured[0].url, { headers: { ...captured[0].headers, cookie: cookies } });
  const body = await res.text();
  console.log('Replay status:', res.status, 'size:', body.length);
  const hasError = body.includes('"digest"') && !body.includes('"digest":"$undefined"');
  console.log('Has error digest:', hasError);
  if (hasError) console.log(body.match(/E\{[^}]+\}/g)?.slice(0, 3));
}

await browser.close();
