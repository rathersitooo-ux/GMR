import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_REPLAY_SELF_CHOICE_REGISTRATION,
  projectReplaySelfChoiceRegistration,
} from '../browser/battle-replay-self-choice-registration-core.mjs';

const versions = Object.freeze({
  rules: 'FIRST_REGULATION@3',
  content: 'GAMEROAD_CARD_CONTENT_FNV1A64:4:abcdef0123456789',
  state: 'GAMEROAD_BATTLE_REPLAY_LIVE_ADAPTER_V1',
});

function resolutionEvent(sequence = 1, overrides = {}) {
  const publicData = {
    serial: sequence,
    round: sequence,
    mode: '2v2',
    attackerId: 'P1',
    defenderId: 'P3',
    lane: 'C',
    shield: null,
    winnerIds: ['P1', 'P2'],
    winningTeam: 'A',
    teamTotals: { A: 21, B: 18 },
    players: [
      {
        id: 'P1',
        name: 'You',
        team: 'A',
        score: 11,
        winner: true,
        cards: [
          { cardId: 'ROAD-1', label: '公開ロード', value: 6, origin: 'road' },
          { cardId: 'BATTLE-1', label: '公開バトル', value: 5, origin: 'battle' },
        ],
      },
      {
        id: 'P3',
        name: 'Opponent',
        team: 'B',
        score: 9,
        winner: false,
        cards: [{ cardId: 'OPPONENT-CARD', label: '相手公開札', value: 4, origin: 'battle' }],
      },
    ],
    laneGains: [],
    maxLaneProgress: [],
    ...overrides,
  };
  return {
    sequence,
    kind: 'battle_resolution',
    publicData,
    privateData: {
      hand: ['SECRET-HAND'],
      opponentHand: ['SECRET-OPPONENT-HAND'],
    },
  };
}

function matchEndEvent(sequence = 2) {
  return {
    sequence,
    kind: 'match_ended',
    publicData: { winnerIds: ['P1', 'P2'], round: 1, mode: '2v2' },
    privateData: { secret: 'DROP-MATCH-END-SECRET' },
  };
}

function replay(events = [resolutionEvent()]) {
  return {
    ok: true,
    status: 'ready',
    schema: 'GAMEROAD_BATTLE_REPLAY_V1',
    matchId: 'MATCH-001',
    versions: { ...versions },
    events,
  };
}

const viewer = Object.freeze({ id: 'P1', authenticated: true });

test('contract is explicit user-evaluation only and has no write or correctness authority', () => {
  assert.deepEqual(BATTLE_REPLAY_SELF_CHOICE_REGISTRATION, {
    schema: 'gameroad.battle-replay-self-choice-registration.v1',
    replaySchema: 'GAMEROAD_BATTLE_REPLAY_V1',
    sourceAuthority: 'accepted_replay_public_event_only',
    identityPolicy: 'match_event_player_index_bundle',
    evaluationAuthority: 'USER_EXPLICIT_ONLY',
    autoRegister: false,
    objectiveCorrectness: false,
    collectiveWrite: false,
    gameplayWrite: false,
  });
});

test('unauthenticated or identity-less viewers cannot obtain self-choice registration refs', () => {
  for (const candidate of [
    null,
    { id: 'P1', authenticated: false },
    { authenticated: true },
    { id: '', authenticated: true },
  ]) {
    const result = projectReplaySelfChoiceRegistration({ replayRead: replay(), viewer: candidate });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'AUTHENTICATED_VIEWER_REQUIRED');
    assert.deepEqual(result.choices, []);
  }
});

test('only the authenticated viewer own accepted public choice bundle is projected', () => {
  const result = projectReplaySelfChoiceRegistration({ replayRead: replay(), viewer });
  assert.equal(result.ok, true);
  assert.equal(result.matchId, 'MATCH-001');
  assert.equal(result.choices.length, 1);
  assert.deepEqual(result.choices[0].display.cardIds, ['ROAD-1', 'BATTLE-1']);
  assert.equal(JSON.stringify(result).includes('OPPONENT-CARD'), false);
  assert.equal(JSON.stringify(result).includes('Opponent'), false);
});

test('registrationRef is the minimal deterministic four-field downstream identity', () => {
  const result = projectReplaySelfChoiceRegistration({ replayRead: replay(), viewer });
  const ref = result.choices[0].registrationRef;
  assert.deepEqual(Object.keys(ref), ['matchId', 'choiceId', 'eventId', 'rulesVersion']);
  assert.deepEqual(ref, {
    matchId: 'MATCH-001',
    choiceId: 'MATCH-001:1:player:0',
    eventId: 'MATCH-001:1',
    rulesVersion: 'FIRST_REGULATION@3',
  });
  assert.equal(JSON.stringify(ref).includes('P1'), false);
  assert.equal(JSON.stringify(ref).includes('You'), false);
});

