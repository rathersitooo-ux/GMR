import test from 'node:test';
import assert from 'node:assert/strict';

import { selectPartnerLegalCandidate } from '../browser/partner-legal-action-adapter.mjs';
import { projectPartnerDecisionEvidence } from '../browser/partner-decision-evidence-projection.mjs';
import {
  PARTNER_DECISION_OUTCOME_JOIN,
  joinPartnerDecisionEvidenceToBattleOutcome,
} from '../browser/partner-decision-outcome-join-core.mjs';

const VERSIONS = Object.freeze({
  rulesVersion: 'rules-r10',
  cardVersion: 'cards-r10',
  stateVersion: 'state-r10',
});

function candidate(candidateId, positionOrder, comparisonValue, legal = true) {
  return {
    candidateId,
    kind: 'card',
    positionOrder,
    comparisonValue,
    legal,
    publicScope: true,
    assetAction: 'NONE',
    payload: { privateOpaque: `secret-${candidateId}` },
  };
}

function decisionEvidence() {
  const candidates = [
    candidate('card-left', 0, 4),
    candidate('card-right', 1, 8),
    candidate('card-blocked', 2, 99, false),
  ];
  const decisionResult = selectPartnerLegalCandidate({
    candidates,
    rule: 'max',
    sourceVersions: VERSIONS,
    targetVersions: VERSIONS,
  });
  assert.equal(decisionResult.ok, true);
  assert.equal(decisionResult.selected.candidateId, 'card-right');
  const projected = projectPartnerDecisionEvidence({
    candidates,
    rule: 'max',
    decisionResult,
    sourceVersions: VERSIONS,
    targetVersions: VERSIONS,
  });
  assert.equal(projected.ok, true);
  return projected;
}

function resolution(serial = 1, sequence = serial) {
  return {
    sequence,
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
      shield: 'raw-shield-id',
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
    versions: { rules: 'rules-r10', content: 'cards-r10', state: 'state-r10' },
    events,
    ...overrides,
  };
}

function join(overrides = {}) {
  return joinPartnerDecisionEvidenceToBattleOutcome({
    matchId: 'match-decision-1',
    resolutionSerial: 1,
    decisionEvidenceResult: decisionEvidence(),
    chosenActionId: 'card-left',
    replayRead: replay(),
    ...overrides,
  });
}

