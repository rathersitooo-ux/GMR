import assert from 'node:assert/strict';
import {
  BATTLE_PLAN_HUD_PRESENTATION,
  auditBattlePlanHudModel,
  createBattlePlanHudModel
} from '../browser/battle-plan-hud-presentation-core.mjs';

const participants = [
  { id: 'P1', label: 'PLAYER 1', team: 'A', publicBadges: ['turn'], hand: ['secret'], deck: ['secret'] },
  { id: 'P2', label: 'PLAYER 2', team: 'A', publicBadges: ['ally'], private: { hand: ['secret'] } },
  { id: 'P3', label: 'PLAYER 3', team: 'B', publicBadges: ['target'] },
  { id: 'P4', label: 'PLAYER 4', team: 'B' }
];

const boardProjection = Object.freeze({
  schema: 'gameroad.battle-board-visual-explanation.v1',
  ok: true,
  clear: false,
  channels: Object.freeze({ target: Object.freeze(['pos-7']) }),
  rolesByPosition: Object.freeze({ 'pos-7': Object.freeze(['target']) })
});

const input = {
  participants,
  viewerParticipantId: 'P1',
  currentActorId: 'P1',
  roundLabel: 'ROUND 3',
  phaseLabel: 'PLAN',
  boardContext: {
    selectedPositionId: 'pos-4',
    selectedTargetId: 'P3',
    targetKind: 'attack',
    prompt: '対象を確認',
    projection: boardProjection
  },
  ownHand: [
    { id: 'c1', label: 'CARD 1', selected: true, readiness: 'ready', effect: 'ignored secret-ish extra' },
    { id: 'c2', label: 'CARD 2', selected: false, readiness: 'blocked' },
    { id: 'c3', label: 'CARD 3' }
  ],
  primaryAction: {
    id: 'commit',
    label: '決定',
    intent: 'COMMIT_PLAN',
    ready: true,
    disabledReason: 'must be ignored when ready'
  }
};

const snapshot = JSON.stringify(input);
const model = createBattlePlanHudModel(input);
assert.equal(JSON.stringify(input), snapshot, 'input must not be mutated');
assert.equal(model.presentationOnly, true);
assert.equal(model.gameplayAuthority, false);
assert.equal(model.gameStateWrite, false);
assert.equal(model.winnerCalculation, false);
assert.equal(model.targetCalculation, false);
assert.equal(model.legalityCalculation, false);
assert.equal(model.secretProjectionAuthority, false);
assert.equal(model.screenMode, 'MATCH_PLAN');
assert.equal(model.phaseLabel, 'PLAN');
assert.equal(model.roundLabel, 'ROUND 3');
assert.equal(model.viewerParticipantId, 'P1');
assert.equal(model.currentActorId, 'P1');
assert.equal(model.participants.length, 4);
assert.deepEqual(model.participants.map(row => row.id), ['P1', 'P2', 'P3', 'P4']);
assert.equal(model.participants.find(row => row.id === 'P1').isViewer, true);
assert.equal(model.participants.find(row => row.id === 'P1').isCurrentActor, true);
assert.equal(model.participants.find(row => row.id === 'P3').isCurrentActor, false);
assert.equal('hand' in model.participants[0], false, 'opponent/public participant projection must not surface hand');
assert.equal('deck' in model.participants[0], false, 'participant projection must not surface deck');
assert.equal('private' in model.participants[1], false, 'participant projection must not surface private payload');
assert.deepEqual(model.participants[0].publicBadges, ['turn']);
assert.equal(model.board.selectedPositionId, 'pos-4');
assert.equal(model.board.selectedTargetId, 'P3');
assert.equal(model.board.targetKind, 'attack');
assert.equal(model.board.projection.schema, 'gameroad.battle-board-visual-explanation.v1');
assert.notEqual(model.board.projection, boardProjection, 'board projection must be copied, not retained by reference');
assert.equal(model.hand.ownerId, 'P1');
assert.equal(model.hand.privacy, 'SELF_ONLY_CALLER_PROJECTION');
assert.equal(model.hand.count, 3);
assert.deepEqual(model.hand.cards.map(row => [row.id, row.selected, row.readiness]), [
  ['c1', true, 'ready'],
  ['c2', false, 'blocked'],
  ['c3', false, 'unknown']
]);
assert.equal('effect' in model.hand.cards[0], false, 'hand projection whitelists semantic fields only');
assert.equal(model.primaryAction.ready, true);
assert.equal(model.primaryAction.disabledReason, null);
assert.equal(model.actionReadinessAuthority, 'CALLER');
assert.equal(model.selectedTargetAuthority, 'CALLER');
assert.equal(model.motion, 'allowed');
assert.equal(Object.isFrozen(model), true);
assert.equal(Object.isFrozen(model.participants), true);
assert.equal(Object.isFrozen(model.hand.cards), true);
assert.equal(auditBattlePlanHudModel(model).ok, true);

