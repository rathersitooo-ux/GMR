// 39番・PCで動かす面を残す実行（E51）— 今の登録の状態の確かめと、残す実行の記録。
//
// 使い方: node tools/pc-surface-registration-check.mjs [--out <report.json>]
// 振る舞いは変えない。写しを読むだけ。E51の文書が見つかっていないため、
// 「今の登録の状態」「残す実行」の指すものはここでは決めない。
// 確かめられる範囲の状態を数えて JSON に残す（残す実行＝この記録を残すこと）。
// E51の指すもの自体は report の unknowns に決め待ちとして残す。
//
// 仕様を決めていないため、この記録は「E51の実行」そのものではない。
// 出どころの文書が見つかったら、その文書の指す登録・実行を確かめてから
// あらためて実行すること。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

const html = read('browser/GAMEROAD.html');
const boardBinding = read('browser/battle-board-naki-4p-visual-binding.mjs');
const cameraRuntime = read('browser/battle-camera-live-runtime.mjs');
const currentPlayerUi = read('browser/battle-current-player-ui-runtime.mjs');
const feedbackAdapter = read('browser/ui-state-feedback-ready-plan-adapter.mjs');

const report = {
  item: '39',
  ref: 'E51',
  title: 'PCで動かす面を残す実行',
  generatedAt: new Date().toISOString(),
  base: {
    gameroadHtmlLines: html.split('\n').length,
  },
  pcSurface: {
    desktopPlacementCommentPreserved: html.includes('Preserve desktop placement'),
    desktopFootprint44x56: boardBinding.includes(
      'desktop: Object.freeze({ surfaceWidth: 44, surfaceHeight: 56, fallbackWidth: 34, fallbackHeight: 44 })',
    ),
    compactFootprint38x48: boardBinding.includes(
      'compact: Object.freeze({ surfaceWidth: 38, surfaceHeight: 48, fallbackWidth: 30, fallbackHeight: 38 })',
    ),
    desktopWheelZoom: cameraRuntime.includes('desktopWheelZoom: true,'),
    desktopShiftWheelAngle: cameraRuntime.includes('desktopShiftWheelAngle: true,'),
    pointerFineHoverInCurrentPlayerUi: currentPlayerUi.includes('(pointer:fine)'),
    pointerFineHoverInFeedbackAdapter: feedbackAdapter.includes('(pointer:fine)'),
  },
  registrationState: {
    // 確かめられる範囲だけ。どれがE51の「登録」かは決めていない。
    serviceWorkerInHtml: count(html, 'serviceWorker'),
    registerProviderInHtml: count(html, 'registerProvider'),
    registeredInHtml: count(html, 'registered'),
    localStorageInHtml: count(html, 'localStorage'),
    sessionStorageInHtml: count(html, 'sessionStorage'),
  },
  unknowns: [
    'E51の出どころの文書が見つかっていない（Drive・00_NOW・手元docsを11通りで再検索、Google Docsだけの全文検索「E51」は0件）。',
    '「今の登録の状態」が何の登録か決められない。',
    '「残す実行」が何を残すのか決められない。',
    '次は引き継ぎメモのE51の1行を書いた人（モカ／本アカ側）に聞くか、E番号の一覧の文書を探すこと。',
  ],
  verdict: 'PC_SURFACE_PRESENT_BUT_E51_UNRESOLVED',
};

const outIndex = process.argv.indexOf('--out');
const out = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
