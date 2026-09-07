import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectBattleBoardRuntimeAuthority,
  projectBattleBoardRuntimeExplanation,
  projectBattleCardPinchScale,
  installBattleCardPinchZoomRuntime,
  BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME,
} from '../browser/battle-board-visual-explanation-runtime-mount.mjs';

function boardNode(positionId, { reachable = false } = {}) {
  return {
    dataset: { pos: positionId },
    classList: { contains: (token) => token === 'reachable' && reachable },
  };
}

function fakeGlobal({ endpoint = '', adviceResult = null, isCurrent = true, resolveTarget = () => null } = {}) {
  const nodes = [
    boardNode('A'),
    boardNode('B', { reachable: true }),
    boardNode('C', { reachable: true }),
  ];
  return {
    document: {
      querySelectorAll(selector) {
        return selector === '#board .node[data-pos]' ? nodes : [];
      },
      getElementById(id) {
        return id === 'endpointText' ? { textContent: endpoint } : null;
      },
    },
    __GAMEROAD_BOARD_PARTNER_ADVICE_AUTHORITY__: adviceResult ? {
      getAdviceResult: () => adviceResult,
      isCurrent: () => isCurrent,
      resolveTarget,
    } : null,
  };
}

function pinchHarness() {
  const listeners = new Map();
  const attributes = new Map();
  let cancelCount = 0;

  const hand = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };

  const card = {
    dataset: { cardId: 'visible-card-a' },
    style: { scale: '', transformOrigin: '', zIndex: '', willChange: '' },
    closest(selector) {
      return selector === '#hand .handCard[data-card-id]' ? card : null;
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    dispatchEvent(event) {
      if (event?.type === 'pointercancel') cancelCount += 1;
      return true;
    },
  };

  class FakePointerEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  const win = {
    document: {
      querySelector(selector) { return selector === '#hand' ? hand : null; },
    },
    PointerEvent: FakePointerEvent,
  };

  function fire(type, { pointerId = 1, x = 0, y = 0, target = card } = {}) {
    let prevented = false;
    let stopped = false;
    let immediate = false;
    const event = {
      type,
      pointerId,
      clientX: x,
      clientY: y,
      target,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
      stopImmediatePropagation() { immediate = true; },
    };
    listeners.get(type)?.(event);
    return { prevented, stopped, immediate };
  }

  return {
    win,
    card,
    attributes,
    fire,
    listeners,
    get cancelCount() { return cancelCount; },
  };
}

test('uses only existing board ids, reachable classes, and the current endpoint selection', () => {
  const authority = collectBattleBoardRuntimeAuthority(fakeGlobal({ endpoint: 'B' }));
  assert.deepEqual(authority.validPositionIds, ['A', 'B', 'C']);
  assert.deepEqual(authority.reachablePositionIds, ['B', 'C']);
  assert.equal(authority.selectedPositionId, 'B');

  const projection = projectBattleBoardRuntimeExplanation(authority);
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.channels.reachable, ['B', 'C']);
  assert.deepEqual(projection.channels.selected, ['B']);
  assert.deepEqual(projection.rolesByPosition.B, ['selected', 'reachable']);
  assert.equal(projection.authorityByRole.reachable, 'rules-derived');
});

test('partner emphasis is accepted only through explicit current public target authority', () => {
  const authority = collectBattleBoardRuntimeAuthority(fakeGlobal({
    endpoint: 'B',
    adviceResult: {
      ok: true,
      containsPrivate: false,
      selected: { candidateId: 'card-a' },
      source: 'shared-legal-action-core',
    },
    resolveTarget: (candidateId) => candidateId === 'card-a' ? { targetId: 'C' } : null,
  }));
  assert.equal(authority.partnerProjection.active, true);
  assert.equal(authority.partnerProjection.targetId, 'C');

  const projection = projectBattleBoardRuntimeExplanation(authority);
  assert.equal(projection.recommendation.active, true);
  assert.equal(projection.recommendation.targetId, 'C');
  assert.deepEqual(projection.rolesByPosition.C, ['reachable', 'partner-recommendation']);
  assert.equal(projection.recommendation.autoExecute, false);
});