const targetlessReady = createBattlePlanHudModel({
  participants,
  viewerParticipantId: 'P2',
  boardContext: { selectedTargetId: null },
  primaryAction: { ready: true }
});
assert.equal(targetlessReady.board.selectedTargetId, null);
assert.equal(targetlessReady.primaryAction.ready, true, 'module must not derive readiness from target presence');

const targetedBlocked = createBattlePlanHudModel({
  participants,
  viewerParticipantId: 'P2',
  boardContext: { selectedTargetId: 'P4' },
  primaryAction: { ready: false, disabledReason: 'CALLER_SAYS_BLOCKED' }
});
assert.equal(targetedBlocked.board.selectedTargetId, 'P4');
assert.equal(targetedBlocked.primaryAction.ready, false, 'module must not infer legal readiness from a selected target');
assert.equal(targetedBlocked.primaryAction.disabledReason, 'CALLER_SAYS_BLOCKED');

const reduced = createBattlePlanHudModel({ participants, viewerParticipantId: 'P1', reducedMotion: true });
assert.equal(reduced.motion, 'static_only');
assert.equal(reduced.reducedMotion, true);
const lowPerf = createBattlePlanHudModel({ participants, viewerParticipantId: 'P1', lowPerf: true });
assert.equal(lowPerf.motion, 'static_only');
assert.equal(lowPerf.lowPerf, true);

assert.throws(
  () => createBattlePlanHudModel({ participants: participants.slice(0, 3), viewerParticipantId: 'P1' }),
  /REQUIRES_FOUR_PARTICIPANTS/
);
assert.throws(
  () => createBattlePlanHudModel({ participants: [...participants.slice(0, 3), { id: 'P3' }], viewerParticipantId: 'P1' }),
  /PARTICIPANT_IDS_NOT_UNIQUE/
);
assert.throws(
  () => createBattlePlanHudModel({ participants, viewerParticipantId: 'PX' }),
  /VIEWER_UNKNOWN/
);
assert.throws(
  () => createBattlePlanHudModel({ participants, viewerParticipantId: 'P1', currentActorId: 'PX' }),
  /CURRENT_ACTOR_UNKNOWN/
);
assert.throws(
  () => createBattlePlanHudModel({ participants, viewerParticipantId: 'P1', primaryAction: { ready: 'yes' } }),
  /PRIMARY_ACTION_READY_REQUIRED/
);
assert.throws(
  () => createBattlePlanHudModel({ participants, viewerParticipantId: 'P1', ownHand: [{ id: 'same' }, { id: 'same' }] }),
  /CARD_IDS_NOT_UNIQUE/
);
assert.throws(
  () => createBattlePlanHudModel({ participants, viewerParticipantId: 'P1', ownHand: [{ id: 'c', readiness: 'legal' }] }),
  /CARD_READINESS_INVALID/
);
assert.throws(
  () => createBattlePlanHudModel({
    participants,
    viewerParticipantId: 'P1',
    boardContext: { projection: { schema: 'wrong' } }
  }),
  /BOARD_PROJECTION_SCHEMA_MISMATCH/
);

const second = createBattlePlanHudModel(input);
assert.deepEqual(second, model, 'same caller snapshot must produce same semantic model');

assert.equal(BATTLE_PLAN_HUD_PRESENTATION.authority, 'NONE_PRESENTATION_ONLY');
assert.equal(BATTLE_PLAN_HUD_PRESENTATION.participantCount, 4);
assert.equal(BATTLE_PLAN_HUD_PRESENTATION.handScope, 'SELF_ONLY_CALLER_PROJECTION');
assert.equal(BATTLE_PLAN_HUD_PRESENTATION.actionReadinessOwner, 'CALLER');
assert.equal(BATTLE_PLAN_HUD_PRESENTATION.selectedTargetOwner, 'CALLER');
assert.equal(BATTLE_PLAN_HUD_PRESENTATION.formalArtOwnedHere, false);
assert.equal(BATTLE_PLAN_HUD_PRESENTATION.domOwnedHere, false);
assert.deepEqual(BATTLE_PLAN_HUD_PRESENTATION.requiredAnchors, [
  'battlePlanHud',
  'battlePlanParticipants',
  'battlePlanBoard',
  'battlePlanTarget',
  'battlePlanOwnHand',
  'battlePlanPrimaryAction'
]);

console.log(JSON.stringify({
  ok: true,
  tests: 69,
  anchors: BATTLE_PLAN_HUD_PRESENTATION.requiredAnchors,
  viewer: model.viewerParticipantId,
  currentActor: model.currentActorId,
  ownHandCount: model.hand.count,
  selectedTargetId: model.board.selectedTargetId,
  primaryReady: model.primaryAction.ready
}, null, 2));
