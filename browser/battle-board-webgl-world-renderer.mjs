const SCHEMA = 'gameroad.battle-board-webgl-world-renderer.v1';
const BABYLON_VERSION = '9.27.1';
const BABYLON_CORE_SRC = `https://cdn.jsdelivr.net/npm/babylonjs@${BABYLON_VERSION}/babylon.js`;

const MATERIAL_COLORS = Object.freeze({
  terrain: '#4b6b3f',
  terrainLow: '#36533a',
  water: '#176a88',
  route: '#d8c58c',
  node: '#f1e8c8',
  nodeRing: '#715f3d',
  goal: '#e6bf58',
  gateClosed: '#665f59',
  gateOpen: '#79c49d',
  trunk: '#5d3c28',
  leaf: '#315a36',
  rock: '#696f70',
  villageWall: '#d7c5a1',
  villageRoof: '#7d4d3f',
});

export const BATTLE_BOARD_WEBGL_WORLD_RENDERER_SOURCES = Object.freeze({
  babylonVersion: BABYLON_VERSION,
  babylonCore: BABYLON_CORE_SRC,
  remoteAssetPreview: false,
  proceduralDressing: true,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorHex(B, value) {
  return B.Color3.FromHexString(value);
}

function hash01(value) {
  let x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  x -= Math.floor(x);
  return x;
}

export function battleWorldTerrainHeight(x, z) {
  const nx = finite(x);
  const nz = finite(z);
  const broad = Math.sin(nx * 0.17) * 0.32 + Math.cos(nz * 0.21) * 0.28;
  const detail = Math.sin((nx + nz) * 0.39) * 0.12 + Math.cos((nx - nz) * 0.31) * 0.1;
  const basin = -0.28 * Math.exp(-((nx * nx) + (nz * nz)) / 70);
  return broad + detail + basin;
}

export function normalizeBattleWorldModel(model) {
  if (!model || typeof model !== 'object') throw new TypeError('BATTLE_BOARD_WORLD_MODEL_REQUIRED');
  if (model.renderSpace !== 'WORLD_FIELD' || model.screenSpaceBoardTopology !== false) {
    throw new TypeError('BATTLE_BOARD_WORLD_MODEL_SPACE_INVALID');
  }
  if (model.gameplayAuthority !== false || model.movementAuthority !== false || model.legalityAuthority !== false) {
    throw new TypeError('BATTLE_BOARD_WORLD_MODEL_AUTHORITY_INVALID');
  }
  const nodeEntries = [];
  const seen = new Set();
  const addNode = (entry) => {
    const { id, world, kind } = entry ?? {};
    if (typeof id !== 'string' || !world || ![world.x, world.y, world.z].every(Number.isFinite) || seen.has(id)) return;
    seen.add(id);
    nodeEntries.push(Object.freeze({
      id, kind, laneKey: entry.laneKey ?? null,
      stageIndex: Number.isSafeInteger(entry.stageIndex) ? entry.stageIndex : null,
      semanticType: entry.semanticType ?? null, state: entry.state ?? null,
      world: Object.freeze({ x: world.x, y: world.y, z: world.z }),
    }));
  };
  for (const cell of model.roundCells ?? []) addNode(cell);
  for (const gate of model.gates ?? []) addNode(gate);
  if (model.sharedGoal?.id && model.sharedGoal?.world) addNode(model.sharedGoal);
  return deepFreeze({
    schema: SCHEMA,
    renderSpace: model.renderSpace,
    nodes: nodeEntries,
    edges: (model.edges ?? []).map((edge) => Object.freeze({
      id: edge.id,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      waypoints: Object.freeze([...(edge.waypoints ?? [])]),
    })),
    goalBranches: (model.goalBranches ?? []).map((edge) => Object.freeze({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      waypoints: Object.freeze([...(edge.waypoints ?? [])]),
      visualState: edge.visualState,
    })),
    gates: Object.freeze([...(model.gates ?? [])]),
    shields: Object.freeze((model.shields ?? []).filter((entry) => (
      typeof entry?.id === 'string' && entry?.world
      && [entry.world.x, entry.world.y, entry.world.z].every(Number.isFinite)
    )).map((entry) => Object.freeze({
      id: entry.id, kind: entry.kind, laneKey: entry.laneKey ?? null,
      world: Object.freeze({ x: entry.world.x, y: entry.world.y, z: entry.world.z }),
    }))),
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
  });
}

export function createBattleWorldDressingPlan(model, { lowPerformance = false } = {}) {
  const normalized = normalizeBattleWorldModel(model);
  const points = normalized.nodes.map((entry) => entry.world);
  const minX = points.length ? Math.min(...points.map((p) => p.x)) : -10;
  const maxX = points.length ? Math.max(...points.map((p) => p.x)) : 10;
  const minZ = points.length ? Math.min(...points.map((p) => p.z)) : -6;
  const maxZ = points.length ? Math.max(...points.map((p) => p.z)) : 6;
  const width = Math.max(8, maxX - minX);
  const depth = Math.max(6, maxZ - minZ);
  const treeCount = lowPerformance ? 18 : 48;
  const rockCount = lowPerformance ? 7 : 18;
  const trees = [];
  const rocks = [];
  for (let index = 0; index < treeCount; index += 1) {
    const rx = hash01(index * 2 + 1);
    const rz = hash01(index * 2 + 2);
    const x = minX - width * 0.1 + rx * width * 1.2;
    const z = minZ - depth * 0.12 + rz * depth * 1.24;
    const centerClear = Math.hypot(x, z) < Math.min(width, depth) * 0.16;
    if (centerClear) continue;
    trees.push(Object.freeze({ x, z, scale: 0.72 + hash01(index * 7 + 5) * 0.8, variant: index % 3 }));
  }
  for (let index = 0; index < rockCount; index += 1) {
    const x = minX - width * 0.08 + hash01(index * 11 + 3) * width * 1.16;
    const z = minZ - depth * 0.08 + hash01(index * 13 + 7) * depth * 1.16;
    rocks.push(Object.freeze({ x, z, scale: 0.35 + hash01(index * 17 + 1) * 0.65 }));
  }
  return deepFreeze({
    bounds: { minX, maxX, minZ, maxZ, width, depth },
    trees,
    rocks,
    landmarks: [
      { id: 'village', x: minX + width * 0.24, z: minZ + depth * 0.34, kind: 'VILLAGE' },
      { id: 'tower', x: maxX - width * 0.2, z: minZ + depth * 0.24, kind: 'TOWER' },
      { id: 'ruins', x: maxX - width * 0.16, z: maxZ - depth * 0.2, kind: 'RUINS' },
    ],
  });
}

function loadScript(document, src, marker) {
  const existing = document.querySelector?.(`script[data-gameroad-world-dep="${marker}"]`);
  if (existing?.dataset?.loaded === 'true') return Promise.resolve();
  if (existing?.__gameroadPromise) return existing.__gameroadPromise;
  const script = existing ?? document.createElement('script');
  script.src = src;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.dataset.gameroadWorldDep = marker;
  const promise = new Promise((resolve, reject) => {
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`BATTLE_WORLD_DEPENDENCY_LOAD_FAILED:${marker}`)), { once: true });
  });
  script.__gameroadPromise = promise;
  if (!existing) (document.head ?? document.documentElement).appendChild(script);
  return promise;
}

