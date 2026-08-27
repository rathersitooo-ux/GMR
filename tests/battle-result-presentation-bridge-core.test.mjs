import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_RESULT_PRESENTATION_BRIDGE_CORE,
  projectBattleResultPresentationBridge
} from '../browser/battle-result-presentation-bridge-core.mjs';

function cutinPlan() {
  return {
    presentationOnly: true,
    authorityBoundary: 'accepted_public_event_only',
    eventId: 'cutin-1',
    kind: 'partner_cutin',
    transition: 'PARTNER_CUTIN_LEFT',
    publicData: { partnerId: 'PARTNER-A' }
  };
}

function comparePlan(overrides = {}) {
  return {
    presentationOnly: true,
    authorityBoundary: 'accepted_public_event_only',
    eventId: 'compare-1',
    kind: 'compare4',
    transition: 'COMPARE4',
    publicData: {
      playerIds: ['P1', 'P2', 'P3', 'P4'],
      winnerId: 'P3',
      comparePayload: { values: { P1: 999, P2: 3, P3: 1, P4: 2 } },
      ...overrides
    }
  };
}

function cardBridge() {
  return {
    plan: {
      presentationOnly: true,
      eventId: 'card-1',
      kind: 'scan',
      visual: { source: 'formal', assetId: 'VIS-1' },
      audio: { source: 'silent' }
    },
    identity: {
      eventId: 'card-1',
      cardId: 'CARD-77',
      actionId: 'ACTION-9',
      characterId: 'CHAR-2'
    }
  };
}

function resultProjection() {
  return {
    ok: true,
    stage: 'settled',
    finalizedResult: {
      winnerId: 'P4',
      ranking: [{ playerId: 'P4', rank: 1 }],
      opaqueUpstreamToken: 'do-not-recompute'
    },
    effects: { motion: 'enabled', particles: 'enabled' },
    assets: { character: 'available' }
  };
}

function queueSnapshot() {
  return {
    enabled: true,
    resultId: 'RESULT-1',
    status: 'searching',
    ticketId: 'TICKET-1',
    matchId: null,
    attempt: 1
  };
}

test('bridge is presentation-only and exposes no gameplay authority writes', () => {
  const out = projectBattleResultPresentationBridge({ conveyorPlans: [cutinPlan()] });
  assert.equal(out.ok, true);
  assert.equal(out.schema, 'GAMEROAD_BATTLE_RESULT_PRESENTATION_BRIDGE_V1');
  assert.equal(BATTLE_RESULT_PRESENTATION_BRIDGE_CORE.schema, out.schema);
  assert.equal(out.presentationOnly, true);
  assert.deepEqual(out.semantic.authority, {
    presentationOnly: true,
    winnerWrite: false,
    legalityWrite: false,
    resultWrite: false,
    queueWrite: false,
    cardIdentityWrite: false
  });
});

test('partner cut-in consumes accepted public plan and preserves partner identity', () => {
  const out = projectBattleResultPresentationBridge({ conveyorPlans: [cutinPlan()] });
  assert.equal(out.ok, true);
  assert.deepEqual(out.semantic.battle[0], {
    type: 'partner_cutin',
    eventId: 'cutin-1',
    partnerId: 'PARTNER-A',
    transition: 'PARTNER_CUTIN_LEFT'
  });
});

test('compare fails closed when authoritative explicit winner is missing', () => {
  const plan = comparePlan({ winnerId: undefined });
  const out = projectBattleResultPresentationBridge({ conveyorPlans: [plan] });
  assert.deepEqual(out, { ok: false, reason: 'COMPARE_EXPLICIT_WINNER_REQUIRED' });
});

test('compare preserves explicit winner even when numeric payload would suggest another player', () => {
  const out = projectBattleResultPresentationBridge({ conveyorPlans: [comparePlan()] });
  assert.equal(out.ok, true);
  assert.equal(out.semantic.battle[0].winnerId, 'P3');
  assert.equal(out.semantic.battle[0].comparePayload.values.P1, 999);
  assert.equal(out.semantic.battle[0].comparePayload.values.P3, 1);
});

