import assert from 'node:assert/strict';
import {
  BATTLE_CINEMATIC_CAUSAL_TIMELINE,
  clearBattleCinematicCausalTimeline,
  createBattleCinematicCausalTimeline,
  scheduleBattleCinematicCausalTimeline
} from '../browser/battle-cinematic-causal-timeline-core.mjs';

const attack = createBattleCinematicCausalTimeline({
  actionPhase: 'attack',
  motion: 'cinematic_action'
});

assert.equal(attack.schema, 'gameroad.battle-cinematic-causal-timeline.v1');
assert.equal(attack.mode, 'causal');
assert.equal(attack.actionPhase, 'attack');
assert.equal(attack.impactPhase, 'impact');
assert.deepEqual(
  attack.entries.map(entry => entry.phase),
  ['stance', 'anticipation', 'release', 'impact', 'reaction', 'return']
);
assert.deepEqual(
  attack.entries.map(entry => entry.atMs),
  [0, 120, 360, 550, 620, 800]
);
assert.equal(attack.totalDurationMs, 1020);
assert.equal(attack.entries[2].cues.vfx, 'travel');
assert.equal(attack.entries[3].cues.environment, 'impact');
assert.equal(attack.entries[4].cues.target, 'reaction');

const ability = createBattleCinematicCausalTimeline({
  actionPhase: 'ability',
  motion: 'cinematic_action'
});
assert.deepEqual(
  ability.entries.map(entry => entry.atMs),
  [0, 140, 440, 660, 750, 950]
);
assert.equal(ability.totalDurationMs, 1210);

const staticTimeline = createBattleCinematicCausalTimeline({
  actionPhase: 'ability',
  motion: 'static_only'
});
assert.equal(staticTimeline.mode, 'static');
assert.equal(staticTimeline.totalDurationMs, 0);
assert.deepEqual(staticTimeline.entries.map(entry => entry.phase), ['static']);

const pending = [];
let nextTimer = 1;
const clock = {
  setTimeout(callback, delay) {
    const id = nextTimer++;
    pending.push({ id, callback, delay });
    return id;
  }
};
const scene = { dataset: {} };
const environment = { dataset: {} };
const observed = [];

const scheduled = scheduleBattleCinematicCausalTimeline({
  clock,
  nodes: [scene, environment],
  timeline: attack,
  onPhase(entry) {
    observed.push(entry.phase);
  }
});

assert.equal(scene.dataset.causalPhase, 'stance');
assert.equal(environment.dataset.causalPhase, 'stance');
assert.equal(scene.dataset.causalTimeline, BATTLE_CINEMATIC_CAUSAL_TIMELINE.schema);
assert.deepEqual(pending.map(timer => timer.delay), [120, 360, 550, 620, 800]);
assert.equal(scheduled.totalDurationMs, 1020);

for (const timer of pending) timer.callback();
assert.deepEqual(observed, ['stance', 'anticipation', 'release', 'impact', 'reaction', 'return']);
assert.equal(scene.dataset.causalPhase, 'return');
assert.equal(environment.dataset.causalPhase, 'return');

clearBattleCinematicCausalTimeline([scene, environment]);
assert.equal(scene.dataset.causalPhase, undefined);
assert.equal(scene.dataset.causalTimeline, undefined);
assert.equal(environment.dataset.causalPhase, undefined);

const staticNode = { dataset: {} };
const staticPending = [];
scheduleBattleCinematicCausalTimeline({
  clock: {
    setTimeout(callback, delay) {
      staticPending.push({ callback, delay });
      return 1;
    }
  },
  nodes: [staticNode],
  timeline: staticTimeline
});
assert.equal(staticNode.dataset.causalPhase, 'static');
assert.equal(staticPending.length, 0);

assert.throws(
  () => scheduleBattleCinematicCausalTimeline({ clock, nodes: [scene], timeline: null }),
  /BATTLE_CINEMATIC_TIMELINE_REQUIRED/
);

assert.equal(BATTLE_CINEMATIC_CAUSAL_TIMELINE.authority, 'PRESENTATION_ONLY_NO_GAMEPLAY_RECALCULATION');
assert.equal(BATTLE_CINEMATIC_CAUSAL_TIMELINE.impactSyncPoint, 'impact');
assert.equal(BATTLE_CINEMATIC_CAUSAL_TIMELINE.exactReferenceTimingAuthority, false);

console.log('battle-cinematic-causal-timeline-core tests passed');
