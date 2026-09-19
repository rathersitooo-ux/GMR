import assert from 'node:assert/strict';
import { planBattleConveyor } from '../browser/battle-conveyor-presentation-core.mjs';
import {
  BATTLE_PARTNER_CUTIN_CONTRACT,
  auditBattlePartnerCutins,
  projectBattlePartnerCutins
} from '../browser/battle-cinematic-partner-cutin-core.mjs';

const events = [
  { accepted: true, eventId: 'cut-a', kind: 'partner_cutin', publicData: { partnerId: 'PARTNER-A' } },
  { accepted: true, eventId: 'reveal', kind: 'reveal', publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'] } },
  { accepted: true, eventId: 'attack', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['P3'] } },
  { accepted: true, eventId: 'cut-b', kind: 'partner_cutin', publicData: { partnerId: 'PARTNER-B' } },
  { accepted: true, eventId: 'ability', kind: 'ability', publicData: { sourceId: 'P3', targetIds: ['P1'], importance: 'strong' } }
];

const conveyor = planBattleConveyor(events);
const actors = {
  'PARTNER-A': {
    partnerId: 'PARTNER-A',
    actorRef: 'partner:PARTNER-A',
    label: '相方A',
    visualRef: 'existing-visual:PARTNER-A'
  },
  'PARTNER-B': {
    actorRef: 'partner:PARTNER-B',
    label: '相方B'
  }
};

const model = projectBattlePartnerCutins({
  plans: conveyor.plans,
  actorsByPartnerId: actors
});

assert.equal(model.schema, 'gameroad.battle-cinematic-partner-cutin.v1');
assert.equal(model.presentationOnly, true);
assert.equal(model.gameplayAuthority, false);
assert.equal(model.gameStateWrite, false);
assert.equal(model.actorIdentityCalculation, false);
assert.equal(model.abilityCalculation, false);
assert.equal(model.targetCalculation, false);
assert.equal(model.winnerCalculation, false);
assert.equal(model.timelineCalculation, false);
assert.equal(model.motion, 'presentation_allowed');
assert.equal(model.cutins.length, 2);
assert.equal(auditBattlePartnerCutins(model).ok, true);
assert.equal(Object.isFrozen(model), true);

const firstPlan = conveyor.plans.find(plan => plan.eventId === 'cut-a');
const first = model.cutins[0];
assert.equal(first.eventId, 'cut-a');
assert.equal(first.partnerId, 'PARTNER-A');
assert.equal(first.actor.actorRef, 'partner:PARTNER-A');
assert.equal(first.actor.visualRef, 'existing-visual:PARTNER-A');
assert.equal(first.actor.identityAuthority, 'caller_supplied_existing_partner_identity');
assert.equal(first.semanticRole, 'existing_partner_cutin_event');
assert.equal(first.sourceTransition, 'PARTNER_CUTIN_LEFT');
assert.equal(first.visualIntent, 'single_actor_cutin_insert');
assert.equal(first.timelineWindow.startMs, firstPlan.timing.start);
assert.equal(first.timelineWindow.endMs, firstPlan.timing.recoveryEnd);
assert.equal(first.timelineWindow.durationMs, firstPlan.timing.recoveryEnd - firstPlan.timing.start);
assert.equal(first.timelineWindow.source, 'existing_battle_conveyor_timing');
assert.equal(first.resume.mode, 'NEXT_ACCEPTED_BATTLE_PLAN');
assert.equal(first.resume.eventId, 'reveal');
assert.equal(first.resume.kind, 'reveal');
assert.equal(first.resume.resumeAtMs, first.timelineWindow.endMs);

const second = model.cutins[1];
assert.equal(second.partnerId, 'PARTNER-B');
assert.equal(second.actor.visualRef, null);
assert.equal(second.resume.mode, 'NEXT_ACCEPTED_BATTLE_PLAN');
assert.equal(second.resume.eventId, 'ability');
assert.equal(second.resume.kind, 'ability');
assert.equal(second.resume.resumeAtMs, second.timelineWindow.endMs);

const mapModel = projectBattlePartnerCutins({
  plans: conveyor.plans,
  actorsByPartnerId: new Map(Object.entries(actors))
});
assert.deepEqual(
  mapModel.cutins.map(row => [row.eventId, row.actor.actorRef]),
  [['cut-a', 'partner:PARTNER-A'], ['cut-b', 'partner:PARTNER-B']]
);

