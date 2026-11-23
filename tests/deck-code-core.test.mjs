// 単位6の統合に伴う対応テスト：browser/deck-code-core.mjs（デッキコードの書き出し・読み込み）
// 単位3で手元の写しで確かめた往復と壊れたコードの弾きを、公開側の部品で固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeDeckCode, decodeDeckCode, DECK_CODE_PREFIX } from '../browser/deck-code-core.mjs';

const deck = {
  main: ['SP_A', 'SP_2', 'HT_3', 'DI_4', 'CL_5', 'DCG_C_03'],
  ex: ['DCG_ZE_KUU'],
};

test('roundtrip preserves main and ex exactly', () => {
  const enc = encodeDeckCode(deck);
  assert.equal(enc.ok, true);
  assert.ok(enc.code.startsWith(DECK_CODE_PREFIX));
  const dec = decodeDeckCode(enc.code);
  assert.equal(dec.ok, true);
  assert.deepEqual(dec.deck, deck);
});

test('broken codes are rejected', () => {
  const enc = encodeDeckCode(deck);
  const cases = [
    enc.code.replace(DECK_CODE_PREFIX, 'XXXX.'),
    `${DECK_CODE_PREFIX}!!!`,
    enc.code.slice(0, Math.floor(enc.code.length / 2)),
    '',
    'GRD1.',
  ];
  for (const c of cases) {
    assert.equal(decodeDeckCode(c).ok, false, `should reject: ${c.slice(0, 24)}`);
  }
});

test('duplicate ids are rejected', () => {
  const enc = encodeDeckCode({ main: ['SP_A', 'SP_A'], ex: [] });
  assert.equal(enc.ok, true);
  assert.equal(decodeDeckCode(enc.code).ok, false);
});

test('invalid deck shape is rejected on encode', () => {
  assert.equal(encodeDeckCode(null).ok, false);
  assert.equal(encodeDeckCode({ main: ['bad id!'], ex: [] }).ok, false);
});
