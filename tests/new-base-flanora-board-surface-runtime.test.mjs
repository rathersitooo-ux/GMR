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

const INPUT = Object.freeze({
  participantIds: ['P1','P2','P3','P4'],
  horizontalCellCount: 12,
  shieldLinkedLaneColumnsByParticipant: {
    P1: [0,1,2], P2: [3,4,5], P3: [6,7,8], P4: [9,10,11],
  },
});

function makeFakeDom() {
  const byId = new Map();
  const documentLike = {
    createElement(tagName) {
      const attrs = new Map();
      const node = {
        tagName, parentNode: null, children: [], dataset: {}, style: {}, className: '', textContent: '',
        appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) byId.set(child.id, child); return child; },
        removeChild(child) { this.children = this.children.filter((x) => x !== child); child.parentNode = null; return child; },
        remove() { if (this.parentNode) this.parentNode.removeChild(this); },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.get(name) ?? null; },
      };
      Object.defineProperty(node, 'id', {
        get() { return this._id ?? ''; },
        set(value) { this._id = value; if (value) byId.set(value, this); },
      });
      return node;
    },
    getElementById(id) { return byId.get(id) ?? null; },
  };
  documentLike.head = documentLike.createElement('head');
  return documentLike;
}

function standardLayout() { return createFlanoraMapLayout(INPUT); }

function goalPathPresentationFor(runtime, countsByLaneKey = {}) {
  return {
    schema: 'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1',
    ok: true,
    terminalWin: false,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    lanePresentations: runtime.model.lanes.map((lane) => {
      const straightCardCount = countsByLaneKey[lane.key] ?? 0;
      return {
        participantId: lane.participantId,
        laneIndex: lane.laneIndex,
        straightCardCount,
        connectedToGoal: straightCardCount === 7,
      };
    }),
  };
}

function laneNode(runtime, participantSlot, laneIndex) {
  return runtime.progressionGrid.children[participantSlot].children[laneIndex];
}

function roadNode(runtime, participantSlot, laneIndex) {
  return laneNode(runtime, participantSlot, laneIndex).children[0];
}

