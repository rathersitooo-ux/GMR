import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT,
  mountBattleNewBaseBoardLivePresentation,
} from '../browser/battle-new-base-board-live-presentation-composer.mjs';

const LAYOUT_INPUT = Object.freeze({
  participantIds: ['P1', 'P2', 'P3', 'P4'],
  horizontalCellCount: 12,
  shieldLinkedLaneColumnsByParticipant: {
    P1: [0, 1, 2],
    P2: [3, 4, 5],
    P3: [6, 7, 8],
    P4: [9, 10, 11],
  },
});

const COLORS = Object.freeze({
  P1: '#e84b4b',
  P2: '#4b8de8',
  P3: '#e8c94b',
  P4: '#62c66c',
});

function emptyStraights() {
  return Array.from({ length: 12 }, () => []);
}

function withStraight(source, columnIndex, count = 7, prefix = `C${columnIndex}`) {
  const next = source.map((column) => [...column]);
  next[columnIndex] = Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
  return next;
}

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

function mount(options = {}) {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const runtime = mountBattleNewBaseBoardLivePresentation({
    host,
    documentLike,
    layoutInput: LAYOUT_INPUT,
    straightCardIdsByColumn: emptyStraights(),
    participantColors: COLORS,
    ...options,
  });
  return { documentLike, host, runtime };
}

function roadState(runtime, participantId, laneIndex, roadIndex) {
  const node = runtime.boardSurfaceRuntime.resolveRoadStep(participantId, laneIndex, roadIndex);
  return {
    state: node?.getAttribute('data-progression-stage-state'),
    established: node?.getAttribute('data-progression-established'),
    latent: node?.getAttribute('data-progression-latent'),
    actionable: node?.getAttribute('data-progression-actionable'),
    traversable: node?.getAttribute('data-progression-traversable'),
  };
}

test('mounts the existing Flanora surface and persistent Shield-entry gates with no false OPEN arrows', () => {
  const { host, runtime } = mount();
  assert.equal(runtime.mounted, true, runtime.reason);
  assert.equal(host.children.length, 1);
  assert.equal(runtime.snapshot().boardSurface.laneCount, 12);
  assert.equal(runtime.snapshot().gateCue.laneGateCount, 12);
  assert.equal(runtime.snapshot().openGoalPathCount, 0);
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 0);
  assert.equal(runtime.snapshot().progressionBuiltStageCount, 0);
  assert.equal(runtime.snapshot().progressionLatentStageCount, 84);
  assert.equal(runtime.boardSurfaceRuntime.resolveRoadStep('P1', 0, 1), null);
  const p2CenterGate = runtime.resolveGateCueLane('P2', 1);
  assert.equal(p2CenterGate.anchor, runtime.boardSurfaceRuntime.resolveRouteGate('P2', 1));
  assert.equal(p2CenterGate.anchor.getAttribute('data-flanora-route-gate'), 'goal-gate:P2:1');
  assert.equal(p2CenterGate.anchor.getAttribute('data-shared-goal-id'), 'goal:shared');
  assert.equal(runtime.resolveGateCueLane('P2', 1).arrowStack, null);
});

test('hands the current NEW_BOARD_ONLY world-field model to the live renderer seam without duplicating geometry rules', () => {
  const { runtime } = mount();
  const bounds = { centerX: 1, centerZ: -2, width: 24, depth: 13.5, y: 0.1 };

  let model = runtime.worldFieldRenderModel(bounds);
  assert.equal(model.renderSpace, 'WORLD_FIELD');
  assert.equal(model.screenSpaceBoardTopology, false);
  assert.equal(model.counts.sharedGoal, 1);
  assert.equal(model.counts.upperLanes, 12);
  assert.equal(model.counts.roundCells, 126);
  assert.equal(model.counts.gates, 12);
  assert.equal(model.counts.shields, 12);
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P2:C').state, 'CLOSED_HEAVY_BARRIER');
  assert.equal(model.edges.find((edge) => edge.id === 'lower-edge:T0-L0').waypoints.length, 1);

  const seven = withStraight(emptyStraights(), 4, 7, 'P2-C');
  assert.equal(runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: seven }).ok, true);
  model = runtime.worldFieldRenderModel(bounds);
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P2:C').state, 'OPEN_PASSABLE_FRAME');
  assert.equal(model.goalBranches.find((branch) => branch.id === 'goal-branch:P2:C').visualState, 'STRONG_OPEN');
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P2:L').state, 'CLOSED_HEAVY_BARRIER');
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.movementAuthority, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.worldFieldGeometryAuthority, 'EXISTING_BATTLE_BOARD_WORLD_FIELD_RENDERER');
});

