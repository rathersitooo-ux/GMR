import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'browser/GAMEROAD.html'), 'utf8');
const styleOpen = '<style id="gameroad-battle-screen-visual-remake-r3">';
const styleStart = html.indexOf(styleOpen);
const styleEnd = html.indexOf('</style>', styleStart + styleOpen.length);
const block = styleStart < 0 || styleEnd < 0 ? '' : html.slice(styleStart + styleOpen.length, styleEnd);

test('R3 skin is attached to the live Battle screen and uses the generated art set', () => {
  assert.ok(block.length > 0, 'R3 Battle visual block is present in GAMEROAD.html');
  assert.ok(html.includes('<section class="screen battle" data-screen="battle">'));
  for (const fileName of [
    'battle-world-landscape-r1.webp',
    'battle-world-portrait-r1.webp',
    'battle-hud-frame-r1.webp',
    'battle-command-panel-r2.png',
  ]) assert.ok(block.includes(fileName), 'style references ' + fileName);
  for (const asset of [
    'browser/assets/visual/battle/battle-world-landscape-r1.webp',
    'browser/assets/visual/battle/battle-world-portrait-r1.webp',
    'browser/assets/visual/battle/battle-hud-frame-r1.webp',
    'browser/assets/visual/battle/battle-action-medallion-r1.webp',
    'browser/assets/visual/battle/battle-command-panel-r2.png',
  ]) {
    const assetPath = path.join(root, asset);
    assert.ok(existsSync(assetPath), 'asset exists: ' + asset);
    assert.ok(statSync(assetPath).size > 20_000, 'asset is non-empty: ' + asset);
  }
  const png = readFileSync(path.join(root, 'browser/assets/visual/battle/battle-command-panel-r2.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'command panel is a PNG');
  assert.equal(png[25], 6, 'command panel keeps its RGBA alpha channel');
});

test('Battle interaction targets remain in the real screen and board hit areas stay active', () => {
  for (const id of [
    'roundNo', 'phaseTitle', 'publicTurnHud', 'board', 'boardPlayers',
    'battleRuntime', 'hand', 'roadSelect', 'battleSelect', 'clearPath',
    'readyPlan', 'targetBox', 'confirmTarget',
  ]) assert.ok(html.includes('id="' + id + '"'), 'live control ' + id + ' remains present');
  assert.ok(block.includes('#board{z-index:2!important;pointer-events:auto!important}'));
  assert.ok(block.includes('#battleAdvanceReservation'), 'dynamic reservation tray keeps its styled consumer');
  assert.ok(block.includes('.planBox>.planSelect'));
  assert.ok(block.includes('.planBox>.endpointChip'));
  assert.ok(block.includes('.planBox>#clearPath'));
  assert.ok(block.includes('#targetBox:not([hidden])'));
});

test('Battle layout has dedicated landscape, portrait, and reduced-motion rules', () => {
  assert.ok(block.includes('@media(max-width:820px) and (orientation:landscape)'));
  assert.ok(block.includes('@media(max-width:600px) and (orientation:portrait)'));
  assert.ok(block.includes('prefers-reduced-motion:reduce'));
  assert.ok(block.includes('#hand .handCard'));
  assert.ok(block.includes('min-height:42px!important'));
});
