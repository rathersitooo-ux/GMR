import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT,
  mountBattleJankenFocusRuntimeSurface,
} from '../browser/battle-janken-focus-runtime-surface.mjs';

const AUTHORITATIVE_SELECTION_FIXTURE_NOTE = 'authoritative_selection_already_happened';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.listeners = new Map();
    this.removed = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  remove() {
    this.removed = true;
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

function createFakeDocument() {
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  return {
    body,
    head,
    createElement(tagName) { return new FakeElement(tagName); },
    querySelector(selector) {
      if (selector === '[data-gr-janken-focus-surface-style]') {
        return head.children.find((child) => child.attributes.has('data-gr-janken-focus-surface-style')) ?? null;
      }
      return null;
    },
  };
}

function authoritativePackages(generation = 'g1') {
  return [
    { jankenHand: 'ROCK', cardId: `rock-card-${generation}`, path: [`${generation}:r0`, `${generation}:r1`], direction: 'RIGHT', roadId: `road-rock-${generation}`, battleId: `battle-${generation}`, opponentId: `opponent-rock-${generation}`, shieldLane: 'LEFT', shieldRef: `shield-rock-${generation}` },
    { jankenHand: 'SCISSORS', cardId: `scissors-card-${generation}`, path: [`${generation}:s0`, `${generation}:s1`], direction: 'CENTER', roadId: `road-scissors-${generation}`, battleId: `battle-${generation}`, opponentId: `opponent-scissors-${generation}`, shieldLane: 'CENTER', shieldRef: `shield-scissors-${generation}` },
    { jankenHand: 'PAPER', cardId: `paper-card-${generation}`, path: [`${generation}:p0`, `${generation}:p1`], direction: 'LEFT', roadId: `road-paper-${generation}`, battleId: `battle-${generation}`, opponentId: `opponent-paper-${generation}`, shieldLane: 'RIGHT', shieldRef: `shield-paper-${generation}` },
  ];
}

function authoritativeCardCatalog(generation = 'g1') {
  return [
    { id: `rock-card-${generation}`, display_name: `岩札 ${generation}`, suit: 'SP', rank: '7', power: 7, authority: AUTHORITATIVE_SELECTION_FIXTURE_NOTE },
    { id: `scissors-card-${generation}`, display_name: `刃札 ${generation}`, suit: 'HT', rank: 'Q', power: 12, authority: AUTHORITATIVE_SELECTION_FIXTURE_NOTE },
    { id: `paper-card-${generation}`, display_name: `紙札 ${generation}`, suit: 'DI', rank: '3', power: 3, authority: AUTHORITATIVE_SELECTION_FIXTURE_NOTE },
  ];
}

function createLiveStack({ rejectCommit = false, rejectCancel = false, rejectFocus = false } = {}) {
  const calls = { focus: [], cancel: 0, commit: 0 };
  let readyHand = null;
  let previewReady = false;
  let nextRejectCommit = rejectCommit;
  return {
    calls,
    setRejectCommit(value) { nextRejectCommit = value; },
    async focus(hand) {
      calls.focus.push(hand);
      if (rejectFocus) {
        readyHand = null;
        previewReady = false;
        return { ok: false, staged: false, reason: 'VISIBLE_PREVIEW_REQUIRED' };
      }
      readyHand = hand;
      previewReady = true;
      return { ok: true, staged: true, reason: 'LATEST_FOCUS_PREVIEW_READY', jankenHand: hand, preview: { active: true } };
    },
    async cancel() {
      calls.cancel += 1;
      if (rejectCancel) return { ok: false, cleared: false, reason: 'PRECOMMIT_CLEAR_REJECTED' };
      readyHand = null;
      previewReady = false;
      return { ok: true, cleared: true, reason: 'PRECOMMIT_SELECTION_CLEARED' };
    },
    async commit() {
      calls.commit += 1;
      if (nextRejectCommit) return { ok: false, committed: false, reason: 'TRANSPORT_REJECTED' };
      readyHand = null;
      previewReady = false;
      return { ok: true, committed: true, reason: 'COMMITTED' };
    },
    status() {
      return { phase: previewReady ? 'READY' : 'IDLE', desiredHand: readyHand, readyHand, previewReady, commitPending: false };
    },
  };
}

function mount(options = {}) {
  const documentRef = createFakeDocument();
  const liveInputStack = options.liveInputStack ?? createLiveStack();
  const generationId = options.generationId ?? 'g1';
  const runtime = mountBattleJankenFocusRuntimeSurface({
    documentRef,
    mountRoot: documentRef.body,
    liveInputStack,
    packages: options.packages ?? authoritativePackages(generationId),
    generationId,
    cardCatalog: options.cardCatalog ?? authoritativeCardCatalog(generationId),
    onAccepted: options.onAccepted,
  });
  return { documentRef, liveInputStack, runtime };
}

test('JANKEN_FOCUS renders all three exact authoritative choices including target, Shield, and route', () => {
  const { runtime } = mount();
  const html = runtime.host.innerHTML;
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.match(html, /グー/);
  assert.match(html, /チョキ/);
  assert.match(html, /パー/);
  assert.match(html, /rock-card-g1/);
  assert.match(html, /opponent-rock-g1/);
  assert.match(html, /LEFT \/ shield-rock-g1/);
  assert.match(html, /road-rock-g1/);
  assert.match(html, /g1:r0/);
  assert.equal(runtime.snapshot().gameplayAuthority, false);
});

test('JANKEN_FOCUS keeps the exact physical card face primary and RPS only as a secondary role badge', () => {
  const { runtime } = mount();
  const html = runtime.host.innerHTML;
  assert.match(html, /data-physical-card-id="rock-card-g1"/);
  assert.match(html, /data-card-identity-source="GLOBAL_CARD_DATA_EXACT_ID"/);
  assert.match(html, /data-native-suit="SP"/);
  assert.match(html, /data-printed-rank="7"/);
  assert.match(html, /岩札 g1/);
  assert.match(html, /♠/);
  assert.match(html, /SPADE · ID rock-card-g1/);
  assert.match(html, /イラスト未接続/);
  assert.match(html, /data-janken-role="ROCK">✊ グー/);
});

test('fixture explicitly models that authoritative opening-hand selection already happened', () => {
  assert.equal(AUTHORITATIVE_SELECTION_FIXTURE_NOTE, 'authoritative_selection_already_happened');
  assert.ok(authoritativeCardCatalog().every((card) => card.authority === AUTHORITATIVE_SELECTION_FIXTURE_NOTE));
});

test('missing catalog metadata preserves exact package cardId and never borrows another card identity', () => {
  const { runtime } = mount({ cardCatalog: [{ id: 'foreign-card', display_name: '別カード', suit: 'CL', rank: 'K' }] });
  const html = runtime.host.innerHTML;
  assert.match(html, /data-physical-card-id="rock-card-g1"/);
  assert.match(html, /data-card-identity-source="PACKAGE_CARD_ID_ONLY"/);
  assert.match(html, /カード情報未接続/);
  assert.match(html, /イラスト未接続/);
  assert.doesNotMatch(html, /別カード/);
});

test('JANKEN_FOCUS exposes exactly one target-rail switch for each authoritative package and no free target', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack });
  const html = runtime.host.innerHTML;
  const railActions = html.match(/class="grJankenTargetChip/g) ?? [];
  assert.equal(railActions.length, 3);
  assert.match(html, /aria-label="ロックオン対象切替"/);
  assert.match(html, /data-opponent-id="opponent-rock-g1"/);
  assert.match(html, /data-shield-lane="LEFT"/);
  assert.match(html, /data-opponent-id="opponent-scissors-g1"/);
  assert.match(html, /data-shield-lane="CENTER"/);
  assert.match(html, /data-opponent-id="opponent-paper-g1"/);
  assert.match(html, /data-shield-lane="RIGHT"/);

  const result = await runtime.focus('PAPER');
  assert.equal(result.ok, true);
  assert.deepEqual(liveInputStack.calls.focus, ['PAPER']);
  assert.equal(runtime.snapshot().presentation.focusedPackage.opponentId, 'opponent-paper-g1');
  assert.equal(runtime.snapshot().presentation.focusedPackage.shieldLane, 'RIGHT');
  assert.equal(runtime.snapshot().presentation.surface, 'LOAD_FOCUS');
});

