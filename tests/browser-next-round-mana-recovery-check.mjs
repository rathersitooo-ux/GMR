import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

test('new base has no unconditional or rank-based Mana recovery at match/round start', () => {
  assert.equal(html.includes('recoverRoundStartManaByPlacement(state.match);'), false);
  assert.equal(html.includes('recoverRoundStartManaByPlacement(m);'), false);
  assert.equal(html.includes('function recoverRoundStartManaByPlacement('), false);
  assert.equal(html.includes('位のためマナ回復+'), false);
});

test('ranking stays available for Result while numeric Mana remains 7/10', () => {
  assert.match(html, /function currentPlacementRanks\(m=state\.match\)/);
  assert.match(html, /function ranksFFA\(\)\{return currentPlacementRanks\(state\.match\)\}/);
  assert.match(html, /manaCurrent:7,manaMax:10/);
});

test('explicit ability Mana payment and explicit recovery effects remain intact', () => {
  assert.match(html, /function payAbility\(p,c\)/);
  assert.match(html, /case'wakeMana'/);
});
