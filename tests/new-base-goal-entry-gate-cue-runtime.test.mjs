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
        appendChild(child) {
          child.parentNode = this;
          this.children.push(child);
          if (child.id) byId.set(child.id, child);
          return child;
        },
        removeChild(child) {
          this.children = this.children.filter((item) => item !== child);
          child.parentNode = null;
          return child;
        },
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this);
        },
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

function makeBoardSurface(documentLike) {
  const shields = new Map();
  const cells = new Map();
  const participants = ['P1', 'P2', 'P3', 'P4'];
  for (let participant = 0; participant < participants.length; participant += 1) {
    for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
      const column = (participant * 3) + laneIndex;
      const key = `${participants[participant]}:${laneIndex}`;
      const shield = documentLike.createElement('span');
      shield.dataset.clearingEntryCellId = `clearing:top:${column}`;
      const cell = documentLike.createElement('span');
      cells.set(`clearing:top:${column}`, cell);
      shields.set(key, shield);
    }
  }
  return {
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    resolveShield(participantId, laneIndex) { return shields.get(`${participantId}:${laneIndex}`) ?? null; },
    resolveClearingCell(cellId) { return cells.get(cellId) ?? null; },
    cells,
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
        connectedToGoal: open.has(key),
      });
    }
  }
  return {
    ok: true,
    terminalWin: false,
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

test('mounts persistent gates and activates arrows only for authoritative OPEN lanes', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P2:1']),
    participantColors: COLORS,
    documentLike,
  });

  assert.equal(runtime.mounted, true);
  assert.equal(runtime.snapshot().laneGateCount, 12);
  assert.equal(runtime.snapshot().openLaneCount, 1);
  assert.equal(runtime.snapshot().activeArrowCount, 1);
  assert.deepEqual(runtime.snapshot().activeArrowEntryCellIds, ['clearing:top:4']);
  assert.equal(runtime.resolveLane('P2', 1).gate.dataset.goalPathOpen, '1');
  assert.equal(runtime.resolveLane('P2', 0).arrowStack, null);
});

test('reacts to CLOSED -> OPEN at the seventh-card boundary without remounting the gate', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(),
    participantColors: COLORS,
    documentLike,
  });

  const gateBefore = runtime.resolveLane('P1', 1).gate;
  assert.equal(runtime.resolveLane('P1', 1).arrowStack, null);

  const result = runtime.syncGoalPathPresentation(makeGoalPresentation(['P1:1']));
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'GOAL_ENTRY_CUES_SYNCED');
  assert.equal(runtime.resolveLane('P1', 1).gate, gateBefore);
  assert.equal(runtime.resolveLane('P1', 1).gate.dataset.goalPathOpen, '1');
  assert.equal(runtime.resolveLane('P1', 1).arrowStack.children.length, 3);
  assert.deepEqual(runtime.snapshot().activeArrowEntryCellIds, ['clearing:top:1']);
});

test('repeated OPEN sync is idempotent and does not duplicate arrow nodes', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(),
    participantColors: COLORS,
    documentLike,
  });

  runtime.syncGoalPathPresentation(makeGoalPresentation(['P3:2']));
  const arrowBefore = runtime.resolveLane('P3', 2).arrowStack;
  const cell = board.cells.get('clearing:top:8');
  assert.equal(cell.children.length, 2);

  runtime.syncGoalPathPresentation(makeGoalPresentation(['P3:2']));
  assert.equal(runtime.resolveLane('P3', 2).arrowStack, arrowBefore);
  assert.equal(cell.children.length, 2);
  assert.equal(runtime.snapshot().activeArrowCount, 1);
});

test('OPEN -> CLOSED removes only the arrow while keeping the persistent boundary gate', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P4:0']),
    participantColors: COLORS,
    documentLike,
  });

  const gateBefore = runtime.resolveLane('P4', 0).gate;
  runtime.syncGoalPathPresentation(makeGoalPresentation());
  assert.equal(runtime.resolveLane('P4', 0).gate, gateBefore);
  assert.equal(runtime.resolveLane('P4', 0).gate.dataset.goalPathOpen, '0');
  assert.equal(runtime.resolveLane('P4', 0).arrowStack, null);
  assert.equal(board.cells.get('clearing:top:9').children.length, 1);
});

test('an OPEN lane with missing color stays unresolved, then becomes visible when caller color authority arrives', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P4:2']),
    participantColors: { P1: COLORS.P1 },
    documentLike,
  });

  assert.equal(runtime.resolveLane('P4', 2).arrowStack, null);
  assert.deepEqual(runtime.snapshot().unresolvedOpenLaneKeys, ['P4:2']);

  const result = runtime.syncGoalPathPresentation(makeGoalPresentation(['P4:2']), {
    participantColors: COLORS,
  });
  assert.equal(result.ok, true);
  assert.equal(runtime.resolveLane('P4', 2).arrowStack.style.getPropertyValue('--gameroad-goal-entry-cue-color'), COLORS.P4);
  assert.deepEqual(runtime.snapshot().unresolvedOpenLaneKeys, []);
});

test('rejects a mismatched lane set before mutating current visible state', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P2:0']),
    participantColors: COLORS,
    documentLike,
  });

  const before = runtime.snapshot();
  const invalid = makeGoalPresentation(['P1:0']);
  invalid.lanePresentations = invalid.lanePresentations.slice(0, 11);
  const result = runtime.syncGoalPathPresentation(invalid);
  assert.deepEqual(result, { ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
  assert.deepEqual(runtime.snapshot(), before);
});

test('Reduced Motion and LowPerf preserve static upward-entry meaning across stateful sync', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const documentLike = makeFakeDom();
    const board = makeBoardSurface(documentLike);
    const runtime = mountNewBaseGoalEntryGateCue({
      boardSurfaceRuntime: board,
      goalPathPresentation: makeGoalPresentation(),
      participantColors: COLORS,
      documentLike,
      ...options,
    });
    runtime.syncGoalPathPresentation(makeGoalPresentation(['P1:0']));
    assert.equal(runtime.snapshot().activeArrowCount, 1);
    assert.equal(runtime.snapshot().animationMode, 'STATIC_UPWARD_ARROW');
    assert.equal(runtime.resolveLane('P1', 0).arrowStack.children[0].textContent, '↑');
  }
});

test('fails soft on invalid authority and destroy removes current owned nodes after updates', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const invalid = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: { ...board, movementAuthority: true },
    goalPathPresentation: makeGoalPresentation(['P1:0']),
    participantColors: COLORS,
    documentLike,
  });
  assert.equal(invalid.mounted, false);
  assert.equal(invalid.reason, 'BOARD_SURFACE_RUNTIME_INVALID');

  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(),
    participantColors: COLORS,
    documentLike,
  });
  runtime.syncGoalPathPresentation(makeGoalPresentation(['P1:0', 'P2:1']));
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(board.cells.get('clearing:top:0').children.length, 0);
  assert.equal(board.cells.get('clearing:top:4').children.length, 0);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.statefulGoalPathSync, true);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.repeatedSyncIdempotent, true);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesSevenCardCompletion, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesMovementLegality, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesResult, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.writesGameState, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.secondMovementEngine, false);
});
