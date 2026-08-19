import assert from 'node:assert/strict';
import {
  planBattleConveyor,
  auditMotionContinuity,
  planBattleStartHandoff,
  auditBattleStartHandoff,
  createBattleStartLiveHandoff,
  reduceBattleStartLiveHandoff,
  auditBattleStartLiveHandoff,
  BATTLE_CONVEYOR_PRESENTATION_CORE
} from '../browser/battle-conveyor-presentation-core.mjs';

const scenarioCoverage = [];
const scenario = (name, fn) => {
  assert.equal(scenarioCoverage.includes(name), false, `duplicate scenario:${name}`);
  fn();
  scenarioCoverage.push(name);
};

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

let conveyor;
let continuity;
scenario('conveyor-baseline-order-and-authority', () => {
  conveyor = planBattleConveyor(demo);
  assert.equal(conveyor.presentationOnly, true);
  assert.equal(conveyor.plans.every(p => p.presentationOnly && p.authorityBoundary === 'accepted_public_event_only'), true);
  assert.equal(conveyor.plans[2].transition, 'CONTINUE');
  assert.equal(conveyor.plans[3].transition, 'IMPACT_CARRY_RIGHT');
  assert.equal(conveyor.plans[4].transition, 'MULTI_TARGET_SPREAD');
  assert.equal(conveyor.plans[5].transition, 'PAIR_SWAP_RIGHT');
  assert.equal(conveyor.plans[7].transition, 'FINISHER_GATHER');
  assert.deepEqual(conveyor.plans[7].groupTargets, ['P1','P2','P3']);
  assert.ok(conveyor.plans[7].emphasis.impact > conveyor.plans[2].emphasis.impact);
});
scenario('conveyor-dead-gap-zero', () => {
  continuity = auditMotionContinuity(conveyor);
  assert.equal(continuity.ok, true);
  assert.equal(continuity.deadGapMs, 0);
  assert.ok(continuity.handoffOverlapMs > 0);
  assert.equal(continuity.declaredAmbientCoverage, 1);
  assert.equal('motionCoverage' in continuity, false);
});
scenario('conveyor-reduced-motion-preserves-meaning', () => {
  const reduced = planBattleConveyor(demo, {reducedMotion:true});
  assert.equal(reduced.plans.map(p => p.kind).join(','), conveyor.plans.map(p => p.kind).join(','));
  assert.ok(reduced.timelineEnd < conveyor.timelineEnd);
  assert.equal(auditMotionContinuity(reduced).ok, true);
});
scenario('conveyor-rejects-unaccepted-event', () => {
  assert.throws(() => planBattleConveyor([{accepted:false,eventId:'x',kind:'attack',publicData:{sourceId:'P1',targetIds:['P2']}}]), /EVENT_NOT_ACCEPTED/);
});
scenario('conveyor-rejects-invalid-finisher', () => {
  assert.throws(() => planBattleConveyor([{accepted:true,eventId:'x',kind:'finisher',publicData:{winnerId:'P1',loserIds:['P1','P2','P3']}}]), /FINISHER_WINNER_IN_LOSERS/);
});

scenario('static-planner-ready-before-entry', () => {
  const early = planBattleStartHandoff({prewarmStartMs:1200,readyBarrierMs:4000,titleDurationMs:700,entryDurationMs:900,movieReadyAtMs:3500});
  assert.deepEqual(early.sequence.map(x => x.kind), ['BATTLE_START_TITLE','BATTLE_START_ENTRY','BATTLE_MOVIE_HANDOFF']);
  assert.equal(early.sequence[0].start, 4000);
  assert.equal(early.handoffAt, early.sequence[1].end);
  assert.equal(auditBattleStartHandoff(early).ok, true);
});
scenario('static-planner-ready-after-entry-uses-bridge', () => {
  const late = planBattleStartHandoff({prewarmStartMs:1000,readyBarrierMs:3000,titleDurationMs:600,entryDurationMs:800,movieReadyAtMs:5200});
  assert.deepEqual(late.sequence.map(x => x.kind), ['BATTLE_START_TITLE','BATTLE_START_ENTRY','MOVIE_READY_BRIDGE','BATTLE_MOVIE_HANDOFF']);
  assert.equal(late.bridgeWaitMs, 800);
  assert.equal(auditBattleStartHandoff(late).ok, true);
});
scenario('static-planner-positive-title-entry-required', () => {
  assert.throws(() => planBattleStartHandoff({prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:0,entryDurationMs:100,movieReadyAtMs:100}), /TITLE_DURATION_MS_INVALID/);
  assert.throws(() => planBattleStartHandoff({prewarmStartMs:0,readyBarrierMs:100,titleDurationMs:100,entryDurationMs:0,movieReadyAtMs:100}), /ENTRY_DURATION_MS_INVALID/);
});
scenario('static-planner-prewarm-cannot-start-after-known-barrier', () => {
  assert.throws(() => planBattleStartHandoff({prewarmStartMs:500,readyBarrierMs:400,titleDurationMs:100,entryDurationMs:100,movieReadyAtMs:600}), /PREWARM_AFTER_READY_BARRIER/);
});

