import assert from 'node:assert/strict';
import { planBattleConveyor } from '../browser/battle-conveyor-presentation-core.mjs';
import {
  BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT,
  auditBattleCinematicDuelSequence,
  projectBattleCinematicDuelSequence
} from '../browser/battle-cinematic-duel-sequence-core.mjs';

const participants = [
  { id: 'P1', label: 'A-1', team: 'A', actorRef: 'actor:P1' },
  { id: 'P2', label: 'A-2', team: 'A', actorRef: 'actor:P2' },
  { id: 'P3', label: 'B-1', team: 'B', actorRef: 'actor:P3' },
  { id: 'P4', label: 'B-2', team: 'B', actorRef: 'actor:P4' }
];

const events = [
  { accepted: true, eventId: 'r0', kind: 'reveal', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'] } },
  { accepted: true, eventId: 'a1', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['P3'], importance: 'normal' } },
  { accepted: true, eventId: 'a2', kind: 'attack', publicData: { sourceId: 'P3', targetIds: ['P4'], importance: 'normal' } },
  { accepted: true, eventId: 'a3', kind: 'ability', publicData: { sourceId: 'P4', targetIds: ['P1', 'P2'], simultaneous: true } },
  { accepted: true, eventId: 'c1', kind: 'compare4', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'], winnerIds: ['P4'] } }
];

const conveyor = planBattleConveyor(events);
const actionCardsByEventId = {
  a1: { ownerId: 'P1', cardId: 'C-101', printedNumber: 5, nativeSuit: 'SPADE', artRef: 'card-art:C-101' },
  a2: { ownerId: 'P3', cardId: 'C-303', printedNumber: 9, nativeSuit: 'HEART', artRef: 'card-art:C-303' },
  a3: { ownerId: 'P4', cardId: 'C-404', printedNumber: 7, nativeSuit: 'DIAMOND', artRef: 'card-art:C-404' }
};
const acceptedReactionsByEventId = {
  a1: { P3: 'HIT' },
  a2: { P4: 'BLOCK' },
  a3: { P1: 'NULLIFIED', P2: 'COUNTER' }
};

const sequence = projectBattleCinematicDuelSequence({
  participants,
  plans: conveyor.plans,
  actionCardsByEventId,
  acceptedReactionsByEventId
});

assert.equal(sequence.schema, 'gameroad.battle-cinematic-duel-sequence.v1');
assert.equal(sequence.presentationOnly, true);
assert.equal(sequence.gameplayAuthority, false);
assert.equal(sequence.gameStateWrite, false);
assert.equal(sequence.orderCalculation, false);
assert.equal(sequence.targetCalculation, false);
assert.equal(sequence.winnerCalculation, false);
assert.equal(sequence.reactionCalculation, false);
assert.equal(sequence.actionCardCalculation, false);
assert.equal(sequence.actorIdentityCalculation, false);
assert.equal(sequence.motion, 'presentation_allowed');
assert.equal(sequence.actions.length, 3);
assert.equal(auditBattleCinematicDuelSequence(sequence).ok, true);
assert.equal(Object.isFrozen(sequence), true);

const first = sequence.actions[0];
assert.equal(first.eventId, 'a1');
assert.equal(first.attacker.participantId, 'P1');
assert.equal(first.attacker.actorRef, 'actor:P1');
assert.equal(first.attacker.stageSide, 'left');
assert.equal(first.defenders[0].actor.participantId, 'P3');
assert.equal(first.defenders[0].actor.stageSide, 'right');
assert.equal(first.defenders[0].reactionKind, 'HIT');
assert.equal(first.defenders[0].reactionMotionIntent, 'RECOIL');
assert.equal(first.actionCard.physicalCardId, 'C-101');
assert.equal(first.actionCard.ownerId, 'P1');
assert.equal(first.actionCard.abstractReplacementAllowed, false);
assert.equal(first.incomingTransition, 'IMPACT_CARRY_RIGHT');
assert.equal(first.motion.sourceMotionIntent, 'LUNGE_TO_TARGET');
assert.equal(first.motion.actionCardMotionIntent, 'CARD_ANCHOR_WITH_ATTACK');
assert.equal(first.motion.startMs, conveyor.plans[1].timing.start);
assert.equal(first.motion.impactMs, conveyor.plans[1].timing.impact);
assert.equal(first.motion.handoffAtMs, conveyor.plans[1].timing.handoffAt);
assert.equal(first.motion.recoveryEndMs, conveyor.plans[1].timing.recoveryEnd);
assert.equal(first.handoff.mode, 'DUEL_HANDOFF');
assert.equal(first.handoff.nextEventId, 'a2');
assert.equal(first.handoff.nextTransition, 'IMPACT_CARRY_LEFT');
assert.deepEqual(first.handoff.preservedParticipantIds, ['P3']);
assert.deepEqual(first.handoff.exitingParticipantIds, ['P1']);
assert.deepEqual(first.handoff.enteringParticipantIds, ['P4']);
assert.ok(first.handoff.overlapMs > 0);

const second = sequence.actions[1];
assert.equal(second.attacker.participantId, 'P3');
assert.equal(second.attacker.stageSide, 'right');
assert.equal(second.defenders[0].actor.participantId, 'P4');
assert.equal(second.defenders[0].actor.stageSide, 'left');
assert.equal(second.defenders[0].reactionKind, 'BLOCK');
assert.equal(second.defenders[0].reactionMotionIntent, 'GUARD_REBOUND');
assert.equal(second.actionCard.physicalCardId, 'C-303');
assert.equal(second.handoff.mode, 'DUEL_HANDOFF');
assert.deepEqual(second.handoff.preservedParticipantIds, ['P4']);
assert.deepEqual(second.handoff.exitingParticipantIds, ['P3']);
assert.deepEqual(second.handoff.enteringParticipantIds, ['P1']);

const third = sequence.actions[2];
assert.equal(third.kind, 'ability');
assert.equal(third.attacker.participantId, 'P4');
assert.deepEqual(third.defenders.map(row => row.actor.participantId), ['P1', 'P2']);
assert.equal(third.defenders[0].actor.stageSide, 'right');
assert.equal(third.defenders[1].actor.stageSide, null);
assert.equal(third.defenders[0].reactionKind, 'NULLIFIED');
assert.equal(third.defenders[0].reactionMotionIntent, 'EFFECT_DISSOLVE');
assert.equal(third.defenders[1].reactionKind, 'COUNTER');
assert.equal(third.defenders[1].reactionMotionIntent, 'GUARD_THEN_COUNTER_CUE');
assert.equal(third.defenders[1].counterPresentation, true);
assert.equal(third.actionCard.physicalCardId, 'C-404');
assert.equal(third.handoff.mode, 'PHASE_BOUNDARY');
assert.equal(third.handoff.nextEventId, 'c1');
assert.equal(third.handoff.nextKind, 'compare4');
assert.equal(third.handoff.nextTransition, 'COMPARE4');

const unresolved = projectBattleCinematicDuelSequence({
  participants,
  plans: planBattleConveyor([
    { accepted: true, eventId: 'solo', kind: 'attack', publicData: { sourceId: 'P2', targetIds: ['P4'] } }
  ]).plans,
  actionCardsByEventId: new Map([
    ['solo', { ownerId: 'P2', cardId: 'C-202', printedNumber: '2' }]
  ]),
  acceptedReactionsByEventId: new Map()
});
assert.equal(unresolved.actions[0].defenders[0].reactionKind, 'UNRESOLVED');
assert.equal(unresolved.actions[0].defenders[0].reactionAuthority, 'not_supplied');
assert.equal(unresolved.actions[0].defenders[0].reactionMotionIntent, 'HOLD_RESULT');
assert.equal(unresolved.actions[0].handoff.mode, 'SEQUENCE_END');

const reduced = projectBattleCinematicDuelSequence({
  participants,
  plans: conveyor.plans,
  actionCardsByEventId,
  acceptedReactionsByEventId,
  reducedMotion: true
});
assert.equal(reduced.motion, 'static_only');
assert.equal(reduced.actions.every(action => action.motion.mode === 'static_only'), true);
assert.equal(reduced.actions[0].defenders[0].reactionMotionIntent, 'STATIC_RESULT');
assert.deepEqual(reduced.actions.map(action => action.eventId), sequence.actions.map(action => action.eventId));

assert.throws(
  () => projectBattleCinematicDuelSequence({
    participants,
    plans: conveyor.plans,
    actionCardsByEventId: { ...actionCardsByEventId, a1: { ...actionCardsByEventId.a1, ownerId: 'P2' } },
    acceptedReactionsByEventId
  }),
  /ACTION_CARD_OWNER_MISMATCH/
);

assert.throws(
  () => projectBattleCinematicDuelSequence({
    participants,
    plans: conveyor.plans,
    actionCardsByEventId: { a2: actionCardsByEventId.a2, a3: actionCardsByEventId.a3 },
    acceptedReactionsByEventId
  }),
  /ACTION_CARD_REQUIRED/
);

assert.throws(
  () => projectBattleCinematicDuelSequence({
    participants,
    plans: conveyor.plans,
    actionCardsByEventId,
    acceptedReactionsByEventId: { ...acceptedReactionsByEventId, a1: { P2: 'HIT' } }
  }),
  /REACTION_TARGET_UNKNOWN/
);

assert.throws(
  () => projectBattleCinematicDuelSequence({
    participants,
    plans: conveyor.plans,
    actionCardsByEventId,
    acceptedReactionsByEventId: { ...acceptedReactionsByEventId, a1: { P3: 'MAGIC_RESULT' } }
  }),
  /REACTION_UNKNOWN/
);

const tampered = auditBattleCinematicDuelSequence({
  ...sequence,
  actions: sequence.actions.map((action, index) => index === 0
    ? { ...action, actionCard: { ...action.actionCard, ownerId: 'P2' } }
    : action)
});
assert.deepEqual(tampered.defects, ['CARD_LINEAGE']);

assert.equal(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.authority, 'NONE_PRESENTATION_ONLY');
assert.equal(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.sourcePlanSchema, 'gameroad.battle-conveyor-presentation.v2');
assert.deepEqual(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.actionKinds, ['attack', 'ability']);
assert.deepEqual(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.reactionKinds, ['HIT', 'BLOCK', 'NULLIFIED', 'COUNTER', 'UNRESOLVED']);
assert.equal(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.orderAuthority, 'EXISTING_BATTLE_CONVEYOR');
assert.equal(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.liveMountOwnedHere, false);
assert.equal(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.formalArtOwnedHere, false);
assert.equal(BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT.gameplayStateWrite, false);

console.log(JSON.stringify({
  ok: true,
  actions: sequence.actions.map(action => ({
    eventId: action.eventId,
    attacker: action.attacker.participantId,
    defenders: action.defenders.map(row => [row.actor.participantId, row.reactionKind]),
    cardId: action.actionCard.physicalCardId,
    handoff: action.handoff.mode
  }))
}, null, 2));
