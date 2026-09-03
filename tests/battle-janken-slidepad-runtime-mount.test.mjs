import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
  BATTLE_JANKEN_HAND_INPUT_SAFE_AREA_CSS,
  BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS,
  buildBattleJankenSlidePadModel,
  isBattleHandAuraLaunchArmed,
  projectBattleLoadCardPreview,
  resolveBattleJankenSlotCardAction,
  resolveBattleJankenSlidePadGestureTarget,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

const hand = [
  { id: 'club-a', suit: 'CL', label: 'Club A' },
  { id: 'diamond-a', suit: 'DI', label: 'Diamond A' },
  { id: 'spade-a', suit: 'SP', label: 'Spade A' },
  { id: 'club-b', suit: 'CL', label: 'Club B' },
];

test('projects fixed janken slots while keeping selected physical cards out of ordinary hand membership', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '1', hand, pickDuplicateIndex: () => 1 });
  assert.equal(model.schema, BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA);
  assert.deepEqual(model.slots.map((slot) => [slot.jankenHand, slot.cardId]), [
    ['ROCK', 'club-b'],
    ['SCISSORS', 'diamond-a'],
    ['PAPER', 'spade-a'],
  ]);
  assert.deepEqual(model.assignment.sourceHandCardIds, hand.map((card) => card.id));
  assert.deepEqual(model.assignment.selectedJankenCardIds, ['club-b', 'diamond-a', 'spade-a']);
  assert.deepEqual(model.ordinaryHandCardIds, ['club-a']);
  assert.deepEqual(
    model.assignment.selectedJankenCardIds.filter((cardId) => model.ordinaryHandCardIds.includes(cardId)),
    [],
  );
});

test('janken slot can still reach its round-source card action without restoring ordinary-hand membership', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '1', hand, pickDuplicateIndex: () => 1 });
  assert.equal(
    resolveBattleJankenSlotCardAction(model, 'ROCK', model.assignment.sourceHandCardIds),
    'club-b',
  );
  assert.equal(
    resolveBattleJankenSlotCardAction(model, 'ROCK', model.ordinaryHandCardIds),
    null,
    'ordinary hand membership is not a backdoor for a reserved janken card',
  );
});

test('same-round redraw keeps the immutable slot assignment even if duplicate chooser would change', () => {
  const first = buildBattleJankenSlidePadModel({ roundId: '5', hand, pickDuplicateIndex: () => 0 });
  const second = buildBattleJankenSlidePadModel({
    roundId: '5',
    hand,
    currentSnapshot: first.assignment,
    pickDuplicateIndex: () => 1,
  });
  assert.strictEqual(second.assignment, first.assignment);
  assert.equal(second.slots.find((slot) => slot.jankenHand === 'ROCK').cardId, 'club-a');
  assert.deepEqual(second.ordinaryHandCardIds, ['club-b']);
});

test('missing suit stays visibly representable but disabled and occupied suit card is not duplicated in ordinary hand', () => {
  const model = buildBattleJankenSlidePadModel({
    roundId: '2',
    hand: [{ id: 'club-only', suit: 'CL', label: 'Club' }],
  });
  const rock = model.slots.find((slot) => slot.jankenHand === 'ROCK');
  const scissors = model.slots.find((slot) => slot.jankenHand === 'SCISSORS');
  const paper = model.slots.find((slot) => slot.jankenHand === 'PAPER');
  assert.equal(rock.occupied, true);
  assert.deepEqual(model.ordinaryHandCardIds, []);
  assert.equal(scissors.occupied, false);
  assert.equal(scissors.selectable, false);
  assert.equal(paper.occupied, false);
  assert.equal(resolveBattleJankenSlotCardAction(model, 'PAPER', ['club-only']), null);
});

test('slot action fails closed when the reserved card is no longer present in the current round source hand', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '3', hand, pickDuplicateIndex: () => 0 });
  assert.equal(
    resolveBattleJankenSlotCardAction(model, 'ROCK', ['diamond-a', 'spade-a', 'club-b']),
    null,
  );
});

