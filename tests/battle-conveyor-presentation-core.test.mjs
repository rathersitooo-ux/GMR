import assert from 'node:assert/strict';
import {
  planBattleConveyorEnvironmentFrame,
  planBattleConveyor,
  auditMotionContinuity,
  planBattleStartHandoff,
  auditBattleStartHandoff,
  createBattleStartLiveHandoff,
  reduceBattleStartLiveHandoff,
  auditBattleStartLiveHandoff
} from '../browser/battle-conveyor-presentation-core.mjs';

const demo = [
  {accepted:true,eventId:'p0',kind:'partner_cutin',publicData:{partnerId:'P-A'}},
  {accepted:true,eventId:'p1',kind:'reveal',publicData:{playerIds:['P1','P2','P3','P4']}},
  {accepted:true,eventId:'p2',kind:'attack',publicData:{sourceId:'P1',targetIds:['P2'],importance:'normal'}},
  {accepted:true,eventId:'p3',kind:'ability',publicData:{sourceId:'P1',targetIds:['P3'],importance:'strong'}},
  {accepted:true,eventId:'p4',kind:'ability',publicData:{sourceId:'P1',targetIds:['P2','P3'],simultaneous:true}},
  {accepted:true,eventId:'p5',kind:'attack',publicData:{sourceId:'P3',targetIds:['P4'],importance:'normal'}},
  {accepted:true,eventId:'p6',kind:'compare4',publicData:{playerIds:['P1','P2','P3','P4'],winnerIds:['P4']}},
  {accepted:true,eventId:'p7',kind:'finisher',publicData:{winnerId:'P4'}}
];

const envBase = planBattleConveyorEnvironmentFrame({segmentCount:8,travel:0,phase:'IDLE_READ'});
const envLoop = planBattleConveyorEnvironmentFrame({segmentCount:8,travel:1,phase:'IDLE_READ'});
assert.equal(envBase.presentationOnly, true);
assert.equal(envBase.environmentAuthority, 'decorative_visual_loop_only');
assert.equal(envBase.gameStateWrite, false);
assert.equal(envBase.position109Write, false);
assert.equal(envBase.targetWrite, false);
assert.equal(envBase.orderWrite, false);
assert.equal(envBase.formalArt, false);
assert.deepEqual(envBase.screenSpaceAnchors, ['target_feedback','status','winner_afterstate']);
assert.deepEqual(envBase.worldLayerScope, ['floor','path','side_scenery']);
assert.deepEqual(envLoop.segments.map(x=>x.segmentId), envBase.segments.map(x=>x.segmentId));
assert.deepEqual(envLoop.segments.map(x=>x.normalizedDepth.toFixed(8)), envBase.segments.map(x=>x.normalizedDepth.toFixed(8)));
assert.deepEqual(envLoop.segments.map(x=>x.recycleCycle), envBase.segments.map(x=>x.recycleCycle + 1));
const depthOrdered = [...envBase.segments].sort((a,b)=>a.normalizedDepth-b.normalizedDepth);
for (let i=1;i<depthOrdered.length;i+=1) {
  assert.ok(depthOrdered[i].screenY > depthOrdered[i-1].screenY);
  assert.ok(depthOrdered[i].scale > depthOrdered[i-1].scale);
  assert.ok(depthOrdered[i].opacity > depthOrdered[i-1].opacity);
}
const envQuarter = planBattleConveyorEnvironmentFrame({segmentCount:8,travel:.25,phase:'RESOLVE'});
assert.equal(envQuarter.motionIntent, 'BURST');
assert.notDeepEqual(envQuarter.segments.map(x=>x.normalizedDepth.toFixed(8)), envBase.segments.map(x=>x.normalizedDepth.toFixed(8)));
const envReduced = planBattleConveyorEnvironmentFrame({segmentCount:8,travel:.73,phase:'RESOLVE',reducedMotion:true});
const envLowPerf = planBattleConveyorEnvironmentFrame({segmentCount:8,travel:.73,phase:'RESOLVE',lowPerf:true});
assert.equal(envReduced.motionSuppressed, true);
assert.equal(envReduced.effectiveTravel, 0);
assert.equal(envLowPerf.motionSuppressed, true);
assert.deepEqual(envReduced.segments.map(x=>x.normalizedDepth), envBase.segments.map(x=>x.normalizedDepth));
assert.deepEqual(envLowPerf.segments.map(x=>x.normalizedDepth), envBase.segments.map(x=>x.normalizedDepth));
assert.throws(() => planBattleConveyorEnvironmentFrame({segmentCount:8,travel:.2,phase:'TARGET_LOCK'}), /PHASE_INVALID/);
assert.throws(() => planBattleConveyorEnvironmentFrame({segmentCount:8,travel:.2,phase:'CARD_SELECT'}), /PHASE_INVALID/);
assert.throws(() => planBattleConveyorEnvironmentFrame({segmentCount:2,travel:0,phase:'IDLE_READ'}), /SEGMENT_COUNT_INVALID/);
assert.throws(() => planBattleConveyorEnvironmentFrame({segmentCount:8,travel:-1,phase:'IDLE_READ'}), /TRAVEL_INVALID/);
assert.throws(() => planBattleConveyorEnvironmentFrame({segmentCount:8,travel:0,phase:'UNKNOWN'}), /PHASE_INVALID/);

