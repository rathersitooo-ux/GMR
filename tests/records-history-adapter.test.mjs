import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptHistoryEntryToRecord,
  adaptHistoryToRecords,
  RECORDS_HISTORY_ADAPTER
} from '../browser/records-history-adapter.mjs';

test('current history fields map without inventing aggregates or replay actions', () => {
  const source = adaptHistoryToRecords([{
    at: '2026-09-05T14:00:00.000Z',
    mode: '2v2',
    rank: 1,
    rounds: 8,
    character: 'partner.naki',
    partner: 'partner.naki',
    battlePointsEarned: 3100,
    quickPoints: 100,
    battlePointsAfter: 4200
  }]);
  const record = source.records[0];
  assert.equal(source.sourceState, 'ready');
  assert.equal(record.title, '二対二 / 1位');
  assert.equal(record.subtitle, '8巡');
  assert.equal(record.statusLabel, '勝利');
  assert.deepEqual(record.actions, []);
  assert.deepEqual(record.details.battlePoints, { earned: 3100, quick: 100, after: 4200 });
  assert.equal(record.details.deck, null);
  assert.equal('winRate' in record.details, false);
  assert.equal('replay' in record.details, false);
});

test('actual used main-deck snapshot is preserved exactly when authority provides it', () => {
  const main = ['A01', 'B02', 'C03'];
  const record = adaptHistoryEntryToRecord({
    at: '2026-09-05T14:00:00.000Z',
    mode: '2p',
    rank: 2,
    rounds: 5,
    deck: { main }
  });
  assert.deepEqual(record.details.deck, { main, ex: null });
  assert.notEqual(record.details.deck.main, main);
});

test('EX stays unavailable instead of being fabricated when history does not own it', () => {
  const record = adaptHistoryEntryToRecord({ mode: '2p', deck: { main: ['A01'], ex: null } });
  assert.deepEqual(record.details.deck, { main: ['A01'], ex: null });
});

test('legacy records remain valid with explicit missing detail values', () => {
  const record = adaptHistoryEntryToRecord({ mode: '4p', rank: 3, rounds: 9 }, 4);
  assert.equal(record.recordId, 'match:legacy-5:4');
  assert.equal(record.details.at, null);
  assert.equal(record.details.character, null);
  assert.equal(record.details.partner, null);
  assert.equal(record.details.battlePoints, null);
  assert.equal(record.details.deck, null);
});

test('source order is recent-first and bounded to the existing 30-entry save limit', () => {
  const history = Array.from({ length: 35 }, (_, i) => ({ at: `2026-09-05T14:${String(i).padStart(2, '0')}:00.000Z`, mode: '2p', rank: 1, rounds: i + 1 }));
  const source = adaptHistoryToRecords(history);
  assert.equal(source.records.length, 30);
  assert.equal(source.records[0].details.rounds, 1);
  assert.equal(source.records[29].details.rounds, 30);
});

test('invalid history containers and entries fail closed', () => {
  assert.throws(() => adaptHistoryToRecords(null), /HISTORY_REQUIRED/);
  assert.throws(() => adaptHistoryEntryToRecord(null), /HISTORY_ENTRY_INVALID/);
});

test('malformed deck snapshots are treated as unavailable, not partially trusted', () => {
  const badMain = adaptHistoryEntryToRecord({ mode: '2p', deck: { main: ['A01', null] } });
  assert.equal(badMain.details.deck, null);
  const badEx = adaptHistoryEntryToRecord({ mode: '2p', deck: { main: ['A01'], ex: ['EX1', null] } });
  assert.equal(badEx.details.deck, null);
});

test('adapter exposes a stable schema and current save-history source id', () => {
  assert.equal(RECORDS_HISTORY_ADAPTER.schema, 'GAMEROAD_RECORDS_HISTORY_ADAPTER_V1');
  assert.equal(RECORDS_HISTORY_ADAPTER.defaultSourceId, 'gameroad.browser.v10.core.1.history');
});
