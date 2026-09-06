import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFranooraCastleTownMap,
  FRANOORA_CASTLE_TOWN_MAP_CORE,
} from '../browser/franoora-castle-town-map-core.mjs';
import { projectNewBaseGoalPathConnections } from '../browser/new-base-goal-path-core.mjs';
import {
  BATTLE_MAP_IDS,
  BATTLE_RULESET_IDS,
  BATTLE_EFFECT_RULESET_IDS,
} from '../browser/battle-map-ruleset-core.mjs';

const participantIds = ['P1', 'P2', 'P3', 'P4'];

function emptyColumns() {
  return Array.from({ length: 12 }, () => []);
}

function sevenCards(prefix) {
  return Array.from({ length: 7 }, (_, index) => `${prefix}-${index + 1}`);
}

test('Franoora V1 uses exactly the delegated minimum 12 columns with four Shield-linked 3-lane groups', () => {
  const map = createFranooraCastleTownMap({ participantIds });

  assert.equal(map.mapId, BATTLE_MAP_IDS.FRANOORA_CASTLE_TOWN);
  assert.equal(map.displayName, 'フラノーラ城下町');
  assert.equal(map.rulesetId, BATTLE_RULESET_IDS.FRANOORA_GOAL);
  assert.equal(map.effectRulesetId, BATTLE_EFFECT_RULESET_IDS.FRANOORA_GOAL);
  assert.equal(map.playerCount, 4);
  assert.equal(map.horizontalCellCount, 12);
  assert.equal(map.extraHorizontalColumns, 0);
  assert.equal(map.shieldLinkedLanesPerPlayer, 3);
  assert.deepEqual(map.shieldLinkedLaneColumnsByParticipant, {
    P1: [0, 1, 2],
    P2: [3, 4, 5],
    P3: [6, 7, 8],
    P4: [9, 10, 11],
  });
});

test('Franoora V1 has one Start anchor per participant and no invented branches or special cells', () => {
  const map = createFranooraCastleTownMap({ participantIds });
  assert.equal(Object.keys(map.startAnchorsByParticipant).length, 4);
  assert.equal(Object.keys(map.shieldAnchorsByParticipant).length, 4);
  for (const participantId of participantIds) {
    assert.equal(typeof map.startAnchorsByParticipant[participantId], 'string');
    assert.equal(map.shieldAnchorsByParticipant[participantId].length, 3);
  }
  assert.deepEqual(map.branchCellIds, []);
  assert.deepEqual(map.specialCellIds, []);
});

test('all 12 top-row cells are GOAL cells and seven straight cards connect without terminal victory', () => {
  const map = createFranooraCastleTownMap({ participantIds });
  assert.deepEqual(map.goalRowColumnIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  const columns = emptyColumns();
  columns[10] = sevenCards('p4-middle');
  const projection = projectNewBaseGoalPathConnections(map.goalPathLayout, {
    straightCardIdsByColumn: columns,
  });

  assert.equal(projection.ok, true);
  assert.equal(projection.connectedGoalPaths.length, 1);
  assert.equal(projection.connectedGoalPaths[0].participantId, 'P4');
  assert.equal(projection.connectedGoalPaths[0].columnIndex, 10);
  assert.equal(projection.connectedGoalPaths[0].straightCardCount, 7);
  assert.equal(projection.connectedGoalPaths[0].connectedToGoal, true);
  assert.equal(projection.terminalWin, false);
});

test('six straight cards do not connect and player-lane symmetry holds across all 12 lanes', () => {
  const map = createFranooraCastleTownMap({ participantIds });

  for (const participantId of participantIds) {
    for (const columnIndex of map.shieldLinkedLaneColumnsByParticipant[participantId]) {
      const six = emptyColumns();
      six[columnIndex] = sevenCards(`${participantId}-${columnIndex}`).slice(0, 6);
      const sixProjection = projectNewBaseGoalPathConnections(map.goalPathLayout, {
        straightCardIdsByColumn: six,
      });
      assert.equal(sixProjection.connectedGoalPaths.length, 0);

      const seven = emptyColumns();
      seven[columnIndex] = sevenCards(`${participantId}-${columnIndex}`);
      const sevenProjection = projectNewBaseGoalPathConnections(map.goalPathLayout, {
        straightCardIdsByColumn: seven,
      });
      assert.equal(sevenProjection.connectedGoalPaths.length, 1);
      assert.equal(sevenProjection.connectedGoalPaths[0].participantId, participantId);
      assert.equal(sevenProjection.connectedGoalPaths[0].columnIndex, columnIndex);
      assert.equal(sevenProjection.terminalWin, false);
    }
  }
});

test('Franoora core explicitly refuses legacy board/topology inheritance', () => {
  assert.equal(FRANOORA_CASTLE_TOWN_MAP_CORE.legacyBoard109Inheritance, false);
  assert.equal(FRANOORA_CASTLE_TOWN_MAP_CORE.legacyFiveColumnInheritance, false);
  assert.equal(FRANOORA_CASTLE_TOWN_MAP_CORE.legacyMapFallbackAllowed, false);
  assert.equal(FRANOORA_CASTLE_TOWN_MAP_CORE.sevenStraightTerminalWin, false);
  assert.equal(FRANOORA_CASTLE_TOWN_MAP_CORE.topmostRowAllGoal, true);
});

test('Franoora map rejects missing, duplicate, or non-four-player participant identity', () => {
  assert.throws(() => createFranooraCastleTownMap(), /EXACTLY_FOUR_PARTICIPANTS_REQUIRED/);
  assert.throws(() => createFranooraCastleTownMap({ participantIds: ['P1', 'P2', 'P3'] }), /EXACTLY_FOUR_PARTICIPANTS_REQUIRED/);
  assert.throws(() => createFranooraCastleTownMap({ participantIds: ['P1', 'P2', 'P3', 'P3'] }), /UNIQUE_PARTICIPANT_IDS_REQUIRED/);
});