async function ensureBabylon(global) {
  const document = global?.document;
  if (!document?.createElement) throw new TypeError('BATTLE_WORLD_DOCUMENT_REQUIRED');
  if (!global.BABYLON?.Engine) await loadScript(document, BABYLON_CORE_SRC, 'babylon-core-9.27.1');
  if (!global.BABYLON?.Engine || !global.BABYLON?.Scene) throw new Error('BATTLE_WORLD_BABYLON_UNAVAILABLE');
  return global.BABYLON;
}

function terrainY(x, z, lift = 0) {
  return battleWorldTerrainHeight(x, z) + lift;
}

function makeMaterial(B, scene, name, hex, { alpha = 1, rough = true } = {}) {
  const material = new B.StandardMaterial(name, scene);
  material.diffuseColor = colorHex(B, hex);
  material.specularColor = rough ? new B.Color3(0.04, 0.04, 0.04) : new B.Color3(0.18, 0.18, 0.18);
  material.alpha = alpha;
  return material;
}

function createTerrain(B, scene, bounds, lowPerformance) {
  const width = Math.max(12, bounds.width * 1.35);
  const depth = Math.max(9, bounds.depth * 1.5);
  const subdivisions = lowPerformance ? 20 : 42;
  const ground = B.MeshBuilder.CreateGround('gr-world-terrain', { width, height: depth, subdivisions, updatable: true }, scene);
  const positions = ground.getVerticesData(B.VertexBuffer.PositionKind);
  if (positions) {
    for (let index = 0; index < positions.length; index += 3) {
      positions[index + 1] = battleWorldTerrainHeight(positions[index], positions[index + 2]);
    }
    ground.updateVerticesData(B.VertexBuffer.PositionKind, positions);
    ground.convertToFlatShadedMesh();
  }
  ground.material = makeMaterial(B, scene, 'gr-world-terrain-material', MATERIAL_COLORS.terrain);
  ground.receiveShadows = !lowPerformance;

  const water = B.MeshBuilder.CreateGround('gr-world-water', { width: width * 1.65, height: depth * 1.65, subdivisions: 1 }, scene);
  water.position.y = -0.62;
  water.material = makeMaterial(B, scene, 'gr-world-water-material', MATERIAL_COLORS.water, { alpha: 0.82, rough: false });
  return { ground, water };
}

