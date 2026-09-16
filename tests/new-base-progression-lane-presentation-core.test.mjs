import test from 'node:test';
import assert from 'node:assert/strict';

import { projectNewBaseGoalPathPresentation } from '../browser/new-base-goal-path-presentation-core.mjs';
import {
  NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT,
  NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE,
  isNewBaseProgressionLanePresentation,
  projectNewBaseProgressionLanePresentation,
} from '../browser/new-base-progression-lane-presentation-core.mjs';

function cards(count,prefix='card'){ return Array.from({length:count},(_,index)=>`${prefix}-${index+1}`); }
function sourceLane({participantId='P1',laneIndex=0,columnIndex=laneIndex,straightCardCount=0,straightCardIds=cards(straightCardCount,`${participantId}-${laneIndex}`),connectedToGoal=false}={}){
  return {participantId,laneIndex,columnIndex,goalRowColumnIndex:columnIndex,straightCardCount,straightCardIds,connectedToGoal,routeGateId:`goal-gate:${participantId}:${laneIndex}`,sharedGoalId:'goal:shared'};
}
function goalPathPresentation(lanes){ return projectNewBaseGoalPathPresentation({ok:true,reason:'TEST_GOAL_PATH_PROJECTION',terminalWin:false,horizontalCellCount:12,sharedGoalId:'goal:shared',laneStates:lanes}); }
function projectOne(input={}){ const goalPath=goalPathPresentation([sourceLane(input)]); assert.equal(goalPath.ok,true); return projectNewBaseProgressionLanePresentation(goalPath); }

test('0 cards keeps all seven future positions latent without discrete card identity',()=>{
  const result=projectOne({straightCardCount:0});
  assert.equal(result.ok,true); assert.equal(result.totalBuiltStageCount,0); assert.equal(result.totalLatentStageCount,7); assert.equal(result.totalResolvedPhysicalCardIdentityCount,0);
  for(const stage of result.lanePresentations[0].stages){
    assert.equal(stage.visualState,NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT);
    assert.equal(stage.cardId,null); assert.equal(stage.physicalCardIdentityResolved,false);
    assert.equal(stage.visualCue,'FUTURE_PROGRESS_NOT_OPEN'); assert.equal(stage.actionable,false); assert.equal(stage.traversable,false);
  }
  assert.equal(result.futureStageLooksOpen,false); assert.equal(result.futureStageActionable,false); assert.equal(result.futureStageTraversable,false);
});

test('three cards exposes exactly those three physical card identities and no empty placeholders',()=>{
  const ids=['CARD-A','CARD-B','CARD-C'];
  const result=projectOne({straightCardCount:3,straightCardIds:ids});
  const stages=result.lanePresentations[0].stages;
  assert.deepEqual(stages.map(stage=>stage.visualState),[
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
    NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
  ]);
  assert.deepEqual(stages.slice(0,3).map(stage=>stage.cardId),ids);
  assert.deepEqual(stages.slice(3).map(stage=>stage.cardId),[null,null,null,null]);
  assert.equal(stages[2].visualCue,'ESTABLISHED_ACTUAL_CARD');
  assert.equal(result.totalResolvedPhysicalCardIdentityCount,3);
});

test('seven physical cards do not infer GOAL connection or terminal result',()=>{
  const result=projectOne({straightCardCount:7,straightCardIds:cards(7,'seven'),connectedToGoal:false});
  assert.equal(result.lanePresentations[0].builtStageCount,7);
  assert.equal(result.lanePresentations[0].connectedToGoal,false);
  assert.equal(result.totalResolvedPhysicalCardIdentityCount,7);
  assert.equal(result.terminalWin,false); assert.equal(result.resultAuthority,false);
});

test('caller-authoritative connected route is preserved without terminal victory',()=>{
  const result=projectOne({straightCardCount:7,straightCardIds:cards(7,'open'),connectedToGoal:true});
  assert.equal(result.lanePresentations[0].connectedToGoal,true);
  assert.equal(result.lanePresentations[0].routeGateId,'goal-gate:P1:0');
  assert.equal(result.lanePresentations[0].sharedGoalId,'goal:shared');
  assert.equal(result.terminalWin,false); assert.equal(result.gameplayAuthority,false); assert.equal(result.gameStateWrite,false);
});

test('stage positions keep Flanora step identity while card identity stays caller-owned',()=>{
  const result=projectOne({participantId:'P3',laneIndex:2,columnIndex:8,straightCardCount:2,straightCardIds:['PHYS-1','PHYS-2']});
  assert.deepEqual(result.lanePresentations[0].stages.map(stage=>stage.roadStepId),[1,2,3,4,5,6,7].map(i=>`road:P3:2:${i}`));
  assert.deepEqual(result.lanePresentations[0].stages.slice(0,2).map(stage=>stage.cardId),['PHYS-1','PHYS-2']);
});

test('mismatched physical card list fails closed rather than inventing identity',()=>{
  const goalPath=goalPathPresentation([sourceLane({straightCardCount:3,straightCardIds:['ONLY-ONE']})]);
  assert.equal(goalPath.ok,false);
  const synthetic=projectNewBaseProgressionLanePresentation({schema:'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1',ok:true,terminalWin:false,presentationOnly:true,gameplayAuthority:false,gameStateWrite:false,movementAuthority:false,legalityAuthority:false,resultAuthority:false,lanePresentations:[{participantId:'P1',laneIndex:0,straightCardCount:3,straightCardIds:['ONLY-ONE'],connectedToGoal:false}]});
  assert.equal(synthetic.ok,false); assert.equal(synthetic.reason,'LANE_PRESENTATION_INVALID');
});

test('projection and contract remain frozen and authority-free',()=>{
  const result=projectOne({straightCardCount:5});
  assert.equal(isNewBaseProgressionLanePresentation(result),true); assert.equal(Object.isFrozen(result),true); assert.equal(Object.isFrozen(result.lanePresentations[0].stages[0]),true);
  assert.equal(result.presentationOnly,true); assert.equal(result.movementAuthority,false); assert.equal(result.legalityAuthority,false); assert.equal(result.resultAuthority,false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.stageCount,7);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.builtStageMeaning,'ESTABLISHED_ACTUAL_CARD_ONLY');
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.physicalCardIdentityAuthority,'CALLER_STRAIGHT_CARD_IDS_ONLY');
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesStraightCompletion,false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesGoalPathConnection,false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesMovementLegality,false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesResult,false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.secondBoardEngine,false);
});
