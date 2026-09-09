import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_TRANSITION_MOTION_PROFILE,
  createBattleStartTransitionPresentationDriver,
  createScreenTransitionRuntimeAdapter
} from '../browser/screen-navigation-core.mjs';

function fakeBattleStartDocument() {
  const created = [];
  const body = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    }
  };
  const documentSource = {
    body,
    documentElement: {clientWidth: 667, clientHeight: 375},
    createElement(tagName) {
      const node = {
        tagName,
        textContent: '',
        style: {},
        dataset: {},
        attributes: {},
        animations: [],
        removed: false,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        animate(frames, options) {
          const animation = {
            frames,
            options,
            cancelled: false,
            finished: Promise.resolve(),
            cancel() { this.cancelled = true; }
          };
          this.animations.push(animation);
          return animation;
        },
        remove() {
          this.removed = true;
          const index = body.children.indexOf(this);
          if (index >= 0) body.children.splice(index, 1);
        }
      };
      created.push(node);
      return node;
    }
  };
  return {documentSource, created, body};
}

function noOpScreenPresentationDriver() {
  return Object.freeze({
    async runPhase() {},
    finishRevision() { return false; },
    getState() { return Object.freeze({activeRevisions: Object.freeze([]), events: Object.freeze([])}); }
  });
}

function makeRuntime({from = 'setup', reducedMotion = false, lowPerf = false} = {}) {
  const fake = fakeBattleStartDocument();
  const battleStartPresentationDriver = createBattleStartTransitionPresentationDriver({document: fake.documentSource});
  let screen = from;
  const phases = [];
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    runVisualPhase: async (phase) => { phases.push(phase); },
    presentationDriver: noOpScreenPresentationDriver(),
    battleStartPresentationDriver,
    reducedMotion,
    lowPerf
  });
  return {fake, battleStartPresentationDriver, runtime, phases, getScreen: () => screen};
}

test('setup to battle runs the existing Battle Start lifecycle on the real screen-transition adapter without gameplay writes', async () => {
  const h = makeRuntime({from: 'setup'});
  const result = await h.runtime.navigate('battle');

  assert.equal(result.status, 'completed');
  assert.equal(h.getScreen(), 'battle');
  assert.deepEqual(h.phases, ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE']);
  assert.equal(h.fake.created.length, 1);
  assert.equal(h.fake.created[0].textContent, 'BATTLE START');
  assert.equal(h.fake.created[0].attributes['aria-hidden'], 'true');
  assert.equal(h.fake.created[0].style.pointerEvents, 'none');
  assert.equal(h.fake.created[0].animations.length, 2);
  assert.equal(h.fake.created[0].removed, true);
  assert.equal(h.fake.body.children.length, 0);

  const state = h.battleStartPresentationDriver.getState();
  assert.deepEqual(state.activeRevisions, []);
  const livePhases = state.events.filter((event) => event.livePhase).map((event) => event.livePhase);
  assert.deepEqual(livePhases, ['PREWARM', 'TITLE', 'ENTRY', 'FALLBACK_REQUIRED']);
  assert.equal(livePhases.includes('HANDOFF'), false, 'missing Battle Movie readiness must never be fabricated');
  assert.ok(state.events.every((event) => event.gameStateWrite === false));
  assert.ok(state.events.filter((event) => event.auditOk !== undefined).every((event) => event.auditOk === true));
});

test('friend-room start gets the same start presentation but direct home to battle does not impersonate a reconnect intro', async () => {
  const friend = makeRuntime({from: 'friendroom'});
  assert.equal((await friend.runtime.navigate('battle')).status, 'completed');
  assert.equal(friend.fake.created.length, 1);
  assert.ok(friend.battleStartPresentationDriver.getState().events.some((event) => event.livePhase === 'TITLE'));

  const direct = makeRuntime({from: 'home'});
  assert.equal((await direct.runtime.navigate('battle')).status, 'completed');
  assert.equal(direct.fake.created.length, 0);
  assert.deepEqual(direct.battleStartPresentationDriver.getState().events, []);
});

test('reduced motion preserves Battle Start meaning without animation', async () => {
  const h = makeRuntime({from: 'setup', reducedMotion: true});
  assert.equal((await h.runtime.navigate('battle')).status, 'completed');
  assert.equal(h.fake.created.length, 1);
  assert.equal(h.fake.created[0].animations.length, 0);
  const state = h.battleStartPresentationDriver.getState();
  assert.ok(state.events.some((event) => event.livePhase === 'TITLE'));
  assert.ok(state.events.some((event) => event.livePhase === 'ENTRY'));
  assert.ok(state.events.some((event) => event.livePhase === 'FALLBACK_REQUIRED'));
});

test('aborting the start transition removes the overlay and stale revision immediately', async () => {
  const fake = fakeBattleStartDocument();
  const driver = createBattleStartTransitionPresentationDriver({document: fake.documentSource});
  const controller = new AbortController();
  const context = Object.freeze({
    revision: 9,
    from: 'setup',
    to: 'battle',
    reason: 'navigation',
    motionProfile: MENU_TRANSITION_MOTION_PROFILE.NORMAL,
    signal: controller.signal
  });

  await driver.runPhase('PREPARE', context);
  assert.deepEqual(driver.getState().activeRevisions, [9]);
  assert.equal(fake.body.children.length, 1);
  controller.abort();
  assert.deepEqual(driver.getState().activeRevisions, []);
  assert.equal(fake.body.children.length, 0);
  assert.equal(fake.created[0].removed, true);
  assert.ok(driver.getState().events.some((event) => event.phase === 'CLEANUP' && event.status === 'aborted'));
});
