export const BATTLE_HAND_INPUT_ARBITER_SCHEMA = 'gameroad.battle-hand-input-arbiter.v1';

export const BATTLE_HAND_INPUT_STATE = Object.freeze({
  PENDING: 'pending',
  DETAIL_PREVIEW: 'detail_preview',
  DRAGGING: 'dragging',
  CANCELLED: 'cancelled',
  COMPLETE: 'complete',
});

export const BATTLE_HAND_INPUT_EFFECT = Object.freeze({
  OPEN_DETAIL_PREVIEW: 'open_detail_preview',
  CLOSE_DETAIL_PREVIEW: 'close_detail_preview',
  START_DRAG: 'start_drag',
  UPDATE_DRAG: 'update_drag',
  ALLOW_TAP: 'allow_tap',
  LATCH_DETAIL: 'latch_detail',
  CANCEL: 'cancel',
  COMMIT_DRAG: 'commit_drag',
});

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? Object.freeze({ x, y }) : null;
}

export function createBattleHandInputState({
  pointerId,
  cardId,
  origin,
  startedAt = 0,
} = {}) {
  const id = Number(pointerId);
  const card = typeof cardId === 'string' ? cardId.trim() : '';
  const point = finitePoint(origin);
  if (!Number.isFinite(id) || !card || !point) return null;
  return Object.freeze({
    schema: BATTLE_HAND_INPUT_ARBITER_SCHEMA,
    mode: BATTLE_HAND_INPUT_STATE.PENDING,
    pointerId: id,
    cardId: card,
    origin: point,
    startedAt: Number.isFinite(Number(startedAt)) ? Number(startedAt) : 0,
    detailPreviewed: false,
    dragType: null,
  });
}

function withState(state, patch) {
  return Object.freeze({ ...state, ...patch });
}

function result(state, effects = []) {
  return Object.freeze({
    state,
    effects: Object.freeze(effects.map((effect) => Object.freeze({ ...effect }))),
  });
}

function distanceFromOrigin(state, pointer) {
  const point = finitePoint(pointer);
  if (!state?.origin || !point) return 0;
  return Math.hypot(point.x - state.origin.x, point.y - state.origin.y);
}

export function reduceBattleHandInput(state, event = {}, {
  moveSlopPx = 8,
  dragType = null,
} = {}) {
  if (!state || state.schema !== BATTLE_HAND_INPUT_ARBITER_SCHEMA) return result(state);
  if ([BATTLE_HAND_INPUT_STATE.COMPLETE, BATTLE_HAND_INPUT_STATE.CANCELLED].includes(state.mode)) {
    return result(state);
  }

  const type = typeof event.type === 'string' ? event.type : '';
  const pointerId = Number(event.pointerId);
  if (type.startsWith('pointer') && Number.isFinite(pointerId) && pointerId !== state.pointerId) {
    return result(state);
  }

  if (type === 'hold') {
    if (state.mode !== BATTLE_HAND_INPUT_STATE.PENDING) return result(state);
    return result(
      withState(state, {
        mode: BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW,
        detailPreviewed: true,
      }),
      [{ type: BATTLE_HAND_INPUT_EFFECT.OPEN_DETAIL_PREVIEW, cardId: state.cardId }],
    );
  }

  if (type === 'pointermove') {
    const pointer = finitePoint(event);
    const distance = distanceFromOrigin(state, pointer);
    const slop = Math.max(0, Number(moveSlopPx) || 0);
    if (distance < slop) {
      if (state.mode === BATTLE_HAND_INPUT_STATE.DRAGGING) {
        return result(state, [{
          type: BATTLE_HAND_INPUT_EFFECT.UPDATE_DRAG,
          cardId: state.cardId,
          dragType: state.dragType,
          pointer,
        }]);
      }
      return result(state);
    }

    const allowedDrag = typeof dragType === 'string' && dragType.trim() ? dragType.trim() : null;
    if (!allowedDrag) {
      const effects = state.mode === BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW
        ? [{ type: BATTLE_HAND_INPUT_EFFECT.CLOSE_DETAIL_PREVIEW, cardId: state.cardId }]
        : [];
      return result(
        withState(state, { mode: BATTLE_HAND_INPUT_STATE.CANCELLED }),
        [...effects, { type: BATTLE_HAND_INPUT_EFFECT.CANCEL, reason: 'movement_without_drag_owner' }],
      );
    }

    if (state.mode === BATTLE_HAND_INPUT_STATE.DRAGGING) {
      return result(state, [{
        type: BATTLE_HAND_INPUT_EFFECT.UPDATE_DRAG,
        cardId: state.cardId,
        dragType: state.dragType,
        pointer,
      }]);
    }

    const effects = [];
    if (state.mode === BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW) {
      effects.push({ type: BATTLE_HAND_INPUT_EFFECT.CLOSE_DETAIL_PREVIEW, cardId: state.cardId });
    }
    effects.push({
      type: BATTLE_HAND_INPUT_EFFECT.START_DRAG,
      cardId: state.cardId,
      dragType: allowedDrag,
      pointer,
    });
    return result(
      withState(state, {
        mode: BATTLE_HAND_INPUT_STATE.DRAGGING,
        dragType: allowedDrag,
      }),
      effects,
    );
  }

  if (type === 'pointerup') {
    if (state.mode === BATTLE_HAND_INPUT_STATE.PENDING) {
      return result(
        withState(state, { mode: BATTLE_HAND_INPUT_STATE.COMPLETE }),
        [{ type: BATTLE_HAND_INPUT_EFFECT.ALLOW_TAP, cardId: state.cardId }],
      );
    }
    if (state.mode === BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW) {
      return result(
        withState(state, { mode: BATTLE_HAND_INPUT_STATE.COMPLETE }),
        [{ type: BATTLE_HAND_INPUT_EFFECT.LATCH_DETAIL, cardId: state.cardId }],
      );
    }
    if (state.mode === BATTLE_HAND_INPUT_STATE.DRAGGING) {
      return result(
        withState(state, { mode: BATTLE_HAND_INPUT_STATE.COMPLETE }),
        [{
          type: BATTLE_HAND_INPUT_EFFECT.COMMIT_DRAG,
          cardId: state.cardId,
          dragType: state.dragType,
          pointer: finitePoint(event),
        }],
      );
    }
    return result(withState(state, { mode: BATTLE_HAND_INPUT_STATE.COMPLETE }));
  }

  if (type === 'pointercancel' || type === 'lostpointercapture' || type === 'secondpointer' || type === 'visibilitychange') {
    const effects = [];
    if (state.mode === BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW) {
      effects.push({ type: BATTLE_HAND_INPUT_EFFECT.CLOSE_DETAIL_PREVIEW, cardId: state.cardId });
    }
    effects.push({ type: BATTLE_HAND_INPUT_EFFECT.CANCEL, reason: type });
    return result(withState(state, { mode: BATTLE_HAND_INPUT_STATE.CANCELLED }), effects);
  }

  return result(state);
}