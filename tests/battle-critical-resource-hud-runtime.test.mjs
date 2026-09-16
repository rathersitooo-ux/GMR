import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME,
  mountBattleCriticalResourceHud,
  projectBattleCriticalResourceSnapshot
} from '../browser/battle-critical-resource-hud-runtime.mjs';

class FakeNode {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.id = '';
  }
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function makeGlobal() {
  const head = new FakeNode('head');
  const document = {
    head,
    createElement(tag) { return new FakeNode(tag); },
    getElementById(id) {
      return head.children.find(node => node.id === id) ?? null;
    }
  };
  return { document };
}

test('projects numeric Mana plus zero Honey and zero Chip as resolved authoritative values', () => {
  const result = projectBattleCriticalResourceSnapshot({ manaCurrent: 7, manaMax: 10, honey: 0, chipCount: 0 });
  assert.equal(result.mana.resolved, true);
  assert.equal(result.mana.text, '7/10');
  assert.equal(result.honey.resolved, true);
  assert.equal(result.honey.text, '0');
  assert.equal(result.chip.resolved, true);
  assert.equal(result.chip.text, '0');
});

test('fails closed instead of inventing invalid resource values', () => {
  for (const snapshot of [
    {},
    { manaCurrent: 11, manaMax: 10, honey: 0, chipCount: 0 },
    { manaCurrent: 7, manaMax: 0, honey: 0, chipCount: 0 },
    { manaCurrent: '7', manaMax: 10, honey: 0, chipCount: 0 },
    { honey: -1, chipCount: 2 },
    { honey: 3, chipCount: -1 },
    { honey: '3', chipCount: '2' },
    { honey: 1.5, chipCount: 2.5 },
    { honey: Number.NaN, chipCount: Number.POSITIVE_INFINITY }
  ]) {
    const result = projectBattleCriticalResourceSnapshot(snapshot);
    const manaValid = Number.isSafeInteger(snapshot.manaCurrent) && snapshot.manaCurrent >= 0
      && Number.isSafeInteger(snapshot.manaMax) && snapshot.manaMax > 0
      && snapshot.manaCurrent <= snapshot.manaMax;
    if (!manaValid) {
      assert.equal(result.mana.resolved, false);
      assert.equal(result.mana.text, '—');
    }
    if (!Number.isSafeInteger(snapshot.honey) || snapshot.honey < 0) {
      assert.equal(result.honey.resolved, false);
      assert.equal(result.honey.text, '—');
    }
    if (!Number.isSafeInteger(snapshot.chipCount) || snapshot.chipCount < 0) {
      assert.equal(result.chip.resolved, false);
      assert.equal(result.chip.text, '—');
    }
  }
});

test('shows Honey delta only when both caller delta and caller source are authoritative', () => {
  const resolved = projectBattleCriticalResourceSnapshot({
    honey: 14,
    chipCount: 2,
    honeyDelta: 3,
    honeyDeltaSource: '3位'
  });
  assert.equal(resolved.honey.deltaResolved, true);
  assert.equal(resolved.honey.deltaText, '+3・3位');

  const missingSource = projectBattleCriticalResourceSnapshot({ honey: 14, chipCount: 2, honeyDelta: 3 });
  assert.equal(missingSource.honey.deltaResolved, false);
  assert.equal(missingSource.honey.deltaText, '');
});

test('shows only a complete current Mana-first then Honey payment receipt', () => {
  const result = projectBattleCriticalResourceSnapshot({
    manaCurrent: 0,
    manaMax: 10,
    honey: 5,
    chipCount: 1,
    paymentReceipt: {
      cost: 6,
      manaPaid: 4,
      honeyPaid: 2,
      manaAfter: 0,
      honeyAfter: 5,
      source: '戦闘札6',
    },
  });
  assert.equal(result.payment.resolved, true);
  assert.equal(result.payment.cost, 6);
  assert.equal(result.payment.manaPaid, 4);
  assert.equal(result.payment.honeyPaid, 2);
  assert.equal(result.payment.text, '戦闘札6・支払6・マナ4＋ハニー2');
  assert.match(result.payment.ariaText, /残りマナ0、残りハニー5/);
});

test('hides partial, inconsistent, non-Mana-first, or stale payment receipts', () => {
  const base = { manaCurrent: 0, manaMax: 10, honey: 5, chipCount: 0 };
  for (const paymentReceipt of [
    { cost: 6, manaPaid: 4, honeyPaid: 2, manaAfter: 0, honeyAfter: 5 },
    { cost: 7, manaPaid: 4, honeyPaid: 2, manaAfter: 0, honeyAfter: 5, source: '戦闘札6' },
    { cost: 6, manaPaid: 4, honeyPaid: 2, manaAfter: 1, honeyAfter: 5, source: '戦闘札6' },
    { cost: 6, manaPaid: 4, honeyPaid: 2, manaAfter: 0, honeyAfter: 4, source: '戦闘札6' },
  ]) {
    const result = projectBattleCriticalResourceSnapshot({ ...base, paymentReceipt });
    assert.equal(result.payment.resolved, false);
    assert.equal(result.payment.text, '');
  }
});

