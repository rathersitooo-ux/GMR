import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT,
  BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_SCHEMA,
  syncBattleFourPublicRevealToRuntime,
} from '../browser/battle-four-public-live-integration.mjs';

function participants() {
  return [
    { id: 'P1', label: 'P1', team: 'A' },
    { id: 'P2', label: 'P2', team: 'B' },
    { id: 'P3', label: 'P3', team: 'A' },
    { id: 'P4', label: 'P4', team: 'B' },
  ];
}

function publicCards() {
  return [
    { playerId: 'P1', cardId: 'CARD-11', displayNumber: 11, hand: 'ROCK', committed: true, visibility: 'public' },
    { playerId: 'P2', cardId: 'CARD-22', displayNumber: 22, hand: 'PAPER', committed: true, visibility: 'public' },
    { playerId: 'P3', cardId: 'CARD-33', displayNumber: 33, hand: 'PAPER', committed: true, visibility: 'public' },
    { playerId: 'P4', cardId: 'CARD-44', displayNumber: 44, hand: 'SCISSORS', committed: true, visibility: 'public' },
  ];
}

function runtimeSpy() {
  const calls = [];
  return {
    runtime: {
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      render(model, hudSnapshot) {
        calls.push({ model, hudSnapshot });
        return model;
      },
    },
    calls,
  };
}

function sync(runtime, overrides = {}) {
  return syncBattleFourPublicRevealToRuntime({
    runtime,
    eventId: 'round-8:four-public',
    participants: participants(),
    publicCards: publicCards(),
    ...overrides,
  });
}

test('projects legal four-public reveal and renders existing runtime exactly once', () => {
  const spy = runtimeSpy();
  const result = sync(spy.runtime);

  assert.equal(result.schema, BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_SCHEMA);
  assert.equal(result.presentationOnly, true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(result.renderCount, 1);
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0].model, result.model);
  assert.equal(spy.calls[0].hudSnapshot, undefined);
  assert.equal(result.model.phase, 'reveal');
  assert.deepEqual(result.model.lanes.map(lane => [lane.id, lane.publicCard?.cardId]), [
    ['P1', 'CARD-11'],
    ['P2', 'CARD-22'],
    ['P3', 'CARD-33'],
    ['P4', 'CARD-44'],
  ]);
});

test('passes caller HUD snapshot only when explicitly supplied', () => {
  const spy = runtimeSpy();
  const hudSnapshot = { score: 12, turn: 8 };
  const result = sync(spy.runtime, { hudSnapshot });

  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0].model, result.model);
  assert.equal(spy.calls[0].hudSnapshot, hudSnapshot);
});

test('invalid four-public input fails before runtime render', () => {
  const spy = runtimeSpy();
  assert.throws(
    () => sync(spy.runtime, { publicCards: publicCards().slice(0, 3) }),
    /BATTLE_SCREEN_PUBLIC_CARDS_REQUIRE_FOUR/,
  );
  assert.equal(spy.calls.length, 0);

  const privateCard = publicCards();
  privateCard[0] = { ...privateCard[0], visibility: 'private' };
  assert.throws(
    () => sync(spy.runtime, { publicCards: privateCard }),
    /BATTLE_FOUR_PUBLIC_CARD_NOT_PUBLIC/,
  );
  assert.equal(spy.calls.length, 0);
});

test('rejects a runtime that is not the presentation-only existing Battle-screen boundary', () => {
  assert.throws(
    () => sync({ render(model) { return model; } }),
    /BATTLE_FOUR_PUBLIC_RUNTIME_AUTHORITY_BOUNDARY_INVALID/,
  );
  assert.throws(
    () => sync({ presentationOnly: true, gameplayAuthority: true, gameStateWrite: false, render(model) { return model; } }),
    /BATTLE_FOUR_PUBLIC_RUNTIME_AUTHORITY_BOUNDARY_INVALID/,
  );
});

test('requires existing runtime to return the exact audited model identity', () => {
  const runtime = {
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    render(model) { return { ...model }; },
  };
  assert.throws(
    () => sync(runtime),
    /BATTLE_FOUR_PUBLIC_RUNTIME_RENDER_IDENTITY_MISMATCH/,
  );
});

test('ReducedMotion and LowPerf keep exact four card identities through runtime handoff', () => {
  const reducedSpy = runtimeSpy();
  const lowPerfSpy = runtimeSpy();
  const reduced = sync(reducedSpy.runtime, { reducedMotion: true });
  const lowPerf = sync(lowPerfSpy.runtime, { lowPerf: true });
  const identities = model => model.lanes.map(lane => [lane.id, lane.publicCard?.cardId]);

  assert.deepEqual(identities(reduced.model), identities(lowPerf.model));
  assert.equal(reduced.model.motion, 'static_only');
  assert.equal(lowPerf.model.motion, 'static_only');
  assert.equal(reducedSpy.calls.length, 1);
  assert.equal(lowPerfSpy.calls.length, 1);
});

test('integration contract adds no order, winner, target, Shield, gameplay or mount authority', () => {
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_SCHEMA, 'gameroad.battle-four-public-live-integration.v1');
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.runtimeMountAuthority, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.renderCallsPerSync, 1);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.requiresPresentationOnlyRuntime, true);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.secretProjectionAuthority, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.processingOrderCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.winnerCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.targetCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.shieldCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.cardIdentityInference, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.createsSecondRenderer, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.readsHiddenHand, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.readsDeck, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT.productionHtmlMutationOwnedHere, false);
});
