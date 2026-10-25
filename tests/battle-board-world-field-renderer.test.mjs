import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleBoardWorldFieldRenderModel, mountBattleBoardWorldField } from '../browser/battle-board-world-field-renderer.mjs';

test('world-field render model keeps the lower shared field, Gate boundary and only actual built upper cards', () => {
  let model = createBattleBoardWorldFieldRenderModel({ worldBounds: { centerX: 0, centerZ: 0, width: 24, y: 0.15 } });
  assert.equal(model.renderSpace, 'WORLD_FIELD');
  assert.equal(model.screenSpaceBoardTopology, false);
  assert.equal(model.counts.sharedGoal, 1);
  assert.equal(model.counts.upperLanes, 12);
  assert.equal(model.counts.lowerRoundCells, 42);
  assert.equal(model.counts.builtUpperCards, 0);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.equal(model.counts.roundCells, 42);
  assert.equal(model.counts.gates, 1);
  assert.equal(model.counts.gateAnchors, 12);
  assert.equal(model.gates.length, 1);
  assert.equal(model.sharedGate.id, 'gate:shared');
  assert.equal(model.sharedGate.anchorIds.length, 12);
  assert.equal(model.counts.shields, 12);
  assert.equal(model.goalBranches.length, 12);
  assert.equal(model.roundCells.some((cell) => cell.id.startsWith('upper:')), false);
  assert.ok(model.roundCells.some((cell) => cell.id === 'lower:T0'));
  assert.ok(model.gates.every((gate) => gate.state === 'CLOSED_HEAVY_BARRIER'));

  model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P2:C': 3 } });
  assert.equal(model.counts.builtUpperCards, 3);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.deepEqual(model.roundCells.filter((cell) => cell.laneKey === 'P2:C').map((cell) => cell.stageIndex), [1, 2, 3]);
  assert.equal(model.roundCells.some((cell) => cell.id === 'upper:P2:C:4'), false);
  assert.equal(model.sharedGate.state, 'CLOSED_HEAVY_BARRIER');
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.movementAuthority, false);
});

test('bent lower-field source waypoints survive source-to-world projection instead of collapsing to the edge origin', () => {
  const bounds = { centerX: 2, centerZ: -3, width: 24, depth: 13.5, y: 0.2 };
  const model = createBattleBoardWorldFieldRenderModel({ worldBounds: bounds });
  const left = model.edges.find((edge) => edge.id === 'lower-edge:T0-L0');
  const right = model.edges.find((edge) => edge.id === 'lower-edge:T11-R1');

  assert.equal(left.waypoints.length, 1);
  assert.equal(right.waypoints.length, 1);
  assert.equal(left.sourceWaypoints.length, 1);
  assert.equal(right.sourceWaypoints.length, 1);
  assert.equal(left.routePresentation, 'SOURCE_REFERENCE_WAYPOINTS');
  assert.equal(right.routePresentation, 'SOURCE_REFERENCE_WAYPOINTS');

  const leftExpected = {
    x: bounds.centerX + ((110 / 1536) - 0.5) * bounds.width,
    y: bounds.y,
    z: bounds.centerZ + ((664 / 864) - 0.5) * bounds.depth,
  };
  const rightExpected = {
    x: bounds.centerX + ((1425 / 1536) - 0.5) * bounds.width,
    y: bounds.y,
    z: bounds.centerZ + ((665 / 864) - 0.5) * bounds.depth,
  };

  assert.ok(Math.abs(left.waypoints[0].x - leftExpected.x) < 1e-9);
  assert.ok(Math.abs(left.waypoints[0].y - leftExpected.y) < 1e-9);
  assert.ok(Math.abs(left.waypoints[0].z - leftExpected.z) < 1e-9);
  assert.ok(Math.abs(right.waypoints[0].x - rightExpected.x) < 1e-9);
  assert.ok(Math.abs(right.waypoints[0].y - rightExpected.y) < 1e-9);
  assert.ok(Math.abs(right.waypoints[0].z - rightExpected.z) < 1e-9);
  assert.notEqual(left.waypoints[0].z, left.from.z);
  assert.notEqual(right.waypoints[0].z, right.from.z);
});

