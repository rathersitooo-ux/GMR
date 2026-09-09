import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
  BATTLE_JANKEN_FOCUS_LIVE_MOUNT_SCHEMA,
  normalizeBattleJankenFocusIntegration,
  BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS,
  advanceBattleJankenSlotRollState,
  buildBattleJankenSlidePadModel,
  createBattleJankenSlotRollState,
  isBattleHandAuraLaunchArmed,
  projectBattleHandDragGhostPosition,
  projectBattleJankenSlotRollDetents,
  projectBattleLoadCardPreview,
  resolveBattleJankenSlotCardAction,
  resolveBattleJankenSlidePadGestureTarget,
  BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA,
  presentBattleJankenOrderMotionToSlidePad,
  projectBattleJankenOrderSlidePadPresentation,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';
import { projectBattleJankenOrderSnapshot } from '../browser/battle-janken-order-live-adapter.mjs';
import {
  createRoundStartJankenSlotAssignment,
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';

const hand = [
  { id: 'club-a', suit: 'CL', label: 'Club A' },
  { id: 'diamond-a', suit: 'DI', label: 'Diamond A' },
  { id: 'spade-a', suit: 'SP', label: 'Spade A' },
  { id: 'club-b', suit: 'CL', label: 'Club B' },
];


test('current Hand3 snapshot projects the exact immutable three-card mapping without native-suit reassignment', () => {
  const currentHand = [
    { id: 'heart-3', suit: 'HE', label: 'Heart 3' },
    { id: 'club-4', suit: 'CL', label: 'Club 4' },
    { id: 'diamond-5', suit: 'DI', label: 'Diamond 5' },
  ];
  const snapshot = createRoundStartJankenSlotAssignment({
    roundId: 'battle-round:current-1',
    hand: currentHand,
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: {
      ROCK: 'diamond-5',
      SCISSORS: 'heart-3',
      PAPER: 'club-4',
    },
  });
  const first = buildBattleJankenSlidePadModel({
    roundId: 'current-1',
    hand: currentHand,
    currentSnapshot: snapshot,
  });
  const redraw = buildBattleJankenSlidePadModel({
    roundId: 'battle-round:current-1',
    hand: currentHand,
    currentSnapshot: snapshot,
  });
  assert.strictEqual(first.assignment, snapshot);
  assert.strictEqual(redraw.assignment, snapshot);
  assert.deepEqual(first.slots.map((slot) => [slot.jankenHand, slot.cardId]), [
    ['ROCK', 'diamond-5'],
    ['SCISSORS', 'heart-3'],
    ['PAPER', 'club-4'],
  ]);
  assert.deepEqual(first.ordinaryHandCardIds, []);
});

test('dedicated Focus projection proactively replaces the legacy display snapshot with current Hand3 authority', () => {
  const runtimeSource = readFileSync(
    new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url),
    'utf8',
  );
  assert.match(runtimeSource, /const callerAssignment = model\.assignment\?\.assignmentMode[\s\S]*CURRENT_HAND3_POLICY[\s\S]*\? model\.assignment[\s\S]*: null/);
  assert.match(runtimeSource, /assignment = currentAssignment;\n      render\(\);/);
  assert.match(runtimeSource, /focusAssignmentSyncPending = true;[\s\S]*readDedicatedFocusContext\(\)\.finally/);
});

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

test('fixed janken slot presentation identifies the hand instead of reusing native suit glyphs', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '1', hand, pickDuplicateIndex: () => 1 });
  assert.deepEqual(model.slots.map((slot) => [slot.jankenHand, slot.symbol, slot.hand]), [
    ['ROCK', '✊', 'グー'],
    ['SCISSORS', '✌', 'チョキ'],
    ['PAPER', '✋', 'パー'],
  ]);
  assert.equal(model.slots.some((slot) => ['♣', '♦', '♠'].includes(slot.symbol)), false);
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