test('projects current board core into 12 Shield lanes, seven-step semantic tracks, top GOAL endpoints and 26 shared clearing cells', () => {
  const model = createFlanoraBoardSurfaceModel(INPUT);
  assert.equal(model.lanes.length, 12);
  assert.equal(model.clearingCells.length, 26);
  assert.equal(model.clearingCycleCellIds.length, 26);
  assert.deepEqual(model.lanes.map((lane) => lane.columnIndex), [0,1,2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual(model.lanes.slice(0,3).map((lane) => lane.laneLabel), ['L','C','R']);
  assert.equal(model.lanes.every((lane) => lane.roadSteps.length === 7), true);
  assert.equal(new Set(model.lanes.map((lane) => lane.goalId)).size, 12);
  assert.equal(new Set(model.lanes.map((lane) => lane.shieldId)).size, 12);
  assert.equal(model.presentationOnly, true);
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.movementAuthority, false);
  assert.equal(model.legalityAuthority, false);
  assert.equal(model.resultAuthority, false);
  assert.equal(model.optionalRuleGeometryIncluded, false);
  assert.equal(model.upperProgressIsPrebuiltMovementField, false);
});

test('preserves same-column clearing entry and the four current start anchors', () => {
  const model = projectFlanoraBoardSurfaceModel(standardLayout());
  for (const lane of model.lanes) assert.equal(lane.clearingEntryCellId, `clearing:top:${lane.columnIndex}`);
  const starts = Object.fromEntries(model.clearingCells.filter((cell) => cell.startParticipantIds.length).map((cell) => [cell.id, cell.startParticipantIds]));
  assert.deepEqual(starts, {
    'clearing:top:1': ['P1'],
    'clearing:top:4': ['P2'],
    'clearing:top:7': ['P3'],
    'clearing:top:10': ['P4'],
  });
});

test('mount composes top GOAL, four three-lane vertical clusters, Shields, then the shared movement field', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const runtime = mountFlanoraBoardSurface({ host, documentLike, layout: standardLayout() });
  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.snapshot(), {
    laneCount: 12,
    goalCount: 12,
    shieldCount: 12,
    roadStepCount: 84,
    visibleBuiltRoadStepCount: 0,
    clearingCellCount: 26,
    clearingCycleCellIds: runtime.model.clearingCycleCellIds,
    performanceProfile: 'standard',
    movementAuthority: false,
  });
  assert.equal(runtime.root.dataset.goalEdge, 'top');
  assert.equal(runtime.root.dataset.roadEntryEdge, 'bottom');
  assert.equal(runtime.root.dataset.progressionDirection, 'bottom-to-top');
  assert.equal(runtime.root.dataset.centralWorldLayout, 'shared-field-below-four-three-lane-clusters');
  assert.equal(runtime.root.dataset.futureDiscreteProgressionSlots, 'false');
  assert.match(runtime.root.getAttribute('aria-label'), /共有フィールド.*盾.*上側GOAL.*未成立位置は開放マスとして表示しない/);

  assert.deepEqual(runtime.upper.children.map((node) => node.className), ['grFlanoraGoalBand', 'grFlanoraProgressionGrid']);
  assert.deepEqual(runtime.goalBand.children.map((node) => node.className), ['grFlanoraGoalLabel', 'grFlanoraGoalEndpoints']);
  assert.equal(runtime.goalBand.children[0].textContent, 'GOAL');
  assert.equal(runtime.goalEndpoints.children.length, 12);
  assert.equal(runtime.progressionGrid.children.length, 4);
  assert.deepEqual(
    runtime.progressionGrid.children.map((node) => [node.dataset.participantSlot, node.style.gridColumn, node.children.length]),
    [['0','1',3], ['1','2',3], ['2','3',3], ['3','4',3]],
  );
  assert.deepEqual(laneNode(runtime, 0, 0).children.map((node) => node.className), ['grFlanoraRoad','grFlanoraShield']);

  const road = roadNode(runtime, 0, 0);
  assert.equal(road.children.length, 0);
  assert.equal(road.dataset.progressionCapacity, '7');
  assert.equal(road.dataset.progressionBuiltCount, '0');
  assert.equal(road.dataset.futureDiscreteSlots, 'false');
  assert.equal(road.dataset.connectedToGoal, 'false');
  assert.match(road.getAttribute('aria-label'), /成立済み 0\/7.*未成立位置は開放マスとして表示しない/);
  assert.equal(laneNode(runtime, 0, 0).children[1].textContent, '盾');

  const styleText = documentLike.head.children[0].textContent;
  assert.match(styleText, /grid-template-rows:minmax\(0,62%\) minmax\(96px,38%\)/);
  assert.match(styleText, /\.grFlanoraProgressionGrid\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styleText, /\.grFlanoraParticipantCluster\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styleText, /\.grFlanoraRoad\{[^}]*display:flex;flex-direction:column-reverse/);
  assert.match(styleText, /\.grFlanoraRoad::before\{[^}]*left:50%;top:1%;bottom:1%;width:2px/);
  assert.match(styleText, /\.grFlanoraRoadStep\{[^}]*height:clamp\(12px,2\.55vh,23px\)/);
  assert.doesNotMatch(styleText, /\.grFlanoraUpper\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(styleText, /\.grFlanoraRoad\{[^}]*direction:rtl/);
  assert.doesNotMatch(styleText, /data-progression-stage-state="UNRESOLVED"/);
  assert.doesNotMatch(styleText, /data-progression-stage-state="LATENT"/);
  assert.doesNotMatch(styleText, /border-style:dotted|border-style:dashed/);
  assert.match(styleText, /@media\(max-height:420px\).*minmax\(0,60%\) minmax\(78px,40%\)/);
  assert.match(styleText, /@media\(max-width:540px\) and \(orientation:portrait\).*\.grFlanoraProgressionGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);

  assert.equal(runtime.resolveGoal('P1', 0).dataset.flanoraGoal, 'P1:0');
  assert.equal(runtime.resolveGoal('P1', 0).dataset.connectedToGoal, 'false');
  assert.equal(runtime.resolveShield('P4', 2).dataset.clearingEntryCellId, 'clearing:top:11');
  assert.equal(runtime.resolveRoadStep('P2', 1, 7), null);
  assert.equal(runtime.resolveClearingCell('clearing:top:4').dataset.startParticipant, 'P2');
  assert.equal(runtime.resolveRoadStep('P2', 1, 8), null);
  assert.equal(runtime.clearing.dataset.sharedMainField, 'true');
  assert.equal(runtime.clearing.children.length, 26);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.gameStateWrite, false);
  assert.equal(runtime.movementAuthority, false);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
});

test('reduced-motion and low-perf keep exact board semantics without future discrete nodes', () => {
  const documentLike = makeFakeDom();
  const a = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout(), reducedMotion: true });
  const b = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout(), lowPerf: true });
  assert.equal(a.snapshot().performanceProfile, 'reduced_motion');
  assert.equal(b.snapshot().performanceProfile, 'low_perf');
  assert.deepEqual(a.snapshot().clearingCycleCellIds, b.snapshot().clearingCycleCellIds);
  assert.equal(a.snapshot().roadStepCount, 84);
  assert.equal(b.snapshot().roadStepCount, 84);
  assert.equal(a.snapshot().visibleBuiltRoadStepCount, 0);
  assert.equal(b.snapshot().visibleBuiltRoadStepCount, 0);
});

test('fails closed if presentation is handed a layout that claims movement authority or optional-rule geometry', () => {
  const good = standardLayout();
  assert.throws(() => projectFlanoraBoardSurfaceModel({ ...good, geometryIsMovementAuthority: true }), /MUST_NOT_OWN_MOVEMENT/);
  assert.throws(() => projectFlanoraBoardSurfaceModel({ ...good, optionalRuleGeometryIncluded: true }), /OPTIONAL_RULE_GEOMETRY_FORBIDDEN/);
});

