import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_PLAN_HAND_PRESENTATION_STATES,
  BATTLE_PLAN_HUD_PRESENTATION_CORE,
  projectBattlePlanHudPresentation
} from '../browser/battle-plan-hud-presentation-core.mjs';

function makeInput() {
  return {
    revision: { expected: 'r10', current: 'r10' },
    responsiveMode: 'short-landscape',
    phase: {
      round: 2,
      phase: 'PLAN',
      status: 'DECIDING',
      readyCount: 2,
      totalPlayers: 4,
      actionClockMs: 21800,
      quickClockMs: 12800
    },
    self: {
      playerId: 'P1',
      displayName: 'YOU',
      portraitRef: 'portrait:self',
      teamId: 'A',
      partner: {
        partnerId: 'NAKI',
        displayName: 'ナキ',
        portraitRef: 'partner:naki',
        expression: 'focus'
      },
      resources: {
        mana: { total: 5, awakened: 3, suits: { spade: 1, heart: 1, club: 1, diamond: 1, moon: 1 } },
        hate: 235,
        deckCount: 26,
        ex: 2,
        chip: 3,
        honey: 4,
        graveyard: 8,
        banished: 1,
        shields: 3
      },
      hand: [
        { slot: 0, cardId: 'C-2' },
        { slot: 1, cardId: 'C-3', presentationState: 'selected', selected: true },
        { slot: 2, cardId: 'C-4', presentationState: 'pending', pending: true, operationToken: 'op-1' }
      ],
      reservations: {
        road: { slot: 1, cardId: 'C-3' },
        battle: { slot: 2, cardId: 'C-4' },
        private: { path: ['R09C09', 'R08C09'] }
      },
      controls: {
        confirm: true,
        cancel: true,
        detail: true,
        targetChange: false
      }
    },
    opponents: [
      {
        playerId: 'P4',
        seat: 3,
        displayName: 'P4',
        handCount: 3,
        shields: 2,
        laneProgress: [2, 1, 0],
        ready: false,
        submitState: 'CHOOSING',
        publicStatus: 'CONNECTED',
        connected: true
      },
      {
        playerId: 'P2',
        seat: 1,
        displayName: 'P2',
        handCount: 3,
        shields: 3,
        laneProgress: [1, 1, 1],
        ready: true,
        submitState: 'SUBMITTED',
        connected: true
      },
      {
        playerId: 'P3',
        seat: 2,
        displayName: 'P3',
        handCount: 2,
        shields: 1,
        laneProgress: [4, 0, 3],
        ready: true,
        submitState: 'SUBMITTED',
        connected: true
      }
    ]
  };
}

function expectFail(view, reason) {
  assert.deepEqual(view, {
    schema: 'gameroad.battle-plan-hud-presentation.v1',
    ok: false,
    clear: true,
    reason,
    brandingVisible: false
  });
}

test('schema and PLAN layout roles are stable and contain no battle branding', () => {
  const view = projectBattlePlanHudPresentation(makeInput());
  assert.equal(view.ok, true);
  assert.equal(view.schema, 'gameroad.battle-plan-hud-presentation.v1');
  assert.deepEqual(view.layout, {
    selfHud: 'bottom-left',
    hand: 'bottom-center-right',
    opponents: 'top-right',
    status: 'top-left',
    primaryControls: 'right-thumb',
    responsiveMode: 'short-landscape'
  });
  assert.equal(view.brandingVisible, false);
  assert.equal(JSON.stringify(view).includes('GAME ROAD'), false);
  assert.equal(BATTLE_PLAN_HUD_PRESENTATION_CORE.brandingVisible, false);
});

test('canonical hand feedback states include shared normal state and do not compute actions', () => {
  assert.deepEqual(BATTLE_PLAN_HAND_PRESENTATION_STATES, [
    'normal', 'focus', 'pressed', 'detail', 'selected', 'pending', 'confirmed', 'failed', 'disabled'
  ]);
  const view = projectBattlePlanHudPresentation(makeInput());
  assert.deepEqual(view.authority, {
    mode: 'presentation-only',
    computesLegality: false,
    mutatesAuthoritativeState: false,
    autoExecutesActions: false,
    mountsProductHtml: false
  });
});