const t = planBattleConveyor(demo);
assert.equal(t.presentationOnly, true);
assert.equal(t.plans.every(p => p.presentationOnly && p.authorityBoundary === 'accepted_public_event_only'), true);
assert.equal(t.plans[2].transition, 'CONTINUE');
assert.equal(t.plans[3].transition, 'IMPACT_CARRY_RIGHT');
assert.equal(t.plans[4].transition, 'MULTI_TARGET_SPREAD');
assert.equal(t.plans[5].transition, 'PAIR_SWAP_RIGHT');
assert.equal(t.plans[7].transition, 'FINISHER_GATHER');
assert.deepEqual(t.plans[7].groupTargets, []);
assert.deepEqual(t.plans[7].stage, { left: 'P4', right: null });
assert.equal('loserIds' in t.plans[7].publicData, false);
assert.ok(t.plans[7].emphasis.impact > t.plans[2].emphasis.impact);
assert.ok(t.plans[3].emphasis.impact > t.plans[2].emphasis.impact);
assert.equal(t.plans[2].timing.handoffAt < t.plans[2].timing.recoveryEnd, true);
const continuity = auditMotionContinuity(t);
assert.equal(continuity.ok, true);
assert.equal(continuity.deadGapMs, 0);
assert.ok(continuity.handoffOverlapMs > 0);
assert.equal(continuity.declaredAmbientCoverage, 1);
assert.equal('motionCoverage' in continuity, false);

const reduced = planBattleConveyor(demo, {reducedMotion:true});
assert.equal(reduced.plans.map(p => p.kind).join(','), t.plans.map(p => p.kind).join(','));
assert.equal(reduced.plans[7].groupTargets.length, 0);
assert.equal(auditMotionContinuity(reduced).ok, true);
assert.ok(reduced.timelineEnd < t.timelineEnd);

assert.throws(() => planBattleConveyor([{accepted:false,eventId:'x',kind:'attack',publicData:{sourceId:'P1',targetIds:['P2']}}]), /EVENT_NOT_ACCEPTED/);
assert.throws(() => planBattleConveyor([{accepted:true,eventId:'x',kind:'finisher',publicData:{}}]), /WINNER_ID_REQUIRED/);

const earlyReady = planBattleStartHandoff({prewarmStartMs:1200,readyBarrierMs:4000,titleDurationMs:700,entryDurationMs:900,movieReadyAtMs:3500});
assert.equal(earlyReady.presentationOnly, true);
assert.equal(earlyReady.gameplayAuthority, false);
assert.equal(earlyReady.loadingBlocksGameplay, false);
assert.equal(earlyReady.preload.mayRunDuringBoardChain, true);
assert.deepEqual(earlyReady.sequence.map(x => x.kind), ['BATTLE_START_TITLE','BATTLE_START_ENTRY','BATTLE_MOVIE_HANDOFF']);
assert.equal(earlyReady.sequence[0].start, 4000);
assert.equal(earlyReady.sequence[1].start, earlyReady.sequence[0].end);
assert.equal(earlyReady.handoffAt, earlyReady.sequence[1].end);
assert.equal(auditBattleStartHandoff(earlyReady).ok, true);

const lateReady = planBattleStartHandoff({prewarmStartMs:1000,readyBarrierMs:3000,titleDurationMs:600,entryDurationMs:800,movieReadyAtMs:5200,lowPerf:true});
assert.deepEqual(lateReady.sequence.map(x => x.kind), ['BATTLE_START_TITLE','BATTLE_START_ENTRY','MOVIE_READY_BRIDGE','BATTLE_MOVIE_HANDOFF']);
assert.equal(lateReady.bridgeWaitMs, 800);
assert.equal(lateReady.sequence[2].start, lateReady.sequence[1].end);
assert.equal(lateReady.sequence[2].end, lateReady.handoffAt);
assert.equal(lateReady.handoffAt, 5200);
assert.equal(auditBattleStartHandoff(lateReady).ok, true);
assert.equal(lateReady.timingAuthority, 'caller_supplied_candidate_not_formal');

const reducedStart = planBattleStartHandoff({prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:80,entryDurationMs:90,movieReadyAtMs:250,reducedMotion:true});
assert.equal(reducedStart.reducedMotion, true);
assert.equal(auditBattleStartHandoff(reducedStart).ok, true);

