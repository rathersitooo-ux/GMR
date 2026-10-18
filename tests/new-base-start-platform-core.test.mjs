import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../browser/new-base-start-platform-core.mjs';
import { createBattleBoardVisualGraph } from '../browser/new-base-battle-board-visual-graph.mjs';

const ids = ['P1', 'P2', 'P3', 'P4'];
const make = (randomUint32 = () => 0) => core.createStartPlatformState({ matchId: 'match:1', participantIds: ids, randomUint32 });
const command = (state, overrides = {}) => {
  const participantId = 'P1', from = state.positionsByParticipant[participantId];
  return { participantId, path: [from, core.startPlatformNeighbors(state, from)[0]], movementBudget: 1, commandId: 'cmd:1', expectedRevision: state.revision, ...overrides };
};

test('exports four canonical anchors and immutable serializable unique assignments for all 24 shuffles', () => {
  assert.deepEqual(core.START_PLATFORMS.map(p => [p.id, p.destinationId, p.placementOrdinal]), [
    ['start:A', 'lower:B1', 35], ['start:B', 'lower:B3', 37], ['start:C', 'lower:B5', 39], ['start:D', 'lower:B7', 41],
  ]);
  const permutations = new Set();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
    const draws = [a, b, c];
    const state = make(() => draws.shift());
    permutations.add(ids.map(id => state.assignmentByParticipant[id]).join(','));
    assert.equal(new Set(Object.values(state.assignmentByParticipant)).size, 4);
    assert.ok(Object.isFrozen(state.positionsByParticipant));
    assert.deepEqual(core.restoreStartPlatformState(JSON.parse(JSON.stringify(state))), state);
  }
  assert.equal(permutations.size, 24);
});

test('entropy rejects bias and malformed sources with bounded retries', () => {
  const draws = [0, 0xffffffff, 0, 0];
  assert.doesNotThrow(() => make(() => draws.shift()));
  for (const value of [-1, 1.5, 0x100000000, NaN]) assert.throws(() => make(() => value));
  let calls = 0;
  assert.throws(() => make(() => ++calls === 1 ? 0 : 0xffffffff));
  assert.ok(calls <= 66);
  assert.throws(() => core.createStartPlatformState({ matchId: 'm', participantIds: ['a','a','b','c'], randomUint32: () => 0 }));
});

test('zero waits; drop costs one; two steps include the drop, without mutating previews', () => {
  const state = make(), cmd = command(state), before = JSON.stringify(state);
  const wait = core.validateStartPlatformPath(state, { ...cmd, path: [cmd.path[0]], movementBudget: 0 });
  assert.equal(wait.ok, true); assert.equal(wait.stepCount, 0);
  assert.equal(core.validateStartPlatformPath(state, { ...cmd, movementBudget: 0 }).ok, false);
  const one = core.validateStartPlatformPath(state, cmd);
  assert.equal(one.ok, true); assert.equal(one.remainingBudget, 0);
  const next = core.startPlatformNeighbors(state, cmd.path[1])[0];
  assert.equal(core.validateStartPlatformPath(state, { ...cmd, path: [...cmd.path, next] }).ok, false);
  assert.equal(core.validateStartPlatformPath(state, { ...cmd, path: [...cmd.path, next], movementBudget: 2 }).ok, true);
  assert.equal(JSON.stringify(state), before);
});

test('exact lower edges remain bidirectional; starts have only directed exits and no upper/legacy paths', () => {
  const state = make(), cmd = command(state), graph = createBattleBoardVisualGraph();
  for (const edge of graph.lowerEdges) {
    assert.ok(core.startPlatformNeighbors(state, edge.fromId).includes(edge.toId));
    assert.ok(core.startPlatformNeighbors(state, edge.toId).includes(edge.fromId));
  }
  for (const node of graph.lowerNodes) assert.ok(core.startPlatformNeighbors(state, node.id).every(id => id.startsWith('lower:')));
  for (const bad of ['start:A','start:B','start:C','start:D','lower:T0','C:0:0','upper:P1:L:1']) {
    if (bad !== cmd.path[1]) assert.equal(core.validateStartPlatformPath(state, { ...cmd, path: [cmd.path[0], bad] }).ok, false);
  }
  assert.deepEqual(core.startPlatformNeighbors(state, 'C:0:0'), []);
  assert.equal(core.validateStartPlatformPath(state, { ...cmd, path: [cmd.path[1]] }).ok, false);
  assert.equal(core.validateStartPlatformPath(state, { ...cmd, path: [...cmd.path, cmd.path[0]], movementBudget: 2 }).ok, false);
});

