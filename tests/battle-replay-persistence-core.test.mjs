import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAcceptedEvent, createReplayLog, validateReplayLog } from '../browser/battle-replay-core.mjs';
import {
  deleteSavedReplay,
  listSavedReplays,
  loadReplayLog,
  saveReplayLog
} from '../browser/battle-replay-persistence-core.mjs';

const versions = Object.freeze({ rules: 'rules-r1', content: 'content-r1', state: 'state-r1' });

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    _map: map
  };
}

function sampleLog(matchId) {
  let log = createReplayLog({ matchId, versions });
  log = appendAcceptedEvent(log, {
    kind: 'round_resolved',
    publicData: { round: 1, winnerIds: ['P1'] },
    privateByViewer: { P1: { ownReservedBattle: 'SP-A' } },
    authorityOnly: { hiddenOpponentDeckOrder: ['X', 'Y'] }
  });
  log = appendAcceptedEvent(log, {
    kind: 'match_ended',
    publicData: { outcome: 'normal', winnerIds: ['P1'] }
  });
  return log;
}

test('保存して読み出すと、出来事と版がそのまま戻る', () => {
  const storage = memoryStorage();
  const log = sampleLog('M-TEST-1');
  const saved = saveReplayLog(storage, log, { now: 1000 });
  assert.equal(saved.ok, true);
  assert.equal(saved.status, 'saved');
  assert.equal(saved.matchId, 'M-TEST-1');
  assert.equal(saved.eventCount, 2);

  const loaded = loadReplayLog(storage, 'M-TEST-1');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.status, 'loaded');
  assert.equal(validateReplayLog(loaded.log).ok, true);
  assert.equal(loaded.log.matchId, 'M-TEST-1');
  assert.equal(loaded.log.events.length, 2);
  assert.equal(loaded.log.events[0].kind, 'round_resolved');
  assert.deepEqual(loaded.log.versions, versions);
  assert.deepEqual(loaded.log.events[0].privateByViewer, { P1: { ownReservedBattle: 'SP-A' } });
});

test('壊れた記録は保存せず、何も書かない', () => {
  const storage = memoryStorage();
  const bad = { schema: 'WRONG', matchId: 'M-BAD', versions, events: [] };
  const saved = saveReplayLog(storage, bad, { now: 1000 });
  assert.equal(saved.ok, false);
  assert.equal(saved.status, 'rejected');
  assert.equal(storage._map.size, 0);
});

test('同じ対戦を保存し直すと、一覧は1件のままで新しい方が残る', () => {
  const storage = memoryStorage();
  saveReplayLog(storage, sampleLog('M-TEST-1'), { now: 1000 });
  const second = appendAcceptedEvent(sampleLog('M-TEST-1'), {
    kind: 'round_resolved',
    publicData: { round: 2, winnerIds: ['P2'] }
  });
  const saved = saveReplayLog(storage, second, { now: 2000 });
  assert.equal(saved.ok, true);
  const listed = listSavedReplays(storage);
  assert.equal(listed.ok, true);
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.entries[0].matchId, 'M-TEST-1');
  assert.equal(listed.entries[0].savedAt, 2000);
  assert.equal(listed.entries[0].eventCount, 3);
});

test('上限を超えると古い方から消え、鍵も消える', () => {
  const storage = memoryStorage();
  saveReplayLog(storage, sampleLog('M-1'), { now: 1000, maxSaved: 3 });
  saveReplayLog(storage, sampleLog('M-2'), { now: 2000, maxSaved: 3 });
  saveReplayLog(storage, sampleLog('M-3'), { now: 3000, maxSaved: 3 });
  const saved = saveReplayLog(storage, sampleLog('M-4'), { now: 4000, maxSaved: 3 });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.evicted, ['M-1']);
  const listed = listSavedReplays(storage);
  assert.deepEqual(listed.entries.map((entry) => entry.matchId), ['M-4', 'M-3', 'M-2']);
  assert.equal(loadReplayLog(storage, 'M-1').reason, 'NOT_FOUND');
  assert.equal(loadReplayLog(storage, 'M-4').ok, true);
});

test('ない対戦の読み出しは NOT_FOUND、壊れた中身は CORRUPT', () => {
  const storage = memoryStorage();
  assert.equal(loadReplayLog(storage, 'M-NONE').reason, 'NOT_FOUND');
  storage.setItem('gameroad.replay.v1.M-BROKEN', '{壊れた');
  assert.equal(loadReplayLog(storage, 'M-BROKEN').reason, 'CORRUPT');
  storage.setItem('gameroad.replay.v1.M-WRONG', JSON.stringify({ schema: 'WRONG', matchId: 'M-WRONG', versions, events: [] }));
  assert.equal(loadReplayLog(storage, 'M-WRONG').reason, 'SCHEMA_UNKNOWN');
});

test('消すと鍵と一覧の両方からなくなる。ない物を消しても失敗しない', () => {
  const storage = memoryStorage();
  saveReplayLog(storage, sampleLog('M-TEST-1'), { now: 1000 });
  saveReplayLog(storage, sampleLog('M-TEST-2'), { now: 2000 });
  const deleted = deleteSavedReplay(storage, 'M-TEST-1');
  assert.equal(deleted.ok, true);
  assert.equal(deleted.existed, true);
  assert.equal(loadReplayLog(storage, 'M-TEST-1').reason, 'NOT_FOUND');
  assert.deepEqual(listSavedReplays(storage).entries.map((entry) => entry.matchId), ['M-TEST-2']);
  const missing = deleteSavedReplay(storage, 'M-NONE');
  assert.equal(missing.ok, true);
  assert.equal(missing.existed, false);
});

test('一覧が空のときは0件。壊れた一覧は作り直して保存は続く', () => {
  const storage = memoryStorage();
  assert.deepEqual(listSavedReplays(storage).entries, []);
  storage.setItem('gameroad.replay.index.v1', '{壊れた');
  const listed = listSavedReplays(storage);
  assert.equal(listed.ok, true);
  assert.equal(listed.indexRebuilt, true);
  assert.deepEqual(listed.entries, []);
  const saved = saveReplayLog(storage, sampleLog('M-TEST-1'), { now: 1000 });
  assert.equal(saved.ok, true);
  assert.equal(saved.indexRebuilt, true);
  assert.equal(listSavedReplays(storage).entries.length, 1);
});

test('storage が無い・投げる場合は失敗を返して投げない', () => {
  const log = sampleLog('M-TEST-1');
  assert.equal(saveReplayLog(null, log).reason, 'STORAGE_UNAVAILABLE');
  assert.equal(loadReplayLog(null, 'M-TEST-1').reason, 'STORAGE_UNAVAILABLE');
  assert.equal(listSavedReplays(null).reason, 'STORAGE_UNAVAILABLE');
  assert.equal(deleteSavedReplay(null, 'M-TEST-1').reason, 'STORAGE_UNAVAILABLE');

  const throwing = {
    getItem: () => { throw new Error('QUOTA'); },
    setItem: () => { throw new Error('QUOTA'); },
    removeItem: () => { throw new Error('QUOTA'); }
  };
  assert.equal(saveReplayLog(throwing, log).ok, false);
  assert.equal(loadReplayLog(throwing, 'M-TEST-1').ok, false);
});