function createRoute(B, scene, edge, material) {
  const sourcePoints = [edge.from, ...(edge.waypoints ?? []), edge.to].filter(Boolean);
  if (sourcePoints.length < 2) return null;
  const path = sourcePoints.map((p) => new B.Vector3(p.x, terrainY(p.x, p.z, 0.12), p.z));
  const tube = B.MeshBuilder.CreateTube(`gr-route-${edge.id}`, { path, radius: 0.055, tessellation: 7, cap: B.Mesh.CAP_ALL }, scene);
  tube.material = material;
  tube.isPickable = false;
  return tube;
}

export function battleWorldVisualPrimitive(entry = {}) {
  if (entry.kind === 'ACTUAL_BUILT_CARD') return Object.freeze({ primitive: 'BUILT_CARD', material: 'builtCard' });
  if (entry.kind === 'ROUTE_GATE' && entry.state === 'OPEN_PASSABLE_FRAME') return Object.freeze({ primitive: 'OPEN_GATE_FRAME', material: 'gateOpen' });
  if (entry.kind === 'ROUTE_GATE') return Object.freeze({ primitive: 'CLOSED_GATE_BARRIER', material: 'gateClosed' });
  if (entry.kind === 'SHIELD_GATE_FACE') return Object.freeze({ primitive: 'SHIELD_FACE', material: 'shield' });
  if (entry.kind === 'SHARED_GOAL') return Object.freeze({ primitive: 'GOAL', material: 'goal' });
  return Object.freeze({ primitive: 'ROUND_CELL', material: 'node' });
}

function createGate(B, scene, entry, materials, open) {
  const root = new B.TransformNode('gr-gate-' + entry.id, scene);
  root.position.set(entry.world.x, terrainY(entry.world.x, entry.world.z, 0.03), entry.world.z);
  if (open) {
    for (const side of [-1, 1]) {
      const post = B.MeshBuilder.CreateBox('gr-gate-post-' + entry.id + '-' + side, { width: 0.075, height: 0.38, depth: 0.09 }, scene);
      post.parent = root; post.position.set(side * 0.15, 0.19, 0); post.material = materials.gateOpen; post.isPickable = false;
    }
    const lintel = B.MeshBuilder.CreateBox('gr-gate-lintel-' + entry.id, { width: 0.38, height: 0.075, depth: 0.09 }, scene);
    lintel.parent = root; lintel.position.set(0, 0.37, 0); lintel.material = materials.gateOpen; lintel.isPickable = false;
  } else {
    const barrier = B.MeshBuilder.CreateBox('gr-gate-barrier-' + entry.id, { width: 0.4, height: 0.32, depth: 0.1 }, scene);
    barrier.parent = root; barrier.position.set(0, 0.16, 0); barrier.material = materials.gateClosed; barrier.isPickable = false;
  }
  return root;
}

