import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOM_MATCH_SERIES,
  createRoomSeriesState,
  describeRoomSeries,
  recordRoomSeriesMatch,
  resolveRoomSeriesState,
  roomSeriesSnapshot,
  seriesWinnerKeysForMatch,
  winsNeededForSeries
} from '../browser/room-match-series-core.mjs';

const ffaMatch = (ids = ['P1', 'P2', 'P3', 'P4']) => ({
  mode: '4p',
  players: ids.map((id) => ({ id, lanes: { L: [], C: [], R: [] } }))
});

const teamMatch = () => ({
  mode: '2v2',
  players: [
    { id: 'P1', team: 'A' }, { id: 'P2', team: 'A' },
    { id: 'P3', team: 'B' }, { id: 'P4', team: 'B' }
  ]
});

test('provisional shape: BO1 needs one win, BO3 needs two (first to two)', () => {
  assert.equal(winsNeededForSeries(1), 1);
  assert.equal(winsNeededForSeries(3), 2);
  assert.throws(() => winsNeededForSeries(5), /SERIES/);
  assert.equal(ROOM_MATCH_SERIES.provisional, 'BO3_IS_FIRST_TO_TWO_WINS');
  assert.equal(createRoomSeriesState(3).winsNeeded, 2);
  assert.equal(createRoomSeriesState(1).winsNeeded, 1);
  assert.equal(createRoomSeriesState().seriesBestOf, 1);
});

test('BO3: wins accumulate on the series and the second win decides it', () => {
  let s = createRoomSeriesState(3);
  s = recordRoomSeriesMatch(s, { matchId: 'M1', winnerKeys: ['P2'] });
  assert.equal(s.counted, true);
  assert.deepEqual(s.wins, { P2: 1 });
  assert.equal(s.matchesPlayed, 1);
  assert.equal(s.decided, false);
  assert.equal(s.seriesWinnerKey, null);
  s = recordRoomSeriesMatch(s, { matchId: 'M2', winnerKeys: ['P1'] });
  assert.deepEqual(s.wins, { P2: 1, P1: 1 });
  assert.equal(s.decided, false);
  s = recordRoomSeriesMatch(s, { matchId: 'M3', winnerKeys: ['P2'] });
  assert.deepEqual(s.wins, { P2: 2, P1: 1 });
  assert.equal(s.matchesPlayed, 3);
  assert.equal(s.decided, true);
  assert.equal(s.seriesWinnerKey, 'P2');
});

test('BO1: the first match decides the series at once', () => {
  const s = recordRoomSeriesMatch(createRoomSeriesState(1), { matchId: 'M1', winnerKeys: ['P3'] });
  assert.equal(s.decided, true);
  assert.equal(s.seriesWinnerKey, 'P3');
  assert.equal(s.winsNeeded, 1);
});

test('the same match is never counted twice', () => {
  let s = recordRoomSeriesMatch(createRoomSeriesState(3), { matchId: 'M1', winnerKeys: ['P1'] });
  assert.equal(s.counted, true);
  s = recordRoomSeriesMatch(s, { matchId: 'M1', winnerKeys: ['P1'] });
  assert.equal(s.counted, false);
  assert.equal(s.countReason, 'ALREADY_COUNTED');
  assert.deepEqual(s.wins, { P1: 1 });
  assert.equal(s.matchesPlayed, 1);
});

test('after the series is decided, later matches are not counted', () => {
  let s = recordRoomSeriesMatch(createRoomSeriesState(1), { matchId: 'M1', winnerKeys: ['P1'] });
  assert.equal(s.decided, true);
  s = recordRoomSeriesMatch(s, { matchId: 'M2', winnerKeys: ['P2'] });
  assert.equal(s.counted, false);
  assert.equal(s.countReason, 'SERIES_ALREADY_DECIDED');
  assert.deepEqual(s.wins, { P1: 1 });
});

