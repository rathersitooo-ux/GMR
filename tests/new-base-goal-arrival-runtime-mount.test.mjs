import test from 'node:test';
import assert from 'node:assert/strict';

import { mountNewBaseGoalArrivalRuntime } from '../browser/new-base-goal-arrival-runtime-mount.mjs';
import { createNewBaseGoalArrivalPresentation } from '../browser/new-base-goal-arrival-presentation-core.mjs';
import {
  applyAuthoritativeNewBaseGoalArrival,
  createNewBaseGoalTerminalState
} from '../browser/new-base-goal-result-core.mjs';

function goalEvent() {
  return {
    type: 'GOAL_REACHED',
    authoritative: true,
    eventId: 'goal-event-runtime-1',
    resultId: 'result-runtime-1',
    matchId: 'match-runtime-1',
    actorId: 'p1',
    goalId: 'goal-a',
    winnerIds: ['p1', 'p2']
  };
}

function goalPlan(options = {}) {
  const state = createNewBaseGoalTerminalState({ matchId: 'match-runtime-1' });
  const accepted = applyAuthoritativeNewBaseGoalArrival(state, goalEvent());
  return createNewBaseGoalArrivalPresentation(accepted, options);
}

function makeScheduler() {
  let nextId = 1;
  const tasks = new Map();
  return {
    source: {
      setTimeout(fn, delay) {
        const id = nextId++;
        tasks.set(id, { fn, delay });
        return id;
      },
      clearTimeout(id) {
        tasks.delete(id);
      }
    },
    runAll() {
      while (tasks.size) {
        const entries = [...tasks.entries()].sort((a, b) => a[1].delay - b[1].delay || a[0] - b[0]);
        const [id, task] = entries[0];
        tasks.delete(id);
        task.fn();
      }
    }
  };
}

function makeFakeDom() {
  const byId = new Map();
  const documentLike = {
    defaultView: {
      CustomEvent: class FakeCustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      }
    },
    createElement(tagName) {
      const node = {
        tagName,
        ownerDocument: documentLike,
        parentNode: null,
        children: [],
        dataset: {},
        className: '',
        textContent: '',
        events: [],
        rect: { left: 0, top: 0, width: 10, height: 10 },
        style: {
          setProperty(key, value) {
            this[key] = value;
          }
        },
        appendChild(child) {
          child.parentNode = this;
          this.children.push(child);
          if (child.id) byId.set(child.id, child);
          return child;
        },
        setAttribute() {},
        dispatchEvent(event) {
          this.events.push(event);
          return true;
        },
        getBoundingClientRect() {
          return this.rect;
        },
        remove() {
          if (!this.parentNode) return;
          this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
          this.parentNode = null;
        }
      };
      Object.defineProperty(node, 'id', {
        get() { return this._id || ''; },
        set(value) {
          this._id = value;
          if (value) byId.set(value, this);
        }
      });
      return node;
    },
    getElementById(id) {
      return byId.get(id) || null;
    }
  };
  documentLike.head = documentLike.createElement('head');
  return documentLike;
}

test('runtime fails soft when no DOM host is available', () => {
  const runtime = mountNewBaseGoalArrivalRuntime();
  assert.equal(runtime.mounted, false);
  assert.deepEqual(runtime.play(goalPlan()), { started: false, reason: 'DOM_UNAVAILABLE' });
});

test('runtime anchors to existing actor/goal elements, plays once, then emits Result handoff completion', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('section');
  host.rect = { left: 10, top: 20, width: 600, height: 300 };
  const actor = documentLike.createElement('div');
  actor.rect = { left: 40, top: 190, width: 20, height: 20 };
  const goal = documentLike.createElement('div');
  goal.rect = { left: 500, top: 35, width: 40, height: 40 };
  const scheduler = makeScheduler();

  const runtime = mountNewBaseGoalArrivalRuntime({
    host,
    documentLike,
    resolveActorElement: (actorId) => actorId === 'p1' ? actor : null,
    resolveGoalElement: (goalId) => goalId === 'goal-a' ? goal : null,
    schedulerSource: scheduler.source
  });
  assert.equal(runtime.mounted, true);

  const plan = goalPlan();
  const first = runtime.play(plan);
  assert.equal(first.started, true);
  assert.equal(runtime.overlay.dataset.stage, 'ARRIVE');
  assert.equal(runtime.overlay.dataset.active, 'true');
  assert.equal(runtime.overlay.style['--gr-goal-x'], '510px');
  assert.equal(runtime.overlay.style['--gr-goal-y'], '35px');
  assert.equal(runtime.overlay.style['--gr-actor-x'], '40px');
  assert.equal(runtime.overlay.style['--gr-actor-y'], '180px');

  scheduler.runAll();
  assert.equal(runtime.overlay.dataset.active, 'false');
  assert.equal(host.events.length, 1);
  assert.equal(host.events[0].type, 'gameroad:goal-arrival-complete');
  assert.equal(host.events[0].detail.eventId, 'goal-event-runtime-1');
  assert.equal(host.events[0].detail.resultHandoff, true);

  assert.deepEqual(runtime.play(plan), {
    started: false,
    reason: 'DUPLICATE_EVENT_SUPPRESSED'
  });
});

test('reduced-motion runtime keeps the GOAL stage but removes actor travel trace', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('section');
  host.rect = { left: 0, top: 0, width: 400, height: 200 };
  const actor = documentLike.createElement('div');
  actor.rect = { left: 20, top: 100, width: 20, height: 20 };
  const goal = documentLike.createElement('div');
  goal.rect = { left: 330, top: 20, width: 30, height: 30 };
  const scheduler = makeScheduler();

  const runtime = mountNewBaseGoalArrivalRuntime({
    host,
    documentLike,
    resolveActorElement: () => actor,
    resolveGoalElement: () => goal,
    schedulerSource: scheduler.source
  });
  const started = runtime.play(goalPlan({ reducedMotion: true }));

  assert.equal(started.started, true);
  assert.equal(runtime.overlay.dataset.profile, 'REDUCED_MOTION');
  assert.equal(runtime.overlay.dataset.stage, 'ARRIVE');
  const trace = runtime.overlay.children[1];
  assert.equal(trace.style.display, 'none');
});