function createNode(B, scene, entry, materials) {
  const visual = battleWorldVisualPrimitive(entry);
  if (visual.primitive === 'OPEN_GATE_FRAME') return createGate(B, scene, entry, materials, true);
  if (visual.primitive === 'CLOSED_GATE_BARRIER') return createGate(B, scene, entry, materials, false);
  if (visual.primitive === 'BUILT_CARD') {
    const card = B.MeshBuilder.CreateBox('gr-built-card-' + entry.id, { width: 0.28, height: 0.075, depth: 0.42 }, scene);
    card.position.set(entry.world.x, terrainY(entry.world.x, entry.world.z, 0.11), entry.world.z);
    card.material = materials.builtCard; card.isPickable = false; return card;
  }
  const goal = visual.primitive === 'GOAL';
  const cylinder = B.MeshBuilder.CreateCylinder('gr-node-' + entry.id, {
    height: goal ? 0.22 : 0.13, diameter: goal ? 0.54 : 0.32, tessellation: lowPolySegments(scene),
  }, scene);
  cylinder.position.set(entry.world.x, terrainY(entry.world.x, entry.world.z, goal ? 0.18 : 0.12), entry.world.z);
  cylinder.material = goal ? materials.goal : materials.node; cylinder.isPickable = false; return cylinder;
}

function createShield(B, scene, entry, materials, index) {
  const shield = B.MeshBuilder.CreateBox('gr-shield-' + entry.id, { width: 0.25, height: 0.31, depth: 0.055 }, scene);
  shield.position.set(entry.world.x, terrainY(entry.world.x, entry.world.z, 0.42), entry.world.z + 0.16);
  shield.rotation.y = ((index % 3) - 1) * 0.08; shield.material = materials.shield; shield.isPickable = false; return shield;
}
function lowPolySegments(scene) {
  return scene?.metadata?.lowPerformance ? 8 : 14;
}

function createFallbackTree(B, scene, root, index, entry, materials) {
  const trunk = B.MeshBuilder.CreateCylinder(`gr-tree-trunk-${index}`, { height: 0.75 * entry.scale, diameterTop: 0.09 * entry.scale, diameterBottom: 0.13 * entry.scale, tessellation: 6 }, scene);
  trunk.parent = root;
  trunk.position.set(entry.x, terrainY(entry.x, entry.z, 0.36 * entry.scale), entry.z);
  trunk.material = materials.trunk;
  const crown = B.MeshBuilder.CreateCylinder(`gr-tree-crown-${index}`, { height: 1.05 * entry.scale, diameterTop: 0.05, diameterBottom: 0.72 * entry.scale, tessellation: 7 }, scene);
  crown.parent = root;
  crown.position.set(entry.x, terrainY(entry.x, entry.z, 1.13 * entry.scale), entry.z);
  crown.material = materials.leaf;
}

function createFallbackRock(B, scene, root, index, entry, materials) {
  const rock = B.MeshBuilder.CreatePolyhedron(`gr-rock-${index}`, { type: 1, size: entry.scale * 0.48 }, scene);
  rock.parent = root;
  rock.position.set(entry.x, terrainY(entry.x, entry.z, entry.scale * 0.17), entry.z);
  rock.scaling.y = 0.65;
  rock.rotation.y = hash01(index * 19 + 4) * Math.PI;
  rock.material = materials.rock;
}

function createVillage(B, scene, root, landmark, materials) {
  const baseY = terrainY(landmark.x, landmark.z);
  for (let index = 0; index < 3; index += 1) {
    const dx = (index - 1) * 0.72;
    const house = B.MeshBuilder.CreateBox(`gr-village-house-${index}`, { width: 0.62, height: 0.46, depth: 0.52 }, scene);
    house.parent = root;
    house.position.set(landmark.x + dx, baseY + 0.23, landmark.z + (index % 2) * 0.32);
    house.material = materials.villageWall;
    const roof = B.MeshBuilder.CreateCylinder(`gr-village-roof-${index}`, { height: 0.56, diameter: 0.62, tessellation: 3 }, scene);
    roof.parent = root;
    roof.rotation.z = Math.PI / 2;
    roof.position.set(house.position.x, baseY + 0.58, house.position.z);
    roof.material = materials.villageRoof;
  }
}

