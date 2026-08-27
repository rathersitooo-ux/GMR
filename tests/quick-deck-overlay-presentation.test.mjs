import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_DECK_OVERLAY_PRESENTATION,
  deriveQuickDeckOverlayPresentation,
  projectBattleQuickDeck,
  projectBuildQuickDeck,
} from '../browser/quick-deck-overlay-presentation.mjs';
import {
  createAuthoritativeRemainingDeckSnapshot,
  projectRemainingDeckForViewer,
} from '../browser/battle-self-deck-inspect-core.mjs';

function ownerBattleProjection(ids = ['B', 'A', 'B'], revision = 4) {
  const snapshot = createAuthoritativeRemainingDeckSnapshot({
    matchId: 'MATCH-1',
    ownerPlayerId: 'P1',
    revision,
    remainingCardIds: ids,
  });
  return projectRemainingDeckForViewer(snapshot, {
    viewer: { id: 'P1', authenticated: true },
  });
}

function publicBattleProjection(ids = ['B', 'A', 'B'], revision = 4) {
  const snapshot = createAuthoritativeRemainingDeckSnapshot({
    matchId: 'MATCH-1',
    ownerPlayerId: 'P1',
    revision,
    remainingCardIds: ids,
  });
  return projectRemainingDeckForViewer(snapshot, {
    viewer: { id: 'P2', authenticated: true },
  });
}

test('build projection groups duplicate cards without mutating source or claiming legality/save authority', () => {
  const ids = ['B', 'A', 'B', 'C'];
  const before = [...ids];
  const value = projectBuildQuickDeck({
    deckId: 'DECK-1',
    cardIds: ids,
    label: 'Deck 1',
    revision: 9,
  });

  assert.equal(QUICK_DECK_OVERLAY_PRESENTATION.schema, 'gameroad.quick-deck-overlay.v1');
  assert.deepEqual(ids, before);
  assert.equal(value.ok, true);
  assert.equal(value.mode, 'build');
  assert.equal(value.total, 4);
  assert.equal(value.typeCount, 3);
  assert.deepEqual(value.cards, [
    { cardId: 'A', count: 1 },
    { cardId: 'B', count: 2 },
    { cardId: 'C', count: 1 },
  ]);
  assert.equal('legal' in value, false);
  assert.equal('saved' in value, false);
  assert.equal('owned' in value, false);
  assert.equal('cardIds' in value, false);
});

test('battle mode consumes the existing authenticated-owner projection and stays read only', () => {
  const owner = ownerBattleProjection();
  const before = JSON.stringify(owner);
  const value = projectBattleQuickDeck(owner);

  assert.equal(value.ok, true);
  assert.equal(value.mode, 'battle_remaining');
  assert.equal(value.matchId, 'MATCH-1');
  assert.equal(value.ownerPlayerId, 'P1');
  assert.equal(value.revision, 4);
  assert.equal(value.total, 3);
  assert.equal(value.typeCount, 2);
  assert.deepEqual(value.cards, [
    { cardId: 'A', count: 1 },
    { cardId: 'B', count: 2 },
  ]);
  assert.equal(value.editableHint, false);
  assert.equal(JSON.stringify(owner), before);
  assert.equal('remainingCardIds' in value, false);
});

test('battle adapter accepts the exact canonical string ordering emitted by the existing Battle core', () => {
  const owner = ownerBattleProjection(['a', 'B', 'a']);
  assert.deepEqual(owner.cardCounts, [
    { cardId: 'B', count: 1 },
    { cardId: 'a', count: 2 },
  ]);

  const value = projectBattleQuickDeck(owner);
  assert.equal(value.ok, true);
  assert.deepEqual(value.cards, owner.cardCounts);
});

test('public, opponent, spectator, or unauthenticated projections cannot be upgraded into hidden counts', () => {
  const projections = [
    publicBattleProjection(),
    projectRemainingDeckForViewer(createAuthoritativeRemainingDeckSnapshot({
      matchId: 'MATCH-1', ownerPlayerId: 'P1', revision: 4, remainingCardIds: ['A', 'B'],
    }), { viewer: { id: 'SPECTATOR', authenticated: true } }),
    projectRemainingDeckForViewer(createAuthoritativeRemainingDeckSnapshot({
      matchId: 'MATCH-1', ownerPlayerId: 'P1', revision: 4, remainingCardIds: ['A', 'B'],
    }), { viewer: { id: 'P1', authenticated: false } }),
  ];

  for (const projection of projections) {
    assert.equal('cardCounts' in projection, false);
    const value = projectBattleQuickDeck(projection);
    assert.equal(value.ok, false);
    assert.equal(value.reason, 'OWNER_COUNTS_UNAVAILABLE');
    assert.deepEqual(value.cards, []);
  }
});

test('battle adapter fails closed on unknown schema, malformed counts, ordering, totals, and type-count mismatch', () => {
  const base = ownerBattleProjection();
  const cases = [
    [{ ...base, schema: 'other' }, 'SCHEMA_UNKNOWN'],
    [{ ...base, cardCounts: [{ cardId: 'A', count: 0 }] }, 'CARD_COUNT_INVALID'],
    [{ ...base, total: 2, cardCounts: [{ cardId: 'B', count: 1 }, { cardId: 'A', count: 1 }] }, 'CARD_COUNTS_NOT_CANONICAL'],
    [{ ...base, total: 999 }, 'TOTAL_MISMATCH'],
    [{ ...base, typeCount: 99 }, 'TYPE_COUNT_MISMATCH'],
  ];

  for (const [projection, reason] of cases) {
    const value = projectBattleQuickDeck(projection);
    assert.equal(value.ok, false);
    assert.equal(value.reason, reason);
    assert.deepEqual(value.cards, []);
  }
});