test('gesture direction sticks to the eligible slot that lies along the drag direction', () => {
  const target = resolveBattleJankenSlidePadGestureTarget({
    origin: { x: 100, y: 100 },
    pointer: { x: 35, y: 92 },
    candidates: [
      { id: 'ROCK', x: 0, y: 105, selectable: true },
      { id: 'SCISSORS', x: 30, y: 25, selectable: true },
      { id: 'PAPER', x: 92, y: 0, selectable: true },
    ],
  });
  assert.equal(target, 'ROCK');
});

test('gesture stays neutral inside the handle dead zone', () => {
  const target = resolveBattleJankenSlidePadGestureTarget({
    origin: { x: 100, y: 100 },
    pointer: { x: 94, y: 97 },
    candidates: [{ id: 'ROCK', x: 0, y: 100, selectable: true }],
  });
  assert.equal(target, null);
});

test('gesture never snaps to an empty or disabled slot', () => {
  const target = resolveBattleJankenSlidePadGestureTarget({
    origin: { x: 100, y: 100 },
    pointer: { x: 30, y: 100 },
    candidates: [
      { id: 'ROCK', x: 0, y: 100, selectable: false },
      { id: 'SCISSORS', x: 100, y: 0, selectable: true },
    ],
  });
  assert.equal(target, null);
});

test('ordinary hand card arms the bottom-right aura when pointer enters the emitter radius', () => {
  const auraRect = { left: 900, top: 500, width: 68, height: 68 };
  assert.equal(
    isBattleHandAuraLaunchArmed({ pointer: { x: 934, y: 534 }, auraRect }),
    true,
  );
  assert.equal(
    isBattleHandAuraLaunchArmed({ pointer: { x: 982, y: 534 }, auraRect }),
    true,
    'default padding keeps the screen-edge launch target forgiving on touch',
  );
});

test('ordinary hand card does not arm or launch when released away from the bottom-right aura', () => {
  const auraRect = { left: 900, top: 500, width: 68, height: 68 };
  assert.equal(
    isBattleHandAuraLaunchArmed({ pointer: { x: 720, y: 390 }, auraRect }),
    false,
  );
  assert.equal(
    isBattleHandAuraLaunchArmed({ pointer: { x: 934, y: 534 }, auraRect, paddingPx: 0 }),
    true,
  );
  assert.equal(
    isBattleHandAuraLaunchArmed({ pointer: { x: 970, y: 534 }, auraRect, paddingPx: 0 }),
    false,
  );
});

test('R75 preview projects only the actually armed selectable janken slot', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '7', hand, pickDuplicateIndex: () => 1 });
  assert.equal(projectBattleLoadCardPreview(model, null), null);
  assert.equal(projectBattleLoadCardPreview(model, 'HEART'), null);
  assert.deepEqual(projectBattleLoadCardPreview(model, 'ROCK'), {
    kind: 'LOAD_CARD',
    cardId: 'club-b',
    cardLabel: 'Club B',
    jankenHand: 'ROCK',
    symbol: '♣',
    hand: 'グー',
  });
});

test('R75 preview fails closed for empty or disabled slots', () => {
  const model = buildBattleJankenSlidePadModel({
    roundId: '8',
    hand: [{ id: 'club-only', suit: 'CL', label: 'Club' }],
  });
  assert.equal(projectBattleLoadCardPreview(model, 'SCISSORS'), null);
  assert.equal(projectBattleLoadCardPreview(model, 'PAPER'), null);
});

test('target-confirm proxy is layered above the expanded SlidePad only during target mode', () => {
  assert.equal(
    BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS,
    'section[data-screen="battle"] #targetBox.on,section[data-screen="battle"] #targetBox.vfTargetProxyOn{z-index:60!important}',
  );
});

test('expanded SlidePad stays clear of ordinary hand input on compact Battle viewports', () => {
  assert.equal(
    BATTLE_JANKEN_HAND_INPUT_SAFE_AREA_CSS,
    '@media(max-width:540px) and (orientation:portrait){[data-battle-janken-slidepad="1"]{bottom:max(154px,calc(env(safe-area-inset-bottom) + 154px))!important}}@media(max-height:430px) and (orientation:landscape){[data-battle-janken-slidepad="1"]{bottom:74px!important}}.battleDrawer.on ~ [data-battle-janken-slidepad="1"]{pointer-events:none!important}.battleDrawer.on ~ [data-battle-janken-slidepad="1"] *{pointer-events:none!important}',
  );
});
