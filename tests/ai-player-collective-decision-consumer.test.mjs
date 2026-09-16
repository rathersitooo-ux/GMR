import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_PLAYER_COLLECTIVE_DECISION_CONTRACT,
  consumeAiPlayerCollectiveDecision,
} from '../browser/ai-player-collective-decision-consumer.mjs';

const VERSIONS = Object.freeze({
  rulesVersion: 'rules-ai-r1',
  cardVersion: 'cards-ai-r1',
  stateVersion: 'state-ai-r1',
});

function identity(overrides = {}) {
  return {
    matchId: 'match-ai-1',
    actorType: 'AI',
    actorRef: 'ai-player-slot-a1',
    teamId: 'team-a',
    roleId: 'road',
    decisionSequence: 17,
    ...overrides,
  };
}

function authority(overrides = {}) {
  return {
    matchIdentityVerified: true,
    matchParticipantAuthenticated: true,
    actorTeamRoleVerified: true,
    decisionSequenceVerified: true,
    ...overrides,
  };
}

function decisionEvidence(overrides = {}) {
  const evidence = {
    schema: 'gameroad.partner-decision-evidence.v1',
    versions: { ...VERSIONS },
    rule: 'max',
    selection: {
      candidateId: 'card-right',
      source: 'approved-runtime-manifest',
      reason: null,
      manifestUsed: true,
      manifest: { source: 'collective-manifest-r1', support: 12 },
    },
    legalCandidateIds: ['card-left', 'card-right'],
    legalCandidates: [
      { candidateId: 'card-left', kind: 'card', positionOrder: 0, comparisonValue: 4 },
      { candidateId: 'card-right', kind: 'card', positionOrder: 1, comparisonValue: 8 },
    ],
    legalCandidateCount: 2,
    decisionTimeOnly: true,
    outcomeAttached: false,
    rewardAttached: false,
    containsPrivate: false,
    gameplayAuthoritative: false,
    bestMoveProven: false,
    authorityScope: 'derived-viewer-safe-decision-projection',
    ...(overrides.evidence ?? {}),
  };
  return {
    ok: true,
    reason: null,
    evidence,
    containsPrivate: false,
    gameplayAuthoritative: false,
    bestMoveProven: false,
    ...overrides,
    evidence,
  };
}

function collective(overrides = {}) {
  return {
    approved: true,
    privacySafe: true,
    containsPrivate: false,
    containsRawEvents: false,
    versions: { ...VERSIONS },
    candidateId: 'card-right',
    reasonRef: 'opponent-history-pattern-r1',
    decisionProductRef: 'decision-product-ai-r1',
    collectiveLineageRef: 'collective-lineage-ai-r1',
    ...overrides,
  };
}

function consume(overrides = {}) {
  return consumeAiPlayerCollectiveDecision({
    identity: identity(),
    authority: authority(),
    decisionEvidenceResult: decisionEvidence(),
    collectiveRecommendation: collective(),
    ...overrides,
  });
}

test('accepts an AI-only approved collective recommendation already inside the viewer-safe legal set', () => {
  const result = consume();
  assert.equal(result.ok, true);
  assert.equal(result.schema, AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.schema);
  assert.deepEqual(result.identity, {
    matchId: 'match-ai-1',
    actorType: 'AI',
    actorRef: 'ai-player-slot-a1',
    teamId: 'team-a',
    roleId: 'road',
    decisionSequence: 17,
  });
  assert.deepEqual(result.versions, VERSIONS);
  assert.deepEqual(result.legalCandidateIds, ['card-left', 'card-right']);
  assert.deepEqual(result.recommendation, {
    candidateId: 'card-right',
    reasonRef: 'opponent-history-pattern-r1',
    decisionProductRef: 'decision-product-ai-r1',
    collectiveLineageRef: 'collective-lineage-ai-r1',
  });
  assert.deepEqual(result.freshness, {
    exactVersionMatch: true,
    decisionSequenceVerified: true,
  });
  assert.equal(result.authority.matchIdentityVerified, true);
  assert.equal(result.authority.matchParticipantAuthenticated, true);
  assert.equal(result.authority.actorTeamRoleVerified, true);
  assert.equal(result.authority.decisionSequenceVerified, true);
  assert.equal(result.gameplayAuthoritative, false);
  assert.equal(result.rewardAttached, false);
  assert.equal(result.trainingEligible, false);
  assert.equal(result.bestMoveProven, false);
  assert.equal(result.autoExecute, false);
  assert.equal(result.containsPrivate, false);
  assert.equal(result.containsRawEvents, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.recommendation), true);
});

