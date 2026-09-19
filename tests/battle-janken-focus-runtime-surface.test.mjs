import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT,
  mountBattleJankenFocusRuntimeSurface,
  resolveViewerLocalFocusCardArt,
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

function createFakeDocument(artByCardId = {}) {
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const collectionCards = Object.entries(artByCardId).map(([cardId, src]) => ({
    dataset: { id: cardId },
    querySelector(selector) {
      return selector === '[data-role="fanart-local-skin-overlay"]' ? { src } : null;
    },
  }));
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
    querySelectorAll(selector) {
      return selector === '#collectionGrid [data-id]' ? collectionCards : [];
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

function exactArt(generation = 'g1') {
  return {
    [`rock-card-${generation}`]: `https://assets.example/${generation}/rock.webp`,
    [`scissors-card-${generation}`]: `https://assets.example/${generation}/scissors.webp`,
    [`paper-card-${generation}`]: `https://assets.example/${generation}/paper.webp`,
  };
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
  const documentRef = createFakeDocument(options.artByCardId ?? {});
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

test('JANKEN_FOCUS keeps exact physical card art primary and RPS only as a secondary role badge', () => {
  const { runtime } = mount({ artByCardId: exactArt() });
  const html = runtime.host.innerHTML;
  assert.match(html, /data-physical-card-id="rock-card-g1"/);
  assert.match(html, /data-card-identity-source="GLOBAL_CARD_DATA_EXACT_ID"/);
  assert.match(html, /data-native-suit="SP"/);
  assert.match(html, /data-printed-rank="7"/);
  assert.match(html, /data-card-art-status="BOUND"/);
  assert.match(html, /class="grJankenCardArt" data-card-art-source="viewer_local_exact_card_id" src="https:\/\/assets\.example\/g1\/rock\.webp"/);
  assert.match(html, /岩札 g1/);
  assert.match(html, /♠/);
  assert.match(html, /SPADE · ID rock-card-g1/);
  assert.doesNotMatch(html, /イラスト未接続/);
  assert.match(html, /data-janken-role="ROCK">✊ グー/);
});

test('exact card-art resolver never borrows a different card image', () => {
  const documentRef = createFakeDocument({ 'foreign-card': 'https://assets.example/foreign.webp', 'rock-card-g1': 'https://assets.example/rock.webp' });
  assert.deepEqual(resolveViewerLocalFocusCardArt(documentRef, 'rock-card-g1'), { src: 'https://assets.example/rock.webp', source: 'viewer_local_exact_card_id' });
  assert.equal(resolveViewerLocalFocusCardArt(documentRef, 'paper-card-g1'), null);
});

test('fixture explicitly models that authoritative opening-hand selection already happened', () => {
  assert.equal(AUTHORITATIVE_SELECTION_FIXTURE_NOTE, 'authoritative_selection_already_happened');
  assert.ok(authoritativeCardCatalog().every((card) => card.authority === AUTHORITATIVE_SELECTION_FIXTURE_NOTE));
});

test('missing catalog metadata preserves exact package cardId and never borrows another card identity or art', () => {
  const { runtime } = mount({
    cardCatalog: [{ id: 'foreign-card', display_name: '別カード', suit: 'CL', rank: 'K' }],
    artByCardId: { 'foreign-card': 'https://assets.example/foreign.webp' },
  });
  const html = runtime.host.innerHTML;
  assert.match(html, /data-physical-card-id="rock-card-g1"/);
  assert.match(html, /data-card-identity-source="PACKAGE_CARD_ID_ONLY"/);
  assert.match(html, /data-card-art-status="MISSING"/);
  assert.match(html, /カード情報未接続/);
  assert.match(html, /イラスト未接続/);
  assert.doesNotMatch(html, /別カード/);
  assert.doesNotMatch(html, /foreign\.webp/);
});

test('JANKEN_FOCUS exposes exactly one target-rail switch for each authoritative package and playing a ready card commits it immediately', async () => {
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
  assert.equal(result.committed, true);
  assert.equal(result.autoCommitted, true);
  assert.deepEqual(liveInputStack.calls.focus, ['PAPER']);
  assert.equal(liveInputStack.calls.commit, 1);
  assert.equal(runtime.snapshot().accepted, true);
  assert.equal(runtime.host.hidden, true);
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
  assert.match(style.textContent, /\.grJankenCardArt\{position:absolute;[^}]*object-fit:cover/);
  assert.match(style.textContent, /\.grJankenRoleBadge\{position:absolute;[^}]*z-index:3/);
});

test('played janken card becomes a provisional large centered hero while commit is pending', async () => {
  let resolveCommit;
  const liveInputStack = createLiveStack();
  liveInputStack.commit = async () => new Promise((resolve) => { resolveCommit = resolve; });
  const { documentRef, runtime } = mount({ liveInputStack, artByCardId: exactArt() });
  const pending = runtime.focus('ROCK');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(runtime.snapshot().presentation.surface, 'COMMITTING');
  assert.match(runtime.host.innerHTML, /data-provisional-card-hero="true"/);
  assert.match(runtime.host.innerHTML, /data-physical-card-id="rock-card-g1"/);
  assert.match(runtime.host.innerHTML, /src="https:\/\/assets\.example\/g1\/rock\.webp"/);
  const style = documentRef.head.children.find((child) => child.attributes.has('data-gr-janken-focus-surface-style'));
  assert.ok(style);
  assert.match(style.textContent, /\.grJankenLoadPanel\{top:50%;bottom:auto;width:min\(940px/);
  assert.match(style.textContent, /grid-template-columns:minmax\(0,1fr\) clamp\(210px,30vw,360px\) minmax\(190px,1fr\)/);
  assert.match(style.textContent, /min-height:clamp\(300px,42vw,520px\)/);
  resolveCommit({ ok: true, committed: true, reason: 'COMMITTED' });
  const result = await pending;
  assert.equal(result.committed, true);
  assert.equal(result.autoCommitted, true);
  assert.equal(runtime.host.hidden, true);
});

test('playing a focused physical card preserves the exact authoritative identity into the accepted auto-commit', async () => {
  const liveInputStack = createLiveStack();
  const artByCardId = exactArt();
  const accepted = [];
  const { runtime } = mount({
    liveInputStack,
    artByCardId,
    onAccepted(result, pkg) { accepted.push({ result, pkg }); },
  });
  const focusHtml = runtime.host.innerHTML;
  assert.match(focusHtml, /src="https:\/\/assets\.example\/g1\/scissors\.webp"/);
  const result = await runtime.focus('SCISSORS');
  assert.deepEqual(liveInputStack.calls.focus, ['SCISSORS']);
  assert.equal(liveInputStack.calls.commit, 1);
  assert.equal(result.committed, true);
  assert.equal(result.autoCommitted, true);
  assert.equal(runtime.snapshot().accepted, true);
  assert.equal(runtime.host.hidden, true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].pkg.cardId, 'scissors-card-g1');
  assert.equal(accepted[0].pkg.jankenHand, 'SCISSORS');
  assert.equal(accepted[0].pkg.opponentId, 'opponent-scissors-g1');
  assert.equal(accepted[0].pkg.shieldLane, 'CENTER');
});
test('failed visible preview stays fail-closed in JANKEN_FOCUS and never auto-commits', async () => {
  const liveInputStack = createLiveStack({ rejectFocus: true });
  const { runtime } = mount({ liveInputStack });
  const result = await runtime.focus('PAPER');
  assert.equal(result.ok, false);
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.equal(runtime.snapshot().presentation.previewReady, false);
  assert.equal(liveInputStack.calls.commit, 0);
  assert.doesNotMatch(runtime.host.innerHTML, /このロードで決定/);
  assert.doesNotMatch(runtime.host.innerHTML, /data-gr-janken-focus-action="commit"/);
  assert.doesNotMatch(runtime.host.innerHTML, /data-gr-janken-focus-action="cancel"/);
});
test('BOARD_PEEK remains available before card play and returning does not stage or commit anything', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack, artByCardId: exactArt() });
  assert.equal(runtime.boardPeek(), true);
  assert.equal(runtime.snapshot().presentation.surface, 'BOARD_PEEK');
  assert.match(runtime.host.innerHTML, /じゃんけんに戻る/);
  assert.equal(runtime.returnFromBoardPeek(), true);
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.deepEqual(liveInputStack.calls.focus, []);
  assert.equal(liveInputStack.calls.commit, 0);
  const committed = await runtime.focus('ROCK');
  assert.equal(committed.committed, true);
  assert.equal(liveInputStack.calls.commit, 1);
});
test('card play delegates commit exactly once; rejection clears precommit and a fresh card play can retry', async () => {
  const liveInputStack = createLiveStack({ rejectCommit: true });
  const accepted = [];
  const { runtime } = mount({ liveInputStack, onAccepted(result, pkg) { accepted.push({ result, pkg }); } });
  const rejected = await runtime.focus('PAPER');
  assert.equal(rejected.committed, false);
  assert.equal(rejected.autoCommitted, true);
  assert.equal(liveInputStack.calls.commit, 1);
  assert.equal(liveInputStack.calls.cancel, 1);
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.equal(runtime.snapshot().accepted, false);
  assert.equal(runtime.host.hidden, false);
  assert.match(runtime.host.innerHTML, /TRANSPORT_REJECTED/);
  assert.doesNotMatch(runtime.host.innerHTML, /このロードで決定/);
  assert.doesNotMatch(runtime.host.innerHTML, />戻す</);

  liveInputStack.setRejectCommit(false);
  const committed = await runtime.focus('PAPER');
  assert.equal(committed.committed, true);
  assert.equal(committed.autoCommitted, true);
  assert.equal(liveInputStack.calls.commit, 2);
  assert.equal(runtime.snapshot().accepted, true);
  assert.equal(runtime.host.hidden, true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].pkg.jankenHand, 'PAPER');
});
test('no visible cancel control exists while the programmatic precommit clear API remains available', () => {
  const { runtime } = mount();
  assert.equal(typeof runtime.cancel, 'function');
  assert.doesNotMatch(runtime.host.innerHTML, /data-gr-janken-focus-action="cancel"/);
  assert.doesNotMatch(runtime.host.innerHTML, />戻す</);
});
test('authoritative sync before card play replaces visible choices and only the fresh choice can auto-commit', async () => {
  const liveInputStack = createLiveStack();
  const { runtime } = mount({ liveInputStack });
  runtime.sync({ packages: authoritativePackages('g2'), generationId: 'g2' });
  assert.equal(runtime.snapshot().presentation.surface, 'JANKEN_FOCUS');
  assert.equal(runtime.snapshot().presentation.focusedHand, null);
  assert.match(runtime.host.innerHTML, /rock-card-g2/);
  assert.match(runtime.host.innerHTML, /data-opponent-id="opponent-rock-g2"/);
  const result = await runtime.focus('ROCK');
  assert.equal(result.committed, true);
  assert.equal(result.autoCommitted, true);
  assert.equal(liveInputStack.calls.commit, 1);
});
test('surface contract auto-commits card play without visible confirm/cancel controls and keeps authority delegated', () => {
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.authoritativeTargetRail, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.targetRailSource, 'EXISTING_THREE_COMPOUND_PACKAGES_ONLY');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.targetRailMayCreateTarget, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.physicalCardLineageSource, 'EXACT_PACKAGE_CARD_ID_JOIN_GLOBAL_CARD_DATA');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.cardArtSource, 'VIEWER_LOCAL_COLLECTION_EXACT_CARD_ID');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.cardArtExactIdRequired, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.jankenRoleIsSecondaryBadge, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.inventedCardIdentityAllowed, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.cardArtFallback, 'EXPLICIT_ART_UNAVAILABLE_NO_INVENTION');
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.openingSevenToRpsSelectionAuthority, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.selectionCommitsImmediately, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.visibleCommitControl, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.visibleCancelControl, false);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.programmaticPrecommitClearPreserved, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.commitTransportDelegatedToExistingLiveStack, true);
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.cancelDelegatedToExistingLiveStack, true);
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
test('visible surface contains no confirm or cancel action after the interaction decision change', () => {
  const { runtime } = mount();
  assert.doesNotMatch(runtime.host.innerHTML, /data-gr-janken-focus-action="commit"/);
  assert.doesNotMatch(runtime.host.innerHTML, /data-gr-janken-focus-action="cancel"/);
  assert.doesNotMatch(runtime.host.innerHTML, /このロードで決定/);
});

test('destroy removes the remaining click listener', () => {
  const { runtime } = mount();
  assert.equal(runtime.host.listeners.has('pointerdown'), false);
  assert.equal(runtime.host.listeners.has('pointermove'), false);
  assert.equal(runtime.host.listeners.has('pointerup'), false);
  assert.equal(runtime.host.listeners.has('pointercancel'), false);
  assert.equal(runtime.host.listeners.has('click'), true);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.host.listeners.has('click'), false);
});