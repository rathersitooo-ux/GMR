import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_2V2_CONTROL_MODES,
  create2v2ReconnectState,
  disconnect2v2Player,
  expire2v2ReconnectGrace,
  reconnect2v2Player,
} from '../browser/battle-2v2-reconnect-core.mjs';
import { selectPartnerLegalCandidate } from '../browser/partner-legal-action-adapter.mjs';
import { projectPartnerDecisionEvidence } from '../browser/partner-decision-evidence-projection.mjs';
import {
  PARTNER_DECISION_CONTROL_IDENTITY,
  bindPartnerDecisionEvidenceToCurrent2v2Control,
} from '../browser/partner-decision-control-identity-core.mjs';

const VERSIONS = Object.freeze({
  rulesVersion: 'rules-control-r1',
  cardVersion: 'cards-control-r1',
  stateVersion: 'state-control-r1',
});

function initialReconnectState() {
  return create2v2ReconnectState({
    seats: [
      { seatId: 'seat-a1', playerId: 'private-player-a1', teamId: 'team-a' },
      { seatId: 'seat-a2', playerId: 'private-player-a2', teamId: 'team-a' },
      { seatId: 'seat-b1', playerId: 'private-player-b1', teamId: 'team-b' },
      { seatId: 'seat-b2', playerId: 'private-player-b2', teamId: 'team-b' },
    ],
  });
}

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
  const result = projectPartnerDecisionEvidence({
    candidates,
    rule: 'max',
    decisionResult,
    sourceVersions: VERSIONS,
    targetVersions: VERSIONS,
  });
  assert.equal(result.ok, true);
  return result;
}

function envelope(seatId, controlMode, controlGeneration) {
  return { seatId, controlMode, controlGeneration };
}

function bind(overrides = {}) {
  return bindPartnerDecisionEvidenceToCurrent2v2Control({
    matchId: 'match-control-1',
    decisionEvidenceResult: decisionEvidence(),
    chosenActionId: 'card-left',
    reconnectState: initialReconnectState(),
    controlEnvelope: envelope('seat-a1', BATTLE_2V2_CONTROL_MODES.SELF, 0),
    ...overrides,
  });
}

