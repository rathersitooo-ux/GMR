import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlanoraMapLayout } from '../browser/new-base-flanora-map-layout-core.mjs';
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

test('projects current board core into 12 Shield lanes, seven-step tracks, top GOALs and 26 shared clearing cells', () => {
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
  for (const lane of model.lanes) {
    assert.equal(lane.clearingEntryCellId, `clearing:top:${lane.columnIndex}`);
  }
  const starts = Object.fromEntries(model.clearingCells.filter((cell) => cell.startParticipantIds.length).map((cell) => [cell.id, cell.startParticipantIds]));
  assert.deepEqual(starts, {
    'clearing:top:1': ['P1'],
    'clearing:top:4': ['P2'],
    'clearing:top:7': ['P3'],
    'clearing:top:10': ['P4'],
  });
});

test('mount exposes stable DOM hooks for later authoritative actor/advice/result consumers without owning game state', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const runtime = mountFlanoraBoardSurface({ host, documentLike, layout: standardLayout() });
  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.snapshot(), {
    laneCount: 12,
    goalCount: 12,
    shieldCount: 12,
    roadStepCount: 84,
    clearingCellCount: 26,
    clearingCycleCellIds: runtime.model.clearingCycleCellIds,
    performanceProfile: 'standard',
    movementAuthority: false,
  });
  assert.equal(runtime.resolveGoal('P1', 0).dataset.flanoraGoal, 'P1:0');
  assert.equal(runtime.resolveShield('P4', 2).dataset.clearingEntryCellId, 'clearing:top:11');
  assert.equal(runtime.resolveRoadStep('P2', 1, 7).dataset.flanoraRoadStepId, 'road:P2:1:7');
  assert.equal(runtime.resolveClearingCell('clearing:top:4').dataset.startParticipant, 'P2');
  assert.equal(runtime.resolveRoadStep('P2', 1, 8), null);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.gameStateWrite, false);
  assert.equal(runtime.movementAuthority, false);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
});

test('reduced-motion and low-perf keep the exact board semantics', () => {
  const documentLike = makeFakeDom();
  const a = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout(), reducedMotion: true });
  const b = mountFlanoraBoardSurface({ host: documentLike.createElement('div'), documentLike, layout: standardLayout(), lowPerf: true });
  assert.equal(a.snapshot().performanceProfile, 'reduced_motion');
  assert.equal(b.snapshot().performanceProfile, 'low_perf');
  assert.deepEqual(a.snapshot().clearingCycleCellIds, b.snapshot().clearingCycleCellIds);
  assert.equal(a.snapshot().roadStepCount, 84);
  assert.equal(b.snapshot().roadStepCount, 84);
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
});