test('composes formal R10 decision evidence with exact Replay outcome while keeping actual choice distinct from recommendation', () => {
  const result = join();
  assert.equal(result.ok, true);
  assert.equal(result.schema, PARTNER_DECISION_OUTCOME_JOIN.schema);
  assert.equal(result.matchId, 'match-decision-1');
  assert.deepEqual(result.versions, { rules: 'rules-r10', content: 'cards-r10', state: 'state-r10' });
  assert.deepEqual(result.decision.legalCandidateIds, ['card-left', 'card-right']);
  assert.equal(result.decision.recommendedCandidateId, 'card-right');
  assert.equal(result.decision.chosenActionId, 'card-left');
  assert.equal(result.decision.resolutionSerial, 1);
  assert.equal(result.outcome.serial, 1);
  assert.equal(result.outcome.winningTeam, 'A');
  assert.equal(result.outcome.winnerCount, 1);
  assert.equal(result.outcome.shieldUsed, true);
  assert.equal(result.training.eligible, false);
  assert.equal(result.training.reason, 'APPROVED_REWARD_REGRET_LABEL_REQUIRED');
  assert.deepEqual(result.authority, {
    gameplayAuthoritative: false,
    rewardLabelAuthority: 'NONE',
    regretLabelAuthority: 'NONE',
    optimalActionAuthority: 'NONE',
  });
  assert.equal(result.containsPrivate, false);
  assert.equal(result.provenance.decisionSchema, 'gameroad.partner-decision-evidence.v1');
  assert.equal(result.provenance.outcomeSchema, 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.decision.legalCandidateIds), true);

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'raw-player-a', 'raw-player-b', 'Private Name A', 'Private Name B',
    'SECRET_HAND', 'SECRET_ORDER', 'raw-shield-id', 'secret-card-left',
    'reward":', 'regret":', 'optimalActionId',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('explicit actual chosen action must belong to the R10 legal set', () => {
  assert.deepEqual(join({ chosenActionId: 'card-blocked' }), {
    ok: false,
    reason: 'CHOSEN_ACTION_NOT_IN_LEGAL_SET',
  });
  assert.deepEqual(join({ chosenActionId: 'unknown-card' }), {
    ok: false,
    reason: 'CHOSEN_ACTION_NOT_IN_LEGAL_SET',
  });
});

test('R10 decision evidence must keep its non-private non-authoritative pre-outcome contract', () => {
  const base = decisionEvidence();
  for (const mutated of [
    { ...base, containsPrivate: true },
    { ...base, gameplayAuthoritative: true },
    { ...base, bestMoveProven: true },
    { ...base, evidence: { ...base.evidence, outcomeAttached: true } },
    { ...base, evidence: { ...base.evidence, rewardAttached: true } },
    { ...base, evidence: { ...base.evidence, bestMoveProven: true } },
  ]) {
    assert.deepEqual(join({ decisionEvidenceResult: mutated }), {
      ok: false,
      reason: 'DECISION_EVIDENCE_INVALID',
    });
  }
});

test('decision and Replay version tuple must match across rules/card/state mapping', () => {
  const base = decisionEvidence();
  const drifted = {
    ...base,
    evidence: {
      ...base.evidence,
      versions: { ...base.evidence.versions, cardVersion: 'cards-r11' },
    },
  };
  assert.deepEqual(join({ decisionEvidenceResult: drifted }), {
    ok: false,
    reason: 'VERSION_MISMATCH',
  });
  assert.deepEqual(join({
    replayRead: replay(undefined, {
      versions: { rules: 'rules-r11', content: 'cards-r10', state: 'state-r10' },
    }),
  }), {
    ok: false,
    reason: 'VERSION_MISMATCH',
  });
});

test('match identity and exact resolution serial are required', () => {
  assert.deepEqual(join({ matchId: 'match-other' }), {
    ok: false,
    reason: 'MATCH_ID_MISMATCH',
  });
  assert.deepEqual(join({ resolutionSerial: 7 }), {
    ok: false,
    reason: 'OUTCOME_NOT_FOUND',
  });
});

test('duplicate resolution serial is ambiguous and never silently picks one outcome', () => {
  const first = resolution(1, 1);
  const second = resolution(1, 2);
  second.publicData = { ...second.publicData, round: 9 };
  assert.deepEqual(join({ replayRead: replay([first, second]) }), {
    ok: false,
    reason: 'OUTCOME_AMBIGUOUS',
  });
});

test('invalid or unready Replay authority fails closed through the existing projection', () => {
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

test('tampered R10 legal-candidate evidence is rejected instead of being repaired locally', () => {
  const base = decisionEvidence();
  const duplicate = {
    ...base,
    evidence: { ...base.evidence, legalCandidateIds: ['card-left', 'card-left'], legalCandidateCount: 2 },
  };
  const recommendationOutsideSet = {
    ...base,
    evidence: {
      ...base.evidence,
      legalCandidateIds: ['card-left'],
      legalCandidateCount: 1,
      selection: { ...base.evidence.selection, candidateId: 'card-right' },
    },
  };
  assert.deepEqual(join({ decisionEvidenceResult: duplicate }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
  assert.deepEqual(join({ decisionEvidenceResult: recommendationOutsideSet }), {
    ok: false,
    reason: 'DECISION_EVIDENCE_INVALID',
  });
});

test('contract explicitly remains evidence-only until approved outcome labels exist', () => {
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.trainingEligible, false);
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.gameplayAuthoritative, false);
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.labelPolicy, 'NO_REWARD_REGRET_OR_OPTIMAL_ACTION_INFERENCE');
  assert.equal(PARTNER_DECISION_OUTCOME_JOIN.chosenActionPolicy, 'EXPLICIT_ACTUAL_CHOICE_MUST_BE_IN_R10_LEGAL_SET');
});
