import test from 'node:test';
import assert from 'node:assert/strict';

import { selectPartnerLegalCandidate } from '../browser/partner-legal-action-adapter.mjs';
import {
  PARTNER_DECISION_OUTCOME_JOIN,
  joinPartnerDecisionToBattleOutcome,
} from '../browser/partner-decision-outcome-join-core.mjs';

const DECISION_VERSIONS = Object.freeze({
  rulesVersion: 'rule@7',
  cardVersion: 'cards:v4',
  stateVersion: 'runtime:v2',
});

function legalDecision() {
  return selectPartnerLegalCandidate({
    rule: 'max',
    sourceVersions: DECISION_VERSIONS,
    targetVersions: DECISION_VERSIONS,
    candidates: [
      {
        candidateId: 'card-left',
        kind: 'hand-card',
        positionOrder: 0,
        comparisonValue: 4,
        legal: true,
        publicScope: true,
        assetAction: 'NONE',
      },
      {
        candidateId: 'card-right',
        kind: 'hand-card',
        positionOrder: 1,
        comparisonValue: 8,
        legal: true,
        publicScope: true,
        assetAction: 'NONE',
      },
      {
        candidateId: 'card-blocked',
        kind: 'hand-card',
        positionOrder: 2,
        comparisonValue: 99,
        legal: false,
        publicScope: true,
        assetAction: 'NONE',
      },
    ],
  });
}

function resolution(serial = 1) {
  return {
    sequence: serial,
    kind: 'battle_resolution',
    privateData: {
      opponentHand: ['SECRET_HAND'],
      deckOrder: ['SECRET_ORDER'],
    },
    publicData: {
      serial,
      round: serial + 2,
      mode: '2v2',
      attackerId: 'raw-player-a',
      defenderId: 'raw-player-b',
      lane: 'left',
      shield: 'shield-private-id',
      winnerIds: ['raw-player-a'],
      winningTeam: 'A',
      teamTotals: { A: 12, B: 9 },
      players: [
        {
          id: 'raw-player-a',
          name: 'Private Name A',
          team: 'A',
          score: 12,
          winner: true,
          cards: [{ cardId: 'public-card-1', label: 'Drop Label', value: 8, origin: 'active_submission' }],
        },
        {
          id: 'raw-player-b',
          name: 'Private Name B',
          team: 'B',
          score: 9,
          winner: false,
          cards: [{ cardId: 'public-card-2', label: 'Drop Label 2', value: 4, origin: 'shield' }],
        },
      ],
      laneGains: [{ id: 'raw-player-a', lane: 'left', before: 2, after: 3, added: 1 }],
      maxLaneProgress: [{ id: 'raw-player-a', before: 2, after: 3 }],
    },
  };
}

