import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBattlePlayableHandRowRouletteModel,
} from '../browser/battle-playable-hand-row-roulette-runtime.mjs';
import {
  projectBattlePlayableHandRouletteOrecaPresentation,
} from '../browser/battle-playable-hand-row-roulette-oreca-presentation-core.mjs';
import { projectBattlePlayableHandAffordance } from '../browser/battle-janken-slidepad-runtime-mount.mjs';

const hand = ['j-rock', 'j-scissors', 'j-paper', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
const presentations = Object.fromEntries(hand.map((id) => [id, { label: id }]));

test('roulette candidates are remaining ordinary hand only and exclude all janken-reserved cards', () => {
  const projection = projectBattlePlayableHandAffordance({
    handCardIds: hand,
    activeRole: 'road',
    activeOptionValues: hand,
    reservedCardIds: ['j-rock', 'j-scissors', 'j-paper'],
    phasePlayable: true,
  });

  assert.deepEqual(projection.candidateCardIds, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  assert.equal(projection.candidateCardIds.some((id) => id.startsWith('j-')), false);
});

test('Oreca-inspired six-row presentation receives exactly the six remaining-hand candidates, never janken cards', () => {
  const projection = projectBattlePlayableHandAffordance({
    handCardIds: hand,
    activeRole: 'road',
    activeOptionValues: hand,
    reservedCardIds: ['j-rock', 'j-scissors', 'j-paper'],
    phasePlayable: true,
  });
  const model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: projection.candidateCardIds,
    cardPresentationById: presentations,
    anchorCardId: 'r3',
  });
  const render = projectBattlePlayableHandRouletteOrecaPresentation(model, { phase: 'IDLE' });

  assert.equal(render.mode, 'ORECA_SIX_ROW');
  assert.deepEqual(render.rows.map((row) => row.cardId), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  assert.equal(render.rows.filter((row) => row.selected).length, 1);
  assert.equal(render.rows.find((row) => row.selected)?.cardId, 'r3');
  assert.equal(render.rows.some((row) => row.cardId.startsWith('j-')), false);
});

test('non-six remaining hand keeps the existing fallback contract without filler cards', () => {
  const model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
    cardPresentationById: presentations,
  });
  const render = projectBattlePlayableHandRouletteOrecaPresentation(model, { phase: 'IDLE' });

  assert.equal(render.mode, 'EXISTING_RUNTIME_FALLBACK');
  assert.equal(render.slotCount, 5);
  assert.deepEqual(render.candidateCardIds, ['r1', 'r2', 'r3', 'r4', 'r5']);
});
