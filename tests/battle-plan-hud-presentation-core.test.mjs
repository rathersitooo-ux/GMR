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
        { slot: 0, cardId: 'C-2', presentationState: 'focus', selected: false },
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
        submitState: 'CHOOSING'
      },
      {
        playerId: 'P2',
        seat: 1,
        displayName: 'P2',
        handCount: 3,
        shields: 3,
        laneProgress: [1, 1, 1],
        ready: true,
        submitState: 'SUBMITTED'
      },
      {
        playerId: 'P3',
        seat: 2,
        displayName: 'P3',
        handCount: 2,
        shields: 1,
        laneProgress: [4, 0, 3],
        ready: true,
        submitState: 'SUBMITTED'
      }
    ]
  };
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
  assert.deepEqual(view.self.hand.cards.map(card => card.presentationState), ['focus', 'selected', 'pending']);
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

test('canonical hand feedback states include selection lifecycle without computing actions', () => {
  assert.deepEqual(BATTLE_PLAN_HAND_PRESENTATION_STATES, [
    'focus', 'pressed', 'detail', 'selected', 'pending', 'confirmed', 'failed', 'disabled'
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

test('opponents expose only public summary and are ordered by seat', () => {
  const view = projectBattlePlanHudPresentation(makeInput());
  assert.deepEqual(view.opponents.map(player => player.playerId), ['P2', 'P3', 'P4']);
  assert.deepEqual(view.opponents[0].laneProgress, [1, 1, 1]);
  assert.equal(view.opponents[0].handCount, 3);
  assert.equal('hand' in view.opponents[0], false);
  assert.equal('reservations' in view.opponents[0], false);
  assert.deepEqual(view.privacy, {
    opponentSecretsExposed: false,
    selfPrivateReservationsVisible: true
  });
});

test('opponent private hand or reservation payload fails closed', () => {
  for (const secretPatch of [
    { hand: [{ cardId: 'SECRET' }] },
    { reservations: { battle: 'SECRET' } },
    { privateState: { selectedCardId: 'SECRET' } },
    { publicStatus: { nested: { secret: { cardId: 'SECRET' } } } }
  ]) {
    const input = makeInput();
    Object.assign(input.opponents[0], secretPatch);
    const view = projectBattlePlanHudPresentation(input);
    assert.deepEqual(view, {
      schema: 'gameroad.battle-plan-hud-presentation.v1',
      ok: false,
      clear: true,
      reason: 'OPPONENT_SECRET_FIELD_FORBIDDEN',
      brandingVisible: false
    });
    assert.equal(JSON.stringify(view).includes('SECRET'), false);
  }
});

test('stale revision fails closed before projecting player state', () => {
  const input = makeInput();
  input.revision.current = 'r11';
  input.self.hand[0].cardId = 'SHOULD-NOT-LEAK';
  const view = projectBattlePlanHudPresentation(input);
  assert.deepEqual(view, {
    schema: 'gameroad.battle-plan-hud-presentation.v1',
    ok: false,
    clear: true,
    reason: 'STALE_REVISION',
    brandingVisible: false
  });
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
  tooMany.self.hand.push({ slot: 0, cardId: 'EXTRA', presentationState: 'focus' });
  assert.equal(projectBattlePlanHudPresentation(tooMany).reason, 'SELF_HAND_EXCEEDS_PLAN_TARGET');

  const badState = makeInput();
  badState.self.hand[0].presentationState = 'invented';
  assert.equal(projectBattlePlanHudPresentation(badState).reason, 'SELF_HAND_STATE_INVALID');

  const duplicate = makeInput();
  duplicate.opponents[1].playerId = duplicate.opponents[0].playerId;
  assert.equal(projectBattlePlanHudPresentation(duplicate).reason, 'OPPONENT_PLAYER_ID_DUPLICATE');
});
