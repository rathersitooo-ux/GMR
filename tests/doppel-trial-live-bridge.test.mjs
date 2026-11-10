// ドッペルゲンガー試し版の接続（影の測定）のテスト（2026-11-10）。
// 開いていない時は黙り、開いている時は結果を変えずにログへ書くこと。
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null };

const { observeDoppelTrial } = await import('../browser/doppel-trial-live-bridge.mjs');

const ENTRIES = [
  { playerId: 'P1', cardId: 'a', name: '炎の剣士', number: 7 },
  { playerId: 'P2', cardId: 'b', name: '氷の女王', number: 7 },
  { playerId: 'P3', cardId: 'c', name: '風の旅人', number: 2 },
];

test('試し版が開いていない時は何もしない', () => {
  const logs = [];
  const r = observeDoppelTrial(ENTRIES, 'battle', { log: (t) => logs.push(t) });
  assert.equal(r, null);
  assert.equal(logs.length, 0);
});

test('開いている時：発動をログに書き、戻りの内訳が出る', () => {
  globalThis.location = { search: '?doppelTrial=normal' };
  const logs = [];
  const r = observeDoppelTrial(ENTRIES, 'battle', { log: (t) => logs.push(t) });
  assert.equal(r.triggered, true);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /試し版ドッペル（normal）/);
  assert.match(logs[0], /戻る 炎の剣士・氷の女王/);
  assert.match(logs[0], /実際の結果は変えていない/);
  globalThis.location = { search: '' };
});

test('発動しない時は、その旨だけを書く', () => {
  globalThis.location = { search: '?doppelTrial=super' };
  const logs = [];
  const r = observeDoppelTrial(
    [{ playerId: 'P1', cardId: 'a', name: 'a', number: 1 }, { playerId: 'P2', cardId: 'b', name: 'b', number: 2 }],
    'road',
    { log: (t) => logs.push(t) },
  );
  assert.equal(r.triggered, false);
  assert.match(logs[0], /発動なし/);
  globalThis.location = { search: '' };
});
