import assert from 'node:assert/strict';
import {
  BATTLE_SCREEN_PRESENTATION,
  auditBattleScreenModel,
  createBattleScreenModel,
  projectAcceptedBattleEventsToScreen
} from '../browser/battle-screen-presentation-core.mjs';

const participants = [
  { id: 'P1', label: 'PLAYER 1', team: 'A' },
  { id: 'P2', label: 'PLAYER 2', team: 'A' },
  { id: 'P3', label: 'PLAYER 3', team: 'B' },
  { id: 'P4', label: 'PLAYER 4', team: 'B' }
];
const COMPOUND_SCHEMA = 'gameroad.battle-janken-compound-attack-package.v1';

const planModel = createBattleScreenModel({ participants });
assert.equal(planModel.presentationOnly, true);
assert.equal(planModel.gameplayAuthority, false);
assert.equal(planModel.gameStateWrite, false);
assert.equal(planModel.winnerCalculation, false);
assert.equal(planModel.targetCalculation, false);
assert.equal(planModel.secretProjectionAuthority, false);
assert.equal(planModel.boardEffectCalculation, false);
assert.equal(planModel.screenMode, 'MATCH_PLAN');
assert.equal(planModel.boardInteractionOwnedByCaller, true);
assert.equal(planModel.battlePhaseBoardInteractionAllowed, false);
assert.equal(planModel.fourLaneCausalStructure, true);
assert.equal(planModel.boardReturn, null);
assert.equal(planModel.lanes.length, 4);
assert.deepEqual(planModel.lanes.map(row => row.id), ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(planModel.lanes.map(row => row.role), ['idle', 'idle', 'idle', 'idle']);
assert.equal(auditBattleScreenModel(planModel).ok, true);

const compoundAttackPackage = {
  schema: COMPOUND_SCHEMA,
  jankenHand: 'ROCK',
  cardId: 'C-009',
  path: [
    { nodeId: 'ROAD-A', order: 1 },
    { nodeId: 'ROAD-B', order: 2 }
  ],
  direction: 'LEFT',
  roadId: 'ROAD-01',
  battleId: 'BATTLE-01',
  opponentId: 'P3',
  shieldLane: 'R',
  shieldRef: 'shield:P3:R'
};
const events = [
  { accepted: true, eventId: 'r1', kind: 'reveal', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'] } },
  { accepted: true, eventId: 'a1', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['P3'], importance: 'normal' } },
  { accepted: true, eventId: 'a2', kind: 'ability', publicData: { sourceId: 'P3', targetIds: ['P1', 'P2'], simultaneous: true } },
  { accepted: true, eventId: 'c1', kind: 'compare4', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'], winnerIds: ['P4'] } },
  { accepted: true, eventId: 'f1', kind: 'finisher', publicData: { winnerId: 'P4', loserIds: ['P1', 'P2', 'P3'] } },
  { accepted: true, eventId: 's1', kind: 'settle', publicData: { compoundAttackPackage } }
];

const timeline = projectAcceptedBattleEventsToScreen({
  participants,
  events,
  persistentAfterstate: [
    { id: 'lane-p4', participantId: 'P4', text: '列進行 7' },
    { id: 'status-p2', participantId: 'P2', text: '公開済み状態' }
  ],
  returnIntent: 'RESULT'
});
assert.equal(timeline.presentationOnly, true);
assert.equal(timeline.gameStateWrite, false);
assert.equal(timeline.authorityBoundary, 'existing_battle_conveyor_accepted_public_event_only');
assert.equal(timeline.models.length, events.length);
assert.ok(timeline.timelineEnd > 0);
assert.equal(timeline.models.every(model => auditBattleScreenModel(model).ok), true);

const attack = timeline.models.find(model => model.eventId === 'a1');
assert.equal(attack.screenMode, 'BATTLE_PHASE');
assert.equal(attack.phase, 'attack');
assert.equal(attack.boardInteractionOwnedByCaller, false);
assert.deepEqual(attack.battlePhaseInputPolicy, ['skip', 'public_info', 'accessibility']);
assert.equal(attack.focus.causeId, 'P1');
assert.deepEqual(attack.focus.targetIds, ['P3']);
assert.equal(attack.boardReturn, null);
assert.equal(attack.lanes.find(row => row.id === 'P1').role, 'source');
assert.equal(attack.lanes.find(row => row.id === 'P3').role, 'target');
assert.equal(attack.lanes.find(row => row.id === 'P2').role, 'idle');

const multi = timeline.models.find(model => model.eventId === 'a2');
assert.equal(multi.lanes.find(row => row.id === 'P3').role, 'source');
assert.equal(multi.lanes.find(row => row.id === 'P1').role, 'target');
assert.equal(multi.lanes.find(row => row.id === 'P2').role, 'target');
assert.equal(multi.transition, 'MULTI_TARGET_SPREAD');

const compare = timeline.models.find(model => model.eventId === 'c1');
assert.deepEqual(compare.focus.winnerIds, ['P4']);
assert.equal(compare.lanes.find(row => row.id === 'P4').role, 'winner');
assert.equal(compare.lanes.find(row => row.id === 'P1').role, 'revealed');
assert.equal(compare.boardReturn, null);

const finisher = timeline.models.find(model => model.eventId === 'f1');
assert.equal(finisher.transition, 'FINISHER_GATHER');
assert.equal(finisher.focus.causeId, 'P4');
assert.deepEqual(finisher.focus.targetIds, []);
assert.deepEqual(finisher.focus.winnerIds, ['P4']);
assert.equal(finisher.lanes.find(row => row.id === 'P4').role, 'winner');
assert.deepEqual(finisher.lanes.map(row => row.role), ['idle', 'idle', 'idle', 'winner']);
assert.equal(finisher.lanes.some(row => row.role === 'loser'), false);
assert.deepEqual(finisher.lanes.find(row => row.id === 'P4').afterstate.map(row => row.text), ['列進行 7']);
assert.deepEqual(finisher.lanes.find(row => row.id === 'P2').afterstate.map(row => row.text), ['公開済み状態']);
assert.equal(finisher.returnIntent, 'RESULT');

const settle = timeline.models.find(model => model.eventId === 's1');
assert.equal(settle.phase, 'settle');
assert.equal(settle.boardEffectCalculation, false);
assert.equal(settle.boardReturn.eventId, 's1');
assert.equal(settle.boardReturn.compoundPackageSchema, COMPOUND_SCHEMA);
assert.equal(settle.boardReturn.cardId, 'C-009');
assert.equal(settle.boardReturn.jankenHand, 'ROCK');
assert.deepEqual(settle.boardReturn.path, compoundAttackPackage.path);
assert.notEqual(settle.boardReturn.path, compoundAttackPackage.path);
assert.equal(settle.boardReturn.direction, 'LEFT');
assert.equal(settle.boardReturn.roadId, 'ROAD-01');
assert.equal(settle.boardReturn.battleId, 'BATTLE-01');
assert.equal(settle.boardReturn.opponentId, 'P3');
assert.equal(settle.boardReturn.shieldLane, 'R');
assert.equal(settle.boardReturn.shieldRef, 'shield:P3:R');
assert.equal(settle.boardReturn.destinationKey, 'P3:R');
assert.equal(settle.boardReturn.source, 'accepted_public_compound_attack_package');
assert.equal(settle.boardReturn.visualIntent, 'resolution_to_committed_shield');
assert.equal(settle.boardReturn.effectMutationClaimed, false);
assert.deepEqual(settle.focus, { causeId: null, targetIds: ['P3'], winnerIds: [] });
assert.deepEqual(settle.lanes.map(row => row.role), ['idle', 'idle', 'target', 'idle']);

const reduced = projectAcceptedBattleEventsToScreen({ participants, events, reducedMotion: true });
assert.equal(reduced.models.every(model => model.motion === 'static_only'), true);
assert.equal(reduced.models.every(model => model.reducedMotion === true), true);
assert.equal(reduced.models.find(model => model.eventId === 's1').boardReturn.destinationKey, 'P3:R');
const lowPerf = projectAcceptedBattleEventsToScreen({ participants, events, lowPerf: true });
assert.equal(lowPerf.models.every(model => model.motion === 'static_only'), true);
assert.equal(lowPerf.models.find(model => model.eventId === 's1').boardReturn.destinationKey, 'P3:R');
assert.ok(reduced.timelineEnd < timeline.timelineEnd);

function settlePlan(overrides = {}) {
  return {
    presentationOnly: true,
    authorityBoundary: 'accepted_public_event_only',
    eventId: 'settle-test',
    kind: 'settle',
    transition: 'CONTINUE',
    groupTargets: [],
    importance: 'ambient',
    publicData: { compoundAttackPackage: { ...compoundAttackPackage, ...overrides } }
  };
}

assert.throws(
  () => createBattleScreenModel({ participants: participants.slice(0, 3) }),
  /REQUIRES_FOUR_PARTICIPANTS/
);
assert.throws(
  () => createBattleScreenModel({ participants: [...participants.slice(0, 3), { id: 'P3', label: 'duplicate' }] }),
  /PARTICIPANT_IDS_NOT_UNIQUE/
);
assert.throws(
  () => createBattleScreenModel({ participants, returnIntent: 'HOME' }),
  /RETURN_INTENT_INVALID/
);
assert.throws(
  () => createBattleScreenModel({ participants, persistentAfterstate: [{ participantId: 'PX', text: 'bad' }] }),
  /AFTERSTATE_PARTICIPANT_UNKNOWN/
);
assert.throws(
  () => projectAcceptedBattleEventsToScreen({
    participants,
    events: [{ accepted: false, eventId: 'bad', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['P2'] } }]
  }),
  /EVENT_NOT_ACCEPTED/
);
assert.throws(
  () => projectAcceptedBattleEventsToScreen({
    participants,
    events: [{ accepted: true, eventId: 'unknown', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['PX'] } }]
  }),
  /BATTLE_SCREEN_PLAN_PARTICIPANT_UNKNOWN:PX/
);
assert.throws(
  () => createBattleScreenModel({ participants, plan: settlePlan({ opponentId: 'PX' }) }),
  /BOARD_RETURN_OPPONENT_UNKNOWN/
);
assert.throws(
  () => createBattleScreenModel({ participants, plan: settlePlan({ shieldLane: 'X' }) }),
  /BOARD_RETURN_SHIELD_UNKNOWN/
);
assert.throws(
  () => createBattleScreenModel({ participants, plan: settlePlan({ path: [] }) }),
  /BOARD_RETURN_PATH_REQUIRED/
);
assert.throws(
  () => createBattleScreenModel({ participants, plan: settlePlan({ schema: 'wrong.schema' }) }),
  /BOARD_RETURN_PACKAGE_SCHEMA/
);