test('binds R10 evidence to exact current self-control seat/team/generation without exposing player identity', () => {
  const result = bind();
  assert.equal(result.ok, true);
  assert.equal(result.schema, PARTNER_DECISION_CONTROL_IDENTITY.schema);
  assert.equal(result.matchId, 'match-control-1');
  assert.deepEqual(result.versions, VERSIONS);
  assert.deepEqual(result.decision.legalCandidateIds, ['card-left', 'card-right']);
  assert.equal(result.decision.recommendedCandidateId, 'card-right');
  assert.equal(result.decision.chosenActionId, 'card-left');
  assert.deepEqual(result.actorControl, {
    reconnectRevision: 0,
    seatId: 'seat-a1',
    teamId: 'team-a',
    connected: true,
    controlMode: BATTLE_2V2_CONTROL_MODES.SELF,
    controlGeneration: 0,
    controlRole: BATTLE_2V2_CONTROL_MODES.SELF,
    controlRoleAuthority: 'GAMEROAD_BATTLE_2V2_RECONNECT_V1',
    playerIdIncluded: false,
  });
  assert.deepEqual(result.freshness, {
    controlEnvelopeCurrent: true,
    reconnectRevisionBound: true,
    controlGenerationBound: true,
    decisionSequenceVerified: false,
  });
  assert.deepEqual(result.authority, {
    controlFreshnessVerified: true,
    matchIdentityVerified: false,
    matchParticipantAuthenticated: false,
    gameplayAuthoritative: false,
    gameplayRoleAuthority: 'NONE',
    rewardLabelAuthority: 'NONE',
    regretLabelAuthority: 'NONE',
    optimalActionAuthority: 'NONE',
  });
  assert.equal(result.training.eligible, false);
  assert.equal(result.containsPrivate, false);
  assert.equal(Object.isFrozen(result), true);

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'private-player-a1', 'private-player-a2', 'private-player-b1', 'private-player-b2',
    'secret-card-left', 'secret-card-right', 'reward":', 'regret":', 'optimalActionId',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('old control generation is rejected immediately after disconnect and reconnect transitions', () => {
  const initial = initialReconnectState();
  const oldSelf = envelope('seat-a1', BATTLE_2V2_CONTROL_MODES.SELF, 0);

  const disconnected = disconnect2v2Player(initial, 'private-player-a1');
  assert.equal(disconnected.ok, true);
  assert.equal(disconnected.state.revision, 1);
  assert.deepEqual(bind({ reconnectState: disconnected.state, controlEnvelope: oldSelf }), {
    ok: false,
    reason: 'CONTROL_ENVELOPE_STALE_OR_INVALID',
  });

  const currentTemporary = envelope('seat-a1', BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER, 1);
  const temporaryResult = bind({ reconnectState: disconnected.state, controlEnvelope: currentTemporary });
  assert.equal(temporaryResult.ok, true);
  assert.equal(temporaryResult.actorControl.controlMode, BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER);
  assert.equal(temporaryResult.actorControl.controlGeneration, 1);
  assert.equal(temporaryResult.actorControl.reconnectRevision, 1);
  assert.equal(temporaryResult.actorControl.connected, false);

  const reconnected = reconnect2v2Player(disconnected.state, 'private-player-a1');
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.state.revision, 2);
  assert.deepEqual(bind({ reconnectState: reconnected.state, controlEnvelope: currentTemporary }), {
    ok: false,
    reason: 'CONTROL_ENVELOPE_STALE_OR_INVALID',
  });

  const currentSelf = envelope('seat-a1', BATTLE_2V2_CONTROL_MODES.SELF, 2);
  const selfAgain = bind({ reconnectState: reconnected.state, controlEnvelope: currentSelf });
  assert.equal(selfAgain.ok, true);
  assert.equal(selfAgain.actorControl.controlGeneration, 2);
  assert.equal(selfAgain.actorControl.reconnectRevision, 2);
});

test('permanent partner control is represented only as control role and preserves team without inventing gameplay role', () => {
  const initial = initialReconnectState();
  const disconnected = disconnect2v2Player(initial, 'private-player-a1');
  const expired = expire2v2ReconnectGrace(disconnected.state, 'private-player-a1');
  assert.equal(expired.ok, true);
  assert.equal(expired.state.revision, 2);

  const permanent = envelope('seat-a1', BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER, 2);
  const result = bind({ reconnectState: expired.state, controlEnvelope: permanent });
  assert.equal(result.ok, true);
  assert.equal(result.actorControl.teamId, 'team-a');
  assert.equal(result.actorControl.controlMode, BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER);
  assert.equal(result.actorControl.controlRole, BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER);
  assert.equal(result.authority.gameplayRoleAuthority, 'NONE');
  assert.equal(JSON.stringify(result).includes('carry'), false);
  assert.equal(JSON.stringify(result).includes('support'), false);
});

test('chosen action must be an exact member of the formal R10 legal candidate set', () => {
  assert.deepEqual(bind({ chosenActionId: 'card-blocked' }), {
    ok: false,
    reason: 'CHOSEN_ACTION_NOT_IN_LEGAL_SET',
  });
  assert.deepEqual(bind({ chosenActionId: 'missing-card' }), {
    ok: false,
    reason: 'CHOSEN_ACTION_NOT_IN_LEGAL_SET',
  });
});

test('uncontrolled or malformed control envelope never gains freshness authority', () => {
  assert.deepEqual(bind({
    controlEnvelope: envelope('seat-a1', BATTLE_2V2_CONTROL_MODES.UNCONTROLLED, 0),
  }), {
    ok: false,
    reason: 'CONTROL_ENVELOPE_STALE_OR_INVALID',
  });
  assert.deepEqual(bind({ controlEnvelope: { seatId: 'seat-a1', controlMode: 'self' } }), {
    ok: false,
    reason: 'CONTROL_ENVELOPE_STALE_OR_INVALID',
  });
});

test('tampered R10 evidence remains fail-closed rather than being repaired by the identity layer', () => {
  const base = decisionEvidence();
  for (const mutated of [
    { ...base, containsPrivate: true },
    { ...base, gameplayAuthoritative: true },
    { ...base, bestMoveProven: true },
    { ...base, evidence: { ...base.evidence, outcomeAttached: true } },
    { ...base, evidence: { ...base.evidence, rewardAttached: true } },
    { ...base, evidence: { ...base.evidence, legalCandidateIds: ['card-left', 'card-left'], legalCandidateCount: 2 } },
  ]) {
    assert.deepEqual(bind({ decisionEvidenceResult: mutated }), {
      ok: false,
      reason: 'DECISION_EVIDENCE_INVALID',
    });
  }
});

test('match id is carried for later server join but explicitly remains unverified here', () => {
  const result = bind({ matchId: 'match-caller-provided' });
  assert.equal(result.ok, true);
  assert.equal(result.matchId, 'match-caller-provided');
  assert.equal(result.authority.matchIdentityVerified, false);
  assert.equal(result.authority.matchParticipantAuthenticated, false);
  assert.equal(result.freshness.decisionSequenceVerified, false);
  assert.equal(result.training.eligible, false);
});

test('contract documents exact non-authoritative boundary', () => {
  assert.equal(PARTNER_DECISION_CONTROL_IDENTITY.controlFreshnessPolicy, 'EXACT_CURRENT_CONTROL_MODE_AND_GENERATION');
  assert.equal(PARTNER_DECISION_CONTROL_IDENTITY.playerIdentityPolicy, 'OMIT_PLAYER_ID_FROM_SHARED_EVIDENCE');
  assert.equal(PARTNER_DECISION_CONTROL_IDENTITY.matchIdentityVerified, false);
  assert.equal(PARTNER_DECISION_CONTROL_IDENTITY.matchParticipantAuthenticated, false);
  assert.equal(PARTNER_DECISION_CONTROL_IDENTITY.gameplayAuthoritative, false);
  assert.equal(PARTNER_DECISION_CONTROL_IDENTITY.trainingEligible, false);
});
