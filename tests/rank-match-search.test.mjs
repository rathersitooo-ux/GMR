import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createRankMatchSearchSession,
  RANK_MATCH_FOUND_SCHEMA,
  RANK_MATCH_PLAYER_COUNT,
} from '../browser/rank-match-search-core.mjs';
import {
  createRankMatchSearchProvider,
  RANK_MATCH_FOUND_EVENT,
} from '../browser/rank-match-search-provider-mount.mjs';

function fakeScheduler() {
  const timers = new Map();
  let nextId = 1;
  return {
    schedule(fn, ms) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fn, ms });
      return id;
    },
    cancelSchedule(id) {
      timers.delete(id);
    },
    runAll() {
      const pending = [...timers.values()];
      timers.clear();
      for (const timer of pending) timer.fn();
    },
    get pendingCount() {
      return timers.size;
    },
  };
}

function fakeWindow() {
  const listeners = new Map();
  const dispatched = [];
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  return {
    CustomEvent: FakeCustomEvent,
    dispatched,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    dispatchEvent(event) {
      dispatched.push(event);
      for (const fn of listeners.get(event.type) || []) fn(event);
      return true;
    },
  };
}

test('rank search gathers 4 seats and fills empty seats with AI', () => {
  const scheduler = fakeScheduler();
  const events = [];
  const session = createRankMatchSearchSession({
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    now: () => 0,
    onEvent: (event) => events.push(event),
  });

  const searching = session.start();
  assert.equal(searching.state, 'searching');
  assert.equal(searching.status, '対戦相手を探しています…');
  assert.equal(scheduler.pendingCount, 1);

  scheduler.runAll();
  const found = events.find((event) => event.type === 'found');
  assert.ok(found, 'found event is emitted');
  const match = found.match;
  assert.equal(match.schema, RANK_MATCH_FOUND_SCHEMA);
  assert.deepEqual([...match.signals], ['MatchFound', 'BattleStart']);
  assert.equal(match.mode, 'rank');
  assert.equal(match.playerCount, RANK_MATCH_PLAYER_COUNT);
  assert.equal(match.players.length, 4);
  assert.equal(match.players[0].seat, 'P1');
  assert.equal(match.players[0].kind, 'you');
  assert.equal(match.aiFilledCount, 3);
  for (const player of match.players.slice(1)) {
    assert.equal(player.kind, 'cpu');
    assert.equal(player.filledByAi, true);
  }
  assert.equal(match.preset.mode, '4p');
  assert.equal(match.preset.editable, false);
  assert.equal(session.snapshot().state, 'found');
});

test('rank search prefers queued peers and fills only the remaining seats with AI', () => {
  const scheduler = fakeScheduler();
  const events = [];
  const session = createRankMatchSearchSession({
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    peerSource: () => [{ name: 'peer-a' }, { name: 'peer-b' }],
    onEvent: (event) => events.push(event),
  });
  session.start();
  scheduler.runAll();
  const match = events.find((event) => event.type === 'found').match;
  assert.equal(match.aiFilledCount, 1);
  assert.deepEqual(match.players.map((player) => player.kind), ['you', 'remote', 'remote', 'cpu']);
});

test('rank search cancel stops the pending match and start is idempotent while searching', () => {
  const scheduler = fakeScheduler();
  const events = [];
  const session = createRankMatchSearchSession({
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    onEvent: (event) => events.push(event),
  });
  session.start();
  session.start();
  assert.equal(scheduler.pendingCount, 1, 'second start does not queue a second search');
  const cancelled = session.cancel();
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(scheduler.pendingCount, 0);
  scheduler.runAll();
  assert.equal(events.some((event) => event.type === 'found'), false);
});

test('provider registers the search entry, announces the found match, and can start over', () => {
  const scheduler = fakeScheduler();
  const win = fakeWindow();
  const provider = createRankMatchSearchProvider(win, {
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    now: () => 0,
  });

  const first = provider({ mode: 'rank', surface: 'waiting', presentationOnly: true });
  assert.equal(first.state, 'searching');
  assert.equal(first.status, '対戦相手を探しています…');

  scheduler.runAll();
  const foundEvents = win.dispatched.filter((event) => event.type === RANK_MATCH_FOUND_EVENT);
  assert.equal(foundEvents.length, 1);
  assert.equal(foundEvents[0].detail.playerCount, 4);
  assert.equal(foundEvents[0].detail.aiFilledCount, 3);

  const second = provider({ mode: 'rank', surface: 'waiting', presentationOnly: true });
  assert.equal(second.state, 'searching', 'a found session does not block the next search');
  const cancelled = provider({ cancel: true });
  assert.equal(cancelled.state, 'cancelled');
  scheduler.runAll();
  assert.equal(
    win.dispatched.filter((event) => event.type === RANK_MATCH_FOUND_EVENT).length,
    1,
    'cancelled search never announces a match',
  );
});

test('rank wiring: page registers the provider and the waiting surface starts the real battle on found', () => {
  const html = fs.readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.ok(html.includes('import "./rank-match-search-provider-mount.mjs";'));

  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(base.includes("const RANK_MATCH_FOUND_EVENT = 'gameroad:rank-match-found';"));
  assert.ok(base.includes('win.addEventListener(RANK_MATCH_FOUND_EVENT, rankMatchHandleFound);'));
  assert.ok(base.includes('data-rank-waiting-primary>対戦相手を探す</button>'));
  assert.ok(base.includes('rankMatchRuntime.startBypass = true;'));
  // The waiting surface must never register the provider itself.
  assert.equal(base.includes('GAMEROAD_RANK_MATCH_SEARCH ='), false);
});
