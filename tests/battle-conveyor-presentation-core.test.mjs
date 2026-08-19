import assert from 'node:assert/strict';
import {
  planBattleConveyor,
  auditMotionContinuity,
  planBattleStartHandoff,
  auditBattleStartHandoff
} from '../browser/battle-conveyor-presentation-core.mjs';

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
const continuity = auditMotionContinuity(t);
assert.equal(continuity.ok, true);
assert.equal(continuity.deadGapMs, 0);
assert.ok(continuity.handoffOverlapMs > 0, 'handoff evidence must be measured, not inferred from a flag');
assert.equal(continuity.declaredAmbientCoverage, 1);
assert.equal('motionCoverage' in continuity, false, 'do not expose a fake visual-motion coverage metric');

const reduced = planBattleConveyor(demo, {reducedMotion:true});
assert.equal(reduced.plans.map(p => p.kind).join(','), t.plans.map(p => p.kind).join(','));
assert.equal(reduced.plans[7].groupTargets.length, 3);
assert.equal(auditMotionContinuity(reduced).ok, true);
assert.ok(reduced.timelineEnd < t.timelineEnd, 'reduced motion shortens movement without changing event meaning');

assert.throws(() => planBattleConveyor([{accepted:false,eventId:'x',kind:'attack',publicData:{sourceId:'P1',targetIds:['P2']}}]), /EVENT_NOT_ACCEPTED/);
assert.throws(() => planBattleConveyor([{accepted:true,eventId:'x',kind:'finisher',publicData:{winnerId:'P1',loserIds:['P1','P2','P3']}}]), /FINISHER_WINNER_IN_LOSERS/);

const earlyReady = planBattleStartHandoff({
  prewarmStartMs: 1200,
  readyBarrierMs: 4000,
  titleDurationMs: 700,
  entryDurationMs: 900,
  movieReadyAtMs: 3500
});
assert.equal(earlyReady.presentationOnly, true);
assert.equal(earlyReady.gameplayAuthority, false);
assert.equal(earlyReady.loadingBlocksGameplay, false);
assert.equal(earlyReady.preload.mayRunDuringBoardChain, true);
assert.deepEqual(earlyReady.sequence.map(x => x.kind), ['BATTLE_START_TITLE','BATTLE_START_ENTRY','BATTLE_MOVIE_HANDOFF']);
assert.equal(earlyReady.sequence[0].start, 4000, 'large title begins at the all-ready presentation barrier');
assert.equal(earlyReady.sequence[1].start, earlyReady.sequence[0].end, 'entry follows the title without a blank gap');
assert.equal(earlyReady.handoffAt, earlyReady.sequence[1].end, 'early movie readiness never skips the title or entry animation');
assert.equal(auditBattleStartHandoff(earlyReady).ok, true);

const lateReady = planBattleStartHandoff({
  prewarmStartMs: 1000,
  readyBarrierMs: 3000,
  titleDurationMs: 600,
  entryDurationMs: 800,
  movieReadyAtMs: 5200,
  lowPerf: true
});
assert.deepEqual(lateReady.sequence.map(x => x.kind), ['BATTLE_START_TITLE','BATTLE_START_ENTRY','MOVIE_READY_BRIDGE','BATTLE_MOVIE_HANDOFF']);
assert.equal(lateReady.bridgeWaitMs, 800);
assert.equal(lateReady.sequence[2].start, lateReady.sequence[1].end, 'late load is covered by a presentation-only continuity bridge');
assert.equal(lateReady.sequence[2].end, lateReady.handoffAt);
assert.equal(lateReady.handoffAt, 5200);
assert.equal(auditBattleStartHandoff(lateReady).ok, true);
assert.equal(lateReady.timingAuthority, 'caller_supplied_candidate_not_formal');

const reducedStart = planBattleStartHandoff({
  prewarmStartMs: 0,
  readyBarrierMs: 100,
  titleDurationMs: 80,
  entryDurationMs: 90,
  movieReadyAtMs: 250,
  reducedMotion: true
});
assert.equal(reducedStart.reducedMotion, true);
assert.equal(auditBattleStartHandoff(reducedStart).ok, true, 'reduced motion preserves title→entry→handoff meaning order');

assert.throws(() => planBattleStartHandoff({
  prewarmStartMs: 500,
  readyBarrierMs: 400,
  titleDurationMs: 100,
  entryDurationMs: 100,
  movieReadyAtMs: 600
}), /PREWARM_AFTER_READY_BARRIER/);

console.log(JSON.stringify({
  ok:true,
  tests:34,
  timelineEnd:t.timelineEnd,
  reducedTimelineEnd:reduced.timelineEnd,
  transitions:t.plans.map(p=>[p.eventId,p.transition]),
  continuity,
  battleStart:{
    earlyReady:{handoffAt:earlyReady.handoffAt,bridgeWaitMs:earlyReady.bridgeWaitMs},
    lateReady:{handoffAt:lateReady.handoffAt,bridgeWaitMs:lateReady.bridgeWaitMs}
  }
}, null, 2));