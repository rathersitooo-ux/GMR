import { projectLegacySevenRoadWinGate } from './new-base-legacy-seven-win-gate-core.mjs';

const BATTLE_MAP_RULESET_SCHEMA = 'GAMEROAD_BATTLE_MAP_RULESET_V1';
const BATTLE_EFFECT_CONTEXT_SCHEMA = 'GAMEROAD_BATTLE_EFFECT_CONTEXT_V1';

export const BATTLE_MAP_IDS = Object.freeze({
  GRAND_HALL: 'GRAND_HALL',
  FRANOORA_CASTLE_TOWN: 'FRANOORA_CASTLE_TOWN',
});

export const BATTLE_RULESET_IDS = Object.freeze({
  GRAND_HALL_LEGACY_NO_GOAL: 'GAMEROAD_RULESET_GRAND_HALL_LEGACY_NO_GOAL_V1',
  FRANOORA_GOAL: 'GAMEROAD_RULESET_FRANOORA_GOAL_V1',
});

export const BATTLE_EFFECT_RULESET_IDS = Object.freeze({
  GRAND_HALL_LEGACY: 'GAMEROAD_EFFECT_RULES_GRAND_HALL_LEGACY_V1',
  FRANOORA_GOAL: 'GAMEROAD_EFFECT_RULES_FRANOORA_GOAL_V1',
});

const MAP_BINDINGS = Object.freeze({
  [BATTLE_MAP_IDS.GRAND_HALL]: Object.freeze({
    schema: BATTLE_MAP_RULESET_SCHEMA,
    mapId: BATTLE_MAP_IDS.GRAND_HALL,
    displayName: '大広間',
    rulesetId: BATTLE_RULESET_IDS.GRAND_HALL_LEGACY_NO_GOAL,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.GRAND_HALL_LEGACY,
    goalPolicy: 'NO_GOAL',
    goalTerminalEventType: null,
    currentLegacyRules: true,
    suppressLegacySevenRoadTerminal: false,
    mapDefinitionId: 'CURRENT_LEGACY_GRAND_HALL_MAP',
    mapDefinitionFallbackAllowed: false,
    implicitEffectFallbackAllowed: false,
  }),
  [BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN]: Object.freeze({
    schema: BATTLE_MAP_RULESET_SCHEMA,
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    displayName: 'フラノーラ城下町',
    rulesetId: BATTLE_RULESET_IDS.FRANOORA_GOAL,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL,
    goalPolicy: 'GOAL_REACHED',
    goalTerminalEventType: 'GOAL_REACHED',
    currentLegacyRules: false,
    suppressLegacySevenRoadTerminal: true,
    mapDefinitionId: 'GAMEROAD_FRANOORA_CASTLE_TOWN_MAP_V1',
    mapDefinitionFallbackAllowed: false,
    implicitEffectFallbackAllowed: false,
  }),
});

function requireKnownMapId(mapId) {
  if (typeof mapId !== 'string' || !Object.hasOwn(MAP_BINDINGS, mapId)) {
    throw new Error('KNOWN_BATTLE_MAP_ID_REQUIRED');
  }
  return mapId;
}

export function getBattleMapRuleBinding(mapId) {
  return MAP_BINDINGS[requireKnownMapId(mapId)];
}

export function createBattleMapRuleContext({ mapId } = {}) {
  const binding = getBattleMapRuleBinding(mapId);
  return Object.freeze({
    schema: BATTLE_MAP_RULESET_SCHEMA,
    mapId: binding.mapId,
    rulesetId: binding.rulesetId,
    effectRulesetId: binding.effectRulesetId,
    goalPolicy: binding.goalPolicy,
    goalTerminalEventType: binding.goalTerminalEventType,
    mapDefinitionId: binding.mapDefinitionId,
  });
}

export function assertBattleMapRuleContext({
  mapId,
  rulesetId,
  effectRulesetId,
  mapDefinitionId,
} = {}) {
  const binding = getBattleMapRuleBinding(mapId);
  if (rulesetId !== binding.rulesetId) {
    throw new Error('MAP_RULESET_MISMATCH');
  }
  if (effectRulesetId !== binding.effectRulesetId) {
    throw new Error('MAP_EFFECT_RULESET_MISMATCH');
  }
  if (mapDefinitionId !== binding.mapDefinitionId) {
    throw new Error('MAP_DEFINITION_MISMATCH');
  }
  return createBattleMapRuleContext({ mapId });
}

export function createBattleEffectRuleContext({ mapId } = {}) {
  const binding = getBattleMapRuleBinding(mapId);
  return Object.freeze({
    schema: BATTLE_EFFECT_CONTEXT_SCHEMA,
    mapId: binding.mapId,
    effectRulesetId: binding.effectRulesetId,
    implicitFallbackAllowed: false,
    legacyEffectFallbackAllowed: false,
  });
}

export function assertEffectRulesetMatchesMap({ mapId, effectRulesetId } = {}) {
  const binding = getBattleMapRuleBinding(mapId);
  if (effectRulesetId !== binding.effectRulesetId) {
    throw new Error('MAP_EFFECT_RULESET_MISMATCH');
  }
  return createBattleEffectRuleContext({ mapId });
}

export function projectLegacySevenRoadWinForMap({ mapId, legacySevenRoadWin } = {}) {
  const binding = getBattleMapRuleBinding(mapId);
  return projectLegacySevenRoadWinGate({
    rulesetIsNewBase: binding.suppressLegacySevenRoadTerminal,
    legacySevenRoadWin,
  });
}

export const BATTLE_MAP_RULESET_CORE = Object.freeze({
  schema: BATTLE_MAP_RULESET_SCHEMA,
  mapIds: BATTLE_MAP_IDS,
  rulesetIds: BATTLE_RULESET_IDS,
  effectRulesetIds: BATTLE_EFFECT_RULESET_IDS,
  implicitMapFallbackAllowed: false,
  implicitEffectFallbackAllowed: false,
  crossMapRulesetReuseAllowed: false,
});