test('pre-match-end accepted choice is private pending input, not final registrable evidence', () => {
  const result = projectReplaySelfChoiceRegistration({ replayRead: replay(), viewer });
  assert.equal(result.matchEnded, false);
  assert.equal(result.choices[0].pendingEligible, true);
  assert.equal(result.choices[0].registrable, false);
  assert.equal(result.choices[0].registrationState, 'PENDING_MATCH_END');
});

test('the same accepted own choice becomes post-match ready only after a single final match_ended event', () => {
  const result = projectReplaySelfChoiceRegistration({
    replayRead: replay([resolutionEvent(1), matchEndEvent(2)]),
    viewer,
  });
  assert.equal(result.ok, true);
  assert.equal(result.matchEnded, true);
  assert.equal(result.choices.length, 1);
  assert.equal(result.choices[0].registrable, true);
  assert.equal(result.choices[0].registrationState, 'POST_MATCH_READY');
  assert.deepEqual(result.choices[0].registrationRef, {
    matchId: 'MATCH-001',
    choiceId: 'MATCH-001:1:player:0',
    eventId: 'MATCH-001:1',
    rulesVersion: 'FIRST_REGULATION@3',
  });
});

test('projection never carries viewer private data or turns self labels into best/correct answers', () => {
  const result = projectReplaySelfChoiceRegistration({
    replayRead: replay([resolutionEvent(1), matchEndEvent(2)]),
    viewer,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('SECRET-HAND'), false);
  assert.equal(serialized.includes('SECRET-OPPONENT-HAND'), false);
  assert.equal(serialized.includes('DROP-MATCH-END-SECRET'), false);
  assert.equal(result.autoRegister, false);
  assert.equal(result.objectiveCorrectness, false);
  assert.equal(result.collectiveWrite, false);
  assert.equal(result.gameplayWrite, false);
  assert.equal(result.choices[0].evaluation, null);
  assert.equal(result.choices[0].bestMove, null);
  assert.equal(result.choices[0].correctAnswer, null);
});

test('multiple accepted resolutions keep stable event/player-index identities without a second recorder', () => {
  const second = resolutionEvent(2, {
    round: 2,
    players: [
      { id: 'P3', cards: [{ cardId: 'OPPONENT-2', value: 4 }] },
      { id: 'P1', cards: [{ cardId: 'BATTLE-2', value: 7 }] },
    ],
  });
  const result = projectReplaySelfChoiceRegistration({
    replayRead: replay([resolutionEvent(1), second, matchEndEvent(3)]),
    viewer,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.choices.map((choice) => choice.registrationRef.choiceId), [
    'MATCH-001:1:player:0',
    'MATCH-001:2:player:1',
  ]);
  assert.deepEqual(result.choices.map((choice) => choice.display.cardIds), [
    ['ROAD-1', 'BATTLE-1'],
    ['BATTLE-2'],
  ]);
});

test('malformed sequence, ambiguous own player, or non-final terminal event fails closed', () => {
  const gap = replay([resolutionEvent(2)]);
  assert.equal(projectReplaySelfChoiceRegistration({ replayRead: gap, viewer }).reason, 'EVENT_IDENTITY_INVALID');

  const duplicateOwn = resolutionEvent(1, {
    players: [
      { id: 'P1', cards: [{ cardId: 'A', value: 1 }] },
      { id: 'P1', cards: [{ cardId: 'B', value: 2 }] },
    ],
  });
  assert.equal(
    projectReplaySelfChoiceRegistration({ replayRead: replay([duplicateOwn]), viewer }).reason,
    'OWN_CHOICE_AMBIGUOUS',
  );

  const afterTerminal = replay([matchEndEvent(1), resolutionEvent(2)]);
  assert.equal(
    projectReplaySelfChoiceRegistration({ replayRead: afterTerminal, viewer }).reason,
    'MATCH_END_ORDER_INVALID',
  );
});

test('output is deeply frozen and projection does not mutate accepted replay input', () => {
  const input = replay([resolutionEvent(1), matchEndEvent(2)]);
  const before = JSON.stringify(input);
  const result = projectReplaySelfChoiceRegistration({ replayRead: input, viewer });
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.choices), true);
  assert.equal(Object.isFrozen(result.choices[0]), true);
  assert.equal(Object.isFrozen(result.choices[0].registrationRef), true);
  assert.equal(Object.isFrozen(result.choices[0].display.cardIds), true);
});