test('card scan/summon bridge preserves Card/Action/Character identities and emits no writes', () => {
  const out = projectBattleResultPresentationBridge({ cardPresentation: cardBridge() });
  assert.equal(out.ok, true);
  assert.deepEqual(
    { cardId: out.semantic.card.cardId, actionId: out.semantic.card.actionId, characterId: out.semantic.card.characterId },
    { cardId: 'CARD-77', actionId: 'ACTION-9', characterId: 'CHAR-2' }
  );
  assert.equal(out.semantic.card.identityWrite, false);
  assert.equal(out.semantic.card.gameplayWrite, false);
});

test('card bridge fails closed when presentation event and identity witness do not match', () => {
  const card = cardBridge();
  card.identity.eventId = 'forged-other-event';
  const out = projectBattleResultPresentationBridge({ cardPresentation: card });
  assert.deepEqual(out, { ok: false, reason: 'CARD_EVENT_ID_MISMATCH' });
});

test('HATE1000 stays outside Branch5 instead of acquiring semantic ownership', () => {
  const out = projectBattleResultPresentationBridge({
    hate1000Presentation: {
      plan: { presentationOnly: true, eventId: 'hate-1', kind: 'hate1000_explosion' },
      authority: { authorized: true, eventId: 'hate-1', hateValue: 1000 }
    }
  });
  assert.deepEqual(out, { ok: false, reason: 'HATE1000_OUT_OF_SCOPE' });
});

test('result and autoqueue remain opaque same-screen projections with no queue command', () => {
  const source = resultProjection();
  const before = JSON.stringify(source.finalizedResult);
  const out = projectBattleResultPresentationBridge({
    resultPresentation: source,
    autoQueueSnapshot: queueSnapshot()
  });
  assert.equal(out.ok, true);
  assert.equal(out.semantic.result.autoQueueSurface, 'same_result_screen');
  assert.equal(out.semantic.result.queueCommand, null);
  assert.equal(out.semantic.result.queueWrite, false);
  assert.equal(JSON.stringify(source.finalizedResult), before);
  assert.deepEqual(out.semantic.result.finalizedResult, source.finalizedResult);
  assert.notEqual(out.semantic.result.finalizedResult, source.finalizedResult);
});

test('FULL, REDUCED, and LOW_PERF have identical semantic landing with presentation-only visual changes', () => {
  const input = {
    conveyorPlans: [cutinPlan(), comparePlan()],
    cardPresentation: cardBridge(),
    resultPresentation: resultProjection(),
    autoQueueSnapshot: queueSnapshot()
  };
  const full = projectBattleResultPresentationBridge(input);
  const reduced = projectBattleResultPresentationBridge(input, { reducedMotion: true });
  const lowPerf = projectBattleResultPresentationBridge(input, { lowPerf: true });
  assert.deepEqual(full.semantic, reduced.semantic);
  assert.deepEqual(full.semantic, lowPerf.semantic);
  assert.deepEqual([full.mode, reduced.mode, lowPerf.mode], ['full', 'reduced', 'low_perf']);
  assert.notDeepEqual(full.visualPolicy, reduced.visualPolicy);
  assert.notDeepEqual(full.visualPolicy, lowPerf.visualPolicy);
});

test('untrusted upstream projections fail closed and successful output is immutable', () => {
  const badBattle = projectBattleResultPresentationBridge({
    conveyorPlans: [{ eventId: 'bad', kind: 'compare4', presentationOnly: true, publicData: {} }]
  });
  assert.deepEqual(badBattle, { ok: false, reason: 'CONVEYOR_PLAN_UNTRUSTED' });

  const badQueue = projectBattleResultPresentationBridge({
    resultPresentation: resultProjection(),
    autoQueueSnapshot: { status: 'invented_success' }
  });
  assert.deepEqual(badQueue, { ok: false, reason: 'AUTOQUEUE_SNAPSHOT_INVALID' });

  const good = projectBattleResultPresentationBridge({ conveyorPlans: [cutinPlan()] });
  assert.equal(Object.isFrozen(good), true);
  assert.equal(Object.isFrozen(good.semantic), true);
  assert.equal(Object.isFrozen(good.semantic.battle[0]), true);
});
