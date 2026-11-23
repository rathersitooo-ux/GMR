// 単位6の統合に伴う対応テスト：browser/user-card-import-core.mjs（作ったカードの読み込み口）
// 単位4で手元の写しで確かめた検査の門を、公開側の部品と公開側の解決処理で固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractEffectTypes,
  validateUserCard,
  parseUserCardPackage,
  USER_CARD_PACKAGE_FORMAT,
} from '../browser/user-card-import-core.mjs';

const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const fnStart = html.indexOf('async function resolveAbilityEntry(entry,phase)');
assert.ok(fnStart >= 0, 'resolveAbilityEntry must exist in GAMEROAD.html');
const effectTypes = extractEffectTypes(html.slice(fnStart, fnStart + 400000));

const goodCard = {
  id: 'USR_TEST_DRAW_1',
  display_name: '試しのドロー鳥',
  suit: 'DCG',
  rank: '5',
  power: 5,
  ability_type: 'Unit',
  ability: '公開された時に2枚引く。',
  effect_type: 'drawCards',
  effect_amount: 2,
  ability_cost: 3,
  rules_text: '公開された時に2枚引く。試しの作ったカード1枚目。',
};

function ctx() {
  return {
    baseIds: new Set(['SP_A']),
    baseNames: new Set(['スペードA']),
    storedIds: new Set(),
    storedNames: new Set(),
    fileIds: new Set(),
    effectTypes,
  };
}

test('effect types are extracted from the public resolver', () => {
  assert.ok(effectTypes.has('drawCards'));
  assert.ok(effectTypes.has('none'));
  assert.ok(effectTypes.size >= 30, `expected >=30, got ${effectTypes.size}`);
});

test('a valid user card passes and gets reader-side fixed values', () => {
  const r = validateUserCard(goodCard, ctx());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.card.runtime_status, 'playable');
  assert.equal(r.card.authority, 'user_created');
  assert.equal(r.card.is_user_card, true);
});

test('invalid cards are rejected one by one', () => {
  const cases = [
    { ...goodCard, id: 'DCG_NOT_USER' },
    { ...goodCard, id: 'SP_A', display_name: '重なり番号' },
    { ...goodCard, power: 99 },
    { ...goodCard, ability_cost: 99 },
    { ...goodCard, effect_type: 'noSuchEffect' },
    { ...goodCard, rules_text: '' },
  ];
  for (const c of cases) {
    assert.equal(validateUserCard(c, ctx()).ok, false, `should reject: ${c.id}/${c.effect_type}`);
  }
});

test('package parse accepts the good card and rejects the bad one only', () => {
  const pkg = {
    format: USER_CARD_PACKAGE_FORMAT,
    version: 1,
    cards: [goodCard, { ...goodCard, id: 'USR_TEST_BAD_1', effect_type: 'noSuchEffect' }],
  };
  const r = parseUserCardPackage(JSON.stringify(pkg), ctx());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].id, 'USR_TEST_DRAW_1');
  assert.equal(r.rejected.length, 1);
});
