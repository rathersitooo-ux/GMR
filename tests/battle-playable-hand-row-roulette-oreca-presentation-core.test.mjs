import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT,
  canUseBattlePlayableHandRouletteOrecaPresentation,
  projectBattlePlayableHandRouletteOrecaPresentation,
} from '../browser/battle-playable-hand-row-roulette-oreca-presentation-core.mjs';

function model(ids, selectedCardId = ids[0] ?? null, extra = {}) {
  return {
    candidateCardIds: ids,
    selectedCardId,
    cardPresentationById: Object.fromEntries(ids.map((id, index) => [id, {
      label: `カード${index + 1}`,
      shortLabel: `C${index + 1}`,
      suit: index % 2 === 0 ? 'HEART' : 'SPADE',
      number: index + 1,
    }])),
    reducedMotion: false,
    lowPerf: false,
    ...extra,
  };
}

test('authoritative six-card candidate set enables the Oreca-inspired six-row presentation', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const projected = projectBattlePlayableHandRouletteOrecaPresentation(model(ids, 'd'), { phase: 'ROLLING' });

  assert.equal(BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT, 6);
  assert.equal(canUseBattlePlayableHandRouletteOrecaPresentation(model(ids)), true);
  assert.equal(projected.mode, 'ORECA_SIX_ROW');
  assert.equal(projected.exactSixSlot, true);
  assert.deepEqual(projected.rows.map((row) => row.cardId), ids);
  assert.equal(projected.rows.filter((row) => row.selected).length, 1);
  assert.equal(projected.rows.find((row) => row.selected)?.cardId, 'd');
  assert.equal(projected.rows.every((row) => row.motion === 'REEL_TICK'), true);
});

test('non-six candidate counts never invent filler cards and fall back to the existing runtime presentation', () => {
  for (const ids of [
    ['a', 'b', 'c', 'd', 'e'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  ]) {
    const projected = projectBattlePlayableHandRouletteOrecaPresentation(model(ids));
    assert.equal(projected.mode, 'EXISTING_RUNTIME_FALLBACK');
    assert.equal(projected.exactSixSlot, false);
    assert.equal(projected.rows.length, ids.length);
    assert.deepEqual(projected.rows.map((row) => row.cardId), ids);
    assert.equal(projected.interaction.fillerCardPolicy, 'NEVER');
  }
});

test('a stale selected card is not replaced with an invented selection', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const projected = projectBattlePlayableHandRouletteOrecaPresentation(model(ids, 'missing'), { phase: 'STOPPED' });

  assert.equal(projected.selectedCardId, null);
  assert.equal(projected.rows.some((row) => row.selected), false);
  assert.equal(projected.rows.some((row) => row.motion === 'STOP_FLASH'), false);
});

test('stopped state emphasizes only the authoritative selected row', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const projected = projectBattlePlayableHandRouletteOrecaPresentation(model(ids, 'b'), { phase: 'STOPPED' });

  assert.equal(projected.rows.find((row) => row.cardId === 'b')?.motion, 'STOP_FLASH');
  assert.equal(projected.rows.filter((row) => row.motion === 'STOP_FLASH').length, 1);
  assert.equal(projected.interaction.primaryAction, 'SELECT_OR_COMMIT');
});

test('reduced-motion and low-perf states preserve selection semantics without reel animation', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (const extra of [{ reducedMotion: true }, { lowPerf: true }]) {
    const projected = projectBattlePlayableHandRouletteOrecaPresentation(model(ids, 'c', extra), { phase: 'ROLLING' });
    assert.equal(projected.motionAllowed, false);
    assert.equal(projected.rows.every((row) => row.motion === 'STATIC'), true);
    assert.equal(projected.rows.find((row) => row.selected)?.cardId, 'c');
  }
});

test('the reference projector explicitly owns no random, legality, or gameplay authority', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const projected = projectBattlePlayableHandRouletteOrecaPresentation(model(ids));

  assert.equal(projected.referenceScope, 'PRESENTATION_AND_INPUT_FEEL_ONLY');
  assert.equal(projected.interaction.eyeTimingAdvantage, false);
  assert.equal(projected.interaction.randomOutcomeAuthority, false);
  assert.equal(projected.interaction.gameplayAuthority, false);
  assert.equal(projected.interaction.legalityAuthority, false);
});