test('accepted departure consumes once, persists final position, and replay cannot recreate it', () => {
  const state = make(), cmd = command(state), out = core.acceptStartPlatformPath(state, cmd);
  assert.equal(out.ok, true); assert.equal(out.duplicate, false);
  assert.equal(out.state.revision, 1); assert.equal(out.remainingMovementBudget, 0);
  assert.equal(out.state.positionsByParticipant.P1, cmd.path[1]);
  assert.deepEqual(out.state.consumedPadIds, [cmd.path[0]]);
  assert.equal(out.events[0].type, 'START_PLATFORM_DEPARTED');
  assert.equal(out.events[0].platformId, cmd.path[0]);
  assert.equal(out.events[0].fromId, cmd.path[0]); assert.equal(out.events[0].toId, cmd.path[1]);
  assert.deepEqual(core.startPlatformNeighbors(out.state, cmd.path[0]), []);
  const restored = core.restoreStartPlatformState(JSON.parse(JSON.stringify(out.state)));
  const duplicate = core.acceptStartPlatformPath(restored, cmd);
  assert.equal(duplicate.ok, true); assert.equal(duplicate.duplicate, true); assert.deepEqual(duplicate.events, []);
  assert.deepEqual(duplicate.state, restored);
  assert.equal(core.acceptStartPlatformPath(restored, { ...cmd, movementBudget: 2 }).ok, false);
  assert.equal(core.acceptStartPlatformPath(restored, { ...cmd, commandId: 'cmd:2' }).ok, false);
  assert.equal(core.validateStartPlatformPath(restored, { participantId: 'P1', path: [cmd.path[1], cmd.path[0]], movementBudget: 1 }).ok, false);
  assert.deepEqual(state.consumedPadIds, []);
});

test('accepted wait preserves platform and malformed commands never write', () => {
  const state = make(), cmd = command(state), wait = { ...cmd, path: [cmd.path[0]], movementBudget: 0 };
  const out = core.acceptStartPlatformPath(state, wait);
  assert.equal(out.ok, true); assert.deepEqual(out.events, []); assert.deepEqual(out.state.consumedPadIds, []);
  for (const overrides of [{participantId:'missing'}, {path:[]}, {movementBudget:-1}, {movementBudget:1.2}, {commandId:''}, {expectedRevision:4}]) {
    const result = core.acceptStartPlatformPath(state, { ...cmd, ...overrides });
    assert.equal(result.ok, false); assert.equal(result.state, state);
  }
});

test('restore rejects inconsistent assignments positions consumption receipts and schema', () => {
  const state = make(), departed = core.acceptStartPlatformPath(state, command(state)).state;
  for (const mutate of [
    s => s.schema = 'other', s => s.revision++, s => s.matchId = '',
    s => s.assignmentByParticipant.P2 = s.assignmentByParticipant.P1,
    s => s.positionsByParticipant.P1 = 'C:0:0',
    s => s.positionsByParticipant.P1 = 'lower:B1',
    s => s.consumedPadIds.push(s.assignmentByParticipant.P1),
    s => s.receipts.push({}), s => s.extra = true,
  ]) { const copy = JSON.parse(JSON.stringify(state)); mutate(copy); assert.throws(() => core.restoreStartPlatformState(copy)); }
  const copy = JSON.parse(JSON.stringify(departed)); copy.consumedPadIds = [];
  assert.throws(() => core.restoreStartPlatformState(copy));
});

test('source placement follows graph anchor points and adds only temporary start geometry', () => {
  const graph = createBattleBoardVisualGraph();
  for (const platform of core.START_PLATFORMS) {
    const anchor = graph.lowerNodes.find(n => n.id === platform.destinationId);
    assert.deepEqual(core.startPlatformSourcePoint(anchor.id), {x:anchor.source.x,y:anchor.source.y,height:0.075});
    assert.deepEqual(core.startPlatformSourcePoint(platform.id), {x:anchor.source.x,y:anchor.source.y+240,height:1.4});
  }
  assert.equal(core.startPlatformSourcePoint('C:0:0'), null);
});

test('accepting or rejecting restored mutable transport data never freezes or mutates caller objects', () => {
  const state = JSON.parse(JSON.stringify(make())), cmd = command(state);
  const before = JSON.stringify(state);
  core.acceptStartPlatformPath(state, { ...cmd, movementBudget: 0 });
  assert.equal(Object.isFrozen(state), false);
  assert.equal(Object.isFrozen(state.positionsByParticipant), false);
  core.acceptStartPlatformPath(state, cmd);
  assert.equal(JSON.stringify(state), before);
  assert.equal(Object.isFrozen(state), false);
});

