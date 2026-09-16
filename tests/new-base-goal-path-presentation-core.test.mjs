import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNewBaseGoalPathLayout,
  projectNewBaseGoalPathConnections,
} from '../browser/new-base-goal-path-core.mjs';
import {
  NEW_BASE_GOAL_GATE_VISUAL_STATE,
  NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT,
  NEW_BASE_GOAL_PATH_VISUAL_STATE,
  isNewBaseGoalPathPresentation,
  projectNewBaseGoalPathPresentation,
} from '../browser/new-base-goal-path-presentation-core.mjs';

const participantIds = ['P1','P2','P3','P4'];
const laneColumns = { P1:[0,1,2], P2:[3,4,5], P3:[6,7,8], P4:[9,10,11] };
function layout(){ return createNewBaseGoalPathLayout({ participantIds, horizontalCellCount:12, shieldLinkedLaneColumnsByParticipant:laneColumns }); }
function emptyColumns(){ return Array.from({length:12},()=>[]); }
function sevenCards(prefix){ return Array.from({length:7},(_,index)=>`${prefix}-${index+1}`); }
function authoritativeProjectionWithOpenLane(columnIndex=0){ const columns=emptyColumns(); columns[columnIndex]=sevenCards(`lane-${columnIndex}`); return projectNewBaseGoalPathConnections(layout(),{straightCardIdsByColumn:columns}); }

test('seven straight opens only its route gate toward one shared GOAL without terminal win',()=>{
  const source=authoritativeProjectionWithOpenLane(0);
  const presentation=projectNewBaseGoalPathPresentation(source);
  assert.equal(presentation.ok,true);
  assert.equal(presentation.sharedGoalId,'goal:shared');
  assert.equal(presentation.sharedGoalCount,1);
  assert.equal(presentation.routeGateCount,12);
  assert.equal(presentation.openGoalPathCount,1);
  assert.equal(presentation.terminalWin,false);
  assert.equal(presentation.requiresAuthoritativeGoalReachedForResult,true);
  const opened=presentation.lanePresentations.find(lane=>lane.columnIndex===0);
  assert.equal(opened.visualState,NEW_BASE_GOAL_PATH_VISUAL_STATE.OPEN);
  assert.equal(opened.gateVisualState,NEW_BASE_GOAL_GATE_VISUAL_STATE.OPEN_HOOP);
  assert.equal(opened.roadConnectionCue,'SHARED_GOAL_LINK_ACTIVE');
  assert.equal(opened.goalConnectionCue,'CONNECTED_TO_SHARED_GOAL');
  assert.equal(opened.sharedGoalId,'goal:shared');
  assert.match(opened.routeGateId,/^goal-gate:P1:0$/);
  assert.deepEqual(opened.straightCardIds,sevenCards('lane-0'));
  assert.equal(opened.physicalCardIdentityResolved,true);
  const closed=presentation.lanePresentations.find(lane=>lane.columnIndex===1);
  assert.equal(closed.visualState,NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED);
  assert.equal(closed.gateVisualState,NEW_BASE_GOAL_GATE_VISUAL_STATE.LOCKED_BARRIER);
  assert.equal(closed.roadConnectionCue,'SHARED_GOAL_LINK_GUIDE');
  assert.equal(closed.goalConnectionCue,'LOCKED_BEFORE_SHARED_GOAL');
});

test('presentation consumes connectedToGoal from caller and never recomputes completion from card count',()=>{
  const source=authoritativeProjectionWithOpenLane(0);
  const manual={...source,laneStates:source.laneStates.map((lane,index)=>({...lane,straightCardCount:index===0?7:0,straightCardIds:index===0?sevenCards('manual'):[],connectedToGoal:index===0?false:lane.connectedToGoal})),connectedGoalPaths:[]};
  const presentation=projectNewBaseGoalPathPresentation(manual);
  const first=presentation.lanePresentations[0];
  assert.equal(presentation.ok,true);
  assert.equal(first.straightCardCount,7);
  assert.equal(first.connectedToGoal,false);
  assert.equal(first.gateVisualState,NEW_BASE_GOAL_GATE_VISUAL_STATE.LOCKED_BARRIER);
  assert.equal(presentation.openGoalPathCount,0);
});

test('preserves exact participant lane gate column and physical card identity for surface consumers',()=>{
  const source=authoritativeProjectionWithOpenLane(5);
  const presentation=projectNewBaseGoalPathPresentation(source);
  assert.equal(presentation.lanePresentations.length,12);
  for(const sourceLane of source.laneStates){
    const projected=presentation.lanePresentations.find(lane=>lane.participantId===sourceLane.participantId&&lane.laneIndex===sourceLane.laneIndex);
    assert.ok(projected);
    assert.equal(projected.key,`${sourceLane.participantId}:${sourceLane.laneIndex}`);
    assert.equal(projected.columnIndex,sourceLane.columnIndex);
    assert.equal(projected.goalRowColumnIndex,sourceLane.goalRowColumnIndex);
    assert.equal(projected.routeGateId,sourceLane.routeGateId);
    assert.equal(projected.sharedGoalId,sourceLane.sharedGoalId);
    assert.deepEqual(projected.straightCardIds,sourceLane.straightCardIds);
  }
});

test('invalid source or terminal-win source fails closed with no open visual lanes',()=>{
  const invalid=projectNewBaseGoalPathPresentation({ok:false,reason:'STRAIGHT_COLUMN_SNAPSHOT_INVALID',connectedGoalPaths:[]});
  assert.equal(invalid.ok,false); assert.equal(invalid.reason,'GOAL_PATH_PROJECTION_NOT_OK'); assert.deepEqual(invalid.lanePresentations,[]); assert.equal(invalid.terminalWin,false);
  const source=authoritativeProjectionWithOpenLane(0);
  const forbidden=projectNewBaseGoalPathPresentation({...source,terminalWin:true});
  assert.equal(forbidden.ok,false); assert.equal(forbidden.reason,'SEVEN_STRAIGHT_TERMINAL_WIN_FORBIDDEN');
});

test('malformed physical identity and duplicate lane identity fail closed',()=>{
  const source=authoritativeProjectionWithOpenLane(0);
  const malformedCards={...source,laneStates:[{...source.laneStates[0],straightCardIds:['wrong-length']}]};
  assert.equal(projectNewBaseGoalPathPresentation(malformedCards).reason,'LANE_STATE_INVALID');
  const duplicate={...source,laneStates:[source.laneStates[0],{...source.laneStates[1],participantId:'P1',laneIndex:0}]};
  assert.equal(projectNewBaseGoalPathPresentation(duplicate).reason,'LANE_IDENTITY_DUPLICATE');
});

test('presentation remains non-authoritative while declaring one GOAL and twelve gate visuals',()=>{
  const presentation=projectNewBaseGoalPathPresentation(authoritativeProjectionWithOpenLane(11));
  assert.equal(isNewBaseGoalPathPresentation(presentation),true);
  assert.equal(presentation.presentationOnly,true);
  assert.equal(presentation.gameplayAuthority,false);
  assert.equal(presentation.gameStateWrite,false);
  assert.equal(presentation.movementAuthority,false);
  assert.equal(presentation.legalityAuthority,false);
  assert.equal(presentation.resultAuthority,false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.sharedGoalCount,1);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.routeGateCount,12);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.closedGateVisual,'LOCKED_BARRIER');
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.openGateVisual,'OPEN_HOOP');
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.computesStraightCompletion,false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.computesMovementLegality,false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.computesResult,false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.sevenStraightTerminalWin,false);
});