test('ordinary hand drag ghost stays above the pointer while preserving horizontal grab position', () => {
  assert.deepEqual(
    projectBattleHandDragGhostPosition({
      pointer: { x: 420, y: 360 },
      grabOffset: { x: 40, y: 60 },
      cardSize: { width: 100, height: 140 },
      viewportHeight: 720,
    }),
    { left: 380, top: 220 },
  );
  assert.deepEqual(
    projectBattleHandDragGhostPosition({
      pointer: { x: 420, y: 80 },
      grabOffset: { x: 40, y: 60 },
      cardSize: { width: 100, height: 140 },
      viewportHeight: 720,
    }),
    { left: 380, top: 0 },
    'visual projection clamps at the viewport top instead of moving the pointer authority',
  );
});

test('ordinary hand drag integration keeps aura arming on the raw pointer rather than the lifted ghost', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /projectBattleHandDragGhostPosition\(\{[\s\S]*pointer: \{ x, y \}/);
  assert.match(source, /isBattleHandAuraLaunchArmed\(\{\s*pointer: \{ x, y \}/);
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
    symbol: '✊',
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


test('disabled expanded janken slots do not intercept ordinary hand hit-testing', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(
    source,
    /\.grJankenSlidePadSlot:disabled\{[^}]*pointer-events:none[^}]*\}/,
    'a disabled or empty visual slot must not win hit-testing over the ordinary hand beneath it',
  );
  assert.equal(
    source.includes('data-expanded=\"true\"] .grJankenSlidePadSlot{opacity:1;pointer-events:auto}'),
    true,
    'expanded selectable slots retain their existing pointer target behavior before :disabled overrides it',
  );
});


test('Battle Slot Roll uses the shared detent loop after the radial anchor', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: 'roll-1', hand, pickDuplicateIndex: () => 1 });
  let state = createBattleJankenSlotRollState(model, 'ROCK');
  assert.equal(state.itemId, 'ROCK');

  state = advanceBattleJankenSlotRollState(state, { deltaPx: 68, detentPx: 68 }).state;
  assert.equal(state.itemId, 'SCISSORS');
  state = advanceBattleJankenSlotRollState(state, { deltaPx: 68, detentPx: 68 }).state;
  assert.equal(state.itemId, 'PAPER');
  state = advanceBattleJankenSlotRollState(state, { deltaPx: 68, detentPx: 68 }).state;
  assert.equal(state.itemId, 'ROCK', 'rightward stepping wraps');
  state = advanceBattleJankenSlotRollState(state, { deltaPx: -68, detentPx: 68 }).state;
  assert.equal(state.itemId, 'PAPER', 'reversing direction immediately walks the same loop backward');
});

test('Battle Slot Roll excludes empty or disabled janken hands instead of creating a second selection authority', () => {
  const model = {
    slots: [
      { jankenHand: 'ROCK', symbol: '♣', hand: 'グー', cardId: 'r', selectable: true },
      { jankenHand: 'SCISSORS', symbol: '♦', hand: 'チョキ', cardId: null, selectable: false },
      { jankenHand: 'PAPER', symbol: '♠', hand: 'パー', cardId: 'p', selectable: true },
    ],
  };
  let state = createBattleJankenSlotRollState(model, 'ROCK');
  assert.deepEqual(state.items.map((item) => item.id), ['ROCK', 'PAPER']);
  state = advanceBattleJankenSlotRollState(state, { deltaPx: 58, detentPx: 58 }).state;
  assert.equal(state.itemId, 'PAPER');
  state = advanceBattleJankenSlotRollState(state, { deltaPx: 58, detentPx: 58 }).state;
  assert.equal(state.itemId, 'ROCK');
});

test('Battle Slot Roll projects one bounded visual snap per emitted detent without moving slot geometry', () => {
  const calls = { SCISSORS: [], PAPER: [] };
  const node = (hand) => ({
    disabled: false,
    animate(frames, options) {
      calls[hand].push({ frames, options });
      return {};
    },
  });
  const slotNodes = new Map([
    ['SCISSORS', node('SCISSORS')],
    ['PAPER', node('PAPER')],
  ]);
  const projected = projectBattleJankenSlotRollDetents(slotNodes, [
    { direction: 1, fromItemId: 'ROCK', toItemId: 'SCISSORS' },
    { direction: 1, fromItemId: 'SCISSORS', toItemId: 'PAPER' },
  ]);

  assert.equal(projected, 2);
  assert.equal(calls.SCISSORS.length, 1);
  assert.equal(calls.PAPER.length, 1);
  for (const call of [...calls.SCISSORS, ...calls.PAPER]) {
    assert.equal(call.options.duration, 110);
    assert.equal(call.frames.some((frame) => Object.hasOwn(frame, 'transform')), false,
      'detent feedback must not take over slot position or selection geometry');
  }
});