test('JANKEN_FOCUS uses centered flower-bloom presentation with a reduced-motion static fallback', () => {
  const { documentRef, runtime } = mount();
  assert.match(runtime.host.innerHTML, /grJankenFocusPanel grJankenFocusBloomPanel/);
  assert.match(runtime.host.innerHTML, /data-janken-focus-visual="flower-bloom"/);
  const style = documentRef.head.children.find((child) => child.attributes.has('data-gr-janken-focus-surface-style'));
  assert.ok(style);
  assert.match(style.textContent, /\.grJankenFocusBloomPanel\{top:50%;bottom:auto/);
  assert.match(style.textContent, /@keyframes grJankenFocusPetalBloom/);
  assert.match(style.textContent, /nth-child\(1\).*animation-delay:0ms/);
  assert.match(style.textContent, /nth-child\(2\).*animation-delay:35ms/);
  assert.match(style.textContent, /nth-child\(3\).*animation-delay:70ms/);
  assert.match(style.textContent, /prefers-reduced-motion:reduce/);
});

test('focus delegates to the existing live stack and enters enlarged LOAD_FOCUS only after its visible preview is ready', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack });
  const result = await runtime.focus('SCISSORS');
  assert.deepEqual(liveInputStack.calls.focus, ['SCISSORS']);
  assert.equal(liveInputStack.calls.commit, 0);
  assert.equal(result.ok, true);
  assert.equal(runtime.snapshot().presentation.surface, 'LOAD_FOCUS');
  assert.equal(runtime.snapshot().presentation.focusedHand, 'SCISSORS');
  assert.match(runtime.host.innerHTML, /ロード確認/);
  assert.match(runtime.host.innerHTML, /ロックオン固定/);
  assert.match(runtime.host.innerHTML, /scissors-card-g1/);
  assert.match(runtime.host.innerHTML, /data-physical-card-id="scissors-card-g1"/);
  assert.match(runtime.host.innerHTML, /data-native-suit="HT"/);
  assert.match(runtime.host.innerHTML, /data-printed-rank="Q"/);
  assert.match(runtime.host.innerHTML, /刃札 g1/);
  assert.match(runtime.host.innerHTML, /data-janken-role="SCISSORS">✌ チョキ/);
  assert.match(runtime.host.innerHTML, /opponent-scissors-g1/);
  assert.match(runtime.host.innerHTML, /CENTER \/ shield-scissors-g1/);
});

