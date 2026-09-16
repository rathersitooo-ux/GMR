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

const TARGET_FILE_ID = 'file_00000000dbf08211a12db264680e0d82';
const TARGET_SHA256 = '8b5d3723d46101a7675921c058a5308347d7740318af43161be7e76459d47a97';
const TARGET_LANE_X = [110,210,310,477,580,682,849,952,1054,1221,1323,1425];

const INPUT = Object.freeze({
  participantIds: ['P1','P2','P3','P4'],
  horizontalCellCount: 12,
  shieldLinkedLaneColumnsByParticipant: {
    P1: [0,1,2], P2: [3,4,5], P3: [6,7,8], P4: [9,10,11],
  },
});

function makeFakeDom() {
  const byId = new Map();
  const make = (tagName) => {
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
  };
  const documentLike = {
    createElement: make,
    createElementNS(_namespace, tagName) { return make(tagName); },
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

test('projects existing 4x3 lane and Shield identities onto one fixed-reference shared GOAL', () => {
  const model = createFlanoraBoardSurfaceModel(INPUT);
  assert.equal(model.lanes.length, 12);
  assert.equal(model.clearingCells.length, 26);
  assert.equal(model.clearingCycleCellIds.length, 26);
  assert.equal(model.sharedGoalId, 'goal:shared');
  assert.equal(new Set(model.lanes.map((lane) => lane.goalId)).size, 1);
  assert.equal(model.lanes.every((lane) => lane.goalId === 'goal:shared'), true);
  assert.equal(new Set(model.lanes.map((lane) => lane.goalLinkId)).size, 12);
  assert.equal(new Set(model.lanes.map((lane) => lane.shieldId)).size, 12);
  assert.deepEqual(model.lanes.map((lane) => lane.columnIndex), [0,1,2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual(model.lanes.map((lane) => lane.referenceX), TARGET_LANE_X);
  assert.deepEqual(model.lanes.slice(0,3).map((lane) => lane.laneLabel), ['L','C','R']);
  assert.equal(model.lanes.every((lane) => lane.roadSteps.length === 7), true);
  assert.equal(model.fixedReference.fileId, TARGET_FILE_ID);
  assert.equal(model.fixedReference.sha256, TARGET_SHA256);
  assert.equal(model.fixedReference.width, 1536);
  assert.equal(model.fixedReference.height, 864);
  assert.equal(model.presentationOnly, true);
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.movementAuthority, false);
  assert.equal(model.legalityAuthority, false);
  assert.equal(model.resultAuthority, false);
});

test('preserves existing same-column Shield-to-shared-field identities and current start anchors', () => {
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

test('mount uses one top GOAL, twelve independent links, vertical lanes, Shields, and one shared lower field', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const runtime = mountFlanoraBoardSurface({ host, documentLike, layout: standardLayout() });
  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.snapshot(), {
    laneCount: 12,
    goalCount: 1,
    goalLinkCount: 12,
    shieldCount: 12,
    roadStepCount: 84,
    visibleBuiltRoadStepCount: 0,
    clearingCellCount: 26,
    clearingCycleCellIds: runtime.model.clearingCycleCellIds,
    fixedReferenceFileId: TARGET_FILE_ID,
    fixedReferenceSha256: TARGET_SHA256,
    performanceProfile: 'standard',
    movementAuthority: false,
  });
  assert.equal(runtime.root.dataset.goalTopology, 'one-shared-goal');
  assert.equal(runtime.root.dataset.goalLinkCount, '12');
  assert.equal(runtime.root.dataset.progressionDirection, 'bottom-to-top');
  assert.equal(runtime.root.dataset.centralWorldLayout, 'fixed-user-reference');
  assert.equal(runtime.root.dataset.fixedReferenceFileId, TARGET_FILE_ID);
  assert.equal(runtime.root.dataset.fixedReferenceSha256, TARGET_SHA256);
  assert.equal(runtime.root.dataset.futureDiscreteProgressionSlots, 'false');
  assert.match(runtime.root.getAttribute('aria-label'), /共有GOAL.*4人×3列.*Shield.*共有フィールド/);

  assert.equal(runtime.upper.children.length, 12);
  assert.deepEqual(runtime.upper.children.map((node) => node.children.map((child) => child.className)),
    Array.from({ length: 12 }, () => ['grFlanoraRoad', 'grFlanoraShield']));
  assert.deepEqual(runtime.upper.children.map((node) => node.dataset.referenceColumn), ['0','1','2','3','4','5','6','7','8','9','10','11']);
  assert.equal(runtime.goalLinks.children.length, 12);
  assert.equal(runtime.sharedGoal.dataset.sharedGoal, 'true');
  assert.equal(runtime.resolveGoal('P1', 0), runtime.sharedGoal);
  assert.equal(runtime.resolveGoal('P4', 2), runtime.sharedGoal);
  assert.notEqual(runtime.resolveGoalLink('P1', 0), runtime.resolveGoalLink('P1', 1));
  assert.equal(runtime.resolveGoalLink('P3', 2).dataset.goalConnected, 'false');
  assert.equal(runtime.resolveShield('P4', 2).dataset.clearingEntryCellId, 'clearing:top:11');
  assert.equal(runtime.resolveClearingCell('clearing:top:4').dataset.startParticipant, 'P2');

  const firstRoad = runtime.upper.children[0].children[0];
  assert.equal(firstRoad.children.length, 0);
  assert.equal(firstRoad.dataset.progressionCapacity, '7');
  assert.equal(firstRoad.dataset.progressionBuiltCount, '0');
  assert.match(firstRoad.getAttribute('aria-label'), /未成立位置は空のまま/);

  const styleText = documentLike.head.children[0].textContent;
  assert.match(styleText, /\.grFlanoraLane\{position:absolute/);
  assert.match(styleText, /\.grFlanoraRoad\{[^}]*grid-template-rows:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(styleText, /\.grFlanoraShield\{[^}]*clip-path:polygon/);
  assert.match(styleText, /\.grFlanoraGoalLinks line/);
  assert.doesNotMatch(styleText, /\.grFlanoraRoad::before/);
  assert.doesNotMatch(styleText, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-template-rows:repeat\(6/);
  assert.doesNotMatch(styleText, /border-style:dotted|border-style:dashed/);

  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.gameStateWrite, false);
  assert.equal(runtime.movementAuthority, false);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
});

test('reduced-motion and low-perf preserve the same fixed-reference topology', () => {
  const documentLike = makeFakeDom();
  const a = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout(), reducedMotion: true });
  const b = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout(), lowPerf: true });
  assert.equal(a.snapshot().performanceProfile, 'reduced_motion');
  assert.equal(b.snapshot().performanceProfile, 'low_perf');
  assert.equal(a.snapshot().goalCount, 1);
  assert.equal(b.snapshot().goalLinkCount, 12);
  assert.equal(a.snapshot().fixedReferenceSha256, TARGET_SHA256);
  assert.equal(b.snapshot().fixedReferenceSha256, TARGET_SHA256);
  assert.equal(a.snapshot().visibleBuiltRoadStepCount, 0);
  assert.equal(b.snapshot().visibleBuiltRoadStepCount, 0);
});

test('fails closed if presentation is handed a layout that claims movement authority or optional-rule geometry', () => {
  const good = standardLayout();
  assert.throws(() => projectFlanoraBoardSurfaceModel({ ...good, geometryIsMovementAuthority: true }), /MUST_NOT_OWN_MOVEMENT/);
  assert.throws(() => projectFlanoraBoardSurfaceModel({ ...good, optionalRuleGeometryIncluded: true }), /OPTIONAL_RULE_GEOMETRY_FORBIDDEN/);
});

test('mount fails soft without DOM and contract forbids a second board engine', () => {
  assert.deepEqual(mountFlanoraBoardSurface(), {
    schema: 'gameroad.new-base-flanora-board-surface-runtime.v2',
    mounted: false,
    presentationOnly: true,
    gameplayAuthority: false,
    reason: 'DOM_HOST_REQUIRED',
  });
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.mount, 'explicit_caller_mount_only');
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.secondBoardEngine, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.fixedReferenceFileId, TARGET_FILE_ID);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.fixedReferenceSha256, TARGET_SHA256);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.sharedGoalCount, 1);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.goalLinkCount, 12);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.goalEndpointCount, 1);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.futureDiscreteStageNodes, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.progressionSyncWritesGameState, false);
});

