import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.GAMEROAD_PUBLIC_BASE_URL || 'https://gameroad-browser-r5.pages.dev';
const outDir = path.resolve('gacha-visible-play-evidence');
fs.mkdirSync(outDir, { recursive: true });

const report = {
  baseURL,
  observedBuildId: process.env.OBSERVED_BUILD_ID || null,
  viewport: { width: 390, height: 844 },
  steps: [],
  outcome: 'UNSET',
  notes: [],
};

const safeLabel = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);

async function visibleControls(page) {
  return page.locator('button, a, [role="button"], input[type="button"], input[type="submit"]').evaluateAll((nodes) =>
    nodes.filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || 1) > 0;
    }).map((el) => ({
      tag: el.tagName,
      text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      aria: (el.getAttribute('aria-label') || '').trim().slice(0, 180),
      title: (el.getAttribute('title') || '').trim().slice(0, 180),
      id: el.id || '',
      dataGo: el.getAttribute('data-go') || '',
      dataScreen: el.getAttribute('data-screen') || '',
    })).slice(0, 160)
  );
}

async function snapshot(page, name) {
  const controls = await visibleControls(page);
  const bodyText = safeLabel(await page.locator('body').innerText().catch(() => ''));
  report.steps.push({ name, url: page.url(), bodyText, controls });
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`\n=== ${name} ===`);
  console.log('body:', bodyText);
  console.log('controls:', JSON.stringify(controls, null, 2));
  return controls;
}

function controlLabel(c) {
  return `${c.text} ${c.aria} ${c.title}`.toLowerCase();
}

async function clickControlByPatterns(page, patterns) {
  const candidates = page.locator('button, a, [role="button"], input[type="button"], input[type="submit"]');
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const text = safeLabel(await el.innerText().catch(() => ''));
    const aria = safeLabel(await el.getAttribute('aria-label').catch(() => ''));
    const title = safeLabel(await el.getAttribute('title').catch(() => ''));
    const label = `${text} ${aria} ${title}`.toLowerCase();
    if (!patterns.some((p) => p.test(label))) continue;
    await el.click({ timeout: 5000 });
    await page.waitForTimeout(650);
    return { text, aria, title };
  }
  return null;
}

async function visibleGachaEntry(page) {
  const controls = await visibleControls(page);
  return controls.find((c) => /ガチャ|gacha|召喚|くじ/.test(controlLabel(c))) || null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: report.viewport, reducedMotion: 'no-preference' });
const page = await context.newPage();
page.on('console', (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

try {
  const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 20000 });
  report.httpStatus = response?.status() ?? null;
  await page.locator('body').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1800);

  let controls = await snapshot(page, '01-entry');

  // If a title/start surface is blocking Home, only press a clearly start/continue/Home control.
  if (!(await visibleGachaEntry(page))) {
    const start = await clickControlByPatterns(page, [/はじめ|始め|スタート|start|continue|つづき|続き|ホーム|home/]);
    if (start) {
      report.notes.push({ action: 'title_or_start', control: start });
      controls = await snapshot(page, '02-after-start');
    }
  }

  let gacha = await visibleGachaEntry(page);
  if (!gacha) {
    // Explore only the visible Shop route; do not press purchase/draw controls here.
    const shop = await clickControlByPatterns(page, [/ショップ|shop|ストア|store/]);
    if (shop) {
      report.notes.push({ action: 'open_shop', control: shop });
      controls = await snapshot(page, '03-shop');
      gacha = await visibleGachaEntry(page);
    }
  }

  if (!gacha) {
    report.outcome = 'NO_VISIBLE_GACHA_ENTRY';
    report.notes.push('No visible control labeled Gacha/ガチャ/召喚/くじ was reachable from the visible entry/Home and visible Shop route. No private state injection was used.');
  } else {
    report.notes.push({ visibleGachaEntry: gacha });
    const entered = await clickControlByPatterns(page, [/ガチャ|gacha|召喚|くじ/]);
    if (!entered) {
      report.outcome = 'VISIBLE_ENTRY_NOT_CLICKABLE';
    } else {
      controls = await snapshot(page, '04-gacha');
      const dangerous = /(購入|買う|課金|有償|支払|決済|purchase|buy|paid)/i;
      const obvious = controls.filter((c) => {
        const label = `${c.text} ${c.aria} ${c.title}`;
        return /(見る|試す|プレビュー|演出|無料|1回|一回|引く|skip|スキップ|start|はじめ|開始)/i.test(label) && !dangerous.test(label);
      });
      if (obvious.length === 0) {
        report.outcome = 'GACHA_REACHED_NO_SAFE_OBVIOUS_ACTION';
      } else {
        const target = obvious[0];
        const patternText = (target.text || target.aria || target.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const clicked = await clickControlByPatterns(page, [new RegExp(patternText, 'i')]);
        report.notes.push({ action: 'obvious_gacha_action', target, clicked });
        controls = await snapshot(page, '05-after-gacha-action');
        const hasResultLike = controls.some((c) => /閉じ|戻|home|skip|スキップ|次|next|完了|ok/i.test(controlLabel(c))) || /結果|result|獲得|入手|reveal/i.test(safeLabel(await page.locator('body').innerText().catch(() => '')));
        report.outcome = hasResultLike ? 'GACHA_ACTION_GAVE_RESULT_OR_RECOVERY_CONTROL' : 'GACHA_ACTION_FEEDBACK_UNCLEAR';
      }
    }
  }
} catch (error) {
  report.outcome = 'HARNESS_OR_RUNTIME_ERROR';
  report.error = { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null };
  try { await snapshot(page, '99-error'); } catch {}
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\nFINAL_REPORT', JSON.stringify(report, null, 2));
  await browser.close();
}
