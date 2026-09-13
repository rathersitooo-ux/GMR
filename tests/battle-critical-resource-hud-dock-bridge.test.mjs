import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT,
  BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_SCHEMA,
  mountBattleCriticalResourceHudDockBridge,
} from '../browser/battle-critical-resource-hud-dock-bridge.mjs';

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
    },
  };
  return { document };
}

test('reuses existing Resource HUD while exposing only Honey and payment in the dock bridge', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHudDockBridge(global, {
    host,
    player: { manaCurrent: 7, manaMax: 10, honey: 4, chip: ['A', 'B'] },
  });

  assert.equal(host.children.length, 1);
  assert.equal(runtime.root.dataset.bridgeAuthority, 'existing_resource_hud_and_caller_only');
  assert.equal(runtime.root.dataset.visibleResources, 'honey,payment_receipt');
  assert.equal(runtime.resourceHud.manaCell.hidden, true);
  assert.equal(runtime.resourceHud.chipCell.hidden, true);
  assert.equal(runtime.honeyCell.hidden, false);
  assert.equal(runtime.honeyCell.children[1].textContent, '4');
  assert.equal(runtime.paymentNode.hidden, true);
  assert.equal(runtime.root.getAttribute('aria-label'), '対戦資源 ハニー 4');
});

test('shows only an already-authoritative atomic payment receipt that matches post-payment state', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHudDockBridge(global, { host });

  const model = runtime.sync({
    player: { manaCurrent: 0, manaMax: 10, honey: 8, chip: [] },
    paymentReceipt: {
      cost: 5,
      manaPaid: 2,
      honeyPaid: 3,
      manaAfter: 0,
      honeyAfter: 8,
      source: '戦闘札 5',
    },
  });

  assert.equal(model.payment.resolved, true);
  assert.equal(runtime.paymentNode.hidden, false);
  assert.equal(runtime.paymentNode.textContent, '戦闘札 5・支払5・マナ2＋ハニー3');
  assert.match(runtime.root.getAttribute('aria-label'), /^対戦資源 ハニー 8、支払い /);
  assert.equal(runtime.root.getAttribute('aria-label').includes('チップ'), false);
});

test('fails closed for stale or partial receipt instead of calculating a replacement', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHudDockBridge(global, { host });

  const stale = runtime.sync({
    player: { manaCurrent: 0, manaMax: 10, honey: 8, chip: [] },
    paymentReceipt: {
      cost: 5,
      manaPaid: 2,
      honeyPaid: 3,
      manaAfter: 0,
      honeyAfter: 9,
      source: '戦闘札 5',
    },
  });
  assert.equal(stale.payment.resolved, false);
  assert.equal(runtime.paymentNode.hidden, true);
  assert.equal(runtime.paymentNode.textContent, '');

  const partial = runtime.sync({
    player: { manaCurrent: 0, manaMax: 10, honey: 8, chip: [] },
    paymentReceipt: { cost: 5, manaPaid: 2, honeyPaid: 3 },
  });
  assert.equal(partial.payment.resolved, false);
  assert.equal(runtime.paymentNode.hidden, true);
  assert.equal(runtime.paymentNode.textContent, '');
});

test('sync is presentation-only and never exposes Chip identities', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const player = {
    id: 'P1',
    manaCurrent: 4,
    manaMax: 10,
    honey: 7,
    chip: ['SECRET-CARD-A', 'SECRET-CARD-B'],
  };
  const before = JSON.stringify(player);
  const runtime = mountBattleCriticalResourceHudDockBridge(global, { host, player });

  runtime.sync({
    player,
    honeyDelta: 2,
    honeyDeltaSource: '順位2位',
  });

  assert.equal(JSON.stringify(player), before);
  assert.equal(runtime.gameStateWrite, false);
  assert.equal(JSON.stringify(runtime.snapshot()).includes('SECRET-CARD-A'), false);
  assert.equal(JSON.stringify(runtime.snapshot()).includes('SECRET-CARD-B'), false);
  assert.equal(runtime.honeyCell.children[2].textContent, '+2・順位2位');
});

test('bridge contract owns no gameplay, payment, player-selection or resource authority', () => {
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_SCHEMA, 'gameroad.battle-critical-resource-hud-dock-bridge.v1');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.presentationOnly, true);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.playerSelectionAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.resourceCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.resourceStoreAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.paymentCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.paymentChoiceAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.rankCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.chipIdentityProjection, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.usesExistingResourceHud, true);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.usesExistingLiveAdapter, true);
  assert.deepEqual(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.visibleResources, ['honey', 'payment_receipt']);
  assert.deepEqual(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.bridgeHiddenDuplicates, ['mana', 'chip']);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT.productionHtmlMutationOwnedHere, false);
});

test('destroy is idempotent and prevents later bridge sync', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountBattleCriticalResourceHudDockBridge(global, {
    host,
    player: { manaCurrent: 7, manaMax: 10, honey: 1, chip: [] },
  });

  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(host.children.length, 0);
  assert.throws(
    () => runtime.sync({ player: { manaCurrent: 6, manaMax: 10, honey: 2, chip: [] } }),
    /BATTLE_RESOURCE_DOCK_BRIDGE_DESTROYED/,
  );
});