test('straight canonical lower edges gain deterministic terrain bows without changing edge identity or endpoints', () => {
  const model = createBattleBoardWorldFieldRenderModel({
    worldBounds: { centerX: 0, centerZ: 0, width: 24, depth: 13.5, y: 0.15 },
  });
  const lowerEdges = model.edges.filter((edge) => edge.region === 'LOWER_SHARED_FIELD');
  const terrainBent = lowerEdges.filter((edge) => edge.routePresentation === 'DERIVED_TERRAIN_BOW');
  const sourceBent = lowerEdges.filter((edge) => edge.routePresentation === 'SOURCE_REFERENCE_WAYPOINTS');

  assert.equal(lowerEdges.length, 71);
  assert.equal(terrainBent.length, 69);
  assert.equal(sourceBent.length, 2);
  assert.equal(model.counts.terrainBentLowerEdges, 69);
  assert.equal(model.counts.sourceWaypointLowerEdges, 2);
  assert.ok(terrainBent.every((edge) => edge.sourceWaypoints.length === 0));
  assert.ok(terrainBent.every((edge) => edge.waypoints.length === 3));
  assert.ok(terrainBent.every((edge) => edge.waypoints.every((point) => point.derivedTerrainRoute === true)));
  assert.ok(lowerEdges.every((edge) => edge.canonicalVisualEdge === true));
  assert.ok(lowerEdges.every((edge) => edge.gameplayAuthority === false));
  assert.ok(lowerEdges.every((edge) => edge.movementAuthority === false));
  assert.ok(lowerEdges.every((edge) => edge.legalityAuthority === false));

  const sample = lowerEdges.find((edge) => edge.id === 'lower-edge:T1-T2');
  const fromCell = model.roundCells.find((cell) => cell.id === 'lower:T1');
  const toCell = model.roundCells.find((cell) => cell.id === 'lower:T2');
  assert.equal(sample.fromId, 'lower:T1');
  assert.equal(sample.toId, 'lower:T2');
  assert.deepEqual(sample.from, fromCell.world);
  assert.deepEqual(sample.to, toCell.world);

  const dx = sample.to.x - sample.from.x;
  const dz = sample.to.z - sample.from.z;
  const midpoint = sample.waypoints[1];
  const cross = (midpoint.x - sample.from.x) * dz - (midpoint.z - sample.from.z) * dx;
  assert.ok(Math.abs(cross) > 1e-6, 'derived route should visibly bow away from its canonical straight chord');
});

test('one shared Gate opens globally while only the completed lane connects to GOAL', () => {
  const model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P1:L': 7, 'P1:C': 6 } });
  assert.equal(model.counts.builtUpperCards, 13);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.equal(model.roundCells.filter((cell) => cell.laneKey === 'P1:L').length, 7);
  assert.equal(model.roundCells.filter((cell) => cell.laneKey === 'P1:C').length, 6);
  assert.equal(model.gates.length, 1);
  assert.equal(model.sharedGate.state, 'OPEN_PASSABLE_FRAME');
  assert.equal(model.gateAnchors.length, 12);
  assert.equal(new Set(model.gateAnchors.map((anchor) => anchor.sharedGateId)).size, 1);
  assert.equal(model.sharedGate.anchorIds.length, 12);
  assert.ok(model.gateAnchors.every((anchor) => anchor.countsAsGate === false));
  assert.equal(model.goalBranches.find((branch) => branch.id === 'goal-branch:P1:L').visualState, 'STRONG_OPEN');
  assert.equal(model.goalBranches.find((branch) => branch.id === 'goal-branch:P1:C').visualState, 'FAINT_READABLE');
});

test('mount hands one complete world-field model to the caller-owned renderer', () => {
  const calls = [];
  const runtime = mountBattleBoardWorldField({ worldRenderer: { replaceBoard(model) { calls.push(model); } } });
  assert.equal(runtime.mounted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].renderSpace, 'WORLD_FIELD');
  assert.equal(calls[0].screenSpaceBoardTopology, false);
});

test('mount fails closed instead of falling back to screen-space UI', () => {
  const runtime = mountBattleBoardWorldField({});
  assert.equal(runtime.mounted, false);
  assert.equal(runtime.reason, 'WORLD_RENDERER_REQUIRED');
});

test('authoritative whole-board Gate state takes precedence over a local visual guess', () => {
  const model = createBattleBoardWorldFieldRenderModel({
    builtCountByLaneKey: { 'P1:L': 7 },
    goalPathProjection: { ok: true, gateOpen: false },
  });
  assert.equal(model.sharedGate.state, 'CLOSED_HEAVY_BARRIER');
  assert.equal(model.goalBranches.find((branch) => branch.id === 'goal-branch:P1:L').visualState, 'STRONG_OPEN');
  assert.equal(model.sharedGate.gameplayAuthority, false);
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ goalPathProjection: { ok: false, gateOpen: true } }),
    /BATTLE_BOARD_SHARED_GATE_PROJECTION_INVALID/,
  );
});

