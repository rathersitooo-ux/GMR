import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BATTLE_CARD_FOCUS_PRESENTATION_SCHEMA,
  projectBattleCardFocusSnapPosition,
  projectBattlePlayableHandAffordance,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

test('card focus keeps legal candidates delegated to the existing active option authority', () => {
  const state = projectBattlePlayableHandAffordance({
    handCardIds: ['a', 'b', 'c', 'd'],
    activeRole: 'battle',
    activeOptionValues: ['a', 'b', 'c'],
    oppositeSelectedCardId: 'b',
    reservedCardIds: ['c'],
    phasePlayable: true,
  });
  assert.equal(BATTLE_CARD_FOCUS_PRESENTATION_SCHEMA, 'gameroad.battle-card-focus-presentation.v1');
  assert.deepEqual(state.candidateCardIds, ['a']);
  assert.equal(state.showActionBase, true);
});

test('visual focus snap is bounded and does not rewrite pointer or gameplay authority', () => {
  const snapped = projectBattleCardFocusSnapPosition({
    ghostPosition: { left: 100, top: 100 },
    cardSize: { width: 80, height: 120 },
    snapRect: { left: 260, top: 180, width: 60, height: 60 },
    armed: true,
    maxPullPx: 28,
  });
  const dx = snapped.left - 100;
  const dy = snapped.top - 100;
  assert.ok(Math.hypot(dx, dy) <= 28.000001);
  assert.ok(snapped.left > 100);
  assert.ok(snapped.top > 100);
});

test('unarmed or invalid snap target preserves the raw drag projection', () => {
  assert.deepEqual(projectBattleCardFocusSnapPosition({
    ghostPosition: { left: 42, top: 77 },
    cardSize: { width: 80, height: 120 },
    snapRect: { left: 260, top: 180, width: 60, height: 60 },
    armed: false,
  }), { left: 42, top: 77 });
  assert.deepEqual(projectBattleCardFocusSnapPosition({
    ghostPosition: { left: 42, top: 77 },
    cardSize: { width: 0, height: 120 },
    snapRect: { left: 260, top: 180, width: 60, height: 60 },
    armed: true,
  }), { left: 42, top: 77 });
});

test('live drag arms and commits only a currently legal candidate while hit testing stays on the raw pointer', async () => {
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /const legalCandidate = currentPlayableHandAffordance\(root\)\?\.candidateCardIds\?\.includes\?\.\(state\.cardId\) === true;/);
  assert.match(source, /const armed = legalCandidate && isBattleHandAuraLaunchArmed\(\{\s*pointer: \{ x, y \},\s*auraRect,/);
  assert.match(source, /const commit = !cancelled && moved && state\.armed && state\.legalCandidate === true && sourceStillOrdinary;/);
  assert.match(source, /projectBattleCardFocusSnapPosition\(\{[\s\S]*ghostPosition,[\s\S]*snapRect: auraRect,[\s\S]*armed,/);
});

test('focus presentation has distinct focused, legal and staged visual states and cleans them on destroy', async () => {
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /data-card-focus="true"/);
  assert.match(source, /data-card-focus-legal="true"/);
  assert.match(source, /data-card-staged="true"/);
  assert.match(source, /delete node\.dataset\.cardFocus;/);
  assert.match(source, /delete node\.dataset\.cardFocusLegal;/);
  assert.match(source, /delete node\.dataset\.cardStaged;/);
});
