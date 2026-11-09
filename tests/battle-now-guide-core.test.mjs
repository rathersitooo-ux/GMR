import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BATTLE_NOW_GUIDE_PLAN_SEQUENCE,
  BATTLE_NOW_GUIDE_SCHEMA,
  projectBattleNowGuide,
} from '../browser/battle-now-guide-core.mjs';

test('plan phase always shows the one-line now guide with the full sequence (provisional plan A)', () => {
  const road = projectBattleNowGuide({ screen: 'battle', phase: 'plan', roadId: null, battleId: null });
  assert.equal(road.schema, BATTLE_NOW_GUIDE_SCHEMA);
  assert.equal(road.active, true);
  assert.equal(road.step, 'road');
  assert.equal(road.message, `今やること：${BATTLE_NOW_GUIDE_PLAN_SEQUENCE}`);
  assert.equal(road.message, '今やること：1 ロードを選ぶ → 2 バトルを選ぶ → 3 終点を決める → 準備完了');
  assert.equal(road.message.includes('\n'), false);

  const battle = projectBattleNowGuide({ screen: 'battle', phase: 'plan', roadId: 'road-a', battleId: null });
  assert.equal(battle.active, true);
  assert.equal(battle.step, 'battle');
  assert.equal(battle.message, road.message);

  const ready = projectBattleNowGuide({ screen: 'battle', phase: 'plan', roadId: 'road-a', battleId: 'battle-b' });
  assert.equal(ready.step, 'ready');
  assert.equal(ready.message, road.message);
});

test('every other phase also gets exactly one now-guide line', () => {
  const reveal = projectBattleNowGuide({ screen: 'battle', phase: 'reveal' });
  assert.equal(reveal.message, '今やること：公開されたカードを確認する');
  const move = projectBattleNowGuide({ screen: 'battle', phase: 'move' });
  assert.equal(move.message, '今やること：移動の結果を確認する');
  const target = projectBattleNowGuide({ screen: 'battle', phase: 'target' });
  assert.equal(target.message, '今やること：攻撃先を選んで「攻撃先を決定」を押す');
  const resolve = projectBattleNowGuide({ screen: 'battle', phase: 'resolve' });
  assert.equal(resolve.message, '今やること：戦闘の結果を確認する');
  for (const projection of [reveal, move, target, resolve]) {
    assert.equal(projection.active, true);
    assert.equal(projection.message.includes('\n'), false);
  }
});

test('busy plan phase shows a waiting line instead of the sequence', () => {
  const busy = projectBattleNowGuide({ screen: 'battle', phase: 'plan', busy: true, roadId: 'r', battleId: 'b' });
  assert.equal(busy.step, 'busy');
  assert.match(busy.message, /^今やること：/);
});

test('guide is presentation only and inactive outside battle or without a phase', () => {
  for (const projection of [
    projectBattleNowGuide({ screen: 'home', phase: 'plan' }),
    projectBattleNowGuide({ screen: 'battle', phase: null }),
    projectBattleNowGuide({ screen: 'battle', phase: 'unknown' }),
    projectBattleNowGuide(null),
    projectBattleNowGuide(),
  ]) {
    assert.equal(projection.active, false);
    assert.equal(projection.message, null);
    assert.equal(projection.presentationOnly, true);
    assert.equal(projection.autoExecute, false);
  }
  const plan = projectBattleNowGuide({ screen: 'battle', phase: 'plan' });
  assert.equal(plan.presentationOnly, true);
  assert.equal(plan.autoExecute, false);
  assert.equal(Object.isFrozen(plan), true);
});

test('GAMEROAD.html wires the now guide into the battle play flow', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  // 題の下に1行の置き場所がある
  assert.match(html, /id="battleNowGuide"/);
  assert.match(html, /id="battleNowGuide"[^>]*>今やること：1 ロードを選ぶ/);
  // 遊ぶ流れへ取り付ける module が読み込まれる
  assert.match(html, /<script type="module" src="\.\/battle-now-guide-runtime\.mjs"><\/script>/);
  assert.match(html, /id="gameroad-battle-now-guide-style"/);
});
