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

test('projects zero Honey and zero Chip as resolved authoritative values', () => {
  const result = projectBattleCriticalResourceSnapshot({ honey: 0, chipCount: 0 });
  assert.equal(result.honey.resolved, true);
  assert.equal(result.honey.text, '0');
  assert.equal(result.chip.resolved, true);
  assert.equal(result.chip.text, '0');
});

test('fails closed instead of inventing invalid resource values', () => {
  for (const snapshot of [
    {},
    { honey: -1, chipCount: 2 },
    { honey: 3, chipCount: -1 },
    { honey: '3', chipCount: '2' },
    { honey: 1.5, chipCount: 2.5 },
    { honey: Number.NaN, chipCount: Number.POSITIVE_INFINITY }
  ]) {
    const result = projectBattleCriticalResourceSnapshot(snapshot);
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

test('mounts a compact caller-owned HUD and updates without resource calculation', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHud(global, {
    host,
    snapshot: { honey: 7, chipCount: 3, honeyDelta: 2, honeyDeltaSource: '2位' }
  });

  assert.equal(host.children.length, 1);
  assert.equal(runtime.root.dataset.presentationOnly, 'true');
  assert.equal(runtime.root.dataset.authority, 'caller_authoritative_resource_snapshot_only');
  assert.equal(runtime.honeyCell.children[1].textContent, '7');
  assert.equal(runtime.chipCell.children[1].textContent, '3');
  assert.equal(runtime.honeyCell.children[2].textContent, '+2・2位');
  assert.equal(runtime.honeyCell.children[2].hidden, false);

  const next = runtime.sync({ honey: 8, chipCount: 0 });
  assert.equal(next.honey.text, '8');
  assert.equal(next.chip.text, '0');
  assert.equal(runtime.honeyCell.children[2].hidden, true);
  assert.equal(runtime.root.dataset.honeyResolved, 'true');
  assert.equal(runtime.root.dataset.chipResolved, 'true');
  assert.equal(runtime.gameStateWrite, false);
});

test('does not expose Chip card identities or create a resource authority', () => {
  const model = projectBattleCriticalResourceSnapshot({ honey: 4, chipCount: 5, chipCardIds: ['secret-card'] });
  assert.deepEqual(Object.keys(model.chip).sort(), ['count', 'resolved', 'text']);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.resourceAuthority, 'CALLER_ONLY');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.resourceCalculationOwnedHere, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.resourceStoreOwnedHere, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME.chipIdentityPublicityOwnedHere, false);
});

test('destroy is idempotent and blocks later sync', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHud(global, { host, snapshot: { honey: 1, chipCount: 1 } });
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
  assert.throws(() => runtime.sync({ honey: 2, chipCount: 2 }), /BATTLE_RESOURCE_HUD_DESTROYED/);
});
