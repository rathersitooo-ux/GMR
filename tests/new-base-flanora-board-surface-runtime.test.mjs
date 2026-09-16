import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlanoraMapLayout } from '../browser/new-base-flanora-map-layout-core.mjs';
import { createNewBaseGoalPathLayout, projectNewBaseGoalPathConnections } from '../browser/new-base-goal-path-core.mjs';
import { projectNewBaseGoalPathPresentation } from '../browser/new-base-goal-path-presentation-core.mjs';
import { projectNewBaseProgressionLanePresentation } from '../browser/new-base-progression-lane-presentation-core.mjs';
import { FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT, mountFlanoraBoardSurface, projectFlanoraBoardSurfaceModel } from '../browser/new-base-flanora-board-surface-runtime.mjs';

const INPUT = Object.freeze({ participantIds:['P1','P2','P3','P4'], horizontalCellCount:12, shieldLinkedLaneColumnsByParticipant:{ P1:[0,1,2], P2:[3,4,5], P3:[6,7,8], P4:[9,10,11] } });

function fakeDom() {
  const byId = new Map();
  const d = { createElement(tagName) { const attrs = new Map(); const n = { tagName,parentNode:null,children:[],dataset:{},style:{},className:'',textContent:'',appendChild(c){c.parentNode=this;this.children.push(c);if(c.id)byId.set(c.id,c);return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;return c;},remove(){if(this.parentNode)this.parentNode.removeChild(this);},setAttribute(k,v){attrs.set(k,String(v));},getAttribute(k){return attrs.get(k)??null;} }; Object.defineProperty(n,'id',{get(){return this._id??'';},set(v){this._id=v;if(v)byId.set(v,this);}}); return n; }, getElementById(id){return byId.get(id)??null;} }; d.head=d.createElement('head'); return d;
}
function layout(){ return createFlanoraMapLayout(INPUT); }
function progression(cardColumns) {
  const goalLayout = createNewBaseGoalPathLayout(INPUT);
  return projectNewBaseProgressionLanePresentation(projectNewBaseGoalPathPresentation(projectNewBaseGoalPathConnections(goalLayout,{ straightCardIdsByColumn:cardColumns })));
}

test('surface keeps existing connected clearing while exposing one shared GOAL and twelve route anchors', () => {
  const model = projectFlanoraBoardSurfaceModel(layout());
  assert.equal(model.sharedGoalCount,1);
  assert.equal(model.sharedGoalId,'goal:shared');
  assert.equal(new Set(model.lanes.map(l=>l.goalId)).size,1);
  assert.equal(model.lanes.length,12);
  assert.equal(model.clearingCells.length,26);
  assert.equal(model.clearingCycleCellIds.length,26);
  assert.equal(model.movementAuthority,false);
});

test('mount is a world hierarchy rather than twelve GOAL/table rows', () => {
  const documentLike=fakeDom(); const host=documentLike.createElement('div');
  const r=mountFlanoraBoardSurface({host,documentLike,layout:layout()});
  assert.equal(r.mounted,true);
  assert.equal(r.snapshot().goalCount,1);
  assert.equal(r.snapshot().gateAnchorCount,12);
  assert.equal(r.snapshot().futureDiscreteStageNodeCount,0);
  assert.equal(r.root.dataset.worldFlow,'shared-field-shields-card-path-gates-shared-goal');
  assert.equal(r.resolveGoal('P1',0),r.resolveGoal('P4',2));
  assert.equal(r.resolveGateAnchor('P1',0).dataset.sharedGoalId,'goal:shared');
  assert.equal(r.resolveShield('P4',2).dataset.clearingEntryCellId,'clearing:top:11');
  assert.equal(r.resolveClearingCell('clearing:top:4').dataset.startParticipant,'P2');
  const css=documentLike.head.children[0].textContent;
  assert.doesNotMatch(css,/grid-template-rows:repeat\(6/);
  assert.doesNotMatch(css,/grid-template-columns:repeat\(2/);
  assert.match(css,/grFlanoraSharedGoal/);
});

test('sync creates DOM cards only for exact placed card ids and never future slots', () => {
  const documentLike=fakeDom(); const r=mountFlanoraBoardSurface({host:documentLike.createElement('div'),documentLike,layout:layout()});
  const cards=Array.from({length:12},()=>[]); cards[0]=['A','B','C']; cards[4]=['D','E','F','G','H','I','J'];
  const p=progression(cards); const applied=r.syncProgressionPresentation(p);
  assert.equal(applied.applied,true);
  assert.equal(r.snapshot().visibleBuiltRoadStepCount,10);
  assert.equal(r.snapshot().futureDiscreteStageNodeCount,0);
  assert.equal(r.resolveRoadStep('P1',0,1).dataset.cardId,'A');
  assert.equal(r.resolveRoadStep('P1',0,3).dataset.cardId,'C');
  assert.equal(r.resolveRoadStep('P1',0,4),null);
  assert.equal(r.resolveRoadStep('P2',1,7).dataset.cardId,'J');
});

test('reduced motion and low perf preserve board state meaning', () => {
  const d=fakeDom();
  const a=mountFlanoraBoardSurface({host:d.createElement('div'),documentLike:d,layout:layout(),reducedMotion:true});
  const b=mountFlanoraBoardSurface({host:d.createElement('div'),documentLike:d,layout:layout(),lowPerf:true});
  assert.equal(a.snapshot().performanceProfile,'reduced_motion');
  assert.equal(b.snapshot().performanceProfile,'low_perf');
  assert.deepEqual(a.snapshot().clearingCycleCellIds,b.snapshot().clearingCycleCellIds);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.sharedGoalCount,1);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.futureDiscreteStageNodes,false);
});