test('edit action is available only for explicitly editable build mode and never for battle remaining mode', () => {
  const build = projectBuildQuickDeck({ deckId: 'D', cardIds: ['A'] });
  const battle = projectBattleQuickDeck(ownerBattleProjection(['A']));

  const buildNoEdit = deriveQuickDeckOverlayPresentation({
    projection: build,
    viewport: { width: 1280, height: 720 },
    allowEdit: false,
  }).presentation;
  const buildEdit = deriveQuickDeckOverlayPresentation({
    projection: build,
    viewport: { width: 1280, height: 720 },
    allowEdit: true,
  }).presentation;
  const battleAttempt = deriveQuickDeckOverlayPresentation({
    projection: battle,
    viewport: { width: 1280, height: 720 },
    allowEdit: true,
  }).presentation;

  assert.equal(buildNoEdit.actions.edit, false);
  assert.equal(buildEdit.actions.edit, true);
  assert.equal(battleAttempt.actions.edit, false);
  for (const value of [buildNoEdit, buildEdit, battleAttempt]) {
    assert.equal(value.actions.mutateDeck, false);
  }
});

test('overlay uses compact short-landscape and stacked portrait layouts while preserving dismiss paths', () => {
  const projection = projectBuildQuickDeck({ deckId: 'D', cardIds: ['A', 'B'] });
  const short = deriveQuickDeckOverlayPresentation({
    projection,
    viewport: { width: 667, height: 375 },
  }).presentation;
  const portrait = deriveQuickDeckOverlayPresentation({
    projection,
    viewport: { width: 390, height: 844 },
  }).presentation;

  assert.equal(short.layout.summaryBand, 'compact');
  assert.equal(short.layout.cardMatrix, 'dense_short_landscape');
  assert.equal(portrait.layout.summaryBand, 'standard');
  assert.equal(portrait.layout.cardMatrix, 'stacked');
  assert.deepEqual(short.dismiss, { closeButton: true, outsideTap: true, back: true });
  assert.equal(short.restoreContextOnClose, true);
  assert.equal(short.dimBackground, true);
});

test('reduced motion and low performance keep counts and actions while reducing animation to static', () => {
  const projection = projectBuildQuickDeck({ deckId: 'D', cardIds: ['A', 'A', 'B'] });
  const full = deriveQuickDeckOverlayPresentation({
    projection,
    viewport: { width: 1280, height: 720 },
  }).presentation;
  const reduced = deriveQuickDeckOverlayPresentation({
    projection,
    viewport: { width: 1280, height: 720 },
    preferences: { reducedMotion: true },
  }).presentation;
  const lowPerf = deriveQuickDeckOverlayPresentation({
    projection,
    viewport: { width: 1280, height: 720 },
    preferences: { lowPerf: true },
  }).presentation;

  assert.equal(full.motion, 'local_open_close_only');
  assert.equal(reduced.motion, 'static');
  assert.equal(lowPerf.motion, 'static');
  assert.equal(reduced.total, full.total);
  assert.deepEqual(reduced.cards, full.cards);
  assert.deepEqual(lowPerf.dismiss, full.dismiss);
});

test('invalid build and presentation inputs fail closed', () => {
  assert.equal(projectBuildQuickDeck({ deckId: '', cardIds: [] }).reason, 'DECK_ID_INVALID');
  assert.equal(projectBuildQuickDeck({ deckId: 'D', cardIds: [' A'] }).reason, 'CARD_IDS_INVALID');
  assert.equal(projectBuildQuickDeck({ deckId: 'D', cardIds: [], revision: -1 }).reason, 'REVISION_INVALID');

  const projection = projectBuildQuickDeck({ deckId: 'D', cardIds: [] });
  assert.equal(deriveQuickDeckOverlayPresentation({ projection, viewport: { width: 0, height: 1 } }).reason, 'VIEWPORT_INVALID');
  assert.equal(deriveQuickDeckOverlayPresentation({ projection: { ...projection, mode: 'other' }, viewport: { width: 1, height: 1 } }).reason, 'PROJECTION_INVALID');
});

test('projections and nested presentation data are deeply frozen', () => {
  const build = projectBuildQuickDeck({ deckId: 'D', cardIds: ['A', 'A'] });
  const battle = projectBattleQuickDeck(ownerBattleProjection(['A', 'B']));
  const presentation = deriveQuickDeckOverlayPresentation({
    projection: build,
    viewport: { width: 1280, height: 720 },
  });

  assert.equal(Object.isFrozen(build), true);
  assert.equal(Object.isFrozen(build.cards), true);
  assert.equal(Object.isFrozen(build.cards[0]), true);
  assert.equal(Object.isFrozen(battle), true);
  assert.equal(Object.isFrozen(battle.cards), true);
  assert.equal(Object.isFrozen(presentation), true);
  assert.equal(Object.isFrozen(presentation.presentation), true);
  assert.equal(Object.isFrozen(presentation.presentation.cards), true);
  assert.equal(Object.isFrozen(presentation.presentation.dismiss), true);
});