test('1..6 established cards become BUILT while future stages stay logical-only and GOAL remains closed', () => {
  const { runtime } = mount();
  for (const count of [1, 3, 6]) {
    const snapshot = withStraight(emptyStraights(), 4, count, `P2-C-${count}`);
    const result = runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: snapshot });
    assert.equal(result.ok, true);
    assert.equal(result.openGoalPathCount, 0);
    assert.equal(result.progressionBuiltStageCount, count);
    assert.equal(result.progressionLatentStageCount, 84 - count);
    for (let roadIndex = 1; roadIndex <= 7; roadIndex += 1) {
      if (roadIndex <= count) {
        const state = roadState(runtime, 'P2', 1, roadIndex);
        assert.equal(state.state, 'BUILT');
        assert.equal(state.established, 'true');
        assert.equal(state.latent, 'false');
        assert.equal(state.actionable, 'false');
        assert.equal(state.traversable, 'false');
      } else {
        assert.equal(runtime.boardSurfaceRuntime.resolveRoadStep('P2', 1, roadIndex), null);
      }
    }
    assert.equal(runtime.resolveGateCueLane('P2', 1).arrowStack, null);
  }
});

test('the seventh authoritative card builds the final stage, opens only the exact lane and shows its colored upward cue without remount', () => {
  const { host, runtime } = mount();
  const originalBoardRoot = host.children[0];
  const seven = withStraight(emptyStraights(), 4, 7, 'P2-C');
  const result = runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: seven });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'AUTHORITATIVE_PRESENTATION_SYNCED');
  assert.equal(host.children[0], originalBoardRoot);
  assert.deepEqual(runtime.snapshot().connectedLaneKeys, ['P2:1']);
  assert.equal(runtime.snapshot().progressionBuiltStageCount, 7);
  assert.equal(runtime.snapshot().progressionLatentStageCount, 77);
  assert.equal(roadState(runtime, 'P2', 1, 7).state, 'BUILT');
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 1);
  const opened = runtime.resolveGateCueLane('P2', 1);
  assert.equal(opened.anchor, runtime.boardSurfaceRuntime.resolveRouteGate('P2', 1));
  assert.equal(opened.anchor.getAttribute('data-flanora-route-gate'), 'goal-gate:P2:1');
  assert.equal(opened.anchor.getAttribute('data-shared-goal-id'), 'goal:shared');
  assert.equal(opened.arrowStack.children.length, 3);
  assert.equal(opened.arrowStack.children.every((node) => node.textContent === '↑'), true);
  assert.equal(opened.arrowStack.style.getPropertyValue('--gameroad-goal-entry-cue-color'), COLORS.P2);
  assert.equal(runtime.resolveGateCueLane('P2', 0).arrowStack, null);
  assert.equal(runtime.resolveGateCueLane('P2', 2).arrowStack, null);
});

test('repeated OPEN sync is idempotent and OPEN to CLOSED removes the arrow without duplicating the gate', () => {
  const { runtime } = mount();
  const seven = withStraight(emptyStraights(), 2, 7, 'P1-R');
  assert.equal(runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: seven }).ok, true);
  const first = runtime.resolveGateCueLane('P1', 2);
  const firstArrow = first.arrowStack;
  const firstGate = first.gate;

  assert.equal(runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: seven }).ok, true);
  assert.equal(runtime.resolveGateCueLane('P1', 2).arrowStack, firstArrow);
  assert.equal(runtime.resolveGateCueLane('P1', 2).gate, firstGate);
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 1);

  assert.equal(runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: emptyStraights() }).ok, true);
  assert.equal(runtime.resolveGateCueLane('P1', 2).gate, firstGate);
  assert.equal(runtime.resolveGateCueLane('P1', 2).arrowStack, null);
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 0);
  assert.equal(runtime.snapshot().progressionBuiltStageCount, 0);
  assert.equal(runtime.snapshot().progressionLatentStageCount, 84);
});

test('invalid authoritative snapshots fail closed and preserve the previously visible GOAL and progression state', () => {
  const { runtime } = mount();
  const seven = withStraight(emptyStraights(), 6, 7, 'P3-L');
  assert.equal(runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: seven }).ok, true);
  const arrowBefore = runtime.resolveGateCueLane('P3', 0).arrowStack;
  const progressionBefore = runtime.progressionPresentation();
  const roadBefore = roadState(runtime, 'P3', 0, 7);

  const invalid = runtime.syncAuthoritativeSnapshot({
    straightCardIdsByColumn: Array.from({ length: 11 }, () => []),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.priorStatePreserved, true);
  assert.deepEqual(runtime.snapshot().connectedLaneKeys, ['P3:0']);
  assert.equal(runtime.resolveGateCueLane('P3', 0).arrowStack, arrowBefore);
  assert.equal(runtime.progressionPresentation(), progressionBefore);
  assert.deepEqual(roadState(runtime, 'P3', 0, 7), roadBefore);
  assert.equal(runtime.snapshot().progressionBuiltStageCount, 7);
});

