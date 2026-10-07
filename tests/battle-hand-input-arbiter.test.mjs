import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_HAND_INPUT_EFFECT,
  BATTLE_HAND_INPUT_STATE,
  createBattleHandInputState,
  reduceBattleHandInput,
} from '../browser/battle-hand-input-arbiter.mjs';

function begin() {
  return createBattleHandInputState({
    pointerId: 7,
    cardId: 'card-a',
    origin: { x: 100, y: 200 },
    startedAt: 0,
  });
}

test('quick release remains a single native tap', () => {
  const out = reduceBattleHandInput(begin(), { type: 'pointerup', pointerId: 7, x: 101, y: 201 });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.COMPLETE);
  assert.deepEqual(out.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.ALLOW_TAP]);
});

test('hold opens detail without writing gameplay state', () => {
  const out = reduceBattleHandInput(begin(), { type: 'hold' });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW);
  assert.equal(out.state.detailPreviewed, true);
  assert.deepEqual(out.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.OPEN_DETAIL_PREVIEW]);
});

test('stationary hold release latches detail instead of tapping', () => {
  const held = reduceBattleHandInput(begin(), { type: 'hold' }).state;
  const out = reduceBattleHandInput(held, { type: 'pointerup', pointerId: 7, x: 100, y: 200 });
  assert.deepEqual(out.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.LATCH_DETAIL]);
});

test('delayed drag morphs detail preview into drag', () => {
  const held = reduceBattleHandInput(begin(), { type: 'hold' }).state;
  const out = reduceBattleHandInput(
    held,
    { type: 'pointermove', pointerId: 7, x: 116, y: 200 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  );
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.DRAGGING);
  assert.deepEqual(out.effects.map((x) => x.type), [
    BATTLE_HAND_INPUT_EFFECT.CLOSE_DETAIL_PREVIEW,
    BATTLE_HAND_INPUT_EFFECT.START_DRAG,
  ]);
});

test('fast drag starts without opening detail', () => {
  const out = reduceBattleHandInput(
    begin(),
    { type: 'pointermove', pointerId: 7, x: 116, y: 200 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  );
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.DRAGGING);
  assert.deepEqual(out.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.START_DRAG]);
});

test('movement with no drag owner cancels and never falls back to tap', () => {
  const out = reduceBattleHandInput(
    begin(),
    { type: 'pointermove', pointerId: 7, x: 116, y: 200 },
    { moveSlopPx: 8, dragType: null },
  );
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.CANCELLED);
  assert.deepEqual(out.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.CANCEL]);
});

test('pointercancel after detail preview closes detail and writes nothing', () => {
  const held = reduceBattleHandInput(begin(), { type: 'hold' }).state;
  const out = reduceBattleHandInput(held, { type: 'pointercancel', pointerId: 7 });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.CANCELLED);
  assert.deepEqual(out.effects.map((x) => x.type), [
    BATTLE_HAND_INPUT_EFFECT.CLOSE_DETAIL_PREVIEW,
    BATTLE_HAND_INPUT_EFFECT.CANCEL,
  ]);
});

test('pointercancel while dragging never commits drag', () => {
  const dragging = reduceBattleHandInput(
    begin(),
    { type: 'pointermove', pointerId: 7, x: 116, y: 200 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  ).state;
  const out = reduceBattleHandInput(dragging, { type: 'pointercancel', pointerId: 7 });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.CANCELLED);
  assert.ok(out.effects.some((x) => x.type === BATTLE_HAND_INPUT_EFFECT.CANCEL));
  assert.ok(out.effects.every((x) => x.type !== BATTLE_HAND_INPUT_EFFECT.COMMIT_DRAG));
});

test('second pointer cancels pending ownership', () => {
  const out = reduceBattleHandInput(begin(), { type: 'secondpointer' });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.CANCELLED);
  assert.equal(out.effects[0].reason, 'secondpointer');
});

test('foreign pointer events do not steal the owner', () => {
  const out = reduceBattleHandInput(
    begin(),
    { type: 'pointermove', pointerId: 99, x: 200, y: 200 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  );
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.PENDING);
  assert.deepEqual(out.effects, []);
});