test('sync creates only BUILT stage nodes bottom-to-top and lights only completed GOAL links', () => {
  const documentLike = makeFakeDom();
  const runtime = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout() });
  const progression = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, {
    'P1:0': 3,
    'P2:1': 7,
  }));
  assert.equal(progression.ok, true);
  const applied = runtime.syncProgressionPresentation(progression);
  assert.equal(applied.applied, true);
  assert.equal(applied.builtStageCount, 10);
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 10);

  assert.equal(runtime.resolveRoadStep('P1', 0, 1).style.gridRow, '7');
  assert.equal(runtime.resolveRoadStep('P1', 0, 3).style.gridRow, '5');
  assert.equal(runtime.resolveRoadStep('P1', 0, 4), null);
  assert.equal(runtime.resolveRoadStep('P2', 1, 7).style.gridRow, '1');
  assert.equal(runtime.resolveGoalLink('P1', 0).dataset.goalConnected, 'false');
  assert.equal(runtime.resolveGoalLink('P2', 1).dataset.goalConnected, 'true');
  assert.equal(runtime.resolveGoal('P2', 1), runtime.sharedGoal);
  assert.equal(runtime.resolveGoal('P3', 2), runtime.sharedGoal);

  const p1Road = runtime.upper.children[0].children[0];
  const p2MiddleRoad = runtime.upper.children[4].children[0];
  assert.equal(p1Road.children.length, 3);
  assert.equal(p2MiddleRoad.children.length, 7);
  assert.equal(p1Road.dataset.progressionLatentCount, '4');
  assert.equal(p1Road.dataset.futureDiscreteSlots, 'false');

  const reduced = runtime.syncProgressionPresentation(projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, {
    'P1:0': 1,
    'P2:1': 6,
  })));
  assert.equal(reduced.applied, true);
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 7);
  assert.equal(runtime.resolveRoadStep('P1', 0, 2), null);
  assert.equal(runtime.resolveGoalLink('P2', 1).dataset.goalConnected, 'false');
});

test('progression runtime refuses partial authority before changing visible state', () => {
  const documentLike = makeFakeDom();
  const runtime = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout() });
  const partial = projectNewBaseProgressionLanePresentation({
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
  });
  assert.equal(partial.ok, true);
  const refused = runtime.syncProgressionPresentation(partial);
  assert.equal(refused.applied, false);
  assert.equal(refused.reason, 'FULL_FLANORA_PROGRESSION_REQUIRED');
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 0);
  assert.equal(runtime.resolveGoalLink('P1', 0).dataset.goalConnected, 'false');
});
