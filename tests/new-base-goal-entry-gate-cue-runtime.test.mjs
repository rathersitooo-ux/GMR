import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT,
  mountNewBaseGoalEntryGateCue,
} from '../browser/new-base-goal-entry-gate-cue-runtime.mjs';

function makeFakeDom() {
  const byId = new Map();
  const documentLike = {
    createElement(tagName) {
      const attrs = new Map();
      const styleValues = {};
      const node = {
        tagName,
        parentNode: null,
        children: [],
        dataset: {},
        className: '',
        textContent: '',
        style: {
          setProperty(name, value) { styleValues[name] = String(value); },
          getPropertyValue(name) { return styleValues[name] ?? ''; },
        },
        appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) byId.set(child.id, child); return child; },
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
        removeAttribute(name) {
          attrs.delete(name);
          if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
            delete this.dataset[key];
          }
        },
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

function makeBoardSurface(documentLike) {
  const routeGates = new Map();
  const sharedGoal = documentLike.createElement('div');
  sharedGoal.dataset.flanoraSharedGoal = 'goal:shared';
  const participants = ['P1', 'P2', 'P3', 'P4'];
  for (const participantId of participants) {
    for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
      const key = `${participantId}:${laneIndex}`;
      const anchor = documentLike.createElement('span');
      anchor.dataset.flanoraRouteGate = `goal-gate:${key}`;
      anchor.dataset.sharedGoalId = 'goal:shared';
      routeGates.set(key, anchor);
    }
  }
  return {
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    resolveSharedGoal() { return sharedGoal; },
    resolveRouteGate(participantId, laneIndex) { return routeGates.get(`${participantId}:${laneIndex}`) ?? null; },
    resolveGoal(participantId, laneIndex) { return routeGates.get(`${participantId}:${laneIndex}`) ?? null; },
    routeGates,
    sharedGoal,
  };
}

function makeGoalPresentation(openKeys = []) {
  const open = new Set(openKeys);
  const lanePresentations = [];
  for (let participant = 1; participant <= 4; participant += 1) {
    for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
      const key = `P${participant}:${laneIndex}`;
      lanePresentations.push({
        key,
        participantId: `P${participant}`,
        laneIndex,
        routeGateId: `goal-gate:${key}`,
        sharedGoalId: 'goal:shared',
        connectedToGoal: open.has(key),
      });
    }
  }
  return {
    ok: true,
    terminalWin: false,
    sharedGoalId: 'goal:shared',
    sharedGoalCount: 1,
    routeGateCount: 12,
    lanePresentations,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
  };
}

const COLORS = Object.freeze({ P1: '#e84b4b', P2: '#4b8de8', P3: '#e8c94b', P4: '#62c66c' });

test('mounts twelve persistent locked barriers at route anchors before one shared GOAL', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(), participantColors: COLORS, documentLike });
  assert.equal(runtime.mounted, true);
  assert.equal(runtime.snapshot().laneGateCount, 12);
  assert.equal(runtime.snapshot().sharedGoalCount, 1);
  assert.equal(runtime.snapshot().openLaneCount, 0);
  assert.equal(runtime.snapshot().lockedBarrierCount, 12);
  assert.equal(runtime.snapshot().openHoopCount, 0);
  assert.equal(runtime.snapshot().activeArrowCount, 0);
  assert.equal(board.routeGates.get('P1:0').children.length, 1);
  assert.equal(runtime.resolveLane('P1', 0).gate.dataset.goalPathOpen, '0');
  assert.equal(runtime.resolveLane('P1', 0).gate.dataset.closedGateMaterial, 'hard-ice-bar');
  assert.equal(runtime.resolveLane('P1', 0).gate.dataset.openGateForm, 'hoop-with-transparent-membrane');
  assert.equal(board.sharedGoal.dataset.flanoraSharedGoal, 'goal:shared');
});

test('closed to open changes only the authoritative route from solid barrier to open hoop', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(), participantColors: COLORS, documentLike });
  const gateBefore = runtime.resolveLane('P1', 1).gate;
  const result = runtime.syncGoalPathPresentation(makeGoalPresentation(['P1:1']));
  assert.equal(result.ok, true);
  assert.equal(result.openLaneCount, 1);
  assert.equal(result.lockedBarrierCount, 11);
  assert.equal(result.openHoopCount, 1);
  assert.equal(runtime.resolveLane('P1', 1).gate, gateBefore);
  assert.equal(gateBefore.dataset.goalPathOpen, '1');
  assert.equal(gateBefore.dataset.gateTransition, 'shatter_to_open');
  assert.equal(runtime.resolveLane('P1', 1).arrowStack.children.length, 3);
  assert.deepEqual(runtime.snapshot().activeRouteGateIds, ['goal-gate:P1:1']);
  assert.equal(board.sharedGoal.dataset.connectedRouteCount, '1');
  assert.equal(board.routeGates.get('P1:1').dataset.connectedToGoal, 'true');
  assert.equal(board.routeGates.get('P1:0').dataset.connectedToGoal, 'false');
});

