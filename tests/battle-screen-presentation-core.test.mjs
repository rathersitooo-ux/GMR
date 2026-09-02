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

const planModel = createBattleScreenModel({ participants });
assert.equal(planModel.presentationOnly, true);
assert.equal(planModel.gameplayAuthority, false);
assert.equal(planModel.gameStateWrite, false);
assert.equal(planModel.winnerCalculation, false);
assert.equal(planModel.targetCalculation, false);
assert.equal(planModel.secretProjectionAuthority, false);
assert.equal(planModel.screenMode, 'MATCH_PLAN');
assert.equal(planModel.boardInteractionOwnedByCaller, true);
assert.equal(planModel.battlePhaseBoardInteractionAllowed, false);
assert.equal(planModel.fourLaneCausalStructure, true);
assert.equal(planModel.lanes.length, 4);
assert.deepEqual(planModel.lanes.map(row => row.id), ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(planModel.lanes.map(row => row.role), ['idle', 'idle', 'idle', 'idle']);
assert.equal(auditBattleScreenModel(planModel).ok, true);

const events = [
  { accepted: true, eventId: 'r1', kind: 'reveal', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'] } },
  { accepted: true, eventId: 'a1', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['P3'], importance: 'normal' } },
  { accepted: true, eventId: 'a2', kind: 'ability', publicData: { sourceId: 'P3', targetIds: ['P1', 'P2'], simultaneous: true } },
  { accepted: true, eventId: 'c1', kind: 'compare4', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'], winnerIds: ['P4'] } },
  { accepted: true, eventId: 'f1', kind: 'finisher', publicData: { winnerId: 'P4', loserIds: ['P1', 'P2', 'P3'] } },
  { accepted: true, eventId: 's1', kind: 'settle', publicData: {} }
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

const reduced = projectAcceptedBattleEventsToScreen({ participants, events, reducedMotion: true });
assert.equal(reduced.models.every(model => model.motion === 'static_only'), true);
assert.equal(reduced.models.every(model => model.reducedMotion === true), true);
const lowPerf = projectAcceptedBattleEventsToScreen({ participants, events, lowPerf: true });
assert.equal(lowPerf.models.every(model => model.motion === 'static_only'), true);
assert.ok(reduced.timelineEnd < timeline.timelineEnd);

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

assert.equal(BATTLE_SCREEN_PRESENTATION.authority, 'NONE_PRESENTATION_ONLY');
assert.equal(BATTLE_SCREEN_PRESENTATION.laneCount, 4);
assert.equal(BATTLE_SCREEN_PRESENTATION.planOwner, 'CALLER');
assert.equal(BATTLE_SCREEN_PRESENTATION.formalArtOwnedHere, false);
assert.deepEqual(BATTLE_SCREEN_PRESENTATION.requiredAnchors, ['battlePhaseSurface', 'battleResolution']);

console.log(JSON.stringify({
  ok: true,
  tests: 61,
  timelineEnd: timeline.timelineEnd,
  phases: timeline.models.map(model => [model.eventId, model.phase, model.transition]),
  finisherRoles: finisher.lanes.map(row => [row.id, row.role])
}, null, 2));
