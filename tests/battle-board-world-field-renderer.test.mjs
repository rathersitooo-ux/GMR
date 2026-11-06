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
  assert.equal(model.counts.gates, 12);
  assert.equal(model.counts.shields, 12);
  assert.equal(model.goalBranches.length, 12);
  assert.equal(model.roundCells.some((cell) => cell.id.startsWith('upper:')), false);
  assert.ok(model.roundCells.some((cell) => cell.id === 'lower:T0'));
  assert.ok(model.gates.every((gate) => gate.state === 'CLOSED_HEAVY_BARRIER'));

  model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P2:C': 3 } });
  assert.equal(model.counts.builtUpperCards, 3);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.deepEqual(model.roundCells.filter((cell) => cell.laneKey === 'P2:C').map((cell) => cell.stageIndex), [5, 6, 7]);
  assert.equal(model.roundCells.some((cell) => cell.id === 'upper:P2:C:4'), false);
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P2:C').state, 'CLOSED_HEAVY_BARRIER');
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

test('Gate and GOAL branch visual state opens only for the exact lane at seven actual cards', () => {
  const model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P1:L': 7, 'P1:C': 6 } });
  assert.equal(model.counts.builtUpperCards, 13);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.equal(model.roundCells.filter((cell) => cell.laneKey === 'P1:L').length, 7);
  assert.equal(model.roundCells.filter((cell) => cell.laneKey === 'P1:C').length, 6);
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P1:L').state, 'OPEN_PASSABLE_FRAME');
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P1:C').state, 'CLOSED_HEAVY_BARRIER');
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

import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
function renderItems(model) {
  let captured;
  const canvas={clientWidth:800,clientHeight:600,width:0,height:0};
  const label={hidden:true,style:{}};
  const context=vm.createContext({
    state:{match:{players:[{id:'P1'}]},settings:{lowPerf:false}},
    $:s=>s==='#fieldCanvas'?canvas:label,
    window:{devicePixelRatio:1},fieldProjection:new Map(),
    fieldCamera:()=>({}),fieldCameraState:null,fieldMVP:null,fieldViewSize:{},
    centerIds:()=>[],shieldId:(p,l)=>`S:${p}:${l}`,roadId:(p,l,d)=>`R:${p}:${l}:${d}`,
    nodeWorld:()=>({x:0,y:0,z:0}),project3:()=>({x:50,y:50}),
    fieldPlayerColor:()=>[.5,.5,.5],
    battleCentralWorldRuntimeR8:{worldFieldRenderModel:()=>model},
    initFieldGL:()=>({}),drawGrasslandGL:(_gl,items)=>{captured=items;},
  });
  const start=html.indexOf('function renderField3D(){');
  const end=html.indexOf('\nfunction renderRouteLine()',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(html.slice(start,end)+';renderField3D();',context);
  return captured;
}
function geometryContext() {
  const start=html.indexOf('/* BATTLE_BOARD_RING_VINE_GEOMETRY_R1 */');
  const end=html.indexOf('/* END_BATTLE_BOARD_RING_VINE_GEOMETRY_R1 */',start);
  assert.ok(start>=0&&end>start,'ring/vine geometry must be available to the existing renderer');
  const triangles=html.slice(html.indexOf('function pushLitTri('),html.indexOf('function fieldTerrainNormal('));
  const context=vm.createContext({});
  vm.runInContext(triangles+html.slice(start,end),context);
  return context;
}

test('actual new-board render keeps all 42 lower positions as hollow rings and the original 71 edge identities as vines',()=>{
  const model=createBattleBoardWorldFieldRenderModel({builtCountByLaneKey:{'P1:L':2}});
  const items=renderItems(model);
  const rings=items.filter(i=>i.kind==='liveWorldRing');
  const vines=items.filter(i=>i.kind==='liveWorldVine');
  assert.equal(rings.length,42);
  assert.equal(vines.length,71);
  assert.deepEqual(new Set(rings.map(i=>i.nodeId)),new Set(model.roundCells.filter(c=>c.region==='LOWER_SHARED_FIELD').map(c=>c.id)));
  assert.deepEqual(new Set(vines.map(i=>i.edgeId)),new Set(model.edges.filter(e=>e.region==='LOWER_SHARED_FIELD').map(e=>e.id)));
  for(const v of vines){
    const e=model.edges.find(e=>e.id===v.edgeId);
    assert.deepEqual(JSON.parse(JSON.stringify(v.points)),JSON.parse(JSON.stringify([e.from,...e.waypoints,e.to])));
  }
  assert.equal(items.filter(i=>i.kind==='liveWorldCell').length,2,'placed upper cards keep their existing presentation');
  assert.equal(items.filter(i=>i.kind==='liveWorldGate').length,12);
  assert.equal(items.filter(i=>i.kind==='liveWorldShield').length,12);
});

test('ring mesh leaves a real hole and never fills the stopping surface with a disc',()=>{
  const context=geometryContext();
  const mesh=[];
  context.appendWorldBoardAccentMesh(mesh,{kind:'liveWorldRing',x:2,y:.8,z:-1,radius:.24,width:.035},false);
  assert.ok(mesh.length>0&&mesh.length%27===0);
  for(let i=0;i<mesh.length;i+=9){
    assert.ok(mesh.slice(i,i+9).every(Number.isFinite));
    assert.ok(mesh[i+4]>.95,'ring top faces the existing overhead light');
    assert.ok(Math.hypot(mesh[i]-2,mesh[i+2]+1)>=.20,'no center vertex or solid-disc triangle');
  }
  for(let i=0;i<mesh.length;i+=27){
    const x=(mesh[i]+mesh[i+9]+mesh[i+18])/3;
    const z=(mesh[i+2]+mesh[i+11]+mesh[i+20])/3;
    assert.ok(Math.hypot(x-2,z+1)>.19,'triangle centroid stays outside the hole');
  }
});

test('vine mesh follows caller heights, keeps a clear center at both ring endpoints, and has a lighter low-performance form',()=>{
  const context=geometryContext();
  const item={kind:'liveWorldVine',edgeId:'test',points:[{x:0,y:1,z:0},{x:1,y:1.5,z:.3},{x:2,y:2,z:0}],radius:.24};
  const normal=[],low=[];
  context.appendWorldBoardAccentMesh(normal,item,false);
  context.appendWorldBoardAccentMesh(low,item,true);
  assert.ok(normal.length>low.length&&low.length>0);
  for(const mesh of [normal,low])for(let i=0;i<mesh.length;i+=9){
    assert.ok(mesh.slice(i,i+9).every(Number.isFinite));
    assert.ok(mesh[i+1]>=1&&mesh[i+1]<2.2,'height follows the supplied route, not a fixed floor');
    assert.ok(Math.hypot(mesh[i],mesh[i+2])>.18,'start ring center stays clear');
    assert.ok(Math.hypot(mesh[i]-2,mesh[i+2])>.18,'end ring center stays clear');
  }
});

test('new-board rings suppress duplicate legacy trails while the legacy-board renderer still draws its own trails',()=>{
  const context=geometryContext();let trails=0;
  Object.assign(context,{state:{settings:{lowPerf:false}},pushFieldTerrain:()=>{},pushFieldTrails:()=>trails++,pushGrasslandScenery:()=>0,pushLitBox:()=>{},fieldProgram:{},fieldLastStats:null});
  const start=html.indexOf('function drawGrasslandGL('),end=html.indexOf('\n\nfunction renderField3D()',start);
  vm.runInContext(html.slice(start,end),context);
  const gl=new Proxy({createBuffer:()=>({}),getAttribLocation:()=>0,getUniformLocation:()=>({})},{get:(o,k)=>k in o?o[k]:()=>{}});
  const camera={eye:[0,2,4],aspect:1,yBase:0,yGain:1};
  context.drawGrasslandGL(gl,[{kind:'liveWorldRing',x:0,y:0,z:0}],{},camera,800,600);
  assert.equal(trails,0,'the new board must not inherit a second cross-shaped trail field');
  context.drawGrasslandGL(gl,[],{},camera,800,600);
  assert.equal(trails,1,'legacy board route presentation remains available');
});

test('alternating vine leaves both face the overhead light along the existing lower-field routes',()=>{
  const context=geometryContext();
  const items=renderItems(createBattleBoardWorldFieldRenderModel());
  let leafVertices=0;
  for(const item of items.filter(i=>i.kind==='liveWorldVine')){
    const mesh=[];
    context.appendWorldBoardAccentMesh(mesh,item,false);
    for(let i=0;i<mesh.length;i+=9){
      if(mesh[i+6]!==.38||mesh[i+7]!==.54||mesh[i+8]!==.19)continue;
      leafVertices++;
      assert.ok(mesh[i+4]>0,'both sides of the vine must receive overhead lighting');
    }
  }
  assert.ok(leafVertices>0,'existing routes must exercise the leaf geometry');
});


test('each of the twelve upper lanes grows from its shared-field entrance toward GOAL with zero to seven real cards', () => {
  const stages = [[], [7], [6, 7], [5, 6, 7], [4, 5, 6, 7], [3, 4, 5, 6, 7], [2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7]];
  for (const player of ['P1', 'P2', 'P3', 'P4']) for (const lane of ['L', 'C', 'R']) {
    const key = `${player}:${lane}`;
    for (let count = 0; count <= 7; count++) {
      const model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { [key]: count } });
      const cards = model.roundCells.filter(cell => cell.laneKey === key);
      assert.deepEqual(cards.map(cell => cell.stageIndex), stages[count], `${key}: ${count} built cards`);
      assert.equal(model.counts.builtUpperCards, count, 'other lanes remain empty');
      assert.equal(model.counts.visibleFutureUpperSlots, 0, 'no unbuilt stopping surface appears');
      assert.equal(model.counts.lowerRoundCells, 42);
      assert.equal(model.edges.filter(edge => edge.region === 'LOWER_SHARED_FIELD').length, 71);
      const gate = model.gates.find(gate => gate.laneKey === key);
      assert.equal(gate.state, count === 7 ? 'OPEN_PASSABLE_FRAME' : 'CLOSED_HEAVY_BARRIER');
      const entrance = model.edges.find(edge => edge.id === `gate-edge:${key}:upper`);
      assert.equal(Boolean(entrance), count > 0, 'the first real card touches the entrance');
      if (count > 0) {
        assert.equal(entrance.fromId, `upper:${key}:7`);
        assert.ok(cards.at(-1).world.z < gate.world.z);
        for (let index = 1; index < cards.length; index++) assert.ok(cards[index - 1].world.z < cards[index].world.z);
      }
      assert.ok(model.edges.filter(edge => edge.region === 'UPPER_PROGRESSION').every(edge => cards.some(card => card.id === edge.fromId) && cards.some(card => card.id === edge.toId)));
      assert.equal(model.movementAuthority, false, 'presentation never grants traversal permission');
    }
  }
});
