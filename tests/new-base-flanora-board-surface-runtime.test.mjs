import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlanoraMapLayout } from '../browser/new-base-flanora-map-layout-core.mjs';
import { projectNewBaseProgressionLanePresentation } from '../browser/new-base-progression-lane-presentation-core.mjs';
import {
  FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT,
  createFlanoraBoardSurfaceModel,
  mountFlanoraBoardSurface,
  projectFlanoraBoardSurfaceModel,
} from '../browser/new-base-flanora-board-surface-runtime.mjs';

const INPUT=Object.freeze({participantIds:['P1','P2','P3','P4'],horizontalCellCount:12,shieldLinkedLaneColumnsByParticipant:{P1:[0,1,2],P2:[3,4,5],P3:[6,7,8],P4:[9,10,11]}});

function makeFakeDom(){
  const byId=new Map();
  const documentLike={
    createElement(tagName){
      const attrs=new Map();
      const node={tagName,parentNode:null,children:[],dataset:{},style:{},className:'',textContent:'',
        appendChild(child){child.parentNode=this;this.children.push(child);if(child.id)byId.set(child.id,child);return child;},
        removeChild(child){this.children=this.children.filter(x=>x!==child);child.parentNode=null;return child;},
        remove(){if(this.parentNode)this.parentNode.removeChild(this);},
        setAttribute(name,value){attrs.set(name,String(value));if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());this.dataset[key]=String(value);}},
        getAttribute(name){return attrs.get(name)??null;},
        removeAttribute(name){attrs.delete(name);},
      };
      Object.defineProperty(node,'id',{get(){return this._id??'';},set(value){this._id=value;if(value)byId.set(value,this);}});
      return node;
    },
    getElementById(id){return byId.get(id)??null;},
  };
  documentLike.head=documentLike.createElement('head');
  return documentLike;
}
function standardLayout(){return createFlanoraMapLayout(INPUT);}
function cards(count,prefix){return Array.from({length:count},(_,index)=>`${prefix}-${index+1}`);}
function goalPathPresentationFor(runtime,countsByLaneKey={}){
  return {schema:'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1',ok:true,terminalWin:false,presentationOnly:true,gameplayAuthority:false,gameStateWrite:false,movementAuthority:false,legalityAuthority:false,resultAuthority:false,sharedGoalId:'goal:shared',lanePresentations:runtime.model.lanes.map(lane=>{const count=countsByLaneKey[lane.key]??0;return {key:lane.key,participantId:lane.participantId,laneIndex:lane.laneIndex,straightCardCount:count,straightCardIds:cards(count,`${lane.key}-card`),routeGateId:lane.routeGateId,sharedGoalId:'goal:shared',connectedToGoal:count===7};})};
}

test('projects 12 Shield routes into one shared GOAL while preserving the 26-cell shared field',()=>{
  const model=createFlanoraBoardSurfaceModel(INPUT);
  assert.equal(model.lanes.length,12); assert.equal(model.clearingCells.length,26); assert.equal(model.clearingCycleCellIds.length,26);
  assert.equal(model.sharedGoalId,'goal:shared'); assert.equal(model.sharedGoalCount,1); assert.equal(model.routeGateCount,12);
  assert.equal(new Set(model.lanes.map(lane=>lane.goalId)).size,1);
  assert.equal(new Set(model.lanes.map(lane=>lane.routeGateId)).size,12);
  assert.equal(new Set(model.lanes.map(lane=>lane.shieldId)).size,12);
  assert.equal(model.lanes.every(lane=>lane.roadSteps.length===7),true);
  assert.equal(model.presentationOnly,true); assert.equal(model.gameplayAuthority,false); assert.equal(model.movementAuthority,false); assert.equal(model.legalityAuthority,false); assert.equal(model.resultAuthority,false);
});

test('keeps same-column shared-field entry and four existing start anchors',()=>{
  const model=projectFlanoraBoardSurfaceModel(standardLayout());
  for(const lane of model.lanes) assert.equal(lane.clearingEntryCellId,`clearing:top:${lane.columnIndex}`);
  const starts=Object.fromEntries(model.clearingCells.filter(cell=>cell.startParticipantIds.length).map(cell=>[cell.id,cell.startParticipantIds]));
  assert.deepEqual(starts,{'clearing:top:1':['P1'],'clearing:top:4':['P2'],'clearing:top:7':['P3'],'clearing:top:10':['P4']});
});

