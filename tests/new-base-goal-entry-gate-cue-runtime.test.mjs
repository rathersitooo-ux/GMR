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

test('mounts a persistent raised boundary gate for every exact Shield-linked entry without activating closed lanes', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(),
    participantColors: COLORS,
    documentLike,
  });

  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.snapshot(), {
    laneGateCount: 12,
    openLaneCount: 0,
    activeArrowCount: 0,
    unresolvedOpenLaneKeys: [],
    activeArrowEntryCellIds: [],
    profile: 'standard',
    animationMode: 'UPWARD_SCROLL_FADE',
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
  });
  assert.equal(board.cells.get('clearing:top:0').children.length, 1);
  assert.equal(runtime.resolveLane('P1', 0).gate.dataset.goalPathOpen, '0');
  assert.equal(runtime.resolveLane('P1', 0).arrowStack, null);
});

test('shows an upward scrolling/fading arrow only on the exact entry cell of an authoritative OPEN lane', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P2:1']),
    participantColors: COLORS,
    documentLike,
  });

  const opened = runtime.resolveLane('P2', 1);
  const neighboringClosed = runtime.resolveLane('P2', 0);
  assert.equal(opened.entryCellId, 'clearing:top:4');
  assert.equal(opened.connectedToGoal, true);
  assert.equal(opened.arrowStack.dataset.clearingEntryCellId, 'clearing:top:4');
  assert.equal(opened.arrowStack.dataset.cueColorAuthority, 'caller-participant-color');
  assert.equal(opened.arrowStack.style.getPropertyValue('--gameroad-goal-entry-cue-color'), COLORS.P2);
  assert.equal(opened.arrowStack.children.length, 3);
  assert.equal(opened.arrowStack.children.every((node) => node.textContent === '↑'), true);
  assert.equal(neighboringClosed.arrowStack, null);
  assert.deepEqual(runtime.snapshot().activeArrowEntryCellIds, ['clearing:top:4']);
});

test('supports multiple independently opened lanes without making the other lane entrances look open', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P1:2', 'P3:0', 'P3:2']),
    participantColors: COLORS,
    documentLike,
  });

  assert.equal(runtime.snapshot().openLaneCount, 3);
  assert.equal(runtime.snapshot().activeArrowCount, 3);
  assert.deepEqual(runtime.snapshot().activeArrowEntryCellIds, [
    'clearing:top:2',
    'clearing:top:6',
    'clearing:top:8',
  ]);
  assert.equal(runtime.resolveLane('P3', 1).arrowStack, null);
});

test('does not invent a participant color when an OPEN lane lacks caller color authority', () => {
  const documentLike = makeFakeDom();
  const board = makeBoardSurface(documentLike);
  const runtime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime: board,
    goalPathPresentation: makeGoalPresentation(['P4:2']),
    participantColors: { P1: '#fff' },
    documentLike,
  });

  assert.equal(runtime.resolveLane('P4', 2).gate.dataset.goalPathOpen, '1');
  assert.equal(runtime.resolveLane('P4', 2).arrowStack, null);
  assert.deepEqual(runtime.snapshot().unresolvedOpenLaneKeys, ['P4:2']);
  assert.equal(runtime.snapshot().activeArrowCount, 0);
});

test('Reduced Motion and LowPerf preserve the upward-entry meaning while removing continuous travel', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const documentLike = makeFakeDom();
    const board = makeBoardSurface(documentLike);
    const runtime = mountNewBaseGoalEntryGateCue({
      boardSurfaceRuntime: board,
      goalPathPresentation: makeGoalPresentation(['P1:0']),
      participantColors: COLORS,
      documentLike,
      ...options,
    });
    assert.equal(runtime.snapshot().activeArrowCount, 1);
    assert.equal(runtime.snapshot().animationMode, 'STATIC_UPWARD_ARROW');
    assert.ok(['reduced_motion', 'low_perf'].includes(runtime.snapshot().profile));
    assert.equal(runtime.resolveLane('P1', 0).arrowStack.children[0].textContent, '↑');
  }
});

test('fails soft rather than becoming movement/gameplay authority and destroy removes only owned gate/cue nodes', () => {
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
    goalPathPresentation: makeGoalPresentation(['P1:0']),
    participantColors: COLORS,
    documentLike,
  });
  assert.equal(board.cells.get('clearing:top:0').children.length, 2);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(board.cells.get('clearing:top:0').children.length, 0);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesSevenCardCompletion, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesMovementLegality, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.computesResult, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.writesGameState, false);
  assert.equal(NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT.secondMovementEngine, false);
});
