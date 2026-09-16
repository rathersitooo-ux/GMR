import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlanoraMapLayout } from '../browser/new-base-flanora-map-layout-core.mjs';
import { createNewBaseGoalPathLayout, projectNewBaseGoalPathConnections } from '../browser/new-base-goal-path-core.mjs';
import { projectNewBaseGoalPathPresentation } from '../browser/new-base-goal-path-presentation-core.mjs';
import { mountFlanoraBoardSurface } from '../browser/new-base-flanora-board-surface-runtime.mjs';
import { NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT, mountNewBaseGoalEntryGateCue } from '../browser/new-base-goal-entry-gate-cue-runtime.mjs';

const INPUT={ participantIds:['P1','P2','P3','P4'], horizontalCellCount:12, shieldLinkedLaneColumnsByParticipant:{P1:[0,1,2],P2:[3,4,5],P3:[6,7,8],P4:[9,10,11]} };
function fakeDom(){const byId=new Map();const d={createElement(tagName){const attrs=new Map();const style={setProperty(k,v){this[k]=v;}};const n={tagName,parentNode:null,children:[],dataset:{},style,className:'',textContent:'',appendChild(c){c.parentNode=this;this.children.push(c);if(c.id)byId.set(c.id,c);return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;return c;},remove(){if(this.parentNode)this.parentNode.removeChild(this);},setAttribute(k,v){attrs.set(k,String(v));},getAttribute(k){return attrs.get(k)??null;}};Object.defineProperty(n,'id',{get(){return this._id??'';},set(v){this._id=v;if(v)byId.set(v,this);}});return n;},getElementById(id){return byId.get(id)??null;}};d.head=d.createElement('head');return d;}
function presentation(cards){const l=createNewBaseGoalPathLayout(INPUT);return projectNewBaseGoalPathPresentation(projectNewBaseGoalPathConnections(l,{straightCardIdsByColumn:cards}));}
function empty(){return Array.from({length:12},()=>[]);}
function mounted(profile={}){const documentLike=fakeDom();const board=mountFlanoraBoardSurface({host:documentLike.createElement('div'),documentLike,layout:createFlanoraMapLayout(INPUT),...profile});return {documentLike,board};}

test('mounts twelve physical route gates after card paths and before one shared GOAL',()=>{
  const {documentLike,board}=mounted(); const gate=mountNewBaseGoalEntryGateCue({boardSurfaceRuntime:board,goalPathPresentation:presentation(empty()),documentLike});
  assert.equal(gate.mounted,true); assert.equal(gate.snapshot().laneGateCount,12); assert.equal(gate.snapshot().closedLaneCount,12); assert.equal(gate.snapshot().visibleArrowCount,0);
  assert.equal(gate.resolveLane('P1',0).gate.dataset.gateState,'CLOSED'); assert.equal(gate.resolveLane('P1',0).anchor.dataset.sharedGoalId,'goal:shared');
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.gatePlacement,'AFTER_CARD_PATH_BEFORE_SHARED_GOAL'); assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.visibleArrowCount,0);
});

test('seven cards shatter blocker and reveal translucent portal; legacy arrow contract remains detached',()=>{
  const {documentLike,board}=mounted(); const cards=empty(); const gate=mountNewBaseGoalEntryGateCue({boardSurfaceRuntime:board,goalPathPresentation:presentation(cards),documentLike,participantColors:{P1:'#d9c16b'}});
  cards[0]=['A','B','C','D','E','F','G']; const next=presentation(cards); assert.equal(next.terminalWin,false);
  const result=gate.syncGoalPathPresentation(next); assert.equal(result.ok,true); assert.equal(result.openLaneCount,1); assert.equal(result.shatterTransitionCount,1); assert.equal(result.activeArrowCount,1); assert.equal(result.visibleArrowCount,0);
  const lane=gate.resolveLane('P1',0); assert.equal(lane.gate.dataset.gateState,'OPEN'); assert.equal(lane.gate.dataset.gateShatter,'1'); assert.equal(lane.guide.dataset.goalPathOpen,'1');
  assert.equal(lane.entryCellId,'clearing:top:0'); assert.equal(lane.arrowStack.children.length,3); assert.equal(lane.arrowStack.parentNode,null); assert.equal(lane.arrowStack.dataset.visualDomMounted,'false');
  const css=documentLike.head.children.map(x=>x.textContent).join('\n'); assert.match(css,/grRouteGoalGateMembrane/); assert.match(css,/grRouteGateShatter/);
});

test('repeated open sync is idempotent and reduced motion preserves old API without visible arrows',()=>{
  const {documentLike,board}=mounted({reducedMotion:true}); const cards=empty(); const gate=mountNewBaseGoalEntryGateCue({boardSurfaceRuntime:board,goalPathPresentation:presentation(cards),documentLike,reducedMotion:true});
  cards[3]=['1','2','3','4','5','6','7']; const open=presentation(cards); gate.syncGoalPathPresentation(open); const second=gate.syncGoalPathPresentation(open);
  const lane=gate.resolveLane('P2',0); assert.equal(second.openLaneCount,1); assert.equal(second.shatterTransitionCount,1); assert.equal(lane.gate.dataset.gateState,'OPEN'); assert.equal(lane.gate.dataset.gateShatter,'0');
  assert.equal(second.animationMode,'STATIC_UPWARD_ARROW'); assert.equal(second.visibleAnimationMode,'STATIC_STATE_SWAP'); assert.equal(lane.arrowStack.dataset.reducedMotion,'true'); assert.equal(lane.arrowStack.parentNode,null);
});

test('fails soft when shared-goal board/presentation contract is absent',()=>{
  const d=fakeDom(); const result=mountNewBaseGoalEntryGateCue({documentLike:d}); assert.equal(result.mounted,false); assert.equal(result.reason,'BOARD_SURFACE_RUNTIME_INVALID');
});