test('untouched hand card defaults to normal instead of fabricated focus', () => {
  const view = projectBattlePlanHudPresentation(makeInput());
  assert.equal(view.ok, true);
  assert.equal(view.self.hand.cards[0].presentationState, 'normal');
});

test('self Partner, resources, clocks and phase are projected without inventing values', () => {
  const input = makeInput();
  const view = projectBattlePlanHudPresentation(input);
  assert.deepEqual(view.phase, input.phase);
  assert.deepEqual(view.self.partner, input.self.partner);
  assert.deepEqual(view.self.resources, input.self.resources);
  assert.equal('unknownResource' in view.self.resources, false);
});

test('three-card hand is slot-stable and preserves presentation feedback state', () => {
  const input = makeInput();
  input.self.hand.reverse();
  const view = projectBattlePlanHudPresentation(input);
  assert.equal(view.self.hand.targetCount, 3);
  assert.equal(view.self.hand.count, 3);
  assert.equal(view.self.hand.transientShortfall, false);
  assert.deepEqual(view.self.hand.cards.map(card => card.cardId), ['C-2', 'C-3', 'C-4']);
  assert.deepEqual(view.self.hand.cards.map(card => card.presentationState), ['normal', 'selected', 'pending']);
  assert.equal(view.self.hand.cards[1].selected, true);
  assert.equal(view.self.hand.cards[2].pending, true);
  assert.equal(view.self.hand.cards[2].operationToken, 'op-1');
});

test('transient hand shortfall is allowed and never fabricates cards', () => {
  const input = makeInput();
  input.self.hand = [{ slot: 1, cardId: 'ONLY', presentationState: 'confirmed', confirmed: true }];
  const view = projectBattlePlanHudPresentation(input);
  assert.equal(view.ok, true);
  assert.equal(view.self.hand.count, 1);
  assert.equal(view.self.hand.transientShortfall, true);
  assert.deepEqual(view.self.hand.cards.map(card => card.cardId), ['ONLY']);
});

test('opponents expose only explicitly typed public summary and are ordered by seat', () => {
  const view = projectBattlePlanHudPresentation(makeInput());
  assert.deepEqual(view.opponents.map(player => player.playerId), ['P2', 'P3', 'P4']);
  assert.deepEqual(view.opponents[0].laneProgress, [1, 1, 1]);
  assert.equal(view.opponents[0].handCount, 3);
  assert.equal('hand' in view.opponents[0], false);
  assert.equal('reservations' in view.opponents[0], false);
  assert.deepEqual(view.privacy, {
    opponentProjection: 'explicit-public-fields-only',
    opponentSecretsExposed: false,
    selfPrivateReservationsVisible: true
  });
  assert.equal(BATTLE_PLAN_HUD_PRESENTATION_CORE.opponentProjection, 'explicit-public-fields-only');
});

test('known opponent private hand or reservation fields fail closed', () => {
  const privateSentinel = 'PRIVATE-CARD-SENTINEL';
  for (const secretPatch of [
    { hand: [{ cardId: privateSentinel }] },
    { reservations: { battle: privateSentinel } },
    { privateState: { selectedCardId: privateSentinel } },
    { secret: { cardId: privateSentinel } }
  ]) {
    const input = makeInput();
    Object.assign(input.opponents[0], secretPatch);
    const view = projectBattlePlanHudPresentation(input);
    expectFail(view, 'OPPONENT_SECRET_FIELD_FORBIDDEN');
    assert.equal(JSON.stringify(view).includes(privateSentinel), false);
  }
});

test('neutral unknown opponent field cannot smuggle nested secret data', () => {
  const input = makeInput();
  input.opponents[0].telemetry = { cardId: 'SECRET-NEUTRAL-KEY' };
  const view = projectBattlePlanHudPresentation(input);
  expectFail(view, 'OPPONENT_FIELD_FORBIDDEN:telemetry');
  assert.equal(JSON.stringify(view).includes('SECRET-NEUTRAL-KEY'), false);
});

