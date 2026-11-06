import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRingVineWorldPresentation } from '../browser/battle-board-ring-vine-world-presentation.mjs';

const P = (x,z) => ({x,y:0,z});
const model = (lowPerf=false)=>projectRingVineWorldPresentation({
 roundCells:[{id:'lower:T0',world:P(0,0)},{id:'lower:T1',world:P(2,0)},
             {id:'upper:P1:L:1',world:P(4,2)}],
 edges:[{id:'lower-edge:T0-T1',region:'LOWER_SHARED_FIELD',fromId:'lower:T0',
         toId:'lower:T1',from:P(0,0),waypoints:[P(1,0.1)],to:P(2,0)},
        {id:'upper-edge:x',region:'UPPER_PROGRESSION',fromId:'upper:P1:L:1',
         toId:'upper:P1:L:2',from:P(4,2),waypoints:[],to:P(4,3)}],
 worldWidth:24,worldDepth:13.5,lowPerf
});

test('selected ring+vine are additive presentation, not a second movement graph',()=>{
 const x=model();
 assert.deepEqual(x.selection,{cellMarker:'A_RING_ONLY',connectionLine:'D_VINE_LIKE'});
 assert.equal(x.markers.length,3);
 assert.equal(x.vines.length,1);
 assert.equal(x.vines[0].edgeId,'lower-edge:T0-T1');
 assert.deepEqual(x.vines[0].centerline,[P(0,0),P(1,0.1),P(2,0)]);
 assert.equal(x.vines[0].leaves.length,2);
 assert.equal(x.vines[0].newGraphNode,false);
 assert.equal(x.vines[0].walkableBridge,false);
 assert.equal(x.noAdditionalStoppingPositions,true);
 assert.ok(Object.isFrozen(x.vines[0].centerline));
});

test('low performance omits optional leaves but not reachable visual geometry',()=>{
 const normal=model(), light=model(true);
 assert.equal(normal.count.vines,light.count.vines);
 assert.equal(light.count.decorativeLeaves,0);
 assert.deepEqual(light.vines[0].centerline,normal.vines[0].centerline);
 assert.equal(light.count.markers,normal.count.markers);
});

test('invalid geometry fails without guessing world positions',()=>{
 assert.throws(()=>projectRingVineWorldPresentation({roundCells:[{id:'x',world: {x:NaN,y:0,z:0}}],edges:[],worldWidth:24,worldDepth:13.5}),/INVALID_WORLD_POINT/);
 assert.throws(()=>projectRingVineWorldPresentation({roundCells:[],edges:[],worldWidth:0,worldDepth:13.5}),/WORLD_FIELD_INPUT/);
});