test('a record without a match id or without a winner counts nothing', () => {
  const base = createRoomSeriesState(3);
  const noId = recordRoomSeriesMatch(base, { matchId: '', winnerKeys: ['P1'] });
  assert.equal(noId.counted, false);
  assert.equal(noId.countReason, 'MATCH_ID_REQUIRED');
  const noWinner = recordRoomSeriesMatch(base, { matchId: 'M1', winnerKeys: [] });
  assert.equal(noWinner.counted, false);
  assert.equal(noWinner.countReason, 'WINNER_KEY_REQUIRED');
  assert.equal(base.matchesPlayed, 0);
});

test('winner keys: FFA uses player ids and ignores unknown tokens', () => {
  const match = ffaMatch();
  assert.deepEqual(seriesWinnerKeysForMatch(match, ['P2']), ['P2']);
  assert.deepEqual(seriesWinnerKeysForMatch(match, ['SPECIAL_TOKEN']), []);
  assert.deepEqual(seriesWinnerKeysForMatch(match, []), []);
});

test('winner keys: 2v2 counts the team once, from a player id or a team letter', () => {
  const match = teamMatch();
  assert.deepEqual(seriesWinnerKeysForMatch(match, ['P3']), ['B']);
  assert.deepEqual(seriesWinnerKeysForMatch(match, ['P3', 'P4']), ['B']);
  assert.deepEqual(seriesWinnerKeysForMatch(match, ['A']), ['A']);
  let s = createRoomSeriesState(3);
  s = recordRoomSeriesMatch(s, { matchId: 'M1', winnerKeys: seriesWinnerKeysForMatch(match, ['P1', 'P2']) });
  assert.deepEqual(s.wins, { A: 1 });
  s = recordRoomSeriesMatch(s, { matchId: 'M2', winnerKeys: seriesWinnerKeysForMatch(match, ['P2']) });
  assert.deepEqual(s.wins, { A: 2 });
  assert.equal(s.seriesWinnerKey, 'A');
  assert.equal(s.decided, true);
});

test('stored or received state is rebuilt safely and survives a round trip', () => {
  const played = recordRoomSeriesMatch(createRoomSeriesState(3), { matchId: 'M1', winnerKeys: ['P1'] });
  const snap = roomSeriesSnapshot(played);
  assert.equal(snap.seriesLabel, 'BO3');
  assert.equal(snap.winnerKey, null);
  assert.equal(snap.decided, false);
  assert.deepEqual(snap.wins, { P1: 1 });
  const restored = resolveRoomSeriesState(snap, 3);
  assert.deepEqual(restored.wins, { P1: 1 });
  assert.equal(restored.matchesPlayed, 1);
  assert.deepEqual(restored.countedMatchIds, ['M1']);
  const again = recordRoomSeriesMatch(restored, { matchId: 'M1', winnerKeys: ['P1'] });
  assert.equal(again.counted, false);
  assert.equal(resolveRoomSeriesState(null).seriesBestOf, 1);
  assert.equal(resolveRoomSeriesState({ wins: { P1: -2, P2: 'x', P3: 2 }, seriesBestOf: 3 }).wins.P3, 2);
  assert.equal(resolveRoomSeriesState({ wins: { P1: -2 } }).wins.P1, undefined);
});

test('description shows the score and how far the series is from decided', () => {
  let s = recordRoomSeriesMatch(createRoomSeriesState(3), { matchId: 'M1', winnerKeys: ['P1'] });
  const mid = describeRoomSeries(s, ['P1', 'P2']);
  assert.equal(mid.scoreText, 'P1 1勝 ・ P2 0勝');
  assert.equal(mid.decided, false);
  s = recordRoomSeriesMatch(s, { matchId: 'M2', winnerKeys: ['P1'] });
  const done = describeRoomSeries(s, ['P1', 'P2']);
  assert.equal(done.decided, true);
  assert.equal(done.seriesWinnerKey, 'P1');
  assert.ok(done.text.includes('シリーズ決定'));
});

test('recording never mutates the previous state', () => {
  const before = createRoomSeriesState(3);
  const after = recordRoomSeriesMatch(before, { matchId: 'M1', winnerKeys: ['P1'] });
  assert.deepEqual(before.wins, {});
  assert.equal(before.matchesPlayed, 0);
  assert.equal(after.matchesPlayed, 1);
  assert.ok(Object.isFrozen(after));
});
