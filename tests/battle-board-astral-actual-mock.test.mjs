import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/mock/GAMEROAD_Battle_board_astral_actual_r1.html', import.meta.url), 'utf8');

assert.match(html, /DIRECT_ACTUAL_REFERENCE_ID=GR-USER-ASTRAL-PARTY-VIDEO-20261004/);
assert.match(html, /DIRECT_ACTUAL_DRIVE_FILE_ID=16ST3f8rkjU8xD7MbeGRjb59BXpT93JN9/);
assert.match(html, /data-presentation-state="BOARD"/);
assert.match(html, /CONTEXT_OVERLAY:'CONTEXT_OVERLAY'/);
assert.match(html, /BATTLE_SCENE:'BATTLE_SCENE'/);
assert.match(html, /data-preserves-board="true"/);
assert.match(html, /data-replaces-board="true"/);
assert.match(html, /snapshotBoardView\(\)/);
assert.match(html, /restoreBoardView\(boardViewSnapshot\)/);
assert.match(html, /camera\.position\.copy\(snapshot\.camera\)/);
assert.match(html, /controls\.target\.copy\(snapshot\.target\)/);
assert.match(html, /contextToBattle/);
assert.match(html, /battleReturn/);
assert.match(html, /renderer\.domElement\.style\.pointerEvents=next===PRESENTATION_STATE\.BOARD\?'auto':'none'/);
assert.match(html, /body\[data-presentation-state="BATTLE_SCENE"\] #hand/);
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);

for (const forbidden of [
  'localStorage',
  'sessionStorage',
  'new WebSocket',
  'XMLHttpRequest',
  'navigator.sendBeacon',
  'fetch('
]) {
  assert.equal(html.includes(forbidden), false, `mock must not gain product/network authority: ${forbidden}`);
}

for (const copiedExpression of [
  'ASTRAL PARTY',
  'START ANGEL',
  'FIGHT!',
  'DUEL!',
  'ショップ'
]) {
  assert.equal(html.includes(copiedExpression), false, `reference expression must not be copied: ${copiedExpression}`);
}

assert.match(
  html,
  /ADOPTED_ATOMS=board_context_persists_for_light_overlay\|dedicated_battle_replaces_board\|same_board_context_restored_after_battle/
);
assert.match(
  html,
  /REJECTED_COPY=characters\|board_geometry\|icons\|cards\|ui_chrome\|text\|palette\|artwork\|rules\|economy\|exact_timing/
);

console.log('battle Astral direct-actual mock regression: PASS');
