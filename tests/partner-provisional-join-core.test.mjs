import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVICE_SCENES,
  makeProvisionalJoin,
  recordTestedScene,
  selectProvisionalPartner,
  untestedScenes,
} from '../browser/partner-provisional-join-core.mjs';

const chara = {
  id: 'naki',
  friends: [
    { characterId: 'saasuna', closeness: 60 },
    { characterId: 'estra', closeness: 90 },
    { characterId: 'nanjamo', closeness: 75 },
  ],
};

test('仲いいキャラは複数いて、一番仲いい人が仮参戦する', () => {
  const sel = selectProvisionalPartner(chara, 'closest');
  assert.equal(sel.partnerId, 'estra');
  assert.equal(sel.reason, '一番仲いい');
});

test('気まぐれで決めた人も仮参戦する（友達の中からだけ）', () => {
  const ids = new Set(chara.friends.map((f) => f.characterId));
  for (const v of [0.0, 0.34, 0.67, 0.99]) {
    const sel = selectProvisionalPartner(chara, 'whim', () => v);
    assert.ok(ids.has(sel.partnerId));
    assert.equal(sel.mode, 'whim');
  }
});

test('友達がいなければ仮参戦は無い', () => {
  assert.equal(selectProvisionalPartner({ id: 'x', friends: [] }), null);
  assert.equal(makeProvisionalJoin({ id: 'x', friends: [] }), null);
});

test('仮参戦は正式決定ではなく、テスト目的が付いている', () => {
  const join = makeProvisionalJoin(chara, 'closest');
  assert.equal(join.provisional, true);
  assert.match(join.purpose, /テスト/);
  assert.equal(join.hostId, 'naki');
});

test('アドバイスの場面は一覧にあり、テストした場面が記録される', () => {
  const join = makeProvisionalJoin(chara, 'closest');
  assert.ok(ADVICE_SCENES.length >= 8);
  assert.equal(untestedScenes(join).length, ADVICE_SCENES.length);
  assert.equal(recordTestedScene(join, 'battle_win'), true);
  assert.equal(recordTestedScene(join, 'battle_win'), true);
  assert.equal(join.testedScenes.length, 1);
  assert.equal(recordTestedScene(join, '存在しない場面'), false);
  assert.ok(!untestedScenes(join).includes('battle_win'));
});