test('unknown selection and private advice fail closed instead of inventing board meaning', () => {
  const authority = collectBattleBoardRuntimeAuthority(fakeGlobal({
    endpoint: 'NOT-A-POSITION',
    adviceResult: { ok: true, containsPrivate: true, selected: { candidateId: 'card-a' } },
    resolveTarget: () => ({ targetId: 'C' }),
  }));
  assert.equal(authority.selectedPositionId, null);
  assert.equal(authority.partnerProjection.active, false);
  assert.equal(authority.partnerProjection.reason, 'PUBLIC_SCOPE_UNVERIFIED');

  const projection = projectBattleBoardRuntimeExplanation(authority);
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.channels.selected, []);
  assert.equal(projection.recommendation.active, false);
  assert.equal(projection.rolesByPosition.A, undefined);
});

test('runtime contract is presentation-only with no topology inference or auto execution', () => {
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.presentationOnly, true);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.gameplayAuthority, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.topologyInference, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.automaticExecution, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.actualPositionSelector, '#board .node[data-pos]');
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.cardPinchZoom, true);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.cardPinchSelector, '#hand .handCard[data-card-id]');
  assert.deepEqual(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.cardPinchScaleRange, [1, 2.2]);
});

test('pinch scale is proportional, clamped, and fails closed for unusable input', () => {
  assert.equal(projectBattleCardPinchScale({ startDistance: 100, currentDistance: 180 }), 1.8);
  assert.equal(projectBattleCardPinchScale({ startDistance: 100, currentDistance: 500 }), 2.2);
  assert.equal(projectBattleCardPinchScale({ startDistance: 100, currentDistance: 20 }), 1);
  assert.equal(projectBattleCardPinchScale({ startDistance: 4, currentDistance: 20 }), null);
  assert.equal(projectBattleCardPinchScale({ startDistance: 100, currentDistance: Number.NaN }), null);
});

test('one pointer remains non-destructive while two-pointer pinch zooms and resets on cancel', () => {
  const h = pinchHarness();
  const runtime = installBattleCardPinchZoomRuntime(h.win);
  assert.ok(runtime);

  const oneDown = h.fire('pointerdown', { pointerId: 1, x: 0, y: 0 });
  const oneMove = h.fire('pointermove', { pointerId: 1, x: 20, y: 0 });
  assert.equal(oneDown.prevented, false);
  assert.equal(oneDown.stopped, false);
  assert.equal(oneMove.prevented, false);
  assert.equal(oneMove.stopped, false);
  assert.equal(runtime.snapshot().active, false);
  assert.equal(h.card.style.scale, '');

  const secondDown = h.fire('pointerdown', { pointerId: 2, x: 100, y: 0 });
  assert.equal(secondDown.prevented, true);
  assert.equal(secondDown.stopped, true);
  assert.equal(h.cancelCount, 1);
  assert.equal(runtime.snapshot().active, true);
  assert.equal(h.attributes.get('data-battle-card-pinch-active'), 'true');

  const pinchMove = h.fire('pointermove', { pointerId: 2, x: 180, y: 0 });
  assert.equal(pinchMove.prevented, true);
  assert.equal(pinchMove.stopped, true);
  assert.equal(runtime.snapshot().scale, 1.8);
  assert.equal(h.card.style.scale, '1.8');

  h.fire('pointermove', { pointerId: 2, x: 500, y: 0 });
  assert.equal(runtime.snapshot().scale, 2.2);
  assert.equal(h.card.style.scale, '2.2');

  const cancelled = h.fire('pointercancel', { pointerId: 1, x: 0, y: 0 });
  assert.equal(cancelled.prevented, true);
  assert.equal(cancelled.stopped, true);
  assert.equal(runtime.snapshot().active, false);
  assert.equal(h.card.style.scale, '');
  assert.equal(h.attributes.has('data-battle-card-pinch-active'), false);
  assert.deepEqual(Object.keys(h.card.dataset), ['cardId']);

  const click = h.fire('click', { target: h.card });
  assert.equal(click.prevented, true);
  assert.equal(click.immediate, true);

  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
});
