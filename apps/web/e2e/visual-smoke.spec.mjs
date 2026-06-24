/**
 * Smoke visual: login + dashboard screenshot.
 * Estrutura base para expansão às 16 rotas da auditoria 108.
 *
 * Uso: BASE_URL=... node apps/web/e2e/visual-smoke.spec.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = join(root, '.env.api');

let email = process.env.AUTH_BOOTSTRAP_EMAIL;
let password = process.env.AUTH_BOOTSTRAP_PASSWORD;

if (!email || !password) {
  try {
    const { readFileSync } = await import('fs');
    const env = readFileSync(envPath, 'utf8');
    email ??= env.match(/^AUTH_BOOTSTRAP_EMAIL=(.+)$/m)?.[1]?.trim();
    password ??= env.match(/^AUTH_BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]?.trim();
  } catch {
    // credenciais opcionais para rota pública
  }
}

const base = process.env.BASE_URL ?? 'http://127.0.0.1:8088';
const outputDir = process.env.OUTPUT_DIR ?? join(root, 'docs/evidencias-e2e');

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.screenshot({ path: join(outputDir, '01-login.png'), fullPage: true });

  const title = await page.title();
  if (!title) {
    throw new Error('Página de login sem título');
  }

  if (email && password) {
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(outputDir, '02-dashboard.png'), fullPage: true });
    console.log('OK: login + dashboard capturados');
  } else {
    console.log('OK: login público capturado (sem credenciais para dashboard)');
  }
} finally {
  await browser.close();
}
