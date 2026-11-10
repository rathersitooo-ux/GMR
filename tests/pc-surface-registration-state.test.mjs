// 39番・PCで動かす面を残す実行（E51）— PC面の現状を固定する検査。
//
// 出どころ: E51の文書は Drive・00_NOW・手元docsを11通りの探し方で
// 探しても見つからず（Google Docsだけに絞った全文検索「E51」は0件）。
// 引き継ぎメモの39番の1行だけが手がかり:
//   「PCで動かす面を残す実行（E51）｜何をするか：今の登録の状態を
//     確かめてから、残す実行をする｜決め待ち：なし」
// 「今の登録の状態」「残す実行」の指すものはメモだけでは決められないため、
// この検査は仕様を決めない。代わりに、写しに今あるPC面（デスクトップの
// 置き方・ホイール操作・細いポインタの見せ方）と、確かめられる登録の状態を
// そのまま固定する（残す）。振る舞いは変えない。E51の指すもの自体は
// 一番下の skip の検査に決め待ちとして残してある。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const boardBinding = readFileSync(
  new URL('../browser/battle-board-naki-4p-visual-binding.mjs', import.meta.url),
  'utf8',
);
const cameraRuntime = readFileSync(
  new URL('../browser/battle-camera-live-runtime.mjs', import.meta.url),
  'utf8',
);
const currentPlayerUi = readFileSync(
  new URL('../browser/battle-current-player-ui-runtime.mjs', import.meta.url),
  'utf8',
);
const feedbackAdapter = readFileSync(
  new URL('../browser/ui-state-feedback-ready-plan-adapter.mjs', import.meta.url),
  'utf8',
);

test('PC面: デスクトップの置き方を残す注釈が GAMEROAD.html にある', () => {
  assert.ok(
    html.includes(
      '/* Preserve desktop placement. On narrower screens, reserve a node-free strip and keep the visible reaction short; full text remains in the session log. */',
    ),
  );
});

test('PC面: 盤面の人物の大きさはデスクトップ 44x56・狭い画面 38x48 のまま', () => {
  assert.ok(
    boardBinding.includes(
      'desktop: Object.freeze({ surfaceWidth: 44, surfaceHeight: 56, fallbackWidth: 34, fallbackHeight: 44 })',
    ),
  );
  assert.ok(
    boardBinding.includes(
      'compact: Object.freeze({ surfaceWidth: 38, surfaceHeight: 48, fallbackWidth: 30, fallbackHeight: 38 })',
    ),
  );
  assert.ok(boardBinding.includes('width:${VISUAL_FOOTPRINT.desktop.surfaceWidth}px'));
  assert.ok(boardBinding.includes('@media(max-width:900px)'));
  assert.ok(boardBinding.includes('width:${VISUAL_FOOTPRINT.compact.surfaceWidth}px'));
});

test('PC面: デスクトップのホイール操作（拡大・Shiftで角度）が入ったまま', () => {
  assert.ok(cameraRuntime.includes('desktopWheelZoom: true,'));
  assert.ok(cameraRuntime.includes('desktopShiftWheelAngle: true,'));
});

test('PC面: 細いポインタ（マウス）のときだけの見せ方が残っている', () => {
  assert.ok(currentPlayerUi.includes('(pointer:fine)'));
  assert.ok(feedbackAdapter.includes('(pointer:fine)'));
});

test('登録の状態（確かめられる範囲）: serviceWorkerの登録はなく、提供者の登録だけある', () => {
  // 写しに serviceWorker の登録はない（0件）。勝手に足さない。
  assert.equal(html.includes('serviceWorker'), false);
  // 相棒のコメントの提供者を登録する仕組みはある。
  assert.ok(html.includes('registerProvider'));
});

test.skip(
  'E51（決め待ち）: 「今の登録の状態」「残す実行」の指すもの — '
    + 'E51の出どころの文書が見つかっていないため実行できない。'
    + '次は引き継ぎメモのE51の1行を書いた人（モカ／本アカ側）に聞くか、'
    + 'E番号の一覧の文書を探すこと。',
  () => {},
);