const reduced = projectBattlePartnerCutins({
  plans: conveyor.plans,
  actorsByPartnerId: actors,
  reducedMotion: true
});
assert.equal(reduced.motion, 'static_only');
assert.equal(reduced.cutins.every(row => row.motion.mode === 'static_only'), true);
assert.equal(reduced.cutins[0].motion.entryIntent, 'STATIC_FOCUS');
assert.equal(reduced.cutins[0].motion.exitIntent, 'STATIC_RELEASE');
assert.deepEqual(
  reduced.cutins.map(row => [row.eventId, row.resume.eventId]),
  model.cutins.map(row => [row.eventId, row.resume.eventId])
);

const endConveyor = planBattleConveyor([
  { accepted: true, eventId: 'only-cut', kind: 'partner_cutin', publicData: { partnerId: 'PARTNER-A' } }
]);
const endModel = projectBattlePartnerCutins({
  plans: endConveyor.plans,
  actorsByPartnerId: actors
});
assert.equal(endModel.cutins[0].resume.mode, 'SEQUENCE_END');
assert.equal(endModel.cutins[0].resume.eventId, null);
assert.equal(endModel.cutins[0].resume.resumeAtMs, endModel.cutins[0].timelineWindow.endMs);

const noCutin = projectBattlePartnerCutins({
  plans: planBattleConveyor([
    { accepted: true, eventId: 'attack-only', kind: 'attack', publicData: { sourceId: 'P1', targetIds: ['P2'] } }
  ]).plans,
  actorsByPartnerId: {}
});
assert.deepEqual(noCutin.cutins, []);
assert.equal(auditBattlePartnerCutins(noCutin).ok, true);

assert.throws(
  () => projectBattlePartnerCutins({
    plans: conveyor.plans,
    actorsByPartnerId: { 'PARTNER-B': actors['PARTNER-B'] }
  }),
  /ACTOR_REQUIRED/
);

assert.throws(
  () => projectBattlePartnerCutins({
    plans: conveyor.plans,
    actorsByPartnerId: {
      ...actors,
      'PARTNER-A': { ...actors['PARTNER-A'], partnerId: 'PARTNER-B' }
    }
  }),
  /ACTOR_PARTNER_MISMATCH/
);

const tamperedPlan = conveyor.plans.map(plan =>
  plan.eventId === 'cut-a' ? { ...plan, transition: 'CONTINUE' } : plan
);
assert.throws(
  () => projectBattlePartnerCutins({ plans: tamperedPlan, actorsByPartnerId: actors }),
  /TRANSITION_MISMATCH/
);

const brokenResume = conveyor.plans.map(plan =>
  plan.eventId === 'reveal'
    ? { ...plan, timing: { ...plan.timing, start: plan.timing.start + 1 } }
    : plan
);
assert.throws(
  () => projectBattlePartnerCutins({ plans: brokenResume, actorsByPartnerId: actors }),
  /RESUME_POINT_MISMATCH/
);

const tamperedAudit = auditBattlePartnerCutins({
  ...model,
  cutins: model.cutins.map((row, index) => index === 0
    ? { ...row, actor: { ...row.actor, partnerId: 'OTHER' } }
    : row)
});
assert.deepEqual(tamperedAudit.defects, ['ACTOR']);

assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.authority, 'NONE_PRESENTATION_ONLY');
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.sourcePlanSchema, 'gameroad.battle-conveyor-presentation.v2');
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.acceptedSourceKind, 'partner_cutin');
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.acceptedSourceTransition, 'PARTNER_CUTIN_LEFT');
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.actorIdentityAuthority, 'CALLER_EXISTING_PARTNER_IDENTITY');
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.timelineAuthority, 'EXISTING_BATTLE_CONVEYOR');
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.liveMountOwnedHere, false);
assert.equal(BATTLE_PARTNER_CUTIN_CONTRACT.formalVisualOwnedHere, false);

console.log(JSON.stringify({
  ok: true,
  cutins: model.cutins.map(row => ({
    eventId: row.eventId,
    partnerId: row.partnerId,
    window: row.timelineWindow,
    resume: row.resume
  }))
}, null, 2));
