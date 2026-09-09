import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT,
  mountBattleJankenFocusRuntimeSurface,
} from '../browser/battle-janken-focus-runtime-surface.mjs';

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
  const runtime = mountBattleJankenFocusRuntimeSurface({
    documentRef,
    mountRoot: documentRef.body,
    liveInputStack,
    packages: options.packages ?? authoritativePackages(),
    generationId: options.generationId ?? 'g1',
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
  assert.match(runtime.host.innerHTML, /scissors-card-g1/);
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
  const result = await runtime.commit();
  assert.equal(result.committed, false);
  assert.equal(liveInputStack.calls.commit, 0);
});

test('surface contract stays presentation-only and exposes no rule or transport authority', () => {
  assert.equal(BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT.authority, 'NONE');
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