test('repeated open sync is idempotent and does not duplicate gate or arrow nodes', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(), participantColors: COLORS, documentLike });
  runtime.syncGoalPathPresentation(makeGoalPresentation(['P3:2']));
  const gateBefore = runtime.resolveLane('P3', 2).gate;
  const arrowBefore = runtime.resolveLane('P3', 2).arrowStack;
  const anchor = board.routeGates.get('P3:2');
  assert.equal(anchor.children.length, 2);
  runtime.syncGoalPathPresentation(makeGoalPresentation(['P3:2']));
  assert.equal(runtime.resolveLane('P3', 2).gate, gateBefore);
  assert.equal(runtime.resolveLane('P3', 2).arrowStack, arrowBefore);
  assert.equal(anchor.children.length, 2);
  assert.equal(runtime.resolveLane('P3', 2).gate.dataset.gateTransition, undefined);
  assert.equal(runtime.snapshot().activeArrowCount, 1);
});

test('open to closed removes the open cue and restores the same persistent barrier gate', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(['P4:0']), participantColors: COLORS, documentLike });
  const gateBefore = runtime.resolveLane('P4', 0).gate;
  runtime.syncGoalPathPresentation(makeGoalPresentation());
  assert.equal(runtime.resolveLane('P4', 0).gate, gateBefore);
  assert.equal(gateBefore.dataset.goalPathOpen, '0');
  assert.equal(runtime.resolveLane('P4', 0).arrowStack, null);
  assert.equal(board.routeGates.get('P4:0').children.length, 1);
  assert.equal(board.sharedGoal.dataset.connectedRouteCount, '0');
});

test('open lane without participant color remains open but does not invent an arrow color', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(['P4:2']), participantColors: { P1: COLORS.P1 }, documentLike });
  assert.equal(runtime.resolveLane('P4', 2).gate.dataset.goalPathOpen, '1');
  assert.equal(runtime.resolveLane('P4', 2).arrowStack, null);
  assert.deepEqual(runtime.snapshot().unresolvedOpenLaneKeys, ['P4:2']);
  const result = runtime.syncGoalPathPresentation(makeGoalPresentation(['P4:2']), { participantColors: COLORS });
  assert.equal(result.ok, true);
  assert.equal(runtime.resolveLane('P4', 2).arrowStack.style.getPropertyValue('--gameroad-goal-entry-cue-color'), COLORS.P4);
  assert.deepEqual(runtime.snapshot().unresolvedOpenLaneKeys, []);
});

test('mismatched lane set fails before mutating current visible gate state', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(['P2:0']), participantColors: COLORS, documentLike });
  const before = runtime.snapshot();
  const invalid = makeGoalPresentation(['P1:0']);
  invalid.lanePresentations = invalid.lanePresentations.slice(0, 11);
  const result = runtime.syncGoalPathPresentation(invalid);
  assert.deepEqual(result, { ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
  assert.deepEqual(runtime.snapshot(), before);
});

test('reduced motion and low perf preserve static gate state without shatter animation', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const documentLike = makeFakeDom();
    const board = makeBoardSurface(documentLike);
    const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(), participantColors: COLORS, documentLike, ...options });
    runtime.syncGoalPathPresentation(makeGoalPresentation(['P1:0']));
    assert.equal(runtime.snapshot().activeArrowCount, 1);
    assert.equal(runtime.snapshot().animationMode, 'STATIC_GATE_STATE');
    assert.equal(runtime.resolveLane('P1', 0).gate.dataset.goalPathOpen, '1');
    assert.equal(runtime.resolveLane('P1', 0).gate.dataset.gateTransition, undefined);
    assert.equal(runtime.resolveLane('P1', 0).arrowStack.children[0].textContent, '↑');
  }
});

test('invalid authority fails soft and destroy removes only runtime-owned nodes', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const invalid = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: { ...board, movementAuthority: true }, goalPathPresentation: makeGoalPresentation(['P1:0']), participantColors: COLORS, documentLike });
  assert.equal(invalid.mounted, false);
  assert.equal(invalid.reason, 'BOARD_SURFACE_RUNTIME_INVALID');

  const runtime = mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime: board, goalPathPresentation: makeGoalPresentation(), participantColors: COLORS, documentLike });
  runtime.syncGoalPathPresentation(makeGoalPresentation(['P1:0', 'P2:1']));
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(board.routeGates.get('P1:0').children.length, 0);
  assert.equal(board.routeGates.get('P2:1').children.length, 0);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.gateCount, 12);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.sharedGoalCount, 1);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.closedGateVisual, 'SOLID_LOCKED_BARRIER');
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.openGateVisual, 'OPEN_HOOP_WITH_TRANSPARENT_MEMBRANE');
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.closedGateMaterial, 'HARD_ICE_BAR');
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesSevenCardCompletion, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesMovementLegality, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesResult, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.writesGameState, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.secondMovementEngine, false);
});
