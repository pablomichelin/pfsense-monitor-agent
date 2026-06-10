#!/usr/bin/env node
/**
 * Captura evidências visuais das telas da Onda 1.
 * Requer: npx playwright install chromium (se necessário)
 * Uso: node scripts/capture-onda1-evidence.mjs
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8088';
const OUT_DIR = join(ROOT, 'docs', 'evidencias-onda1');

function readEnv(key) {
  try {
    const content = readFileSync(join(ROOT, '.env.api'), 'utf8');
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  const email = readEnv('AUTH_BOOTSTRAP_EMAIL');
  const password = readEnv('AUTH_BOOTSTRAP_PASSWORD');
  if (!email || !password) {
    console.error('AUTH_BOOTSTRAP_EMAIL e AUTH_BOOTSTRAP_PASSWORD em .env.api');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  try {
    const page = await context.newPage();

    // 1. Login (sem autenticação)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(OUT_DIR, '01-login.png'), fullPage: true });
    console.log('01-login.png');

    // 2. Fazer login
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|nodes)/, { timeout: 10000 });

    // 3. Menu/Header com Auditoria (admin)
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(OUT_DIR, '02-menu-com-auditoria.png'), fullPage: false });
    console.log('02-menu-com-auditoria.png');

    // 4. Sessions
    await page.goto(`${BASE_URL}/sessions`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(OUT_DIR, '03-sessions.png'), fullPage: true });
    console.log('03-sessions.png');

    // 5. Alertas
    await page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(OUT_DIR, '04-alertas.png'), fullPage: true });
    console.log('04-alertas.png');

    // 6. Verificar versão no footer
    const footer = await page.locator('footer').textContent();
    console.log('Footer:', footer?.trim().slice(0, 80));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
