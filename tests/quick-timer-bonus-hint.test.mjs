import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

// Item 17 (2026-11-08): the bare quick-timer number "30" on the battle screen
// read as a deadline. It is a bonus window (decide fast, earn points), so a
// provisional caption "はやく決めると得点" sits beside the number. Whether to
// keep the caption is decision-pending; the timer rules must not change.

test('quick hint caption sits between the coil and the ready button', () => {
  const group = html.indexOf('class="quickReadyGroup"');
  const coil = html.indexOf('id="quickCoil"', group);
  const hint = html.indexOf('id="quickHint"', group);
  const btn = html.indexOf('id="readyPlan"', group);
  assert.ok(group >= 0 && coil > group, 'quickReadyGroup and coil exist');
  assert.ok(hint > coil, 'hint is after (beside) the coil number');
  assert.ok(btn > hint, 'ready button stays after the hint');
  assert.match(
    html,
    /<span class="quickHint" id="quickHint">はやく決めると得点<\/span>/,
    'caption text is exactly はやく決めると得点',
  );
});

test('renderQuickTimer shows and hides the hint together with the coil', () => {
  assert.match(html, /const m=state\.match,coil=\$\('#quickCoil'\),num=\$\('#quickRemain'\),btn=\$\('#readyPlan'\),hint=\$\('#quickHint'\)/);
  assert.match(html, /coil\.hidden=!visible;if\(hint\)hint\.hidden=!visible;/);
  assert.match(
    html,
    /aria-label',`準備完了。はやく決めると得点。クイック判定/,
    'ready button aria-label also carries the caption',
  );
});

test('quick QA snapshot exposes the hint state', () => {
  assert.match(html, /hintHidden:\$\('#quickHint'\)\?\.hidden\?\?null,hintText:\$\('#quickHint'\)\?\.textContent\|\|null/);
});

test('item17 style block is last and lays the group out as coil / caption / button', () => {
  const block = html.indexOf('id="gameroad-quick-hint-item17"');
  assert.ok(block > html.indexOf('id="gameroad-battle-3d-card-label-r1"'), 'item17 style comes after earlier battle styles');
  assert.match(html, /\.battle \.quickHint\[hidden\]\{display:none!important\}/);
  assert.match(html, /\.battle \.planBox>\.quickReadyGroup\{grid-template-columns:32px auto 44px!important/);
});

test('quick timer rules are unchanged (window, tiers, points)', () => {
  assert.match(
    html,
    /const QUICK_WINDOW_MS=30000,QUICK_PERFECT_REMAIN_MS=20000,QUICK_GOOD_REMAIN_MS=15000,QUICK_PERFECT_POINTS=100,QUICK_GOOD_POINTS=10/,
    '30s window, PERFECT +100 at >=20s left, GOOD +10 at >=15s left',
  );
});