test('drag release emits one commit effect only after pointerup', () => {
  const dragging = reduceBattleHandInput(
    begin(),
    { type: 'pointermove', pointerId: 7, x: 116, y: 200 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  ).state;
  const out = reduceBattleHandInput(
    dragging,
    { type: 'pointerup', pointerId: 7, x: 140, y: 180 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  );
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.COMPLETE);
  assert.deepEqual(out.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.COMMIT_DRAG]);
});

test('lost pointer capture cancels an active drag without commit', () => {
  const dragging = reduceBattleHandInput(
    begin(),
    { type: 'pointermove', pointerId: 7, x: 116, y: 200 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  ).state;
  const out = reduceBattleHandInput(dragging, { type: 'lostpointercapture', pointerId: 7 });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.CANCELLED);
  assert.equal(out.effects.at(-1)?.type, BATTLE_HAND_INPUT_EFFECT.CANCEL);
  assert.ok(out.effects.every((x) => x.type !== BATTLE_HAND_INPUT_EFFECT.COMMIT_DRAG));
});

test('visibility change cancels detail preview and never taps', () => {
  const held = reduceBattleHandInput(begin(), { type: 'hold' }).state;
  const out = reduceBattleHandInput(held, { type: 'visibilitychange', pointerId: 7 });
  assert.equal(out.state.mode, BATTLE_HAND_INPUT_STATE.CANCELLED);
  assert.deepEqual(out.effects.map((x) => x.type), [
    BATTLE_HAND_INPUT_EFFECT.CLOSE_DETAIL_PREVIEW,
    BATTLE_HAND_INPUT_EFFECT.CANCEL,
  ]);
});

test('sub-slop movement after hold keeps detail preview eligible to latch', () => {
  const held = reduceBattleHandInput(begin(), { type: 'hold' }).state;
  const moved = reduceBattleHandInput(
    held,
    { type: 'pointermove', pointerId: 7, x: 105, y: 204 },
    { moveSlopPx: 8, dragType: 'hand_aura' },
  );
  assert.equal(moved.state.mode, BATTLE_HAND_INPUT_STATE.DETAIL_PREVIEW);
  assert.deepEqual(moved.effects, []);
  const released = reduceBattleHandInput(moved.state, { type: 'pointerup', pointerId: 7, x: 105, y: 204 });
  assert.deepEqual(released.effects.map((x) => x.type), [BATTLE_HAND_INPUT_EFFECT.LATCH_DETAIL]);
});

test('live Battle integration preserves legacy commit authority and adds safe detail ownership', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/battle-hand-input-arbiter\.mjs'/);
  assert.match(source, /const HAND_DETAIL_HOLD_MS = 500;/);
  assert.match(source, /physical-device\/Human acceptance must tune this value/);
  assert.match(source, /reduceBattleHandInput\(state\.inputState, \{ type: 'hold' \}\)/);
  assert.match(source, /BATTLE_HAND_INPUT_EFFECT\.CLOSE_DETAIL_PREVIEW/);
  assert.match(source, /const commit = !cancelled && moved && state\.armed && state\.legalCandidate === true && sourceStillOrdinary;/);
  assert.match(source, /const effectiveCommit = commit && !detailLatch;/);
  assert.match(source, /openHandDetailPanel\(cardId, state\.source\)/);
  assert.match(source, /rules: card\?\.rules_text \?\? card\?\.ability \?\? '能力なし'/);
  assert.match(source, /handleHandDetailOverlayPointerDown/);
  assert.match(source, /event\?\.key !== 'Escape'/);
  assert.match(source, /returnFocus\?\.focus\?\.\(\)/);
  assert.match(source, /handleGlobalHandSecondaryPointerDown/);
  assert.match(source, /event\.stopPropagation\?\.\(\)/);
  assert.match(source, /handleHandVisibilityChange/);
  assert.match(source, /documentRef\.removeEventListener\?\.\('visibilitychange', handleHandVisibilityChange, true\)/);
});

test('Cloudflare package explicitly includes the imported hand arbiter', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(
    source,
    /source: 'browser\/battle-hand-input-arbiter\.mjs', output: 'battle-hand-input-arbiter\.mjs', artifact: 'battle_hand_input_arbiter'/,
  );
});