test('Battle Slot Roll does not fabricate detent feedback when no detent was emitted', () => {
  let animateCount = 0;
  const slotNodes = new Map([
    ['SCISSORS', { disabled: false, animate() { animateCount += 1; } }],
    ['PAPER', { disabled: true, animate() { animateCount += 1; } }],
  ]);
  assert.equal(projectBattleJankenSlotRollDetents(slotNodes, []), 0);
  assert.equal(projectBattleJankenSlotRollDetents(slotNodes, [{ toItemId: 'PAPER' }]), 0);
  assert.equal(projectBattleJankenSlotRollDetents(slotNodes, [{ toItemId: 'MISSING' }]), 0);
  assert.equal(animateCount, 0);
});

test('live Battle pointer adapter consumes shared detents instead of discarding them', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /const advanced = advanceBattleJankenSlotRollState\(slotRollState,[\s\S]*slotRollState = advanced\.state;/);
  assert.match(source, /projectBattleJankenSlotRollDetents\(slotNodes, advanced\.detents\);/);
  assert.equal(source.includes('advanceBattleJankenSlotRollState(slotRollState, {\n        deltaPx,\n        detentPx: slotRollDetentPx,\n      }).state;'), false,
    'the live pointer adapter must not throw away the shared detent event list');
});


test('portrait reserved janken fan compacts without changing desktop slot geometry', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /\.grJankenSlidePadSlot\{position:absolute;right:2px;bottom:2px;width:82px;height:112px/);
  assert.match(source, /@media\(max-width:540px\) and \(orientation:portrait\)\{[^\n]*\.grJankenSlidePadSlot\{width:64px;height:88px/);
  assert.match(source, /orientation:portrait[^\n]*rock\{transform:translate\(-126px,12px\)[^\n]*scissors\{transform:translate\(-96px,-43px\)[^\n]*paper\{transform:translate\(-38px,-72px\)/);
});

test('basic Battle does not mount or show the optional remaining-hand roulette by default', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /rouletteEnabled = false/);
  assert.match(source, /const rowRouletteRuntime = rouletteEnabled === true/);
  assert.match(source, /rowRouletteHost\.hidden = rouletteEnabled !== true;/);
  assert.match(source, /const runtime = mountBattleJankenSlidePadRuntime\(globalThis\);/);
});

test('remaining-hand row roulette live mount reuses the current playable projection and hand-card action', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /createBattlePlayableHandRowRouletteController/);
  assert.match(source, /getCandidateProjection: \(\) => currentPlayableHandAffordance\(root\)/);
  assert.match(source, /delegateHandCardAction: \(cardId\) => clickExistingHandCard\(root, cardId\)/);
  assert.match(source, /syncHandZoneProjection\(root, model\);[\s\S]*syncPlayableHandAffordance\(root\);[\s\S]*rowRouletteRuntime\?\.refresh\?\.\(\)/);
  assert.match(source, /rowRouletteRuntime\?\.destroy\?\.\(\);[\s\S]*rowRouletteHost\.remove\?\.\(\)/);
});

test('remaining-hand row roulette live placement stays left of the board beside the Partner region', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /data-battle-playable-hand-row-roulette-live/);
  assert.match(source, /left:var\(--gameroad-battle-partner-right-x/);
  assert.match(source, /bottom:var\(--gameroad-battle-partner-upper-y/);
  assert.match(source, /z-index:39/);
});

