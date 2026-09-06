import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_MAP_IDS,
  BATTLE_RULESET_IDS,
  BATTLE_EFFECT_RULESET_IDS,
  BATTLE_MAP_RULESET_CORE,
  getBattleMapRuleBinding,
  createBattleMapRuleContext,
  assertBattleMapRuleContext,
  createBattleEffectRuleContext,
  assertEffectRulesetMatchesMap,
  projectLegacySevenRoadWinForMap,
} from '../browser/battle-map-ruleset-core.mjs';

test('大広間 is the current legacy no-goal map and does not inherit a goal terminal', () => {
  const binding = getBattleMapRuleBinding(BATTLE_MAP_IDS.GRAND_HALL);
  assert.equal(binding.displayName, '大広間');
  assert.equal(binding.rulesetId, BATTLE_RULESET_IDS.GRAND_HALL_LEGACY_NO_GOAL);
  assert.equal(binding.effectRulesetId, BATTLE_EFFECT_RULESET_IDS.GRAND_HALL_LEGACY);
  assert.equal(binding.goalPolicy, 'NO_GOAL');
  assert.equal(binding.goalTerminalEventType, null);
  assert.equal(binding.currentLegacyRules, true);
  assert.equal(binding.mapDefinitionFallbackAllowed, false);
});

test('フラノーラ城下町 is goal rules only with its own map and effect namespaces', () => {
  const binding = getBattleMapRuleBinding(BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN);
  assert.equal(binding.displayName, 'フラノーラ城下町');
  assert.equal(binding.rulesetId, BATTLE_RULESET_IDS.FRANOORA_GOAL);
  assert.equal(binding.effectRulesetId, BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL);
  assert.equal(binding.goalPolicy, 'GOAL_REACHED');
  assert.equal(binding.goalTerminalEventType, 'GOAL_REACHED');
  assert.equal(binding.currentLegacyRules, false);
  assert.equal(binding.suppressLegacySevenRoadTerminal, true);
  assert.equal(binding.mapDefinitionId, 'GAMEROAD_FRANOORA_CASTLE_TOWN_MAP_V1');
  assert.equal(binding.mapDefinitionFallbackAllowed, false);
  assert.equal(binding.implicitEffectFallbackAllowed, false);
});

test('map, ruleset, effect ruleset and map definition cannot be cross-wired', () => {
  assert.throws(() => assertBattleMapRuleContext({
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    rulesetId: BATTLE_RULESET_IDS.GRAND_HALL_LEGACY_NO_GOAL,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL,
    mapDefinitionId: 'GAMEROAD_FRANOORA_CASTLE_TOWN_MAP_V1',
  }), /MAP_RULESET_MISMATCH/);

  assert.throws(() => assertBattleMapRuleContext({
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    rulesetId: BATTLE_RULESET_IDS.FRANOORA_GOAL,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.GRAND_HALL_LEGACY,
    mapDefinitionId: 'GAMEROAD_FRANOORA_CASTLE_TOWN_MAP_V1',
  }), /MAP_EFFECT_RULESET_MISMATCH/);

  assert.throws(() => assertBattleMapRuleContext({
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    rulesetId: BATTLE_RULESET_IDS.FRANOORA_GOAL,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL,
    mapDefinitionId: 'CURRENT_LEGACY_GRAND_HALL_MAP',
  }), /MAP_DEFINITION_MISMATCH/);
});

test('effect rules never fall back implicitly across maps', () => {
  const legacyEffects = createBattleEffectRuleContext({ mapId: BATTLE_MAP_IDS.GRAND_HALL });
  const franooraEffects = createBattleEffectRuleContext({ mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN });

  assert.notEqual(legacyEffects.effectRulesetId, franooraEffects.effectRulesetId);
  assert.equal(legacyEffects.implicitFallbackAllowed, false);
  assert.equal(legacyEffects.legacyEffectFallbackAllowed, false);
  assert.equal(franooraEffects.implicitFallbackAllowed, false);
  assert.equal(franooraEffects.legacyEffectFallbackAllowed, false);

  assert.throws(() => assertEffectRulesetMatchesMap({
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.GRAND_HALL_LEGACY,
  }), /MAP_EFFECT_RULESET_MISMATCH/);
});

test('legacy seven-road terminal routing is derived from map identity, not caller new-base boolean', () => {
  const legacy = projectLegacySevenRoadWinForMap({
    mapId: BATTLE_MAP_IDS.GRAND_HALL,
    legacySevenRoadWin: true,
  });
  const franoora = projectLegacySevenRoadWinForMap({
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    legacySevenRoadWin: true,
  });

  assert.equal(legacy.forwardLegacyWin, true);
  assert.equal(legacy.suppressedForNewBase, false);
  assert.equal(franoora.forwardLegacyWin, false);
  assert.equal(franoora.suppressedForNewBase, true);
});

test('unknown maps fail closed instead of defaulting to legacy or new rules', () => {
  assert.throws(() => getBattleMapRuleBinding('UNKNOWN_MAP'), /KNOWN_BATTLE_MAP_ID_REQUIRED/);
  assert.throws(() => createBattleMapRuleContext(), /KNOWN_BATTLE_MAP_ID_REQUIRED/);
  assert.throws(() => projectLegacySevenRoadWinForMap({ legacySevenRoadWin: true }), /KNOWN_BATTLE_MAP_ID_REQUIRED/);
});

test('core declares no implicit map/effect fallback or cross-map ruleset reuse', () => {
  assert.equal(BATTLE_MAP_RULESET_CORE.implicitMapFallbackAllowed, false);
  assert.equal(BATTLE_MAP_RULESET_CORE.implicitEffectFallbackAllowed, false);
  assert.equal(BATTLE_MAP_RULESET_CORE.crossMapRulesetReuseAllowed, false);
});