test('mount is world-first: one top-center GOAL, twelve route anchors, four x three vertical roads, then shared field',()=>{
  const documentLike=makeFakeDom(); const host=documentLike.createElement('div');
  const runtime=mountFlanoraBoardSurface({host,documentLike,layout:standardLayout()});
  assert.equal(runtime.mounted,true);
  const snap=runtime.snapshot();
  assert.equal(snap.laneCount,12); assert.equal(snap.goalCount,1); assert.equal(snap.sharedGoalCount,1); assert.equal(snap.routeGateCount,12); assert.equal(snap.shieldCount,12); assert.equal(snap.roadStepCount,84); assert.equal(snap.visibleBuiltRoadStepCount,0); assert.equal(snap.clearingCellCount,26);
  assert.equal(runtime.root.dataset.goalEdge,'top-center');
  assert.equal(runtime.root.dataset.roadEntryEdge,'bottom');
  assert.equal(runtime.root.dataset.progressionDirection,'bottom-to-top');
  assert.equal(runtime.root.dataset.centralWorldLayout,'shared-field-shield-actual-card-road-route-gates-one-goal');
  assert.equal(runtime.root.dataset.futureDiscreteProgressionSlots,'false');
  assert.match(runtime.root.getAttribute('aria-label'),/共有フィールド.*盾.*カード.*12経路ゲート.*1つのGOAL/);
  assert.deepEqual(runtime.upper.children.map(node=>node.className),['grFlanoraSharedGoal','grFlanoraRouteGateLayer','grFlanoraProgressionGrid']);
  assert.equal(runtime.routeGateLayer.children.length,12);
  assert.equal(runtime.progressionGrid.children.length,4);
  assert.deepEqual(runtime.progressionGrid.children.map(cluster=>cluster.children.length),[3,3,3,3]);
  assert.equal(runtime.resolveSharedGoal().dataset.flanoraSharedGoal,'goal:shared');
  assert.equal(runtime.resolveRouteGate('P1',0).dataset.flanoraRouteGate,'goal-gate:P1:0');
  assert.equal(runtime.resolveGoal('P1',0),runtime.resolveRouteGate('P1',0));
  assert.equal(runtime.resolveShield('P4',2).dataset.clearingEntryCellId,'clearing:top:11');
  assert.equal(runtime.resolveRoadStep('P2',1,7),null);
  const styleText=documentLike.head.children[0].textContent;
  assert.match(styleText,/\.grFlanoraSharedGoal\{/);
  assert.match(styleText,/\.grFlanoraRouteGateLayer\{[^}]*repeat\(12/);
  assert.match(styleText,/\.grFlanoraProgressionGrid\{[^}]*repeat\(4/);
  assert.match(styleText,/\.grFlanoraParticipantCluster\{[^}]*repeat\(3/);
  assert.match(styleText,/\.grFlanoraRoad\{[^}]*flex-direction:column-reverse/);
  assert.match(styleText,/\.grFlanoraRoadStep\{[^}]*aspect-ratio:1\.48/);
  assert.doesNotMatch(styleText,/grFlanoraGoal\{/);
  assert.doesNotMatch(styleText,/grid-template-columns:repeat\(7/);
  assert.equal(runtime.gameplayAuthority,false); assert.equal(runtime.gameStateWrite,false); assert.equal(runtime.movementAuthority,false);
});

test('sync renders discrete nodes only for actual BUILT cards and keeps future positions invisible',()=>{
  const documentLike=makeFakeDom(); const runtime=mountFlanoraBoardSurface({host:documentLike.createElement('div'),documentLike,layout:standardLayout()});
  const progression=projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime,{'P1:0':3,'P2:1':7}));
  assert.equal(progression.ok,true); assert.equal(progression.totalBuiltStageCount,10); assert.equal(progression.totalResolvedPhysicalCardIdentityCount,10);
  const applied=runtime.syncProgressionPresentation(progression);
  assert.equal(applied.applied,true); assert.equal(applied.builtStageCount,10); assert.equal(applied.resolvedPhysicalCardIdentityCount,10);
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount,10); assert.equal(runtime.snapshot().resolvedPhysicalCardIdentityCount,10);
  const first=runtime.resolveRoadStep('P1',0,1);
  assert.equal(first.dataset.progressionStageState,'BUILT'); assert.equal(first.dataset.cardIdentityResolved,'true'); assert.equal(first.dataset.cardId,'P1:0-card-1'); assert.equal(first.dataset.physicalCardId,'P1:0-card-1');
  assert.equal(runtime.resolveRoadStep('P1',0,4),null);
  assert.equal(runtime.resolveRoadStep('P2',1,7).dataset.cardId,'P2:1-card-7');
  assert.equal(runtime.resolveRouteGate('P2',1).dataset.connectedToGoal,'true');
  assert.equal(runtime.resolveSharedGoal().dataset.connectedRouteCount,'1');
  assert.equal(runtime.resolveSharedGoal().dataset.terminalResultAuthority,'false');
  const road=runtime.resolveRoadStep('P1',0,1).parentNode;
  assert.equal(road.dataset.futureDiscreteSlots,'false'); assert.equal(road.dataset.progressionLatentCount,'4');
});

test('sync can reduce built cards without leaving stale discrete nodes',()=>{
  const documentLike=makeFakeDom(); const runtime=mountFlanoraBoardSurface({host:documentLike.createElement('div'),documentLike,layout:standardLayout()});
  runtime.syncProgressionPresentation(projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime,{'P1:0':3})));
  assert.equal(runtime.resolveRoadStep('P1',0,3).dataset.cardId,'P1:0-card-3');
  runtime.syncProgressionPresentation(projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime,{'P1:0':1})));
  assert.equal(runtime.resolveRoadStep('P1',0,1).dataset.cardId,'P1:0-card-1');
  assert.equal(runtime.resolveRoadStep('P1',0,2),null); assert.equal(runtime.resolveRoadStep('P1',0,3),null);
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount,1);
});