function createTower(B, scene, root, landmark, materials) {
  const baseY = terrainY(landmark.x, landmark.z);
  const tower = B.MeshBuilder.CreateCylinder('gr-landmark-tower', { height: 1.55, diameter: 0.7, tessellation: 10 }, scene);
  tower.parent = root;
  tower.position.set(landmark.x, baseY + 0.78, landmark.z);
  tower.material = materials.villageWall;
  const roof = B.MeshBuilder.CreateCylinder('gr-landmark-tower-roof', { height: 0.72, diameterTop: 0, diameterBottom: 0.85, tessellation: 10 }, scene);
  roof.parent = root;
  roof.position.set(landmark.x, baseY + 1.82, landmark.z);
  roof.material = materials.villageRoof;
}

function createRuins(B, scene, root, landmark, materials) {
  const baseY = terrainY(landmark.x, landmark.z);
  for (let index = 0; index < 4; index += 1) {
    const pillar = B.MeshBuilder.CreateBox(`gr-ruin-${index}`, { width: 0.16, height: 0.7 + (index % 2) * 0.25, depth: 0.16 }, scene);
    pillar.parent = root;
    pillar.position.set(landmark.x + (index % 2) * 0.55, baseY + pillar.scaling.y * 0.4 + 0.35, landmark.z + Math.floor(index / 2) * 0.5);
    pillar.material = materials.rock;
  }
}