assert.equal(BATTLE_SCREEN_PRESENTATION.authority, 'NONE_PRESENTATION_ONLY');
assert.equal(BATTLE_SCREEN_PRESENTATION.laneCount, 4);
assert.equal(BATTLE_SCREEN_PRESENTATION.planOwner, 'CALLER');
assert.equal(BATTLE_SCREEN_PRESENTATION.compoundAttackPackageSchema, COMPOUND_SCHEMA);
assert.equal(BATTLE_SCREEN_PRESENTATION.boardReturnAuthority, 'NORMALIZED_COMPOUND_ATTACK_PACKAGE_FROM_ACCEPTED_SETTLE_EVENT_ONLY');
assert.equal(BATTLE_SCREEN_PRESENTATION.boardReturnEffectPolicy, 'NO_EFFECT_INFERENCE_OR_GAME_STATE_WRITE');
assert.deepEqual(BATTLE_SCREEN_PRESENTATION.shieldLanes, ['L', 'C', 'R']);
assert.equal(BATTLE_SCREEN_PRESENTATION.formalArtOwnedHere, false);
assert.deepEqual(BATTLE_SCREEN_PRESENTATION.requiredAnchors, ['battlePhaseSurface', 'battleResolution']);

console.log(JSON.stringify({
  ok: true,
  tests: 91,
  timelineEnd: timeline.timelineEnd,
  phases: timeline.models.map(model => [model.eventId, model.phase, model.transition]),
  boardReturn: settle.boardReturn,
  finisherRoles: finisher.lanes.map(row => [row.id, row.role])
}, null, 2));