test('failed visible preview stays fail-closed in JANKEN_FOCUS and never exposes commit', async () => {
  const liveInputStack = createLiveStack({ rejectFocus: true });
  const { runtime } = mount({ liveInputStack });
  const result = await runtime.focus('PAPER');
  assert.equal(result.ok, false);
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.equal(runtime.snapshot().presentation.previewReady, false);
  assert.doesNotMatch(runtime.host.innerHTML, /このロードで決定/);
  const commit = await runtime.commit();
  assert.equal(commit.committed, false);
  assert.equal(liveInputStack.calls.commit, 0);
});

test('BOARD_PEEK round-trip preserves the exact focused package and returns to LOAD_FOCUS without restaging', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack });
  await runtime.focus('ROCK');
  const before = runtime.snapshot().presentation.focusedPackage;
  assert.equal(runtime.boardPeek(), true);
  assert.equal(runtime.snapshot().presentation.surface, 'BOARD_PEEK');
  assert.match(runtime.host.innerHTML, /じゃんけんに戻る/);
  assert.equal(runtime.returnFromBoardPeek(), true);
  const after = runtime.snapshot().presentation.focusedPackage;
  assert.equal(runtime.snapshot().presentation.surface, 'LOAD_FOCUS');
  assert.equal(after, before);
  assert.deepEqual(liveInputStack.calls.focus, ['ROCK']);
});

test('commit delegates exactly once; rejection keeps LOAD_FOCUS and accepted commit closes the surface', async () => {
  const liveInputStack = createLiveStack({ rejectCommit: true });
  const accepted = [];
  const { runtime } = mount({ liveInputStack, onAccepted(result, pkg) { accepted.push({ result, pkg }); } });
  await runtime.focus('PAPER');
  const rejected = await runtime.commit();
  assert.equal(rejected.committed, false);
  assert.equal(liveInputStack.calls.commit, 1);
  assert.equal(runtime.snapshot().presentation.surface, 'LOAD_FOCUS');
  assert.equal(runtime.host.hidden, false);
  assert.match(runtime.host.innerHTML, /TRANSPORT_REJECTED/);
  liveInputStack.setRejectCommit(false);
  const committed = await runtime.commit();
  assert.equal(committed.committed, true);
  assert.equal(liveInputStack.calls.commit, 2);
  assert.equal(runtime.snapshot().accepted, true);
  assert.equal(runtime.host.hidden, true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].pkg.jankenHand, 'PAPER');
});

test('cancel delegates to the existing global precommit clear and returns to the three-choice focus', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack });
  await runtime.focus('ROCK');
  const result = await runtime.cancel();
  assert.equal(result.cleared, true);
  assert.equal(liveInputStack.calls.cancel, 1);
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.equal(runtime.snapshot().presentation.focusedHand, null);
  assert.match(runtime.host.innerHTML, /グー/);
  assert.match(runtime.host.innerHTML, /チョキ/);
  assert.match(runtime.host.innerHTML, /パー/);
});

test('authoritative sync invalidates local focus so a stale preview cannot commit through this surface', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack });
  await runtime.focus('ROCK');
  runtime.sync({ packages: authoritativePackages('g2'), generationId: 'g2' });
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.equal(runtime.snapshot().presentation.focusedHand, null);
  assert.match(runtime.host.innerHTML, /rock-card-g2/);
  assert.match(runtime.host.innerHTML, /data-opponent-id="opponent-rock-g2"/);
  const result = await runtime.commit();
  assert.equal(result.committed, false);
  assert.equal(liveInputStack.calls.commit, 0);
});

test('surface contract stays presentation-only and exposes no rule or transport authority', () => {
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.authoritativeTargetRail, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.targetRailSource, 'EXISTING_THREE_COMPOUND_PACKAGES_ONLY');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.targetRailMayCreateTarget, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.physicalCardLineageSource, 'EXACT_PACKAGE_CARD_ID_JOIN_GLOBAL_CARD_DATA');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.jankenRoleIsSecondaryBadge, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.inventedCardIdentityAllowed, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.cardArtFallback, 'EXPLICIT_ART_UNAVAILABLE_NO_INVENTION');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.openingSevenToRpsSelectionAuthority, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.selectionCommitsImmediately, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.commitTransportDelegatedToExistingLiveStack, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.computesShieldMapping, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.computesHandAssignment, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.mutatesProductionHtml, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.mutatesJankenRuntime, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.mutatesPublicPackage, false);
});