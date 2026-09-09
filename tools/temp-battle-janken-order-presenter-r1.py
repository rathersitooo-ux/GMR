from pathlib import Path
import subprocess

RUNTIME = Path('browser/battle-janken-slidepad-runtime-mount.mjs')
TEST = Path('tests/battle-janken-order-slidepad-presenter.test.mjs')
EXPECTED_BLOB = '58cd76d6b9ac30043465aa3e70ede4598ef69782'
MARKER = 'BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA'


def git_blob(path: Path) -> str:
    return subprocess.check_output(['git', 'hash-object', str(path)], text=True).strip()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)


text = RUNTIME.read_text(encoding='utf-8')
if MARKER in text:
    if not TEST.exists():
        raise SystemExit('presenter marker exists but focused test is missing')
    print('presenter patch already applied')
    raise SystemExit(0)

actual_blob = git_blob(RUNTIME)
if actual_blob != EXPECTED_BLOB:
    raise SystemExit(f'runtime blob changed: expected {EXPECTED_BLOB}, got {actual_blob}')

text = replace_once(
    text,
    "const SLOT_ATTR = 'data-janken-slot';\n",
    "const SLOT_ATTR = 'data-janken-slot';\nconst ORDER_PRESENTER_ATTR = 'data-janken-order-presentation';\nexport const BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA = 'gameroad.battle-janken-order-slidepad-presenter.v1';\n",
    'constant anchor',
)

css = r'''[${HOST_ATTR}="1"] .grJankenOrderPresenter{position:absolute;right:0;top:-43px;width:248px;min-height:36px;display:flex;align-items:center;justify-content:flex-end;pointer-events:none;opacity:1;z-index:4}
[${HOST_ATTR}="1"] .grJankenOrderRail{display:flex;align-items:center;justify-content:flex-end;gap:3px;max-width:100%;padding:4px 6px;border-radius:12px;background:rgba(7,10,32,.74);border:1px solid rgba(210,230,255,.46);box-shadow:0 7px 20px rgba(3,5,24,.3);backdrop-filter:blur(3px)}
[${HOST_ATTR}="1"] .grJankenOrderItem{min-width:38px;height:28px;padding:2px 4px;border-radius:8px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:1fr auto;column-gap:3px;align-items:center;background:rgba(36,44,92,.92);border:1px solid rgba(213,231,255,.48);color:#f7fbff;box-sizing:border-box;transform-origin:50% 80%}
[${HOST_ATTR}="1"] .grJankenOrderOrdinal{grid-row:1 / span 2;font-size:9px;font-weight:950;opacity:.62}
[${HOST_ATTR}="1"] .grJankenOrderIdentity{font-size:11px;font-weight:950;line-height:1;white-space:nowrap}
[${HOST_ATTR}="1"] .grJankenOrderState{font-size:7px;font-weight:900;line-height:1;letter-spacing:.04em;opacity:.72;white-space:nowrap}
[${HOST_ATTR}="1"] .grJankenOrderItem[data-final-state="invalidated"]{opacity:.5;filter:saturate(.2)}
[${HOST_ATTR}="1"] .grJankenOrderItem[data-final-state="resolved-win"]{border-color:rgba(233,248,255,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
[${HOST_ATTR}="1"] .grJankenOrderArrow{font-size:10px;font-weight:950;opacity:.5}
@media(max-height:430px) and (orientation:landscape){[${HOST_ATTR}="1"] .grJankenOrderPresenter{top:-35px;width:188px}[${HOST_ATTR}="1"] .grJankenOrderRail{padding:3px 4px;gap:2px;border-radius:9px}[${HOST_ATTR}="1"] .grJankenOrderItem{min-width:30px;height:23px;padding:1px 3px;border-radius:6px}[${HOST_ATTR}="1"] .grJankenOrderIdentity{font-size:9px}[${HOST_ATTR}="1"] .grJankenOrderState{font-size:6px}}
@media(max-width:430px) and (orientation:portrait){[${HOST_ATTR}="1"] .grJankenOrderPresenter{top:-42px;width:220px}}
@media(prefers-reduced-motion:reduce){[${HOST_ATTR}="1"] .grJankenOrderItem{animation:none!important;transition:none!important}}
'''
text = replace_once(
    text,
    '${BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS}\n',
    css + '${BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS}\n',
    'style anchor',
)

