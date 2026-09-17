import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNewBaseProgressionLanePresentation } from '../browser/new-base-progression-lane-presentation-core.mjs';
import {
  FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT,
  createFlanoraBoardSurfaceModel,
  mountFlanoraBoardSurface,
  projectFlanoraBoardSurfaceModel,
} from '../browser/new-base-flanora-board-surface-runtime.mjs';

const INPUT = Object.freeze({
  participantIds: ['P1', 'P2', 'P3', 'P4'],
  horizontalCellCount: 12,
  shieldLinkedLaneColumnsByParticipant: {
    P1: [0, 1, 2],
    P2: [3, 4, 5],
    P3: [6, 7, 8],
    P4: [9, 10, 11],
  },
});

function makeFakeDom() {
  const byId = new Map();
  const documentLike = {
    createElement(tagName) {
      const attrs = new Map();
      const node = {
        tagName,
        parentNode: null,
        children: [],
        dataset: {},
        style: {},
        className: '',
        textContent: '',
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; },
        remove() { if (this.parentNode) this.parentNode.removeChild(this); },
        setAttribute(name, value) {
          attrs.set(name, String(value));
          if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
            this.dataset[key] = String(value);
          }
        },
        getAttribute(name) { return attrs.get(name) ?? null; },
        removeAttribute(name) { attrs.delete(name); },
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

function cards(count, prefix) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

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
    sharedGoalId: 'goal:shared',
    lanePresentations: runtime.model.lanes.map((lane) => {
      const count = countsByLaneKey[lane.key] ?? 0;
      return {
        key: lane.key,
        participantId: lane.participantId,
        laneIndex: lane.laneIndex,
        straightCardCount: count,
        straightCardIds: cards(count, `${lane.key}-card`),
        routeGateId: lane.routeGateId,
        sharedGoalId: 'goal:shared',
        connectedToGoal: count === 7,
      };
    }),
  };
}

function mount(options = {}) {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const runtime = mountFlanoraBoardSurface({ host, documentLike, layoutInput: INPUT, ...options });
  return { documentLike, host, runtime };
}

test('USER_LOCK: one shared GOAL, four x three upper lanes and seven structural round cells per lane', () => {
  const model = createFlanoraBoardSurfaceModel(INPUT);
  assert.equal(model.participantIds.length, 4);
  assert.equal(model.lanes.length, 12);
  assert.equal(model.upperLaneCount, 12);
  assert.equal(model.upperLanesPerParticipant, 3);
  assert.equal(model.roundCellsPerUpperLane, 7);
  assert.equal(model.structuralRoundCellCount, 84);
  assert.equal(model.lanes.every((lane) => lane.roundCells.length === 7), true);
  assert.equal(model.lanes.every((lane) => lane.roundCells.every((cell) => cell.shape === 'ROUND')), true);
  assert.equal(model.sharedGoalCount, 1);
  assert.equal(model.goalBranchCount, 12);
  assert.equal(new Set(model.lanes.map((lane) => lane.goalId)).size, 1);
});

test('USER_LOCK: Shield is part of Gate, never a stoppable cell, and lower field meaning is not inferred here', () => {
  const model = createFlanoraBoardSurfaceModel(INPUT);
  assert.equal(model.lanes.every((lane) => lane.shieldStoppable === false), true);
  assert.equal(model.lanes.every((lane) => lane.shieldCountsAsCell === false), true);
  assert.equal(model.lanes.every((lane) => lane.shieldVisualRole === 'PART_OF_GATE'), true);
  assert.equal(model.lowerFieldOwnership, 'SHARED');
  assert.equal(model.lowerFieldTopologyResolvedHere, false);
  assert.equal(model.cellTypeUniform, false);
  assert.equal(model.unknownCellTypeInference, false);
});

test('stale HORIZONTAL_ZERO / 26-cell data may survive only as compatibility input, never new-board canon', () => {
  const legacy = {
    ...INPUT,
    clearingLoopShape: 'HORIZONTAL_ZERO',
    clearingConnectivity: 'SINGLE_CLOSED_LOOP',
    clearingCells: Array.from({ length: 26 }, (_, index) => ({ id: `legacy:${index}`, kind: 'OLD' })),
  };
  const model = projectFlanoraBoardSurfaceModel(legacy);
  assert.equal(model.stale26CellHorizontalZeroCanon, false);
  assert.equal(model.legacyClearingCompatibility.length, 26);
  assert.equal(model.legacyClearingCompatibility.every((cell) => cell.compatibilityOnly === true), true);
  assert.equal(model.legacyClearingCompatibility.every((cell) => cell.canonicalNewBoardCell === false), true);
  assert.deepEqual(model.clearingCycleCellIds, []);
});