test('reduced motion and low perf preserve one-GOAL topology and card identity semantics',()=>{
  const documentLike=makeFakeDom();
  for(const options of [{reducedMotion:true},{lowPerf:true}]){
    const runtime=mountFlanoraBoardSurface({host:documentLike.createElement('div'),documentLike,layout:standardLayout(),...options});
    const result=runtime.syncProgressionPresentation(projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime,{'P3:2':2})));
    assert.equal(result.applied,true); assert.equal(runtime.snapshot().goalCount,1); assert.equal(runtime.snapshot().routeGateCount,12); assert.equal(runtime.resolveRoadStep('P3',2,2).dataset.cardId,'P3:2-card-2');
  }
});

test('fails closed for movement-authority geometry or partial progression before mutating visible state',()=>{
  const good=standardLayout(); assert.throws(()=>projectFlanoraBoardSurfaceModel({...good,geometryIsMovementAuthority:true}),/MUST_NOT_OWN_MOVEMENT/);
  const documentLike=makeFakeDom(); const runtime=mountFlanoraBoardSurface({host:documentLike.createElement('div'),documentLike,layout:good});
  const oneLane={schema:'GAMEROAD_NEW_BASE_PROGRESSION_LANE_PRESENTATION_V1',ok:true,stageCount:7,presentationOnly:true,gameplayAuthority:false,gameStateWrite:false,movementAuthority:false,legalityAuthority:false,resultAuthority:false,terminalWin:false,futureStageLooksOpen:false,futureStageActionable:false,futureStageTraversable:false,totalBuiltStageCount:0,totalLatentStageCount:7,lanePresentations:[]};
  const refused=runtime.syncProgressionPresentation(oneLane); assert.equal(refused.applied,false); assert.equal(refused.reason,'FULL_FLANORA_PROGRESSION_REQUIRED'); assert.equal(runtime.snapshot().visibleBuiltRoadStepCount,0);
});

test('contract denies a second board engine and fixes one shared GOAL without fake future slots',()=>{
  assert.deepEqual(mountFlanoraBoardSurface(),{schema:'gameroad.new-base-flanora-board-surface-runtime.v1',mounted:false,presentationOnly:true,gameplayAuthority:false,reason:'DOM_HOST_REQUIRED'});
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.secondBoardEngine,false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.sharedGoalCount,1);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.routeGateCount,12);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.progressionDirection,'BOTTOM_TO_TOP');
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.futureDiscreteStageNodes,false);
});