helper = r'''
function orderPresenterStateLabel(finalState) {
  if (finalState === 'resolved-win') return '確定';
  if (finalState === 'invalidated') return '無効';
  if (finalState === 'unresolved-final') return '残り';
  return '';
}

export function projectBattleJankenOrderSlidePadPresentation(motion, { chain = null } = {}) {
  if (!motion || motion.schema !== 'gameroad.battle-janken-order-motion.v1') return null;
  if (motion.presentationOnly !== true || motion.gameplayAuthority !== false || motion.gameStateWrite !== false) return null;
  if (!Array.isArray(motion.processingOrder) || motion.processingOrder.length < 1 || motion.processingOrder.length > 4) return null;
  const processingOrder = motion.processingOrder.map((value) => typeof value === 'string' ? value.trim() : '');
  if (processingOrder.some((value) => !value) || new Set(processingOrder).size !== processingOrder.length) return null;
  if (!Array.isArray(motion.subjects) || motion.subjects.length !== processingOrder.length) return null;
  if (!Array.isArray(motion.sequenceBuild) || !Array.isArray(motion.steps) || !Array.isArray(motion.finalSettle)) return null;
  if (motion.motionMode !== 'full' && motion.motionMode !== 'semantic-only') return null;

  const chainSlots = Array.isArray(chain?.orderSlots) ? chain.orderSlots : [];
  if (chainSlots.length !== 0 && chainSlots.length !== processingOrder.length) return null;
  if (Array.isArray(chain?.processingOrder)) {
    if (chain.processingOrder.length !== processingOrder.length) return null;
    for (let index = 0; index < processingOrder.length; index += 1) {
      if (chain.processingOrder[index] !== processingOrder[index]) return null;
    }
  }

  const slots = [];
  for (let index = 0; index < processingOrder.length; index += 1) {
    const playerId = processingOrder[index];
    const subject = motion.subjects[index];
    const finalSlot = motion.finalSettle[index];
    if (!subject || subject.playerId !== playerId || subject.sequenceIndex !== index) return null;
    if (!finalSlot || finalSlot.playerId !== playerId || finalSlot.sequenceIndex !== index) return null;
    const chainSlot = chainSlots[index] ?? null;
    if (chainSlot && (chainSlot.playerId !== playerId || chainSlot.sequenceIndex !== index)) return null;

    const stepActions = [];
    for (const step of motion.steps) {
      if (!step || !Number.isInteger(step.stepIndex) || !Array.isArray(step.slots)) return null;
      const actionSlot = step.slots.find((candidate) => candidate?.playerId === playerId);
      if (!actionSlot || typeof actionSlot.action !== 'string') return null;
      stepActions.push(Object.freeze({
        stepIndex: step.stepIndex,
        current: step.currentPlayerId === playerId,
        action: actionSlot.action,
      }));
    }

    const hand = chainSlot?.hand ?? null;
    const symbol = SLOT_VIEW[hand]?.symbol ?? '';
    const displayNumber = chainSlot?.displayNumber ?? null;
    slots.push(Object.freeze({
      playerId,
      cardId: subject.cardId ?? chainSlot?.cardId ?? null,
      sequenceIndex: index,
      displayNumber,
      hand,
      symbol,
      finalState: finalSlot.sourceFinalState ?? null,
      finalAction: finalSlot.action ?? null,
      stepActions: Object.freeze(stepActions),
    }));
  }

  const links = [];
  for (let index = 0; index < motion.sequenceBuild.length; index += 1) {
    const link = motion.sequenceBuild[index];
    if (!link || link.phase !== 'order-link-establish' || link.sequenceIndex !== index) return null;
    if (link.fromPlayerId !== processingOrder[index] || link.toPlayerId !== processingOrder[index + 1]) return null;
    links.push(Object.freeze({
      sequenceIndex: index,
      fromPlayerId: link.fromPlayerId,
      toPlayerId: link.toPlayerId,
      action: link.action,
    }));
  }
  if (links.length !== Math.max(0, processingOrder.length - 1)) return null;

  return deepFreeze({
    schema: BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    orderCalculation: false,
    comparisonCalculation: false,
    winnerCalculation: false,
    targetCalculation: false,
    physicalTimingAuthority: false,
    motionMode: motion.motionMode,
    reducedMotion: motion.reducedMotion === true,
    lowPerf: motion.lowPerf === true,
    processingOrder: Object.freeze([...processingOrder]),
    slots: Object.freeze(slots),
    links: Object.freeze(links),
  });
}

export function presentBattleJankenOrderMotionToSlidePad(orderHost, motion, metadata = {}) {
  const projection = projectBattleJankenOrderSlidePadPresentation(motion, metadata);
  const documentRef = orderHost?.ownerDocument;
  if (!projection || !orderHost || typeof documentRef?.createElement !== 'function' || typeof orderHost.replaceChildren !== 'function') return false;

  const rail = documentRef.createElement('div');
  rail.className = 'grJankenOrderRail';
  for (let index = 0; index < projection.slots.length; index += 1) {
    const slot = projection.slots[index];
    const item = documentRef.createElement('div');
    item.className = 'grJankenOrderItem';
    item.dataset.playerId = slot.playerId;
    item.dataset.sequenceIndex = String(slot.sequenceIndex);
    item.dataset.cardId = slot.cardId ?? '';
    item.dataset.finalState = slot.finalState ?? '';
    item.dataset.finalAction = slot.finalAction ?? '';
    item.dataset.stepActions = slot.stepActions.map((entry) => `${entry.stepIndex}:${entry.action}`).join('|');

    const ordinal = documentRef.createElement('span');
    ordinal.className = 'grJankenOrderOrdinal';
    ordinal.textContent = String(index + 1);
    const identity = documentRef.createElement('span');
    identity.className = 'grJankenOrderIdentity';
    identity.textContent = `${slot.symbol}${slot.displayNumber ?? ''}` || String(index + 1);
    const state = documentRef.createElement('span');
    state.className = 'grJankenOrderState';
    state.textContent = orderPresenterStateLabel(slot.finalState);
    item.appendChild(ordinal);
    item.appendChild(identity);
    item.appendChild(state);
    rail.appendChild(item);

    if (projection.motionMode === 'full' && typeof item.animate === 'function') {
      for (const entry of slot.stepActions) {
        let keyframes = null;
        if (entry.action === 'current-pop') {
          keyframes = [
            { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
            { transform: 'translateY(-5px) scale(1.08)', filter: 'brightness(1.35)' },
            { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
          ];
        } else if (entry.action === 'processed-retreat') {
          keyframes = [
            { transform: 'translateY(0) scale(1)', opacity: 1 },
            { transform: 'translateY(3px) scale(.94)', opacity: .72 },
          ];
        } else if (entry.action === 'invalidated-stay-skip') {
          keyframes = [
            { filter: 'saturate(1)', opacity: 1 },
            { filter: 'saturate(.18)', opacity: .5 },
          ];
        }
        if (keyframes) {
          item.animate(keyframes, {
            duration: 170,
            delay: Math.max(0, entry.stepIndex) * 120,
            easing: 'cubic-bezier(.2,.8,.2,1)',
            fill: 'none',
          });
        }
      }
    }

    if (index < projection.slots.length - 1) {
      const arrow = documentRef.createElement('span');
      arrow.className = 'grJankenOrderArrow';
      arrow.textContent = '›';
      arrow.dataset.sequenceIndex = String(index);
      rail.appendChild(arrow);
    }
  }

  orderHost.replaceChildren(rail);
  orderHost.hidden = false;
  orderHost.dataset.motionMode = projection.motionMode;
  orderHost.dataset.presentationOnly = 'true';
  orderHost.dataset.gameStateWrite = 'false';
  orderHost.setAttribute?.('aria-hidden', 'false');
  orderHost.setAttribute?.('aria-label', 'じゃんけん処理順');
  orderHost.__gameroadOrderPresentation = projection;
  return true;
}

'''
text = replace_once(
    text,
    '\nexport function mountBattleJankenSlidePadRuntime(globalRef = globalThis, { battleRoot = null, rouletteEnabled = false } = {}) {\n',
    '\n' + helper + 'export function mountBattleJankenSlidePadRuntime(globalRef = globalThis, { battleRoot = null, rouletteEnabled = false } = {}) {\n',
    'presenter helper anchor',
)