function replay(events = [resolution(1)], overrides = {}) {
  return {
    ok: true,
    status: 'ready',
    schema: 'GAMEROAD_BATTLE_REPLAY_V1',
    matchId: 'match-decision-1',
    versions: { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' },
    events,
    ...overrides,
  };
}

function join(overrides = {}) {
  return joinPartnerDecisionToBattleOutcome({
    matchId: 'match-decision-1',
    resolutionSerial: 1,
    decision: legalDecision(),
    chosenActionId: 'card-left',
    decisionVersionTuple: DECISION_VERSIONS,
    replayRead: replay(),
    ...overrides,
  });
}

test('joins current legal-candidate decision evidence to exact privacy-safe Replay outcome without inventing a label', () => {
  const decision = legalDecision();
  assert.equal(decision.ok, true);
  assert.equal(decision.selected.candidateId, 'card-right', 'max rule recommends right card');

  const result = join({ decision, chosenActionId: 'card-left' });
  assert.equal(result.ok, true);
  assert.equal(result.schema, PARTNER_DECISION_OUTCOME_JOIN.schema);
  assert.equal(result.matchId, 'match-decision-1');
  assert.deepEqual(result.versions, { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' });
  assert.equal(result.decision.resolutionSerial, 1);
  assert.deepEqual(result.decision.legalCandidateIds, ['card-right', 'card-left']);
  assert.equal(result.decision.recommendedCandidateId, 'card-right');
  assert.equal(result.decision.chosenActionId, 'card-left', 'actual chosen action is distinct from recommendation');
  assert.equal(result.outcome.serial, 1);
  assert.equal(result.outcome.winningTeam, 'A');
  assert.equal(result.outcome.winnerCount, 1);
  assert.equal(result.training.eligible, false);
  assert.equal(result.training.reason, 'APPROVED_REWARD_REGRET_LABEL_REQUIRED');
  assert.deepEqual(result.authority, {
    gameplayAuthoritative: false,
    rewardLabelAuthority: 'NONE',
    regretLabelAuthority: 'NONE',
    optimalActionAuthority: 'NONE',
  });
  assert.equal(result.containsPrivate, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.decision.legalCandidateIds), true);

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'raw-player-a', 'raw-player-b', 'Private Name A', 'Private Name B',
    'SECRET_HAND', 'SECRET_ORDER', 'shield-private-id',
    'reward":', 'regret":', 'optimalActionId',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('chosen action must be inside the exact current legal candidate set', () => {
  assert.deepEqual(join({ chosenActionId: 'card-blocked' }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
  assert.deepEqual(join({ chosenActionId: 'unknown-card' }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
});

test('decision and Replay versions must match across explicit rules/card/state mapping', () => {
  assert.deepEqual(join({
    decisionVersionTuple: { ...DECISION_VERSIONS, cardVersion: 'cards:v5' },
  }), {
    ok: false,
    reason: 'VERSION_MISMATCH',
  });

  assert.deepEqual(join({
    replayRead: replay(undefined, {
      versions: { rules: 'rule@8', content: 'cards:v4', state: 'runtime:v2' },
    }),
  }), {
    ok: false,
    reason: 'VERSION_MISMATCH',
  });
});

test('match identity and exact resolution serial are required for the join', () => {
  assert.deepEqual(join({ matchId: 'match-other' }), {
    ok: false,
    reason: 'MATCH_ID_MISMATCH',
  });
  assert.deepEqual(join({ resolutionSerial: 7 }), {
    ok: false,
    reason: 'OUTCOME_NOT_FOUND',
  });
});

test('duplicate resolution serial is rejected as ambiguous rather than choosing an outcome silently', () => {
  const first = resolution(1);
  const second = { ...resolution(1), sequence: 2, publicData: { ...resolution(1).publicData, round: 9 } };
  assert.deepEqual(join({ replayRead: replay([first, second]) }), {
    ok: false,
    reason: 'OUTCOME_AMBIGUOUS',
  });
});

test('invalid or unready Replay authority fails closed through the existing projection contract', () => {
  assert.deepEqual(join({ replayRead: null }), {
    ok: false,
    reason: 'OUTCOME_REPLAY_READ_INVALID',
  });
  assert.deepEqual(join({ replayRead: { ok: false, status: 'unavailable' } }), {
    ok: false,
    reason: 'OUTCOME_REPLAY_NOT_READY',
  });
  assert.deepEqual(join({ replayRead: replay(undefined, { schema: 'OTHER' }) }), {
    ok: false,
    reason: 'OUTCOME_REPLAY_AUTHORITY_INVALID',
  });
});

test('private or malformed decision evidence cannot enter the join', () => {
  const decision = legalDecision();
  assert.deepEqual(join({ decision: { ...decision, containsPrivate: true } }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
  assert.deepEqual(join({ decision: { ...decision, ordered: ['card-left', 'card-left'] } }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
  assert.deepEqual(join({ decision: { ...decision, selected: { candidateId: 'not-legal' } } }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
});

test('contract is explicit that a successful join is evidence, not training truth or gameplay authority', () => {
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.trainingEligible, false);
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.gameplayAuthoritative, false);
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.labelPolicy, 'NO_REWARD_REGRET_OR_OPTIMAL_ACTION_INFERENCE');
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.versionPolicy, 'EXACT_DECISION_TO_REPLAY_VERSION_MATCH');
});
