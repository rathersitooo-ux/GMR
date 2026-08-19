import assert from 'node:assert/strict';
import { planBattleConveyor, auditMotionContinuity } from '../browser/battle-conveyor-presentation-core.mjs';

const demo = [
  {accepted:true,eventId:'p0',kind:'partner_cutin',publicData:{partnerId:'P-A'}},
  {accepted:true,eventId:'p1',kind:'reveal',publicData:{playerIds:['P1','P2','P3','P4']}},
  {accepted:true,eventId:'p2',kind:'attack',publicData:{sourceId:'P1',targetIds:['P2'],importance:'normal'}},
  {accepted:true,eventId:'p3',kind:'ability',publicData:{sourceId:'P1',targetIds:['P3'],importance:'strong'}},
  {accepted:true,eventId:'p4',kind:'ability',publicData:{sourceId:'P1',targetIds:['P2','P3'],simultaneous:true}},
  {accepted:true,eventId:'p5',kind:'attack',publicData:{sourceId:'P3',targetIds:['P4'],importance:'normal'}},
  {accepted:true,eventId:'p6',kind:'compare4',publicData:{playerIds:['P1','P2','P3','P4'],winnerIds:['P4']}},
  {accepted:true,eventId:'p7',kind:'finisher',publicData:{winnerId:'P4',loserIds:['P1','P2','P3']}}
];

const t = planBattleConveyor(demo);
assert.equal(t.presentationOnly, true);
assert.equal(t.plans.every(p => p.presentationOnly && p.authorityBoundary === 'accepted_public_event_only'), true);
assert.equal(t.plans[2].transition, 'CONTINUE');
assert.equal(t.plans[3].transition, 'IMPACT_CARRY_RIGHT');
assert.equal(t.plans[4].transition, 'MULTI_TARGET_SPREAD');
assert.equal(t.plans[5].transition, 'PAIR_SWAP_RIGHT');
assert.equal(t.plans[7].transition, 'FINISHER_GATHER');
assert.deepEqual(t.plans[7].groupTargets, ['P1','P2','P3']);
assert.ok(t.plans[7].emphasis.impact > t.plans[2].emphasis.impact, 'finisher must be more exaggerated than normal attack');
assert.ok(t.plans[3].emphasis.impact > t.plans[2].emphasis.impact, 'strong ability must be more exaggerated than normal attack');
assert.equal(t.plans[2].timing.handoffAt < t.plans[2].timing.recoveryEnd, true, 'next view starts before recovery ends');
assert.equal(auditMotionContinuity(t).ok, true);

const reduced = planBattleConveyor(demo, {reducedMotion:true});
assert.equal(reduced.plans.map(p => p.kind).join(','), t.plans.map(p => p.kind).join(','));
assert.equal(reduced.plans[7].groupTargets.length, 3);
assert.equal(auditMotionContinuity(reduced).ok, true);
assert.ok(reduced.timelineEnd < t.timelineEnd, 'reduced motion shortens movement without changing event meaning');

assert.throws(() => planBattleConveyor([{accepted:false,eventId:'x',kind:'attack',publicData:{sourceId:'P1',targetIds:['P2']}}]), /EVENT_NOT_ACCEPTED/);
assert.throws(() => planBattleConveyor([{accepted:true,eventId:'x',kind:'finisher',publicData:{winnerId:'P1',loserIds:['P1','P2','P3']}}]), /FINISHER_WINNER_IN_LOSERS/);

console.log(JSON.stringify({
  ok:true,
  tests:13,
  timelineEnd:t.timelineEnd,
  reducedTimelineEnd:reduced.timelineEnd,
  transitions:t.plans.map(p=>[p.eventId,p.transition]),
  continuity:auditMotionContinuity(t)
}, null, 2));