test('allowed publicStatus is scalar-only and rejects nested object payloads', () => {
  const input = makeInput();
  input.opponents[0].publicStatus = { cardId: 'SECRET-IN-PUBLIC-STATUS' };
  const view = projectBattlePlanHudPresentation(input);
  expectFail(view, 'OPPONENT_PUBLIC_STATUS_INVALID');
  assert.equal(JSON.stringify(view).includes('SECRET-IN-PUBLIC-STATUS'), false);
});

test('opponent public summary shape fails closed on invalid counts, lanes, booleans and duplicate seats', () => {
  const tooManyCards = makeInput();
  tooManyCards.opponents[0].handCount = 4;
  expectFail(projectBattlePlanHudPresentation(tooManyCards), 'OPPONENT_HAND_COUNT_INVALID');

  const badLaneCount = makeInput();
  badLaneCount.opponents[0].laneProgress = [1, 2];
  expectFail(projectBattlePlanHudPresentation(badLaneCount), 'OPPONENT_LANE_PROGRESS_INVALID');

  const badLaneValue = makeInput();
  badLaneValue.opponents[0].laneProgress = [1, -1, 2];
  expectFail(projectBattlePlanHudPresentation(badLaneValue), 'OPPONENT_LANE_PROGRESS_INVALID');

  const badReady = makeInput();
  badReady.opponents[0].ready = 'yes';
  expectFail(projectBattlePlanHudPresentation(badReady), 'OPPONENT_READY_INVALID');

  const duplicateSeat = makeInput();
  duplicateSeat.opponents[1].seat = duplicateSeat.opponents[0].seat;
  expectFail(projectBattlePlanHudPresentation(duplicateSeat), 'OPPONENT_SEAT_DUPLICATE');
});

test('stale revision fails closed before projecting player state', () => {
  const input = makeInput();
  input.revision.current = 'r11';
  input.self.hand[0].cardId = 'SHOULD-NOT-LEAK';
  const view = projectBattlePlanHudPresentation(input);
  expectFail(view, 'STALE_REVISION');
  assert.equal(JSON.stringify(view).includes('SHOULD-NOT-LEAK'), false);
});

test('self reservations remain self-only presentation data', () => {
  const input = makeInput();
  const view = projectBattlePlanHudPresentation(input);
  assert.deepEqual(view.self.reservations, input.self.reservations);
  assert.equal(JSON.stringify(view.opponents).includes('R09C09'), false);
});

test('projection is deterministic, frozen, and cannot be changed by caller mutation', () => {
  const input = makeInput();
  const first = projectBattlePlanHudPresentation(input);
  const second = projectBattlePlanHudPresentation(input);
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.self.hand.cards), true);

  input.self.resources.hate = 999;
  input.self.hand[0].cardId = 'MUTATED';
  input.opponents[0].laneProgress[0] = 99;
  assert.equal(first.self.resources.hate, 235);
  assert.equal(first.self.hand.cards[0].cardId, 'C-2');
  assert.deepEqual(first.opponents[2].laneProgress, [2, 1, 0]);
});

test('invalid hand size/state and duplicate opponent identity fail closed', () => {
  const tooMany = makeInput();
  tooMany.self.hand.push({ slot: 0, cardId: 'EXTRA', presentationState: 'normal' });
  expectFail(projectBattlePlanHudPresentation(tooMany), 'SELF_HAND_EXCEEDS_PLAN_TARGET');

  const badState = makeInput();
  badState.self.hand[0].presentationState = 'invented';
  expectFail(projectBattlePlanHudPresentation(badState), 'SELF_HAND_STATE_INVALID');

  const duplicate = makeInput();
  duplicate.opponents[1].playerId = duplicate.opponents[0].playerId;
  expectFail(projectBattlePlanHudPresentation(duplicate), 'OPPONENT_PLAYER_ID_DUPLICATE');
});