test('one cell keeps its own role while independent gimmick and Honey item occupy it', () => {
  const model = createBattleBoardWorldFieldRenderModel({
    cellRoles: { 'lower:L2': 'OWNABLE_LAND' },
    areas: { 'lower:L2': ['FOREST_FLOOR', 'CREEK_BANK'] },
    gimmicks: [{ id: 'g:1', nodeId: 'lower:L2', kind: 'SEASONAL_MECHANISM', active: true }],
    pickups: [{ id: 'h:1', nodeId: 'lower:L2', kind: 'HONEY', count: 3 }],
  });
  assert.equal(model.mechanicPresentations.cellRoles[0].roleId, 'OWNABLE_LAND');
  assert.deepEqual(model.mechanicPresentations.areas[0].areaIds, ['FOREST_FLOOR','CREEK_BANK']);
  assert.equal(model.mechanicPresentations.gimmicks[0].nodeId, 'lower:L2');
  assert.equal(model.mechanicPresentations.pickups[0].count, 3);
  assert.equal(model.mechanicPresentations.pickups[0].kind, 'HONEY');
  assert.equal(model.roundCells.find((c) => c.id === 'lower:L2').semanticType, 'UNRESOLVED_NO_INFERENCE');
  assert.equal(model.mechanicPresentations.pickups[0].gameplayAuthority, false);
  assert.equal(Object.isFrozen(model.mechanicPresentations), true);
  assert.equal(Object.isFrozen(model.mechanicPresentations.areas[0].areaIds), true);
});

test('no role or item is guessed from the visual board if no game-provided layers exist', () => {
  const model = createBattleBoardWorldFieldRenderModel();
  assert.equal(model.mechanicPresentations.cellRoles.length, 0);
  assert.equal(model.mechanicPresentations.areas.length, 0);
  assert.equal(model.mechanicPresentations.gimmicks.length, 0);
  assert.equal(model.mechanicPresentations.pickups.length, 0);
  assert.equal(model.roundCells.length, 42);
  assert.equal(model.sharedGoal.id, 'goal:shared');
  assert.equal(model.gates.length, 1);
});

test('reject unknown, unbuilt and duplicated visual item identifiers', () => {
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ cellRoles: { 'legacy:C:0': 'LAND' } }),
    /BATTLE_BOARD_MECHANIC_UNKNOWN_VISIBLE_NODE/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ pickups: [{ id: 'h', nodeId: 'upper:P1:L:7', kind: 'HONEY', count: 1 }] }),
    /BATTLE_BOARD_MECHANIC_UNKNOWN_VISIBLE_NODE/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ pickups: [{ id: 'h', nodeId: 'lower:T0', kind: 'HONEY', count: 0 }] }),
    /BATTLE_BOARD_INVALID_PICKUP_COUNT/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({
      gimmicks: [
        { id: 'g', nodeId: 'lower:T0', kind: 'TRAP' },
        { id: 'g', nodeId: 'lower:T1', kind: 'TRAP' },
      ],
    }),
    /BATTLE_BOARD_MECHANIC_INVALID_ITEM/,
  );
});

test('mount forwards authored mechanical layers without applying any effects', () => {
  const models = [];
  const r = mountBattleBoardWorldField({
    worldRenderer: { replaceBoard(model) { models.push(model); } },
    cellRoles: { 'lower:B4': 'VISIT_EVENT' },
    pickups: [{ id: 'h:2', nodeId: 'lower:B4', kind: 'HONEY', count: 2 }],
  });
  assert.equal(r.mounted, true);
  assert.equal(models[0].mechanicPresentations.cellRoles[0].roleId, 'VISIT_EVENT');
  assert.equal(models[0].mechanicPresentations.pickups[0].count, 2);
  assert.equal(models[0].gameplayAuthority, false);
  assert.equal(models[0].movementAuthority, false);
});

test('rider seat stays above the ride, with ground shadow on authoritative node', () => {
  const r = createBattleBoardWorldFieldRenderModel({
    controlledCharacters: [{
      participantId: 'P1', characterId: 'hero.example', nodeId: 'lower:T0',
      facing: 'right', ride: { assetId: 'ride.example', seatHeight: 0.63 },
    }],
  });
  const row = r.controlledCharacterRides[0];
  assert.equal(row.nodeId, 'lower:T0');
  assert.equal(row.ride.assetId, 'ride.example');
  assert.equal(row.ride.facing, 'right');
  assert.equal(row.coLocatedCount, 1);
  assert.deepEqual(row.groundWorld, row.nodeWorld);
  assert.deepEqual(row.contactShadowWorld, row.groundWorld);
  assert.deepEqual(row.ride.world, row.groundWorld);
  assert.deepEqual(row.ride.seatWorld, row.characterWorld);
  assert.ok(Math.abs(row.characterWorld.y - row.groundWorld.y - 0.63) < 1e-9);
  assert.equal(r.gameplayAuthority, false);
  assert.equal(r.movementAuthority, false);
  assert.equal(Object.isFrozen(row.ride), true);
});