test('mounts a compact caller-owned HUD and updates without resource calculation', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHud(global, {
    host,
    snapshot: { manaCurrent: 7, manaMax: 10, honey: 7, chipCount: 3, honeyDelta: 2, honeyDeltaSource: '2位' }
  });

  assert.equal(host.children.length, 1);
  assert.equal(runtime.root.dataset.presentationOnly, 'true');
  assert.equal(runtime.root.dataset.authority, 'caller_authoritative_resource_snapshot_only');
  assert.equal(runtime.root.dataset.visualPriority, 'resource_detail');
  assert.equal(runtime.manaCell.children[1].textContent, '7/10');
  assert.equal(runtime.honeyCell.children[1].textContent, '7');
  assert.equal(runtime.chipCell.children[1].textContent, '3');
  assert.equal(runtime.honeyCell.children[2].textContent, '+2・2位');
  assert.equal(runtime.honeyCell.children[2].hidden, false);
  assert.equal(runtime.manaCell.children[2].hidden, true);

  const next = runtime.sync({
    manaCurrent: 0,
    manaMax: 10,
    honey: 5,
    chipCount: 0,
    paymentReceipt: {
      cost: 6,
      manaPaid: 4,
      honeyPaid: 2,
      manaAfter: 0,
      honeyAfter: 5,
      source: '戦闘札6',
    },
  });
  assert.equal(next.mana.text, '0/10');
  assert.equal(next.honey.text, '5');
  assert.equal(next.chip.text, '0');
  assert.equal(runtime.honeyCell.children[2].hidden, true);
  assert.equal(runtime.manaCell.children[2].textContent, '戦闘札6・支払6・マナ4＋ハニー2');
  assert.equal(runtime.manaCell.children[2].hidden, false);
  assert.equal(runtime.root.dataset.manaResolved, 'true');
  assert.equal(runtime.root.dataset.honeyResolved, 'true');
  assert.equal(runtime.root.dataset.chipResolved, 'true');
  assert.equal(runtime.root.dataset.paymentResolved, 'true');
  assert.match(runtime.root.getAttribute('aria-label'), /支払い 戦闘札6、支払6、マナ4、ハニー2/);
  assert.equal(runtime.gameStateWrite, false);
});

test('installs a late Battle-shell visual hierarchy while remaining presentation-only', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHud(global, {
    host,
    snapshot: { manaCurrent: 7, manaMax: 10, honey: 4, chipCount: 2 }
  });
  const style = global.document.head.children.find(node => node.id === 'gameroad-battle-critical-resource-hud-style');

  assert.ok(style);
  assert.match(style.textContent, /\[data-gr-battle-screen="1"\] \.grBattleScreenTop/);
  assert.match(style.textContent, /\[data-gr-battle-screen="1"\] \[data-battle-current-action\]/);
  assert.match(style.textContent, /\[data-gr-battle-screen="1"\] \[data-battle-screen-causal-grid\]/);
  assert.match(style.textContent, /\[data-gr-battle-screen="1"\] \[data-battle-progress-guide\]\{display:none!important\}/);
  assert.match(style.textContent, /@media\(max-height:420px\) and \(orientation:landscape\)/);
  assert.deepEqual(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.battleShellVisualOrder, [
    'BOARD_WORLD',
    'CURRENT_ACTION',
    'HAND_JANKEN',
    'PUBLIC_4P',
    'RESOURCE_DETAIL'
  ]);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.battleShellHierarchyStyleHook, 'LATE_PRESENTATION_ONLY');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.constrainedLandscapeAcceptanceTarget, '667x375');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.persistentRightRailOwnedHere, false);
  assert.equal(runtime.visualPriority, 'RESOURCE_DETAIL');
  assert.equal(runtime.presentationOnly, true);
  assert.equal(runtime.gameStateWrite, false);
});

test('does not expose physical Mana or Chip card identities or create a resource authority', () => {
  const model = projectBattleCriticalResourceSnapshot({
    manaCurrent: 7,
    manaMax: 10,
    manaCardIds: ['legacy-mana-card'],
    honey: 4,
    chipCount: 5,
    chipCardIds: ['secret-card']
  });
  assert.deepEqual(Object.keys(model.mana).sort(), ['current', 'max', 'resolved', 'text']);
  assert.equal(JSON.stringify(model).includes('legacy-mana-card'), false);
  assert.deepEqual(Object.keys(model.chip).sort(), ['count', 'resolved', 'text']);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.resourceAuthority, 'CALLER_ONLY');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.resourceCalculationOwnedHere, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.resourceStoreOwnedHere, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.paymentReceiptAuthority, 'CALLER_ONLY_ATOMIC');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.paymentCalculationOwnedHere, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.paymentChoiceOwnedHere, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.physicalManaIdentityProjection, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.chipIdentityPublicityOwnedHere, false);
});

test('destroy is idempotent and blocks later sync', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHud(global, { host, snapshot: { manaCurrent: 7, manaMax: 10, honey: 1, chipCount: 1 } });
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
  assert.throws(() => runtime.sync({ manaCurrent: 6, manaMax: 10, honey: 2, chipCount: 2 }), /BATTLE_RESOURCE_HUD_DESTROYED/);
});