test('positive movement budget requires departure from own start, while zero and post-departure waits remain legal', () => {
  const state = make(), cmd = command(state), wait = { ...cmd, path: [cmd.path[0]] };
  const preview = core.validateStartPlatformPath(state, wait);
  assert.equal(preview.ok, false);
  assert.equal(preview.reason, 'START_DROP_REQUIRED');
  const rejected = core.acceptStartPlatformPath(state, wait);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'START_DROP_REQUIRED');
  assert.equal(rejected.state, state);
  assert.equal(core.validateStartPlatformPath(state, { ...wait, movementBudget: 0 }).ok, true);
  const departed = core.acceptStartPlatformPath(state, cmd).state;
  const ordinaryWait = { ...cmd, commandId: 'cmd:2', expectedRevision: departed.revision, path: [cmd.path[1]] };
  assert.equal(core.validateStartPlatformPath(departed, ordinaryWait).ok, true);
  assert.equal(core.acceptStartPlatformPath(departed, ordinaryWait).ok, true);
});

// Exercise the actual HTML consumer alongside the start-state core.
import fs from "node:fs";
import vm from "node:vm";
const starts=core;
const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
function bridge(){
  const a=html.indexOf('/* BATTLE_START_PLATFORM_BRIDGE_R1 */'),b=html.indexOf('/* END_BATTLE_START_PLATFORM_BRIDGE_R1 */');
  assert.ok(a>=0&&b>a,'actual HTML must mount the start-state bridge');
  const context=vm.createContext({...starts,createBattleBoardVisualGraph,state:{match:null,settings:{reduceMotion:true,lowPerf:false}},crypto:{getRandomValues:a=>(a[0]=0,a)},performance:{now:()=>0}});
  vm.runInContext(html.slice(a,b),context);return context;
}
const players=()=>['P1','P2','P3','P4'].map(id=>({id,position:'C:0:0'}));
test('actual match bridge gives four distinct new-board starts and leaves two-player mode alone',()=>{
  const c=bridge(),m={id:'m1',players:players()};c.initBattleStartPlatforms(m);
  assert.equal(new Set(m.players.map(p=>p.position)).size,4);
  assert.ok(m.players.every(p=>p.position.startsWith('start:')));
  assert.equal(c.battleStartNodeIds(m).length,46);
  assert.ok(c.battleStartNodeIds(m).every(id=>!id.startsWith('C:')&&!id.startsWith('R:')));
  const two={id:'m2',players:players().slice(0,2)};c.initBattleStartPlatforms(two);
  assert.equal(two.newBoardStart,undefined);assert.equal(two.players[0].position,'C:0:0');
});
test('accepted HTML movement bridge consumes one pad and retains the remaining path budget',()=>{
  const c=bridge(),m={id:'m1',round:1,resolutionSeq:1,players:players()};c.initBattleStartPlatforms(m);c.state.match=m;
  const p=m.players[0],from=p.position,to=starts.START_PLATFORMS.find(s=>s.id===from).destinationId;
  assert.equal(c.validateStartPlatformPath(m.newBoardStart,{participantId:p.id,path:[from,to],movementBudget:0}).ok,false);
  const accepted=c.commitBattleStartPath(p,[from,to],1);
  assert.equal(accepted.ok,true);assert.equal(accepted.remainingMovementBudget,0);
  assert.equal(c.battleStartNodeIds(m).length,45);
  assert.ok(!starts.startPlatformNeighbors(m.newBoardStart,to).includes(from));
  assert.equal(m.newBoardStart.positionsByParticipant[p.id],to);
  assert.equal(m.startPlatformBursts.length,1);
});
test('friend projection restore preserves assignment and vanished pads without rerolling',()=>{
  const c=bridge(),m={id:'m1',round:1,resolutionSeq:1,players:players()};c.initBattleStartPlatforms(m);c.state.match=m;
  const p=m.players[0],from=p.position,to=starts.START_PLATFORMS.find(s=>s.id===from).destinationId;
  c.commitBattleStartPath(p,[from,to],1);
  const copy={id:'friend-m1',players:players().reverse()};c.restoreBattleStartPlatforms(copy,JSON.parse(JSON.stringify(m.newBoardStart)));
  assert.equal(copy.players.find(x=>x.id===p.id).position,to);
  assert.deepEqual(JSON.parse(JSON.stringify(copy.newBoardStart)),JSON.parse(JSON.stringify(m.newBoardStart)));
  assert.equal(c.battleStartNodeIds(copy).length,45);
});
test('normal player route, host legality, and friend projection call the actual bridge',()=>{
  assert.ok(/initBattleStartPlatforms\(state\.match\)/.test(html));
  assert.ok(/newBoardStart:clone\(m\.newBoardStart\|\|null\)/.test(html));
  assert.ok(/restoreBattleStartPlatforms\(m,pr\.newBoardStart,pr\.matchInstanceId\)/.test(html));
  assert.ok(/validateStartPlatformPath\(state\.match\.newBoardStart/.test(html));
  assert.ok(/commitBattleStartPath\(p,path,/.test(html));
});
test('new circular nodes expose a movement-range surface',()=>{
  const a=html.indexOf('function nodeTopSurface('),b=html.indexOf('\nfunction ',a+1);
  const c=vm.createContext({nodeWorld:()=>({x:1,y:2,z:3}),posType:()=> 'field',project3:p=>p});
  vm.runInContext(html.slice(a,b),c);
  const surface=c.nodeTopSurface('lower:B1',{});
  assert.ok(surface&&surface.length>=12,'circular lower nodes need a visible range polygon');
  assert.ok(surface.every(p=>Math.hypot(p.x-1,p.z-3)<=.25));
});
test('drop tween updates the human sprite position without remounting it',async()=>{
  const c=bridge(),m={id:'m1',players:players()};c.initBattleStartPlatforms(m);c.state.match=m;c.state.settings.reduceMotion=false;
  const style={},seen=[];let frame=0;
  Object.assign(c,{$:()=>({style}),project3:p=>({x:p.x,y:p.y}),renderField3D:()=>{},renderBoard:()=>{},requestAnimationFrame:cb=>{cb(++frame*180);seen.push({...style})}});
  const p=m.players[0];p.human=true;const from=p.position,to=starts.START_PLATFORMS.find(s=>s.id===from).destinationId;
  await c.animateBattleStartDrop(p,from,to);
  assert.ok(seen.length>=2&&seen.every(s=>s.left&&s.top),'the human sprite must move during the drop frames');
  assert.equal(p.startDropVisual,undefined);
});
test('friend restore rejects a snapshot from another match before changing players',()=>{
  const c=bridge(),m={id:'m1',players:players()};c.initBattleStartPlatforms(m);
  const guest={id:'guest',players:players()};
  assert.throws(()=>c.restoreBattleStartPlatforms(guest,m.newBoardStart,'different-match'));
  assert.equal(guest.newBoardStart,undefined);
});
test('untouched first-turn path is forced through the sole exit only when movement is available',()=>{
  const c=bridge(),m={id:'m1',players:players()};c.initBattleStartPlatforms(m);c.state.match=m;const p=m.players[0];
  const from=p.position,to=starts.START_PLATFORMS.find(s=>s.id===from).destinationId;
  assert.deepEqual(Array.from(c.battleStartMandatoryPath(p,[from],1)),[from,to]);
  assert.deepEqual(Array.from(c.battleStartMandatoryPath(p,[from],0)),[from]);
  assert.deepEqual(Array.from(c.battleStartMandatoryPath(p,[from,to],2)),[from,to]);
});
test('host waits for imported start rules before mutating lobby state',async()=>{
  const a=html.indexOf('function hostStart(){'),b=html.indexOf('\n',a);
  let ready;const pending=new Promise(r=>ready=r),fr={role:'host',roomState:'lobby'};
  const c=vm.createContext({FR:fr,createStartPlatformState:undefined,battleStartRuntimeReady:pending,toast:()=>{}});
  vm.runInContext(html.slice(a,b),c);assert.equal(c.hostStart(),false);assert.equal(fr.roomState,'lobby');
  fr.role='guest';c.createStartPlatformState=()=>{};ready();await pending;await Promise.resolve();assert.equal(fr.roomState,'lobby');
});
test('guest buffers only latest projection while start rules load',async()=>{
  const a=html.indexOf('let pendingStartProjection=null;'),b=html.indexOf('\n',html.indexOf('function applyProjection(pr){',a));
  let ready;const pending=new Promise(r=>ready=r),applied=[];
  const c=vm.createContext({FR:{assignedPid:'P1'},restoreStartPlatformState:undefined,battleStartRuntimeReady:pending,toast:()=>{}});
  vm.runInContext(html.slice(a,b),c);
  c.applyProjection({viewer:'P1',revision:1});c.applyProjection({viewer:'P1',revision:2});
  c.applyProjection=pr=>applied.push(pr.revision);ready();await pending;await Promise.resolve();assert.deepEqual(applied,[2]);
});