test('on-foot character uses the same node without a fabricated ride', () => {
  const r = createBattleBoardWorldFieldRenderModel({
    controlledCharacters: [{
      participantId: 'P3', characterId: 'hero.onfoot',
      nodeId: 'lower:B4', facing: 'left',
    }],
  });
  const row = r.controlledCharacterRides[0];
  assert.equal(row.ride, null);
  assert.deepEqual(row.characterWorld, row.groundWorld);
  assert.equal(row.nodeId, 'lower:B4');
});

test('four co-located riders are visible separately but never split the game position', () => {
  const rows = ['P4','P2','P1','P3'].map((participantId) => ({
    participantId, characterId: 'hero.' + participantId,
    nodeId: 'lower:L2', facing: 'forward',
    ride: { assetId: 'ride.' + participantId, seatHeight: 0.35 },
  }));
  const first = createBattleBoardWorldFieldRenderModel({ controlledCharacters: rows });
  const second = createBattleBoardWorldFieldRenderModel({ controlledCharacters: [...rows].reverse() });
  assert.equal(first.controlledCharacterRides.length, 4);
  assert.equal(new Set(first.controlledCharacterRides.map((r) => r.nodeId)).size, 1);
  assert.equal(new Set(first.controlledCharacterRides.map((r) => `${r.groundWorld.x}:${r.groundWorld.z}`)).size, 4);
  const asOffsetMap = (model) => Object.fromEntries(model.controlledCharacterRides.map((r) => [
    r.participantId, r.groundWorld,
  ]));
  for (const participantId of ['P1', 'P2', 'P3', 'P4']) {
    assert.deepEqual(asOffsetMap(first)[participantId], asOffsetMap(second)[participantId]);
  }
  assert.ok(first.controlledCharacterRides.every((r) => r.visibilityOffsetOnly === true));
  assert.ok(first.controlledCharacterRides.every((r) => r.positionAuthority === 'CALLER_CONFIRMED_NEW_BOARD_NODE'));
});

test('ride rejects old map nodes, invisible future cards and invalid seats rather than guessing', () => {
  const base = { participantId: 'P1', characterId: 'hero', nodeId: 'lower:T0', facing: 'forward' };
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ controlledCharacters: [{ ...base, nodeId: 'CENTER:0' }] }),
    /BATTLE_BOARD_CHARACTER_PROJECTION_INVALID/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ controlledCharacters: [{ ...base, nodeId: 'upper:P1:L:7' }] }),
    /BATTLE_BOARD_CHARACTER_PROJECTION_INVALID/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ controlledCharacters: [{ ...base, ride: { assetId: 'ride.x' } }] }),
    /BATTLE_BOARD_RIDE_ASSET_OR_SEAT_INVALID/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ controlledCharacters: [{ ...base, ride: { assetId: 'ride.x', seatHeight: -0.1 } }] }),
    /BATTLE_BOARD_RIDE_ASSET_OR_SEAT_INVALID/,
  );
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ controlledCharacters: [base, base] }),
    /BATTLE_BOARD_CHARACTER_PROJECTION_INVALID/,
  );
});

test('completed progression cell and shared goal both support a rider; gate is not a stoppable character node', () => {
  const base = { participantId: 'P1', characterId: 'hero', nodeId: 'upper:P1:L:7', facing: 'forward' };
  const upper = createBattleBoardWorldFieldRenderModel({
    builtCountByLaneKey: { 'P1:L': 7 },
    controlledCharacters: [base],
  });
  assert.equal(upper.controlledCharacterRides[0].nodeId, 'upper:P1:L:7');
  assert.equal(upper.sharedGoal.id, 'goal:shared');
  const arrived = createBattleBoardWorldFieldRenderModel({
    controlledCharacters: [{ ...base, nodeId: 'goal:shared' }],
  });
  assert.equal(arrived.controlledCharacterRides[0].nodeId, 'goal:shared');
  assert.throws(
    () => createBattleBoardWorldFieldRenderModel({ controlledCharacters: [{ ...base, nodeId: 'gate:P1:L' }] }),
    /BATTLE_BOARD_CHARACTER_PROJECTION_INVALID/,
  );
});

test('world mount passes rider positions to renderer without changing rules', () => {
  let drawn = null;
  mountBattleBoardWorldField({
    worldRenderer: { replaceBoard(model) { drawn = model; } },
    controlledCharacters: [{ participantId: 'P1', characterId: 'hero', nodeId: 'lower:T1',
      facing: 'up', ride: { assetId: 'ride.one', seatHeight: 0.5 } }],
  });
  assert.equal(drawn.controlledCharacterRides.length, 1);
  assert.equal(drawn.controlledCharacterRides[0].ride.assetId, 'ride.one');
  assert.equal(drawn.movementAuthority, false);
});