export async function createBattleBoardWebglWorldRenderer({
  canvas,
  global = globalThis,
  lowPerformance = false,
  reducedMotion = false,
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('BATTLE_WORLD_CANVAS_REQUIRED');
  const B = await ensureBabylon(global);
  const engine = new B.Engine(canvas, !lowPerformance, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: !lowPerformance,
    adaptToDeviceRatio: true,
  });
  const scene = new B.Scene(engine);
  scene.metadata = { lowPerformance: Boolean(lowPerformance) };
  scene.clearColor = new B.Color4(0.06, 0.13, 0.16, 1);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = lowPerformance ? 0.008 : 0.012;
  scene.fogColor = new B.Color3(0.42, 0.54, 0.58);

  const camera = new B.ArcRotateCamera('gr-world-camera', -Math.PI / 2.7, 0.92, 18, new B.Vector3(0, 0, 0), scene);
  camera.lowerRadiusLimit = 7;
  camera.upperRadiusLimit = 34;
  camera.lowerBetaLimit = 0.42;
  camera.upperBetaLimit = 1.34;
  camera.wheelPrecision = 60;
  camera.panningSensibility = 0;
  camera.inputs.clear();

  const hemi = new B.HemisphericLight('gr-world-hemi', new B.Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.88;
  const sun = new B.DirectionalLight('gr-world-sun', new B.Vector3(-0.4, -1, 0.45), scene);
  sun.position = new B.Vector3(8, 16, -10);
  sun.intensity = 1.2;

  const materials = Object.freeze({
    route: makeMaterial(B, scene, 'gr-world-route-material', MATERIAL_COLORS.route),
    node: makeMaterial(B, scene, 'gr-world-node-material', MATERIAL_COLORS.node),
    builtCard: makeMaterial(B, scene, 'gr-world-built-card-material', MATERIAL_COLORS.goal, { rough: false }),
    goal: makeMaterial(B, scene, 'gr-world-goal-material', MATERIAL_COLORS.goal, { rough: false }),
    gateClosed: makeMaterial(B, scene, 'gr-world-gate-closed-material', MATERIAL_COLORS.gateClosed),
    gateOpen: makeMaterial(B, scene, 'gr-world-gate-open-material', MATERIAL_COLORS.gateOpen, { rough: false }),
    shield: makeMaterial(B, scene, 'gr-world-shield-material', MATERIAL_COLORS.nodeRing, { rough: false }),
    overlayCurrent: makeMaterial(B, scene, 'gr-world-overlay-current', '#fff2a8', { rough: false }),
    overlayNext: makeMaterial(B, scene, 'gr-world-overlay-next', '#8fffd0', { rough: false }),
    overlayPath: makeMaterial(B, scene, 'gr-world-overlay-path', '#f0c85a', { rough: false }),
    overlayReachable: makeMaterial(B, scene, 'gr-world-overlay-reachable', '#d9fff0', { rough: false }),
    trunk: makeMaterial(B, scene, 'gr-world-trunk-material', MATERIAL_COLORS.trunk),
    leaf: makeMaterial(B, scene, 'gr-world-leaf-material', MATERIAL_COLORS.leaf),
    rock: makeMaterial(B, scene, 'gr-world-rock-material', MATERIAL_COLORS.rock),
    villageWall: makeMaterial(B, scene, 'gr-world-village-wall', MATERIAL_COLORS.villageWall),
    villageRoof: makeMaterial(B, scene, 'gr-world-village-roof', MATERIAL_COLORS.villageRoof),
  });

  let boardRoot = null;
  let terrainMeshes = [];
  let interactionRoot = null;
  let lastModel = null;
  let lastInteractionOverlay = null;
  let interactionState = Object.freeze({ complete: false, applied: 0, unresolvedNodeIds: [] });
  let nodeWorldById = new Map();
  let destroyed = false;

  function clearInteractionOverlay() {
    interactionRoot?.dispose?.(false, true); interactionRoot = null;
  }

  function applyInteractionOverlay(overlay = {}) {
    if (destroyed) throw new Error('BATTLE_WORLD_RENDERER_DESTROYED');
    const entries = Array.isArray(overlay?.overlays) ? overlay.overlays : [];
    lastInteractionOverlay = overlay; clearInteractionOverlay();
    interactionRoot = new B.TransformNode('gr-world-interaction-root', scene); interactionRoot.parent = boardRoot;
    const unresolvedNodeIds = []; let applied = 0;
    for (const entry of entries) {
      const world = nodeWorldById.get(entry?.nodeId);
      if (!world) { if (typeof entry?.nodeId === 'string') unresolvedNodeIds.push(entry.nodeId); continue; }
      const role = entry.primaryRole;
      const material = role === 'CURRENT' ? materials.overlayCurrent : role === 'NEXT' ? materials.overlayNext : role === 'PATH' ? materials.overlayPath : materials.overlayReachable;
      const ring = B.MeshBuilder.CreateTorus('gr-world-interaction-' + entry.nodeId, { diameter: role === 'CURRENT' ? 0.54 : 0.46, thickness: role === 'CURRENT' ? 0.055 : 0.04, tessellation: lowPolySegments(scene) }, scene);
      ring.parent = interactionRoot; ring.position.set(world.x, terrainY(world.x, world.z, 0.19), world.z); ring.material = material; ring.isPickable = false; applied += 1;
    }
    interactionState = deepFreeze({ complete: unresolvedNodeIds.length === 0, applied, unresolvedNodeIds, presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
    return interactionState;
  }

  async function replaceBoard(model) {
    if (destroyed) throw new Error('BATTLE_WORLD_RENDERER_DESTROYED');
    const normalized = normalizeBattleWorldModel(model);
    lastModel = model;
    clearInteractionOverlay();
    if (boardRoot) boardRoot.dispose(false, true);
    terrainMeshes.forEach((mesh) => mesh.dispose?.());
    terrainMeshes = [];
    nodeWorldById = new Map();
    boardRoot = new B.TransformNode('gr-world-board-root', scene);

    const plan = createBattleWorldDressingPlan(model, { lowPerformance });
    const terrain = createTerrain(B, scene, plan.bounds, lowPerformance);
    terrain.ground.parent = boardRoot;
    terrain.water.parent = boardRoot;
    terrainMeshes = [terrain.ground, terrain.water];

    normalized.edges.forEach((edge) => {
      const route = createRoute(B, scene, edge, materials.route);
      if (route) route.parent = boardRoot;
    });
    normalized.goalBranches.forEach((edge) => {
      const route = createRoute(B, scene, edge, edge.visualState === 'STRONG_OPEN' ? materials.goal : materials.route);
      if (route) route.parent = boardRoot;
    });
    normalized.nodes.forEach((entry) => {
      const node = createNode(B, scene, entry, materials);
      node.parent = boardRoot;
      nodeWorldById.set(entry.id, entry.world);
    });
    normalized.shields.forEach((entry, index) => {
      const shield = createShield(B, scene, entry, materials, index);
      shield.parent = boardRoot;
    });

    const dressingRoot = new B.TransformNode('gr-world-dressing-root', scene);
    dressingRoot.parent = boardRoot;
    plan.trees.forEach((entry, index) => createFallbackTree(B, scene, dressingRoot, index, entry, materials));
    plan.rocks.forEach((entry, index) => createFallbackRock(B, scene, dressingRoot, index, entry, materials));
    for (const landmark of plan.landmarks) {
      if (landmark.kind === 'VILLAGE') createVillage(B, scene, dressingRoot, landmark, materials);
      else if (landmark.kind === 'TOWER') createTower(B, scene, dressingRoot, landmark, materials);
      else if (landmark.kind === 'RUINS') createRuins(B, scene, dressingRoot, landmark, materials);
    }

    camera.target.set(
      (plan.bounds.minX + plan.bounds.maxX) / 2,
      0,
      (plan.bounds.minZ + plan.bounds.maxZ) / 2,
    );
    camera.radius = Math.max(11, Math.max(plan.bounds.width, plan.bounds.depth) * 0.88);

    if (lastInteractionOverlay) applyInteractionOverlay(lastInteractionOverlay);
    return inspect();
  }

  function applyCameraView(state) {
    if (!state || destroyed) return false;
    const center = state.center ?? state.worldTransform?.center;
    const zoom = Number.isFinite(state.zoom) ? state.zoom : state.worldTransform?.zoom;
    const angle = Number.isFinite(state.angle) ? state.angle : state.worldTransform?.angle;
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
      camera.target.x = center.x;
      camera.target.z = center.y;
    }
    if (Number.isFinite(zoom)) camera.radius = clamp(22 / Math.max(0.35, zoom), camera.lowerRadiusLimit, camera.upperRadiusLimit);
    if (Number.isFinite(angle)) camera.beta = clamp((angle * Math.PI) / 180, camera.lowerBetaLimit, camera.upperBetaLimit);
    return true;
  }

  function inspect() {
    return deepFreeze({
      schema: SCHEMA,
      ready: !destroyed,
      renderSpace: 'WORLD_FIELD',
      engine: 'BABYLON_WEBGL',
      babylonVersion: BABYLON_VERSION,
      canvasConnected: Boolean(canvas.isConnected),
      lowPerformance: Boolean(lowPerformance),
      reducedMotion: Boolean(reducedMotion),
      remoteAssetPreview: false,
      interactionOverlay: interactionState,
      boardMounted: Boolean(boardRoot && lastModel),
      meshCount: scene.meshes?.length ?? 0,
      presentationOnly: true,
      gameplayAuthority: false,
      movementAuthority: false,
      legalityAuthority: false,
      gameStateWrite: false,
    });
  }

  engine.runRenderLoop(() => {
    if (!destroyed) scene.render();
  });

  const resize = () => {
    if (!destroyed) engine.resize();
  };
  global?.addEventListener?.('resize', resize);

  return Object.freeze({
    schema: SCHEMA,
    replaceBoard,
    applyCameraView,
    applyInteractionOverlay,
    inspect,
    resolveScene: () => scene,
    resolveCamera: () => camera,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      global?.removeEventListener?.('resize', resize);
      boardRoot?.dispose?.(false, true);
      scene.dispose();
      engine.dispose();
      return true;
    },
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    gameStateWrite: false,
  });
}

export const BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT = deepFreeze({
  schema: SCHEMA,
  engine: 'BABYLON_WEBGL',
  pinnedBabylonVersion: BABYLON_VERSION,
  consumesWorldFieldModel: true,
  secondBoardEngine: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
  gameStateWrite: false,
  terrainIsPresentationOnly: true,
  routesArePresentationOnly: true,
  remoteCc0PreviewIsFormalAsset: false,
  remoteAssetPreview: false,
  proceduralDressing: true,
  distinctBuiltCardPrimitive: true,
  distinctGateOpenClosedPrimitives: true,
  shieldPresentationConsumed: true,
  worldInteractionOverlay: true,
  lowPerformanceFallback: true,
  reducedMotionAware: true,
});