test('multiple OPEN lanes remain independent and late caller color authority can activate a previously unresolved cue', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  let straights = withStraight(emptyStraights(), 9, 7, 'P4-L');
  straights = withStraight(straights, 11, 7, 'P4-R');
  const runtime = mountBattleNewBaseBoardLivePresentation({
    host,
    documentLike,
    layoutInput: LAYOUT_INPUT,
    straightCardIdsByColumn: straights,
    participantColors: { P1: COLORS.P1 },
  });

  assert.equal(runtime.snapshot().openGoalPathCount, 2);
  assert.equal(runtime.snapshot().progressionBuiltStageCount, 14);
  assert.equal(runtime.snapshot().progressionLatentStageCount, 70);
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 0);
  assert.deepEqual(runtime.snapshot().gateCue.unresolvedOpenLaneKeys, ['P4:0', 'P4:2']);

  const synced = runtime.syncAuthoritativeSnapshot({ participantColors: COLORS });
  assert.equal(synced.ok, true);
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 2);
  assert.equal(runtime.resolveGateCueLane('P4', 0).arrowStack.style.getPropertyValue('--gameroad-goal-entry-cue-color'), COLORS.P4);
  assert.equal(runtime.resolveGateCueLane('P4', 1).arrowStack, null);
  assert.equal(runtime.resolveGateCueLane('P4', 2).arrowStack.style.getPropertyValue('--gameroad-goal-entry-cue-color'), COLORS.P4);
});

test('normalizes the caller lane blocks once so Flanora, progression and GOAL-path keep the same L/C/R identity', () => {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  const unorderedLayout = {
    participantIds: ['P1', 'P2', 'P3', 'P4'],
    horizontalCellCount: 12,
    shieldLinkedLaneColumnsByParticipant: {
      P1: [2, 0, 1],
      P2: [5, 3, 4],
      P3: [8, 6, 7],
      P4: [11, 9, 10],
    },
  };
  const runtime = mountBattleNewBaseBoardLivePresentation({
    host,
    documentLike,
    layoutInput: unorderedLayout,
    straightCardIdsByColumn: withStraight(emptyStraights(), 0, 7, 'P1-L'),
    participantColors: COLORS,
  });

  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.flanoraLayout.shieldLinkedLaneColumnsByParticipant.P1, [0, 1, 2]);
  assert.deepEqual(runtime.snapshot().connectedLaneKeys, ['P1:0']);
  assert.equal(runtime.progressionPresentation().lanePresentations[0].key, 'P1:0');
  assert.equal(runtime.progressionPresentation().lanePresentations[0].builtStageCount, 7);
  assert.equal(roadState(runtime, 'P1', 0, 7).state, 'BUILT');
  const p1LeftGate = runtime.resolveGateCueLane('P1', 0);
  assert.equal(p1LeftGate.anchor, runtime.boardSurfaceRuntime.resolveRouteGate('P1', 0));
  assert.equal(p1LeftGate.anchor.getAttribute('data-flanora-route-gate'), 'goal-gate:P1:0');
  assert.equal(p1LeftGate.anchor.getAttribute('data-shared-goal-id'), 'goal:shared');
  assert.equal(runtime.resolveGateCueLane('P1', 1).arrowStack, null);
});

test('Reduced Motion keeps the same OPEN/progression meaning with static cue and destroy removes the composed surface', () => {
  const seven = withStraight(emptyStraights(), 0, 7, 'P1-L');
  const { host, runtime } = mount({
    straightCardIdsByColumn: seven,
    reducedMotion: true,
  });

  assert.equal(runtime.snapshot().progressionBuiltStageCount, 7);
  assert.equal(runtime.snapshot().progressionLatentStageCount, 77);
  assert.equal(roadState(runtime, 'P1', 0, 7).state, 'BUILT');
  assert.equal(runtime.snapshot().gateCue.activeArrowCount, 1);
  assert.equal(runtime.snapshot().gateCue.animationMode, 'STATIC_GATE_STATE');
  assert.equal(runtime.snapshot().gateCue.profile, 'reduced_motion');
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
  assert.equal(runtime.syncAuthoritativeSnapshot({ straightCardIdsByColumn: seven }).ok, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.ownsSevenCardRule, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.ownsProgressionRule, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.computesMovementLegality, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.computesResult, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.writesGameState, false);
  assert.equal(BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT.secondBoardEngine, false);
});
