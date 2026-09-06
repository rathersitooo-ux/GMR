import { createNewBaseGoalPathLayout } from './new-base-goal-path-core.mjs';
import {
  BATTLE_MAP_IDS,
  BATTLE_RULESET_IDS,
  BATTLE_EFFECT_RULESET_IDS,
} from './battle-map-ruleset-core.mjs';

const FRANOORA_MAP_SCHEMA = 'GAMEROAD_FRANOORA_CASTLE_TOWN_MAP_V1';
const PLAYER_COUNT = 4;
const SHIELD_LINKED_LANES_PER_PLAYER = 3;
const HORIZONTAL_CELL_COUNT = PLAYER_COUNT * SHIELD_LINKED_LANES_PER_PLAYER;
const STRAIGHT_CARD_TARGET = 7;

function normalizeParticipantIds(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length !== PLAYER_COUNT) {
    throw new Error('EXACTLY_FOUR_PARTICIPANTS_REQUIRED');
  }
  const normalized = participantIds.map((participantId) => String(participantId ?? '').trim());
  if (normalized.some((participantId) => !participantId)) {
    throw new Error('PARTICIPANT_ID_REQUIRED');
  }
  if (new Set(normalized).size !== PLAYER_COUNT) {
    throw new Error('UNIQUE_PARTICIPANT_IDS_REQUIRED');
  }
  return normalized;
}

function createShieldLinkedLaneColumns(participantIds) {
  return Object.freeze(Object.fromEntries(participantIds.map((participantId, participantIndex) => {
    const firstColumn = participantIndex * SHIELD_LINKED_LANES_PER_PLAYER;
    return [participantId, Object.freeze([
      firstColumn,
      firstColumn + 1,
      firstColumn + 2,
    ])];
  })));
}

function createStartAnchors(participantIds) {
  return Object.freeze(Object.fromEntries(participantIds.map((participantId) => [
    participantId,
    `FRANOORA_START_${participantId}`,
  ])));
}

function createShieldAnchors(participantIds) {
  return Object.freeze(Object.fromEntries(participantIds.map((participantId, participantIndex) => [
    participantId,
    Object.freeze(Array.from({ length: SHIELD_LINKED_LANES_PER_PLAYER }, (_, laneOffset) =>
      `FRANOORA_SHIELD_${participantIndex + 1}_${laneOffset + 1}`)),
  ])));
}

export function createFranooraCastleTownMap({ participantIds } = {}) {
  const normalizedParticipantIds = normalizeParticipantIds(participantIds);
  const shieldLinkedLaneColumnsByParticipant = createShieldLinkedLaneColumns(normalizedParticipantIds);
  const goalPathLayout = createNewBaseGoalPathLayout({
    participantIds: normalizedParticipantIds,
    horizontalCellCount: HORIZONTAL_CELL_COUNT,
    shieldLinkedLaneColumnsByParticipant,
  });

  return Object.freeze({
    schema: FRANOORA_MAP_SCHEMA,
    mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
    displayName: 'フラノーラ城下町',
    rulesetId: BATTLE_RULESET_IDS.FRANOORA_GOAL,
    effectRulesetId: BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL,
    participantIds: Object.freeze([...normalizedParticipantIds]),
    playerCount: PLAYER_COUNT,
    horizontalCellCount: HORIZONTAL_CELL_COUNT,
    shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
    straightCardTarget: STRAIGHT_CARD_TARGET,
    goalRowColumnIndices: Object.freeze([...goalPathLayout.topRowGoalColumnIndices]),
    shieldLinkedLaneColumnsByParticipant,
    startAnchorsByParticipant: createStartAnchors(normalizedParticipantIds),
    shieldAnchorsByParticipant: createShieldAnchors(normalizedParticipantIds),
    branchCellIds: Object.freeze([]),
    specialCellIds: Object.freeze([]),
    extraHorizontalColumns: 0,
    goalPathLayout,
  });
}

export const FRANOORA_CASTLE_TOWN_MAP_CORE = Object.freeze({
  schema: FRANOORA_MAP_SCHEMA,
  mapId: BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN,
  displayName: 'フラノーラ城下町',
  rulesetId: BATTLE_RULESET_IDS.FRANOORA_GOAL,
  effectRulesetId: BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL,
  playerCount: PLAYER_COUNT,
  shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
  horizontalCellCount: HORIZONTAL_CELL_COUNT,
  straightCardTarget: STRAIGHT_CARD_TARGET,
  topmostRowAllGoal: true,
  branchCellCount: 0,
  specialCellCount: 0,
  extraHorizontalColumns: 0,
  legacyBoard109Inheritance: false,
  legacyFiveColumnInheritance: false,
  legacyMapFallbackAllowed: false,
  sevenStraightTerminalWin: false,
});
