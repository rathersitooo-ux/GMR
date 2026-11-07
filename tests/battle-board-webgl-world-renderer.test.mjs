import test from 'node:test';
import assert from 'node:assert/strict';

import { createBattleBoardWorldFieldRenderModel } from '../browser/battle-board-world-field-renderer.mjs';
import {
  BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT,
  BATTLE_BOARD_WEBGL_WORLD_RENDERER_SOURCES,
  battleWorldTerrainHeight,
  battleWorldVisualPrimitive,
  createBattleWorldDressingPlan,
  normalizeBattleWorldModel,
} from '../browser/battle-board-webgl-world-renderer.mjs';

test('real 3D renderer consumes the existing WORLD_FIELD model without taking gameplay authority', () => {
  const model = createBattleBoardWorldFieldRenderModel({
    worldBounds: { centerX: 0, centerZ: 0, width: 24, depth: 13.5, y: 0 },
  });
  const normalized = normalizeBattleWorldModel(model);
  assert.equal(normalized.renderSpace, 'WORLD_FIELD');
  assert.equal(normalized.presentationOnly, true);
  assert.equal(normalized.gameplayAuthority, false);
  assert.equal(normalized.movementAuthority, false);
  assert.equal(normalized.legalityAuthority, false);
  assert.ok(normalized.nodes.length >= 43);
  assert.ok(normalized.edges.length > 0);
  const terrainBentRoutes = normalized.edges.filter((edge) => Array.isArray(edge.waypoints) && edge.waypoints.length >= 3);
  assert.ok(terrainBentRoutes.length > 0);
  assert.ok(terrainBentRoutes.every((edge) => typeof edge.from === 'object' && typeof edge.to === 'object'));
});

test('terrain height is deterministic, finite, and produces actual elevation variation', () => {
  const samples = [
    battleWorldTerrainHeight(0, 0),
    battleWorldTerrainHeight(3, 1),
    battleWorldTerrainHeight(-4, 2.5),
    battleWorldTerrainHeight(7, -3),
  ];
  assert.ok(samples.every(Number.isFinite));
  assert.equal(samples[0], battleWorldTerrainHeight(0, 0));
  assert.ok(new Set(samples.map((value) => value.toFixed(6))).size > 1);
});

test('dressing plan reduces scene density for low-performance mode', () => {
  const model = createBattleBoardWorldFieldRenderModel();
  const full = createBattleWorldDressingPlan(model, { lowPerformance: false });
  const low = createBattleWorldDressingPlan(model, { lowPerformance: true });
  assert.ok(full.trees.length > low.trees.length);
  assert.ok(full.rocks.length > low.rocks.length);
  assert.equal(full.landmarks.length, 3);
  assert.equal(low.landmarks.length, 3);
});

test('renderer contract pins the graphics engine but does not create a second board engine', () => {
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.engine, 'BABYLON_WEBGL');
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.pinnedBabylonVersion, '9.27.1');
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.secondBoardEngine, false);
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.remoteAssetPreview, false);
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.shieldPresentationConsumed, true);
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.worldInteractionOverlay, true);
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_SOURCES.remoteAssetPreview, false);
  assert.equal(BATTLE_BOARD_WEBGL_WORLD_RENDERER_SOURCES.proceduralDressing, true);
});

test('wrong render-space or authority is rejected instead of silently becoming a new board source', () => {
  assert.throws(() => normalizeBattleWorldModel({ renderSpace: 'SCREEN_SPACE' }), /MODEL_SPACE_INVALID/);
  assert.throws(() => normalizeBattleWorldModel({
    renderSpace: 'WORLD_FIELD',
    screenSpaceBoardTopology: false,
    gameplayAuthority: true,
  }), /MODEL_AUTHORITY_INVALID/);
});

test('built card, shield, and gate state keep distinct 3D presentation semantics', () => {
  const model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P1:L': 7, 'P1:C': 2 } });
  const normalized = normalizeBattleWorldModel(model);
  const card = normalized.nodes.find((entry) => entry.kind === 'ACTUAL_BUILT_CARD');
  const openGate = normalized.nodes.find((entry) => entry.kind === 'ROUTE_GATE' && entry.state === 'OPEN_PASSABLE_FRAME');
  const closedGate = normalized.nodes.find((entry) => entry.kind === 'ROUTE_GATE' && entry.state === 'CLOSED_HEAVY_BARRIER');
  assert.ok(card); assert.ok(openGate); assert.ok(closedGate); assert.equal(normalized.shields.length, 12);
  assert.equal(battleWorldVisualPrimitive(card).primitive, 'BUILT_CARD');
  assert.equal(battleWorldVisualPrimitive(openGate).primitive, 'OPEN_GATE_FRAME');
  assert.equal(battleWorldVisualPrimitive(closedGate).primitive, 'CLOSED_GATE_BARRIER');
  assert.equal(battleWorldVisualPrimitive(normalized.shields[0]).primitive, 'SHIELD_FACE');
});
