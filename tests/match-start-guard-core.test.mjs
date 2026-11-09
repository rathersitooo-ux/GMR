import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MATCH_START_GUARD_SCHEMA,
  MATCH_START_GUARD_WINDOW_MS,
  createMatchStartGuard,
} from '../browser/match-start-guard-core.mjs';

test('fresh guard allows the first match start', () => {
  const guard = createMatchStartGuard();
  assert.equal(guard.schema, MATCH_START_GUARD_SCHEMA);
  assert.equal(guard.windowMs, MATCH_START_GUARD_WINDOW_MS);
  assert.equal(guard.shouldStart(1000), true);
});

test('second start inside the window is refused, at the window edge it is allowed', () => {
  const guard = createMatchStartGuard({ windowMs: 1000 });
  assert.equal(guard.noteStarted(5000), true);
  assert.equal(guard.shouldStart(5000), false);
  assert.equal(guard.shouldStart(5999), false);
  assert.equal(guard.shouldStart(6000), true);
});

test('failed starts do not arm the guard', () => {
  const guard = createMatchStartGuard();
  assert.equal(guard.noteStarted(Number.NaN), false);
  assert.equal(guard.shouldStart(1000), true);
});

test('non-finite time fails closed', () => {
  const guard = createMatchStartGuard();
  assert.equal(guard.shouldStart(Number.NaN), false);
  assert.equal(guard.shouldStart(Infinity), false);
  assert.equal(guard.shouldStart('1000'), false);
});

test('reset clears the last start', () => {
  const guard = createMatchStartGuard();
  guard.noteStarted(1000);
  assert.equal(guard.shouldStart(1500), false);
  guard.reset();
  assert.equal(guard.shouldStart(1500), true);
});

test('custom window is honoured and bad windows throw', () => {
  const guard = createMatchStartGuard({ windowMs: 100 });
  guard.noteStarted(1000);
  assert.equal(guard.shouldStart(1099), false);
  assert.equal(guard.shouldStart(1100), true);
  assert.throws(() => createMatchStartGuard({ windowMs: -1 }), TypeError);
  assert.throws(() => createMatchStartGuard({ windowMs: Number.NaN }), TypeError);
});

test('snapshot is frozen and reports the last start', () => {
  const guard = createMatchStartGuard();
  guard.noteStarted(777);
  const snapshot = guard.snapshot();
  assert.equal(snapshot.schema, MATCH_START_GUARD_SCHEMA);
  assert.equal(snapshot.windowMs, MATCH_START_GUARD_WINDOW_MS);
  assert.equal(snapshot.lastStartedAt, 777);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(guard), true);
});

test('Browser startMatch wires the guard: check at entry, record only after the snapshot succeeds', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.match(html, /GAMEROAD_LOBBYDECK_R4_MATCHSTART_SNAPSHOT/);
  assert.match(html, /import \{ createMatchStartGuard, MATCH_START_GUARD_SCHEMA \} from "\.\/match-start-guard-core\.mjs"/);
  assert.match(html, /GAMEROAD_MATCH_START_GUARD_CONFLICT/);
  const hit = html.match(/function startMatch\(\)\{.*?syncFromGame\?\.\(\);return state\.match\}/s);
  assert.ok(hit, 'startMatch function must be uniquely discoverable');
  const body = hit[0];
  assert.match(body, /matchStartGuard\.shouldStart\(matchStartNow\)/);
  assert.match(body, /matchStartGuard\.noteStarted\(matchStartNow\)/);
  assert.ok(
    body.indexOf('noteStarted(matchStartNow)') > body.indexOf('snapshot=snapshotFactory('),
    'guard must be recorded only after the match-start snapshot succeeds',
  );
  assert.match(body, /return state\.match/);
});

test('public build manifest carries the guard core', () => {
  const build = readFileSync(
    new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url),
    'utf8',
  );
  assert.match(build, /matchStartGuardCoreSource/);
  assert.match(build, /source: 'browser\/match-start-guard-core\.mjs'/);
  assert.match(build, /artifact: 'match_start_guard_core'/);
});