const makeLive = (generationId='battle-live', overrides={}) => createBattleStartLiveHandoff({
  generationId,
  prewarmStartMs:1000,
  titleDurationMs:600,
  entryDurationMs:800,
  maxBridgeMs:1500,
  ...overrides
});

scenario('live-schema-v1-consumer-compat-with-contract-revision-2', () => {
  assert.equal(BATTLE_CONVEYOR_PRESENTATION_CORE.battleStartLiveSchema, 'gameroad.battle-start-live-handoff.v1');
  assert.equal(BATTLE_CONVEYOR_PRESENTATION_CORE.battleStartLiveContractRevision, 2);
  assert.equal(makeLive().contractRevision, 2);
});
scenario('live-prewarm-has-no-future-barrier-timestamp', () => {
  const live = makeLive();
  assert.equal(live.phase, 'PREWARM');
  assert.equal(live.barrierAccepted, false);
  assert.equal(live.timing.readyBarrier, null);
  assert.equal(live.timing.titleEnd, null);
  assert.equal(live.timing.entryEnd, null);
  assert.equal(live.timing.fallbackAt, null);
  assert.equal(auditBattleStartLiveHandoff(live).ok, true);
});
scenario('live-can-advance-indefinitely-before-barrier', () => {
  let live = makeLive('no-barrier');
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'no-barrier', nowMs:999999});
  assert.equal(live.phase, 'PREWARM');
  assert.equal(live.barrierAccepted, false);
  assert.equal(auditBattleStartLiveHandoff(live).ok, true);
});
scenario('live-stale-generation-barrier-is-ignored', () => {
  let live = makeLive('current');
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'old', observedAtMs:2000});
  assert.equal(live.barrierAccepted, false);
  assert.equal(live.lastEventDisposition, 'IGNORED_STALE_GENERATION');
});
scenario('live-stale-generation-movie-ready-is-ignored', () => {
  let live = makeLive('current-ready');
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'old-ready', observedAtMs:1500});
  assert.equal(live.movieReady, false);
  assert.equal(live.lastEventDisposition, 'IGNORED_STALE_GENERATION');
});
scenario('live-movie-ready-before-barrier-is-remembered', () => {
  let live = makeLive('ready-first');
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'ready-first', observedAtMs:1300});
  assert.equal(live.movieReady, true);
  assert.equal(live.movieReadyObservedAt, 1300);
  assert.equal(live.phase, 'PREWARM');
  assert.equal(auditBattleStartLiveHandoff(live).ok, true);
});
scenario('live-barrier-always-enters-title-even-when-movie-ready', () => {
  let live = makeLive('ready-first-title');
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'ready-first-title', observedAtMs:1300});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'ready-first-title', observedAtMs:3000});
  assert.equal(live.phase, 'TITLE');
  assert.equal(live.timing.readyBarrier, 3000);
  assert.equal(live.timing.titleEnd, 3600);
  assert.equal(live.timing.entryEnd, 4400);
  assert.equal(live.timing.fallbackAt, 5900);
});
scenario('live-title-then-entry-then-handoff', () => {
  let live = makeLive('ordered');
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'ordered', observedAtMs:1200});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'ordered', observedAtMs:3000});
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'ordered', nowMs:3599});
  assert.equal(live.phase, 'TITLE');
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'ordered', nowMs:3600});
  assert.equal(live.phase, 'ENTRY');
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'ordered', nowMs:4400});
  assert.equal(live.phase, 'HANDOFF');
  assert.equal(auditBattleStartLiveHandoff(live).ok, true);
});
scenario('live-duplicate-barrier-is-ignored', () => {
  let live = makeLive('dup-barrier');
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'dup-barrier', observedAtMs:2000});
  const barrier = live.timing.readyBarrier;
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'dup-barrier', observedAtMs:2500});
  assert.equal(live.timing.readyBarrier, barrier);
  assert.equal(live.lastEventDisposition, 'IGNORED_DUPLICATE_BARRIER');
});
scenario('live-duplicate-ready-is-ignored', () => {
  let live = makeLive('dup-ready');
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'dup-ready', observedAtMs:1200});
  const observed = live.movieReadyObservedAt;
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'dup-ready', observedAtMs:1500});
  assert.equal(live.movieReadyObservedAt, observed);
  assert.equal(live.lastEventDisposition, 'IGNORED_DUPLICATE_READY');
});
scenario('live-delayed-barrier-observation-clamps-to-current-clock', () => {
  let live = makeLive('late-delivered-barrier');
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'late-delivered-barrier', nowMs:5000});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'late-delivered-barrier', observedAtMs:4000});
  assert.equal(live.timing.readyBarrier, 5000);
  assert.equal(live.phase, 'TITLE');
  assert.equal(live.lastEventDisposition, 'BARRIER_ACCEPTED_CLAMPED_TO_NOW');
});
scenario('live-late-ready-within-bridge-handoffs', () => {
  let live = makeLive('bridge-ready', {prewarmStartMs:0,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:700});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'bridge-ready', observedAtMs:100});
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'bridge-ready', nowMs:300});
  assert.equal(live.phase, 'BRIDGE');
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'bridge-ready', observedAtMs:500});
  assert.equal(live.phase, 'HANDOFF');
  assert.equal(live.lastEventDisposition, 'READY_AND_HANDOFF');
});
scenario('live-ready-exactly-at-fallback-deadline-still-handoffs', () => {
  let live = makeLive('deadline-tie', {prewarmStartMs:0,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:400});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'deadline-tie', observedAtMs:100});
  assert.equal(live.timing.fallbackAt, 700);
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'deadline-tie', observedAtMs:700});
  assert.equal(live.phase, 'HANDOFF');
  assert.equal(live.movieReadyTooLate, false);
});
scenario('live-ready-after-fallback-deadline-fails-soft', () => {
  let live = makeLive('deadline-late', {prewarmStartMs:0,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:400});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'deadline-late', observedAtMs:100});
  live = reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'deadline-late', observedAtMs:701});
  assert.equal(live.phase, 'FALLBACK_REQUIRED');
  assert.equal(live.movieReadyTooLate, true);
  assert.equal(live.loadingBlocksGameplay, false);
  assert.equal(live.lastEventDisposition, 'READY_AFTER_FALLBACK_DEADLINE');
  assert.equal(auditBattleStartLiveHandoff(live).ok, true);
});
scenario('live-missing-ready-reaches-bounded-fallback', () => {
  let live = makeLive('missing', {prewarmStartMs:0,titleDurationMs:100,entryDurationMs:100,maxBridgeMs:400});
  live = reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'missing', observedAtMs:100});
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'missing', nowMs:699});
  assert.equal(live.phase, 'BRIDGE');
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'missing', nowMs:700});
  assert.equal(live.phase, 'FALLBACK_REQUIRED');
  assert.equal(live.loadingBlocksGameplay, false);
});
scenario('live-clock-rewind-is-ignored', () => {
  let live = makeLive('rewind');
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'rewind', nowMs:2500});
  live = reduceBattleStartLiveHandoff(live, {type:'ADVANCE', generationId:'rewind', nowMs:2000});
  assert.equal(live.nowMs, 2500);
  assert.equal(live.lastEventDisposition, 'IGNORED_CLOCK_REWIND');
});
scenario('live-cancel-is-presentation-only-terminal', () => {
  let live = makeLive('cancel');
  live = reduceBattleStartLiveHandoff(live, {type:'CANCEL', generationId:'cancel'});
  assert.equal(live.phase, 'CANCELLED');
  assert.equal(live.gameStateWrite, false);
  assert.equal(live.gameplayAuthority, false);
  assert.equal(auditBattleStartLiveHandoff(live).ok, true);
});
scenario('live-rejects-zero-title-or-entry-duration', () => {
  assert.throws(() => makeLive('bad-title',{titleDurationMs:0}), /TITLE_DURATION_MS_INVALID/);
  assert.throws(() => makeLive('bad-entry',{entryDurationMs:0}), /ENTRY_DURATION_MS_INVALID/);
});
scenario('live-ready-and-barrier-require-observed-times', () => {
  let live = makeLive('observed-required');
  assert.throws(() => reduceBattleStartLiveHandoff(live, {type:'READY_BARRIER', generationId:'observed-required'}), /OBSERVED_AT_MS_INVALID/);
  assert.throws(() => reduceBattleStartLiveHandoff(live, {type:'MOVIE_READY', generationId:'observed-required'}), /OBSERVED_AT_MS_INVALID/);
});
scenario('live-audit-detects-precomputed-future-barrier', () => {
  const live = makeLive('audit-precomputed');
  const corrupted = JSON.parse(JSON.stringify(live));
  corrupted.timing.readyBarrier = 5000;
  const audit = auditBattleStartLiveHandoff(corrupted);
  assert.equal(audit.ok, false);
  assert.equal(audit.defects.includes('FUTURE_BARRIER_PRECOMPUTED'), true);
});

assert.equal(new Set(scenarioCoverage).size, scenarioCoverage.length);
assert.ok(scenarioCoverage.length >= 20, 'named coverage must stay broad enough to detect accidental scenario loss');

console.log(JSON.stringify({
  ok: true,
  scenarioCount: scenarioCoverage.length,
  scenarioCoverage,
  timelineEnd: conveyor.timelineEnd,
  continuity,
  battleStartLiveSchema: BATTLE_CONVEYOR_PRESENTATION_CORE.battleStartLiveSchema
}, null, 2));