test('mount fails soft without a DOM host and contract denies a second board engine', () => {
  assert.deepEqual(mountFlanoraBoardSurface(), {
    schema: 'gameroad.new-base-flanora-board-surface-runtime.v1',
    mounted: false,
    presentationOnly: true,
    gameplayAuthority: false,
    reason: 'DOM_HOST_REQUIRED',
  });
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.mount, 'explicit_caller_mount_only');
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.secondBoardEngine, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.optionalRuleGeometryIncluded, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.futureDiscreteStageNodes, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.unresolvedStageDefault, 'NO_DISCRETE_NODE_CONTINUOUS_TRACK_ONLY');
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.sharedGoalVisualCount, 1);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.progressionDirection, 'BOTTOM_TO_TOP');
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.centralWorldLayout, 'SHARED_FIELD_BELOW_FOUR_THREE_LANE_CLUSTERS');
});

test('sync creates card-shaped nodes only for BUILT stages and connects a completed seven-card lane to the top GOAL', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const runtime = mountFlanoraBoardSurface({ host, documentLike, layout: standardLayout() });

  assert.equal(runtime.resolveRoadStep('P1', 0, 1), null);
  const progression = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, {
    'P1:0': 3,
    'P2:1': 7,
  }));
  assert.equal(progression.ok, true);
  assert.equal(progression.totalBuiltStageCount, 10);
  assert.equal(progression.totalLatentStageCount, 74);

  const applied = runtime.syncProgressionPresentation(progression);
  assert.deepEqual(applied, {
    applied: true,
    reason: 'PROGRESSION_PRESENTATION_APPLIED',
    builtStageCount: 10,
    latentStageCount: 74,
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    gameStateWrite: false,
  });
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 10);
  assert.equal(runtime.resolveRoadStep('P1', 0, 1).dataset.progressionStageState, 'BUILT');
  assert.equal(runtime.resolveRoadStep('P1', 0, 3).dataset.progressionEstablished, 'true');
  assert.equal(runtime.resolveRoadStep('P1', 0, 4), null);
  assert.equal(runtime.resolveRoadStep('P2', 1, 7).dataset.progressionStageState, 'BUILT');
  assert.equal(runtime.resolveRoadStep('P3', 2, 7), null);
  assert.equal(roadNode(runtime, 0, 0).children.length, 3);
  assert.equal(roadNode(runtime, 1, 1).children.length, 7);
  assert.equal(roadNode(runtime, 0, 0).dataset.progressionLatentCount, '4');
  assert.equal(roadNode(runtime, 0, 0).dataset.futureDiscreteSlots, 'false');
  assert.equal(roadNode(runtime, 0, 0).dataset.connectedToGoal, 'false');
  assert.equal(roadNode(runtime, 1, 1).dataset.connectedToGoal, 'true');
  assert.equal(runtime.resolveGoal('P2', 1).dataset.connectedToGoal, 'true');

  const reducedProgression = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, {
    'P1:0': 1,
    'P2:1': 6,
  }));
  const reduced = runtime.syncProgressionPresentation(reducedProgression);
  assert.equal(reduced.applied, true);
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 7);
  assert.equal(runtime.resolveRoadStep('P1', 0, 1).dataset.progressionStageState, 'BUILT');
  assert.equal(runtime.resolveRoadStep('P1', 0, 2), null);
  assert.equal(roadNode(runtime, 0, 0).children.length, 1);
  assert.equal(roadNode(runtime, 1, 1).children.length, 6);
  assert.equal(roadNode(runtime, 1, 1).dataset.connectedToGoal, 'false');
  assert.equal(runtime.resolveGoal('P2', 1).dataset.connectedToGoal, 'false');

  const beforeInvalid = runtime.snapshot().visibleBuiltRoadStepCount;
  const refused = runtime.syncProgressionPresentation(null);
  assert.equal(refused.applied, false);
  assert.equal(refused.reason, 'PROGRESSION_PRESENTATION_REQUIRED');
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, beforeInvalid);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.gameStateWrite, false);
  assert.equal(runtime.movementAuthority, false);
});

test('progression runtime refuses partial authoritative projections before mutating the visible lane state', () => {
  const documentLike = makeFakeDom();
  const runtime = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout() });
  const oneLaneGoalPath = {
    schema: 'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1',
    ok: true,
    terminalWin: false,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    lanePresentations: [{ participantId: 'P1', laneIndex: 0, straightCardCount: 2, connectedToGoal: false }],
  };
  const partial = projectNewBaseProgressionLanePresentation(oneLaneGoalPath);
  assert.equal(partial.ok, true);
  const refused = runtime.syncProgressionPresentation(partial);
  assert.equal(refused.applied, false);
  assert.equal(refused.reason, 'FULL_FLANORA_PROGRESSION_REQUIRED');
  assert.equal(runtime.resolveRoadStep('P1', 0, 1), null);
  assert.equal(runtime.resolveRoadStep('P1', 0, 3), null);
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 0);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.progressionSyncWritesGameState, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.secondBoardEngine, false);
});