order_host = r'''  const orderPresenterHost = documentRef.createElement('div');
  orderPresenterHost.className = 'grJankenOrderPresenter';
  orderPresenterHost.setAttribute(ORDER_PRESENTER_ATTR, '1');
  orderPresenterHost.setAttribute('aria-label', 'じゃんけん処理順');
  orderPresenterHost.setAttribute('aria-hidden', 'true');
  orderPresenterHost.hidden = true;
  host.appendChild(orderPresenterHost);
'''
text = replace_once(
    text,
    "  const handle = documentRef.createElement('button');\n",
    order_host + "  const handle = documentRef.createElement('button');\n",
    'order host anchor',
)

text = replace_once(
    text,
    "    loadPreviewSnapshot: () => projectBattleLoadCardPreview(model, armedHand),\n    isExpanded: () => expanded,\n",
    "    loadPreviewSnapshot: () => projectBattleLoadCardPreview(model, armedHand),\n    presentOrderMotion: (motion, metadata = {}) => destroyed ? false : presentBattleJankenOrderMotionToSlidePad(orderPresenterHost, motion, metadata),\n    orderPresentationSnapshot: () => orderPresenterHost.__gameroadOrderPresentation ?? null,\n    isExpanded: () => expanded,\n",
    'runtime API anchor',
)