test('remaining-hand row roulette bridge owns no draw refill Mana Honey score or result path', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const rowRouletteController = createBattlePlayableHandRowRouletteController({');
  const end = source.indexOf('\n\n  let assignment = null;', start);
  assert.ok(start >= 0 && end > start);
  const bridge = source.slice(start, end).toLowerCase();
  for (const forbidden of ['draw', 'refill', 'mana', 'honey', 'score', 'result', 'removehand']) {
    assert.equal(bridge.includes(forbidden), false, `roulette bridge must not own ${forbidden}`);
  }
});

test('short-landscape Battle controls keep the compact janken fan on the non-occluding right-edge anchor', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /@media\(max-height:430px\) and \(orientation:landscape\)\{[^\n]*\[\$\{HOST_ATTR\}=\"1\"\]\{width:188px;height:146px;right:7px;bottom:7px/);
  assert.match(source, /max-height:430px[^\n]*\.grJankenSlidePadHandle\{width:58px;height:58px\}/,
    'the primary bottom-right touch target stays at the existing short-landscape size');
  assert.match(source, /max-height:430px[^\n]*\.grJankenSlidePadSlot\{width:60px;height:80px;padding:4px\}/);
  assert.match(source, /max-height:430px[^\n]*rock\{transform:translate\(-124px,10px\)[^\n]*scissors\{transform:translate\(-92px,-40px\)[^\n]*paper\{transform:translate\(-48px,-62px\)/);
});

test('short-landscape remaining-hand roulette compacts beside Partner without changing its board-occlusion contract', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /max-height:430px[^\n]*BATTLE_PLAYABLE_HAND_ROW_ROULETTE_LIVE_HOST_ATTR[^\n]*bottom:var\(--gameroad-battle-partner-upper-y,92px\);transform:scale\(\.72\)/);
  assert.match(source, /left:var\(--gameroad-battle-partner-right-x,clamp\(112px,14vw,174px\)\)/,
    'desktop placement remains anchored beside Partner rather than moving into the board');
});

test('390x844 portrait keeps SlidePad and optional roulette in the right-thumb dock', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /BATTLE_PORTRAIT_390X844_R7B/);
  assert.match(source, /@media\(max-width:430px\) and \(orientation:portrait\)/);
  assert.match(source, /right:max\(12px,env\(safe-area-inset-right\)\)!important/);
  assert.match(source, /bottom:max\(12px,env\(safe-area-inset-bottom\)\)!important/);
  assert.match(source, /right:176px!important;left:auto!important/);
  assert.match(source, /max-width:min\(164px,42vw\)!important/);
  assert.match(source, /rouletteEnabled = false/);
  assert.doesNotMatch(source, /battle-janken-slidepad-runtime-mount-base\.mjs/);
});



// BATTLE_JANKEN_FOCUS_SLIDEPAD_LIVE_MOUNT_R1_BEGIN

test('dedicated janken focus integration requires the existing surface and live-stack contract', () => {
  const stack = {
    focus() {},
    cancel() {},
    commit() {},
    status() {},
  };
  const mountSurface = () => null;
  const readContext = () => ({ packages: [] });
  const normalized = normalizeBattleJankenFocusIntegration({ mountSurface, readContext, liveInputStack: stack });
  assert.equal(normalized.schema, BATTLE_JANKEN_FOCUS_LIVE_MOUNT_SCHEMA);
  assert.equal(normalized.mountSurface, mountSurface);
  assert.equal(normalized.readContext, readContext);
  assert.equal(normalized.liveInputStack, stack);
  assert.equal(normalizeBattleJankenFocusIntegration(null), null);
  assert.equal(normalizeBattleJankenFocusIntegration({ mountSurface, readContext, liveInputStack: { focus() {} } }), null);
});

test('configured dedicated focus blocks legacy direct hand-card commit and delegates exact packages to the existing surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /focusIntegration = null/);
  assert.match(source, /const dedicatedFocus = normalizeBattleJankenFocusIntegration\(focusIntegration\);/);
  assert.equal((source.match(/if \(dedicatedFocus\) \{\s*void openDedicatedFocusSurface\(\);\s*return;\s*\}/g) ?? []).length, 2,
    'both gesture release and direct slot click must enter the same dedicated focus surface');
  assert.match(source, /const callerAssignment = model\.assignment\?\.assignmentMode[\s\S]*CURRENT_HAND3_POLICY[\s\S]*\? model\.assignment[\s\S]*: null[\s\S]*context = await dedicatedFocus\.readContext\(Object\.freeze\(\{[\s\S]*roundId: model\.roundId,[\s\S]*assignment: callerAssignment/);
  assert.match(source, /runtime = dedicatedFocus\.mountSurface\(\{[\s\S]*liveInputStack: dedicatedFocus\.liveInputStack,[\s\S]*packages: context\.packages,[\s\S]*generationId: context\.generationId/);
  assert.doesNotMatch(source, /from '\.\/battle-janken-focus-runtime-surface\.mjs'/,
    'SlidePad must not invent a second static mount authority; the current caller supplies the merged surface');
});

test('dedicated focus commit keeps release flight presentation-only and invalidates on round or explicit sync failure', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  const acceptedStart = source.indexOf('onAccepted: (result, readyPackage) => {');
  const acceptedEnd = source.indexOf('\n        },\n      });', acceptedStart);
  assert.ok(acceptedStart >= 0 && acceptedEnd > acceptedStart);
  const accepted = source.slice(acceptedStart, acceptedEnd);
  assert.match(accepted, /captureReleasedJankenCardFlight\(globalRef, root, slotNodes, hand\)/);
  assert.match(accepted, /playReleasedJankenCardFlight\(host, flight\)/);
  assert.equal(accepted.includes('clickExistingHandCard'), false,
    'authoritative compound commit already happened inside the existing live stack');
  assert.match(source, /function openForRound\(roundId\) \{[\s\S]*closeDedicatedFocusSurface\(\);[\s\S]*lastRoundId = roundId;/);
  assert.match(source, /syncFocusSurface: \(\) => syncDedicatedFocusSurface\(\)/);
  assert.match(source, /if \(!context \|\| destroyed[\s\S]*closeDedicatedFocusSurface\(\);\s*return null;/);
});

// BATTLE_JANKEN_FOCUS_SLIDEPAD_LIVE_MOUNT_R1_END

// BATTLE_CARD_FOCUS_PRESENTATION_R3_BEGIN

test('card focus keeps legal candidates delegated to the existing active option authority', async () => {
  const {
    BATTLE_CARD_FOCUS_PRESENTATION_SCHEMA,
    projectBattlePlayableHandAffordance,
  } = await import('../browser/battle-janken-slidepad-runtime-mount.mjs');
  const state = projectBattlePlayableHandAffordance({
    handCardIds: ['a', 'b', 'c', 'd'],
    activeRole: 'battle',
    activeOptionValues: ['a', 'b', 'c'],
    oppositeSelectedCardId: 'b',
    reservedCardIds: ['c'],
    phasePlayable: true,
  });
  assert.equal(BATTLE_CARD_FOCUS_PRESENTATION_SCHEMA, 'gameroad.battle-card-focus-presentation.v1');
  assert.deepEqual(state.candidateCardIds, ['a']);
  assert.equal(state.showActionBase, true);
});

test('card focus visual snap is bounded and preserves raw projection when unarmed or invalid', async () => {
  const { projectBattleCardFocusSnapPosition } = await import('../browser/battle-janken-slidepad-runtime-mount.mjs');
  const snapped = projectBattleCardFocusSnapPosition({
    ghostPosition: { left: 100, top: 100 },
    cardSize: { width: 80, height: 120 },
    snapRect: { left: 260, top: 180, width: 60, height: 60 },
    armed: true,
    maxPullPx: 28,
  });
  const dx = snapped.left - 100;
  const dy = snapped.top - 100;
  assert.ok(Math.hypot(dx, dy) <= 28.000001);
  assert.ok(snapped.left > 100);
  assert.ok(snapped.top > 100);

  assert.deepEqual(projectBattleCardFocusSnapPosition({
    ghostPosition: { left: 42, top: 77 },
    cardSize: { width: 80, height: 120 },
    snapRect: { left: 260, top: 180, width: 60, height: 60 },
    armed: false,
  }), { left: 42, top: 77 });
  assert.deepEqual(projectBattleCardFocusSnapPosition({
    ghostPosition: { left: 42, top: 77 },
    cardSize: { width: 0, height: 120 },
    snapRect: { left: 260, top: 180, width: 60, height: 60 },
    armed: true,
  }), { left: 42, top: 77 });
});

test('card focus live drag uses existing legality and raw pointer authority before commit', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /const legalCandidate = currentPlayableHandAffordance\(root\)\?\.candidateCardIds\?\.includes\?\.\(state\.cardId\) === true;/);
  assert.match(source, /const armed = legalCandidate && isBattleHandAuraLaunchArmed\(\{\s*pointer: \{ x, y \},\s*auraRect,/);
  assert.match(source, /const commit = !cancelled && moved && state\.armed && state\.legalCandidate === true && sourceStillOrdinary;/);
  assert.match(source, /projectBattleCardFocusSnapPosition\(\{[\s\S]*ghostPosition,[\s\S]*snapRect: auraRect,[\s\S]*armed,/);
});

test('card focus has distinct focused, legal and staged presentation states with cleanup', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /data-card-focus="true"/);
  assert.match(source, /data-card-focus-legal="true"/);
  assert.match(source, /data-card-staged="true"/);
  assert.match(source, /delete node\.dataset\.cardFocus;/);
  assert.match(source, /delete node\.dataset\.cardFocusLegal;/);
  assert.match(source, /delete node\.dataset\.cardStaged;/);
});

// BATTLE_CARD_FOCUS_PRESENTATION_R3_END

function orderPresenterAuthoritativeSnapshot() {
  return {
    publicCards: [
      { playerId: 'P1', cardId: 'C1', displayNumber: 1, hand: 'ROCK' },
      { playerId: 'P2', cardId: 'C2', displayNumber: 2, hand: 'SCISSORS' },
      { playerId: 'P3', cardId: 'C3', displayNumber: 3, hand: 'PAPER' },
    ],
    resolution: {
      processingOrder: ['P1', 'P2', 'P3'],
      steps: [
        { processedPlayerId: 'P1', resolvedWinner: true, winningHand: 'ROCK', invalidated: ['P2'] },
        { processedPlayerId: 'P3', resolvedWinner: false, winningHand: null, invalidated: [] },
      ],
      resolvedWinners: ['P1'],
      unresolvedSurvivors: ['P3'],
      invalidated: ['P2'],
    },
  };
}

class OrderPresenterFakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.animations = [];
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  animate(keyframes, options) {
    this.animations.push({ keyframes, options });
    return { finished: Promise.resolve() };
  }
}

class OrderPresenterFakeDocument {
  createElement(tagName) { return new OrderPresenterFakeElement(this, tagName); }
}

function makeOrderPresenterHost() {
  const documentRef = new OrderPresenterFakeDocument();
  return new OrderPresenterFakeElement(documentRef, 'div');
}

test('projects exact authoritative order without sorting or gameplay recalculation', () => {
  const projected = projectBattleJankenOrderSnapshot(orderPresenterAuthoritativeSnapshot());
  const model = projectBattleJankenOrderSlidePadPresentation(projected.motion, { chain: projected.chain });

  assert.equal(model.schema, BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA);
  assert.deepEqual(model.processingOrder, ['P1', 'P2', 'P3']);
  assert.deepEqual(model.slots.map((slot) => slot.displayNumber), [1, 2, 3]);
  assert.deepEqual(model.slots.map((slot) => slot.symbol), ['✊', '✌', '✋']);
  assert.deepEqual(model.slots.map((slot) => slot.finalState), ['resolved-win', 'invalidated', 'unresolved-final']);
  assert.equal(model.presentationOnly, true);
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.gameStateWrite, false);
  assert.equal(model.orderCalculation, false);
  assert.equal(model.comparisonCalculation, false);
  assert.equal(model.winnerCalculation, false);
  assert.equal(model.targetCalculation, false);
  assert.equal(model.physicalTimingAuthority, false);
});

test('full mode renders order links and non-blocking motion cues from the supplied actions', () => {
  const projected = projectBattleJankenOrderSnapshot(orderPresenterAuthoritativeSnapshot());
  const host = makeOrderPresenterHost();
  const accepted = presentBattleJankenOrderMotionToSlidePad(host, projected.motion, { chain: projected.chain });

  assert.equal(accepted, true);
  assert.equal(host.hidden, false);
  assert.equal(host.dataset.motionMode, 'full');
  assert.equal(host.dataset.gameStateWrite, 'false');
  assert.equal(host.children.length, 1);
  const rail = host.children[0];
  const items = rail.children.filter((node) => node.className === 'grJankenOrderItem');
  const arrows = rail.children.filter((node) => node.className === 'grJankenOrderArrow');
  assert.equal(items.length, 3);
  assert.equal(arrows.length, 2);
  assert.equal(items[0].dataset.finalState, 'resolved-win');
  assert.equal(items[1].dataset.finalState, 'invalidated');
  assert.match(items[0].dataset.stepActions, /0:current-pop/);
  assert.ok(items.some((item) => item.animations.length > 0));
});

test('ReducedMotion and LowPerf retain the same order and states without animated cues', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const projected = projectBattleJankenOrderSnapshot(orderPresenterAuthoritativeSnapshot(), options);
    const host = makeOrderPresenterHost();
    const accepted = presentBattleJankenOrderMotionToSlidePad(host, projected.motion, { chain: projected.chain });
    assert.equal(accepted, true);
    assert.equal(host.dataset.motionMode, 'semantic-only');
    const items = host.children[0].children.filter((node) => node.className === 'grJankenOrderItem');
    assert.deepEqual(items.map((item) => item.dataset.finalState), ['resolved-win', 'invalidated', 'unresolved-final']);
    assert.equal(items.reduce((sum, item) => sum + item.animations.length, 0), 0);
  }
});

test('fails closed when chain order does not match the supplied motion order', () => {
  const projected = projectBattleJankenOrderSnapshot(orderPresenterAuthoritativeSnapshot());
  const badChain = { ...projected.chain, processingOrder: ['P2', 'P1', 'P3'] };
  assert.equal(projectBattleJankenOrderSlidePadPresentation(projected.motion, { chain: badChain }), null);
  assert.equal(presentBattleJankenOrderMotionToSlidePad(makeOrderPresenterHost(), projected.motion, { chain: badChain }), false);
});

test('presentation leaves authoritative projection untouched', () => {
  const projected = projectBattleJankenOrderSnapshot(orderPresenterAuthoritativeSnapshot());
  const beforeMotion = structuredClone(projected.motion);
  const beforeChain = structuredClone(projected.chain);
  assert.equal(presentBattleJankenOrderMotionToSlidePad(makeOrderPresenterHost(), projected.motion, { chain: projected.chain }), true);
  assert.deepEqual(projected.motion, beforeMotion);
  assert.deepEqual(projected.chain, beforeChain);
});


test('release-flight live adapter delegates to the canonical effect and keeps success-only triggers', () => {
  const source = readFileSync(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("from './battle-card-release-flight-runtime-effect.mjs';"), true);
  assert.equal(source.includes('captureBattleCardReleaseFlightEffect({'), true);
  assert.equal(source.includes('return playBattleCardReleaseFlightEffect({ host, flight });'), true);
  assert.equal(source.includes('RELEASE_FLIGHT_DURATION_MS'), false);
  assert.equal(source.includes('sampleOffsets = [0, 0.12, 0.28'), false);
  assert.equal(source.includes("reducedMotion: globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true"), true);
  assert.equal(source.includes("lowPerf: battleRoot?.dataset?.lowPerf === 'true'"), true);
  assert.equal(source.includes('if (cardId && clickExistingHandCard(root, cardId)) playReleasedJankenCardFlight(host, flight);'), true);
  assert.equal(source.includes('onAccepted: (result, readyPackage) => {'), true);
  assert.equal(source.includes('const hand = readyPackage?.jankenHand;'), true);
  assert.equal(source.includes('if (flight) playReleasedJankenCardFlight(host, flight);'), true);
});
