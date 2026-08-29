import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSpatialCursor} from '../browser/ui-spatial-cursor-core.mjs';

const viewport={width:400,height:240};
const cfg={deadzone:0.1,maxSpeed:100,responseExponent:1,acquireRadius:20,releaseRadius:40,directionWeight:20,switchMargin:8};
const button=(id,x,y,width=40,height=30,extra={})=>({id,rect:{x,y,width,height},...extra});
const step=(state,input,candidates=[],config=cfg)=>advanceSpatialCursor(state,input,candidates,viewport,config);

test('free cursor moves continuously without requiring any button registry',()=>{
  const result=step({position:{x:10,y:20},focusId:null},{stick:{x:1,y:0},dtSeconds:0.5});
  assert.deepEqual(result,{position:{x:60,y:20},focusId:null});
});

test('deadzone prevents analog drift',()=>{
  const result=step({position:{x:50,y:50},focusId:null},{stick:{x:0.05,y:0},dtSeconds:1});
  assert.deepEqual(result,{position:{x:50,y:50},focusId:null});
});

test('cursor is clamped to the viewport',()=>{
  const result=step({position:{x:395,y:5},focusId:null},{stick:{x:1,y:-1},dtSeconds:2});
  assert.equal(result.position.x,400);
  assert.equal(result.position.y,0);
});

test('nearby visible enabled candidate becomes the focus target',()=>{
  const result=step({position:{x:80,y:65},focusId:null},{stick:{x:0,y:0},dtSeconds:0},[button('shop',100,50)]);
  assert.equal(result.focusId,'shop');
});

test('current target stays focused inside the wider release radius',()=>{
  const candidates=[button('shop',100,50)];
  const result=step({position:{x:145,y:65},focusId:'shop'},{stick:{x:0,y:0},dtSeconds:0},candidates);
  assert.equal(result.focusId,'shop');
});

test('movement direction can beat a slightly nearer off-axis candidate',()=>{
  const candidates=[
    button('right',116,90,20,20),
    button('down',100,114,20,20),
  ];
  const result=step({position:{x:100,y:100},focusId:null},{stick:{x:1,y:0},dtSeconds:0},candidates);
  assert.equal(result.focusId,'right');
});

test('focus switches when cursor physically enters a different control',()=>{
  const candidates=[button('left',60,90,20,20),button('right',110,90,20,20)];
  const result=step({position:{x:112,y:100},focusId:'left'},{stick:{x:0,y:0},dtSeconds:0},candidates);
  assert.equal(result.focusId,'right');
});

test('overlapping candidates resolve deterministically by priority then zIndex',()=>{
  const same={x:100,y:80,width:50,height:40};
  const priority=step({position:{x:120,y:100},focusId:null},{stick:{x:0,y:0},dtSeconds:0},[
    {id:'low',rect:same,priority:0,zIndex:50},
    {id:'high',rect:same,priority:2,zIndex:0},
  ]);
  assert.equal(priority.focusId,'high');
  const z=step({position:{x:120,y:100},focusId:null},{stick:{x:0,y:0},dtSeconds:0},[
    {id:'back',rect:same,priority:0,zIndex:1},
    {id:'front',rect:same,priority:0,zIndex:9},
  ]);
  assert.equal(z.focusId,'front');
});

test('hidden disabled or explicitly non-selectable candidates are ignored',()=>{
  const candidates=[
    button('hidden',90,90,20,20,{visible:false}),
    button('disabled',90,90,20,20,{enabled:false}),
    button('nope',90,90,20,20,{selectable:false}),
  ];
  const result=step({position:{x:100,y:100},focusId:null},{stick:{x:0,y:0},dtSeconds:0},candidates);
  assert.equal(result.focusId,null);
});

test('destroyed or absent focused target releases safely',()=>{
  const result=step({position:{x:100,y:100},focusId:'gone'},{stick:{x:0,y:0},dtSeconds:0},[]);
  assert.equal(result.focusId,null);
});

test('far controls do not steal a free cursor',()=>{
  const result=step({position:{x:10,y:10},focusId:null},{stick:{x:0,y:0},dtSeconds:0},[button('far',200,120)]);
  assert.equal(result.focusId,null);
});

test('core never returns activation navigation or visual commands',()=>{
  const result=step({position:{x:100,y:100},focusId:null},{stick:{x:0,y:0},dtSeconds:0},[button('battle',90,90)]);
  assert.deepEqual(Object.keys(result).sort(),['focusId','position']);
  assert.equal('activate' in result,false);
  assert.equal('route' in result,false);
  assert.equal('scale' in result,false);
});

test('invalid geometry and tuning fail closed',()=>{
  assert.throws(()=>advanceSpatialCursor({position:{x:0,y:0}},{stick:{x:0,y:0},dtSeconds:0},[],{width:0,height:1},cfg),/viewport.width/);
  assert.throws(()=>step({position:{x:0,y:0}},{stick:{x:0,y:0},dtSeconds:-1}),/dtSeconds/);
  assert.throws(()=>step({position:{x:0,y:0}},{stick:{x:0,y:0},dtSeconds:0},[button('bad',0,0,-1,1)]),/width/);
  assert.throws(()=>step({position:{x:0,y:0}},{stick:{x:0,y:0},dtSeconds:0},[],{...cfg,releaseRadius:5}),/releaseRadius/);
});