assert.throws(() => planBattleStartHandoff({prewarmStartMs:500,readyBarrierMs:400,titleDurationMs:100,entryDurationMs:100,movieReadyAtMs:600}), /PREWARM_AFTER_READY_BARRIER/);
assert.throws(() => planBattleStartHandoff({prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:0,entryDurationMs:100,movieReadyAtMs:100}), /TITLE_DURATION_MS_INVALID/);
assert.throws(() => planBattleStartHandoff({prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:100,entryDurationMs:0,movieReadyAtMs:100}), /ENTRY_DURATION_MS_INVALID/);

let live = createBattleStartLiveHandoff({generationId:'match-1-round-3-battle-2',prewarmStartMs:1000,readyBarrierMs:3000,titleDurationMs:600,entryDurationMs:800,maxBridgeMs:1500});
assert.equal(live.phase, 'PREWARM');
assert.equal(live.movieReady, false);
assert.equal(auditBattleStartLiveHandoff(live).ok, true);
live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'old-battle'});
assert.equal(live.movieReady, false);
assert.equal(live.lastEventDisposition, 'IGNORED_STALE_GENERATION');
live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'match-1-round-3-battle-2'});
assert.equal(live.movieReady, true);
assert.equal(live.phase, 'PREWARM');
assert.equal(live.lastEventDisposition, 'READY_ACCEPTED');
live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'match-1-round-3-battle-2'});
assert.equal(live.lastEventDisposition, 'IGNORED_DUPLICATE_READY');
live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'match-1-round-3-battle-2', nowMs:3000});
assert.equal(live.phase, 'TITLE');
live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'match-1-round-3-battle-2', nowMs:3600});
assert.equal(live.phase, 'ENTRY');
live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'match-1-round-3-battle-2', nowMs:4400});
assert.equal(live.phase, 'HANDOFF');
assert.equal(live.lastEventDisposition, 'HANDOFF_READY');
assert.equal(auditBattleStartLiveHandoff(live).ok, true);

let lateLive = createBattleStartLiveHandoff({generationId:'battle-late',prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:700});
lateLive = reduceBattleStartLiveHandoff(lateLive, {type:'ADVANCE', generationId:'battle-late', nowMs:300});
assert.equal(lateLive.phase, 'BRIDGE');
lateLive = reduceBattleStartLiveHandoff(lateLive, {type:'MOVIE_READY', generationId:'battle-late'});
assert.equal(lateLive.phase, 'HANDOFF');
assert.equal(lateLive.lastEventDisposition, 'READY_AND_HANDOFF');

let missing = createBattleStartLiveHandoff({generationId:'battle-missing',prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:400});
missing = reduceBattleStartLiveHandoff(missing, {type:'ADVANCE', generationId:'battle-missing', nowMs:699});
assert.equal(missing.phase, 'BRIDGE');
missing = reduceBattleStartLiveHandoff(missing, {type:'ADVANCE', generationId:'battle-missing', nowMs:700});
assert.equal(missing.phase, 'FALLBACK_REQUIRED');
assert.equal(missing.loadingBlocksGameplay, false);
assert.equal(auditBattleStartLiveHandoff(missing).ok, true);

let cancelled = createBattleStartLiveHandoff({generationId:'battle-cancel',prewarmStartMs:100,readyBarrierMs:200,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:500});
cancelled = reduceBattleStartLiveHandoff(cancelled, {type:'ADVANCE', generationId:'battle-cancel', nowMs:250});
const beforeRewind = cancelled.nowMs;
cancelled = reduceBattleStartLiveHandoff(cancelled, {type:'ADVANCE', generationId:'battle-cancel', nowMs:200});
assert.equal(cancelled.nowMs, beforeRewind);
assert.equal(cancelled.lastEventDisposition, 'IGNORED_CLOCK_REWIND');
cancelled = reduceBattleStartLiveHandoff(cancelled, {type:'CANCEL', generationId:'battle-cancel'});
assert.equal(cancelled.phase, 'CANCELLED');
assert.equal(cancelled.gameStateWrite, false);

assert.throws(() => createBattleStartLiveHandoff({generationId:'bad-title',prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:0,entryDurationMs:100,maxBridgeMs:100}), /TITLE_DURATION_MS_INVALID/);

console.log(JSON.stringify({
  ok:true,
  tests:65,
  timelineEnd:t.timelineEnd,
  reducedTimelineEnd:reduced.timelineEnd,
  transitions:t.plans.map(p=>[p.eventId,p.transition]),
  continuity,
  battleStart:{
    earlyReady:{handoffAt:earlyReady.handoffAt,bridgeWaitMs:earlyReady.bridgeWaitMs},
    lateReady:{handoffAt:lateReady.handoffAt,bridgeWaitMs:lateReady.bridgeWaitMs},
    live:{phase:live.phase,lastEventDisposition:live.lastEventDisposition},
    missing:{phase:missing.phase,lastEventDisposition:missing.lastEventDisposition}
  }
}, null, 2));