test('mount adds only a nonvisual controller root and no screen-space board topology', () => {
  const { documentLike, host, runtime } = mount();
  assert.equal(runtime.mounted, true);
  assert.equal(host.children.length, 1);
  assert.equal(runtime.root.children.length, 0);
  assert.equal(runtime.root.dataset.screenSpaceUiAttached, 'false');
  assert.equal(runtime.root.dataset.worldSpacePlacement, 'required-existing-field-renderer');
  assert.equal(documentLike.head.children.length, 0);
  assert.equal(runtime.resolveSharedGoal().parentNode, null);
  assert.equal(runtime.resolveGoalBranch('P1', 0).parentNode, null);
  assert.equal(runtime.resolveRouteGate('P1', 0).parentNode, null);
  assert.equal(runtime.resolveShield('P1', 0).parentNode, null);
  const snap = runtime.snapshot();
  assert.equal(snap.screenSpaceUiNodeCount, 0);
  assert.equal(snap.screenSpaceBoardTopology, false);
  assert.equal(snap.stale26CellHorizontalZeroCanon, false);
  assert.equal(snap.worldSpacePlacementRequired, true);
  assert.equal(snap.structuralRoundCellCount, 84);
});

test('inactive branches remain semantically faint/readable and exactly seven established cards opens only that lane', () => {
  const { runtime } = mount();
  const initial = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime));
  assert.equal(runtime.syncProgressionPresentation(initial).applied, true);
  assert.equal(runtime.resolveGoalBranch('P2', 1).dataset.branchVisualState, 'faint-readable');
  assert.equal(runtime.resolveSharedGoal().dataset.connectedRouteCount, '0');

  const six = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, { 'P2:1': 6 }));
  assert.equal(runtime.syncProgressionPresentation(six).applied, true);
  assert.equal(runtime.resolveGoalBranch('P2', 1).dataset.branchVisualState, 'faint-readable');
  assert.equal(runtime.resolveRoadStep('P2', 1, 6).dataset.cardIdentityResolved, 'true');
  assert.equal(runtime.resolveRoadStep('P2', 1, 7), null);

  const seven = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, { 'P2:1': 7 }));
  const applied = runtime.syncProgressionPresentation(seven);
  assert.equal(applied.applied, true);
  assert.equal(runtime.resolveGoalBranch('P2', 1).dataset.branchVisualState, 'strong-open');
  assert.equal(runtime.resolveGoalBranch('P2', 1).dataset.connectedToGoal, 'true');
  assert.equal(runtime.resolveGoalBranch('P2', 0).dataset.branchVisualState, 'faint-readable');
  assert.equal(runtime.resolveSharedGoal().dataset.connectedRouteCount, '1');
  assert.equal(runtime.resolveSharedGoal().dataset.terminalResultAuthority, 'false');
});

test('progression rejects a branch-open state that is not backed by exactly seven built cards', () => {
  const { runtime } = mount();
  const wrong = goalPathPresentationFor(runtime, { 'P1:0': 6 });
  wrong.lanePresentations[0] = { ...wrong.lanePresentations[0], connectedToGoal: true };
  const projection = projectNewBaseProgressionLanePresentation(wrong);
  const result = runtime.syncProgressionPresentation(projection);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'GOAL_BRANCH_STATE_MISMATCH');
  assert.equal(runtime.snapshot().visibleBuiltRoadStepCount, 0);
});

test('Reduced Motion and LowPerf keep the same non-screen-space topology semantics', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const { runtime } = mount(options);
    const seven = projectNewBaseProgressionLanePresentation(goalPathPresentationFor(runtime, { 'P4:2': 7 }));
    assert.equal(runtime.syncProgressionPresentation(seven).applied, true);
    assert.equal(runtime.snapshot().screenSpaceBoardTopology, false);
    assert.equal(runtime.snapshot().structuralRoundCellCount, 84);
    assert.equal(runtime.resolveGoalBranch('P4', 2).dataset.branchVisualState, 'strong-open');
  }
});

test('contract permanently rejects the previous screen-space and stale-26-cell assumptions', () => {
  assert.deepEqual(mountFlanoraBoardSurface(), {
    schema: 'gameroad.new-base-flanora-board-surface-runtime.v2',
    mounted: false,
    presentationOnly: true,
    gameplayAuthority: false,
    reason: 'DOM_HOST_REQUIRED',
  });
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.sharedGoalCount, 1);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.goalBranchCount, 12);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.upperLaneCount, 12);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.roundCellsPerUpperLane, 7);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.structuralRoundCellCount, 84);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.shieldStoppable, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.shieldCountsAsCell, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.screenSpaceBoardTopology, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.fixedViewportPercentLaneGeometry, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.stale26CellHorizontalZeroCanon, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.lowerFieldTopologyResolvedHere, false);
  assert.equal(FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT.imageGenerationEditingOcrRedraw, false);
});