test('CPU, Human, Partner, and Auto actors cannot enter the AI player consumer', () => {
  for (const actorType of ['CPU', 'Human', 'Partner', 'Auto']) {
    assert.deepEqual(consume({ identity: identity({ actorType }) }), {
      ok: false,
      reason: 'AI_ACTOR_REQUIRED',
      recommendation: null,
      containsPrivate: false,
      containsRawEvents: false,
      gameplayAuthoritative: false,
      rewardAttached: false,
      trainingEligible: false,
      bestMoveProven: false,
    });
  }
});

test('all upstream match participant actor/team/role and sequence authority must already be verified', () => {
  for (const key of [
    'matchIdentityVerified',
    'matchParticipantAuthenticated',
    'actorTeamRoleVerified',
    'decisionSequenceVerified',
  ]) {
    const result = consume({ authority: authority({ [key]: false }) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'AUTHORITATIVE_IDENTITY_AND_SEQUENCE_REQUIRED');
  }
});

test('decision freshness is exact and cannot be substituted by a different version tuple', () => {
  const result = consume({
    collectiveRecommendation: collective({
      versions: { ...VERSIONS, stateVersion: 'state-ai-r2' },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'DECISION_FRESHNESS_MISMATCH');
});

test('collective recommendation can never introduce a candidate outside the existing legal projection', () => {
  const result = consume({
    collectiveRecommendation: collective({ candidateId: 'card-hidden-or-illegal' }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'COLLECTIVE_CANDIDATE_NOT_IN_LEGAL_SET');
});

test('private or raw collective payload claims fail closed instead of being sanitized into eligibility', () => {
  for (const recommendation of [
    collective({ containsPrivate: true }),
    collective({ containsRawEvents: true }),
    collective({ privacySafe: false }),
    collective({ approved: false }),
  ]) {
    const result = consume({ collectiveRecommendation: recommendation });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'APPROVED_COLLECTIVE_RECOMMENDATION_REQUIRED');
  }

  const unexpectedRaw = collective();
  unexpectedRaw.rawOpponentHand = ['secret-card'];
  const unexpected = consume({ collectiveRecommendation: unexpectedRaw });
  assert.equal(unexpected.ok, false);
  assert.equal(unexpected.reason, 'APPROVED_COLLECTIVE_RECOMMENDATION_REQUIRED');
  assert.equal(JSON.stringify(unexpected).includes('secret-card'), false);
});

test('collective linkage must retain at least one approved Decision Product or Collective lineage reference', () => {
  const result = consume({
    collectiveRecommendation: collective({ decisionProductRef: null, collectiveLineageRef: null }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'APPROVED_COLLECTIVE_RECOMMENDATION_REQUIRED');
});

test('tampered viewer-safe decision evidence never becomes eligible AI evidence', () => {
  for (const evidenceResult of [
    decisionEvidence({ containsPrivate: true }),
    decisionEvidence({ gameplayAuthoritative: true }),
    decisionEvidence({ bestMoveProven: true }),
    decisionEvidence({ evidence: { outcomeAttached: true } }),
    decisionEvidence({ evidence: { rewardAttached: true } }),
    decisionEvidence({ evidence: { legalCandidateIds: ['card-left', 'card-left'] } }),
  ]) {
    const result = consume({ decisionEvidenceResult: evidenceResult });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'VIEWER_SAFE_DECISION_EVIDENCE_REQUIRED');
  }
});

test('contract keeps collective preference separate from legality, gameplay authority, labels, and auto-execution', () => {
  assert.equal(AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.actorType, 'AI');
  assert.equal(
    AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.legalCandidateAuthority,
    'browser/partner-decision-evidence-projection.mjs',
  );
  assert.equal(
    AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.freshnessPolicy,
    'EXACT_CALLER_AUTHORITATIVE_VERSION_TUPLE_NO_HASH_NO_TRUNCATION',
  );
  assert.equal(AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.gameplayAuthoritative, false);
  assert.equal(AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.rewardAttached, false);
  assert.equal(AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.trainingEligible, false);
  assert.equal(AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.bestMoveProven, false);
  assert.equal(AI_PLAYER_COLLECTIVE_DECISION_CONTRACT.autoExecute, false);
});