RUNTIME.write_text(text, encoding='utf-8')

TEST.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';

import { projectBattleJankenOrderSnapshot } from '../browser/battle-janken-order-live-adapter.mjs';
import {
  BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA,
  presentBattleJankenOrderMotionToSlidePad,
  projectBattleJankenOrderSlidePadPresentation,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

function authoritativeSnapshot() {
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

class FakeElement {
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

class FakeDocument {
  createElement(tagName) { return new FakeElement(this, tagName); }
}

function makeHost() {
  const documentRef = new FakeDocument();
  return new FakeElement(documentRef, 'div');
}

test('projects exact authoritative order without sorting or gameplay recalculation', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
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
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const host = makeHost();
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
    const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot(), options);
    const host = makeHost();
    const accepted = presentBattleJankenOrderMotionToSlidePad(host, projected.motion, { chain: projected.chain });
    assert.equal(accepted, true);
    assert.equal(host.dataset.motionMode, 'semantic-only');
    const items = host.children[0].children.filter((node) => node.className === 'grJankenOrderItem');
    assert.deepEqual(items.map((item) => item.dataset.finalState), ['resolved-win', 'invalidated', 'unresolved-final']);
    assert.equal(items.reduce((sum, item) => sum + item.animations.length, 0), 0);
  }
});

test('fails closed when chain order does not match the supplied motion order', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const badChain = { ...projected.chain, processingOrder: ['P2', 'P1', 'P3'] };
  assert.equal(projectBattleJankenOrderSlidePadPresentation(projected.motion, { chain: badChain }), null);
  assert.equal(presentBattleJankenOrderMotionToSlidePad(makeHost(), projected.motion, { chain: badChain }), false);
});

test('presentation leaves authoritative projection untouched', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const beforeMotion = structuredClone(projected.motion);
  const beforeChain = structuredClone(projected.chain);
  assert.equal(presentBattleJankenOrderMotionToSlidePad(makeHost(), projected.motion, { chain: projected.chain }), true);
  assert.deepEqual(projected.motion, beforeMotion);
  assert.deepEqual(projected.chain, beforeChain);
});
''', encoding='utf-8')

print('patched', RUNTIME, 'and created', TEST)
