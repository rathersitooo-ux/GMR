import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCharacterPack, createCharacterCatalog, catalogAdd, catalogRemove, catalogList,
} from '../browser/user-character-pack-core.mjs';
import { cook, feedPartner, cookableWith } from '../browser/cooking-core.mjs';

const GOOD_PACK = JSON.stringify({
  kind: 'gameroad-character-pack', version: 1,
  id: 'my-rin', name: 'リン', images: ['rin-stand.png'], lines: { start: ['いくよ！'] }, note: '',
});

test('キャラパック：正しい形は通る。問題は全部まとめて返る', () => {
  const ok = parseCharacterPack(GOOD_PACK);
  assert.equal(ok.ok, true);
  assert.equal(ok.pack.source, 'user');
  const bad = parseCharacterPack(JSON.stringify({ kind: 'x' }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 4);
  assert.equal(parseCharacterPack('{broken').ok, false);
});

test('カタログ：1人1行で持ち、同じ識別子は二重に入らない', () => {
  const catalog = createCharacterCatalog();
  const pack = parseCharacterPack(GOOD_PACK).pack;
  assert.equal(catalogAdd(catalog, pack).ok, true);
  assert.equal(catalogAdd(catalog, pack).ok, false);
  assert.deepEqual(catalogList(catalog), [{ id: 'my-rin', name: 'リン', source: 'user' }]);
  assert.equal(catalogRemove(catalog, 'my-rin'), true);
  assert.equal(catalogList(catalog).length, 0);
});

test('料理：材料と工程が合えば料理になり、食べると効き先が返る', () => {
  const r = cook(['ing_milk', 'ing_egg'], 'proc_fry'); // 並び順は問わない
  assert.equal(r.ok, true);
  assert.equal(r.dish.name, 'ふわふわオムレツ');
  const fed = feedPartner(r.dish);
  assert.equal(fed.effects.affinity, 2);
  assert.deepEqual(cookableWith(['ing_egg', 'ing_milk', 'ing_potato']), ['dish_omelette']);
});

test('料理：合わない組み合わせは失敗作になり、材料は消費される', () => {
  const r = cook(['ing_egg'], 'proc_simmer');
  assert.equal(r.ok, false);
  assert.equal(r.dish.name, 'なぞの料理');
  assert.deepEqual(r.consumed, ['ing_egg']);
});
