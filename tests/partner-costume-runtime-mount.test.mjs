import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_COSTUME_PROVIDER_NAME,
  createOwnedPartnerCostumeItems,
  mountPartnerCostumeRuntime,
  normalizePartnerCostumeProviderState,
  openPartnerCostumeFromCurrentBrowser,
  partnerCostumeRuntimePlan,
  projectPartnerCostumeEntry,
  resolveOwnedRecommendedSet,
} from '../browser/partner-costume-runtime-mount.mjs';

function matchesSelector(node, selector) {
  if (!node) return false;
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  const dataMatch = selector.match(/^\[data-([^=]+)="([^"]+)"\]$/);
  if (dataMatch) {
    const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return String(node.dataset?.[key] ?? '') === dataMatch[2];
  }
  if (selector.startsWith('.')) return String(node.className || '').split(/\s+/).includes(selector.slice(1));
  return false;
}

function element(tag = 'div') {
  const node = {
    tag,
    id: '',
    className: '',
    dataset: {},
    textContent: '',
    type: '',
    src: '',
    alt: '',
    disabled: false,
    children: [],
    listeners: new Map(),
    attributes: new Map(),
    parentNode: null,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    remove() { this.parentNode?.removeChild?.(this); },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
    dispatch(type, event = {}) {
      let result;
      for (const listener of this.listeners.get(type) || []) result = listener(event);
      return result;
    },
    click() {
      if (this.disabled) return undefined;
      return this.dispatch('click', { target: this, preventDefault() {} });
    },
    querySelector(selector) {
      for (const child of this.children) {
        if (matchesSelector(child, selector)) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {
        if (matchesSelector(child, selector)) found.push(child);
        found.push(...(child.querySelectorAll?.(selector) || []));
      }
      return found;
    },
  };
  Object.defineProperty(node, 'firstChild', { get() { return this.children[0] || null; } });
  return node;
}

function costumeFixture() {
  const head = element('head');
  const body = element('body');
  const html = element('html');
  const charDetail = element('section');
  charDetail.id = 'charDetail';
  body.appendChild(charDetail);

  const document = {
    head,
    body,
    documentElement: html,
    createElement: (tag) => element(tag),
    getElementById(id) {
      if (head.id === id) return head;
      return head.querySelector(`#${id}`) || body.querySelector(`#${id}`) || null;
    },
    querySelector(selector) {
      if (matchesSelector(charDetail, selector)) return charDetail;
      return head.querySelector(selector) || body.querySelector(selector) || null;
    },
  };

  let observerCallback = null;
  class FakeObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }

  const globalListeners = new Map();
  const global = {
    document,
    MutationObserver: FakeObserver,
    crypto: { randomUUID: () => 'request-1' },
    addEventListener(type, listener) { globalListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (globalListeners.get(type) === listener) globalListeners.delete(type);
    },
  };
  return { global, document, charDetail, observer: () => observerCallback, globalListeners };
}

function canonicalState({ savedSelection = { shoes: null, coord: null, accessory: null } } = {}) {
  const catalog = {
    shoes_1: { category: 'shoes', label: '靴', setId: 'set_1', layers: [{ z: 30, src: '/shoe.png' }] },
    coord_1: { category: 'coord', label: 'コーデ', setId: 'set_1', layers: [{ z: 20, src: '/coord.png' }] },
    accessory_1: { category: 'accessory', label: 'アクセ', setId: 'set_1', layers: [{ z: 40, src: '/accessory.png' }] },
    hidden_1: { category: 'accessory', label: '未所持', setId: 'set_2', layers: [{ z: 50, src: '/hidden.png' }] },
  };
  return {
    activePartnerId: 'partner_1',
    snapshot: {
      selectedPartnerId: 'partner_1',
      partners: {
        partner_1: {
          ownedItemIds: ['shoes_1', 'coord_1', 'accessory_1'],
          savedSelection,
        },
      },
    },
    catalog,
    baseLayers: [{ z: 0, src: '/base.png' }],
  };
}

function findByClass(root, className) {
  if (String(root?.className || '').split(/\s+/).includes(className)) return root;
  for (const child of root?.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findAllByClass(root, className) {
  const found = [];
  if (String(root?.className || '').split(/\s+/).includes(className)) found.push(root);
  for (const child of root?.children || []) found.push(...findAllByClass(child, className));
  return found;
}

test('runtime plan preserves the adopted three-category costume contract without creating authority', () => {
  const plan = partnerCostumeRuntimePlan();
  assert.deepEqual(plan.categories, [
    { id: 'shoes', label: 'シューズ' },
    { id: 'coord', label: 'コーデ' },
    { id: 'accessory', label: 'アクセ' },
  ]);
  assert.equal(plan.provisionalEquip, true);
  assert.equal(plan.secondTapDetail, true);
  assert.equal(plan.revertToOpeningState, true);
  assert.equal(plan.saveOnlyViaCallerProvider, true);
  assert.equal(plan.createsOwnershipAuthority, false);
  assert.equal(plan.createsProductionSaveAuthority, false);
  assert.equal(plan.fabricatesCatalogOrFormalAsset, false);
  assert.equal(plan.minimumTouchTargetPx, 44);
});

test('provider state requires a stable active partner and rejects contradictory selection', () => {
  const state = normalizePartnerCostumeProviderState(canonicalState());
  assert.equal(state.activePartnerId, 'partner_1');
  assert.deepEqual(state.snapshot.partners.partner_1.ownedItemIds, ['shoes_1', 'coord_1', 'accessory_1']);
  const invalid = canonicalState();
  invalid.snapshot.selectedPartnerId = 'partner_other';
  assert.throws(() => normalizePartnerCostumeProviderState(invalid), /must match activePartnerId/);
});

test('owned item projection never exposes an unowned catalog entry', () => {
  const state = normalizePartnerCostumeProviderState(canonicalState());
  const accessories = createOwnedPartnerCostumeItems({
    snapshot: state.snapshot,
    partnerId: state.activePartnerId,
    catalog: state.catalog,
    category: 'accessory',
  });
  assert.deepEqual(accessories.map((item) => item.id), ['accessory_1']);
  assert.equal(accessories.some((item) => item.id === 'hidden_1'), false);
});

test('recommended set resolves only when all three matching items are owned', () => {
  const state = normalizePartnerCostumeProviderState(canonicalState());
  assert.deepEqual(resolveOwnedRecommendedSet({
    snapshot: state.snapshot,
    partnerId: state.activePartnerId,
    catalog: state.catalog,
    sourceItemId: 'shoes_1',
  }), { shoes: 'shoes_1', coord: 'coord_1', accessory: 'accessory_1' });

  const partial = canonicalState();
  partial.snapshot.partners.partner_1.ownedItemIds = ['shoes_1', 'coord_1'];
  const normalized = normalizePartnerCostumeProviderState(partial);
  assert.equal(resolveOwnedRecommendedSet({
    snapshot: normalized.snapshot,
    partnerId: normalized.activePartnerId,
    catalog: normalized.catalog,
    sourceItemId: 'shoes_1',
  }), null);
});

test('mount stays inert when no caller-owned canonical provider exists', () => {
  const fixture = costumeFixture();
  assert.equal(projectPartnerCostumeEntry(fixture.global), 0);
  assert.equal(mountPartnerCostumeRuntime(fixture.global), null);
  assert.equal(fixture.charDetail.children.length, 0);
});

test('mount adds one touch-sized costume entry to the existing partner surface and is idempotent', () => {
  const fixture = costumeFixture();
  fixture.global[PARTNER_COSTUME_PROVIDER_NAME] = {
    loadState: async () => canonicalState(),
    saveState: async ({ snapshot }) => ({ ...canonicalState(), snapshot }),
  };
  const runtime = mountPartnerCostumeRuntime(fixture.global);
  assert.equal(runtime.version, 'gameroad.partner-costume-runtime.v1');
  assert.equal(projectPartnerCostumeEntry(fixture.global), 0);
  const entry = fixture.charDetail.querySelector('[data-gr-partner-costume-entry="1"]');
  assert.equal(entry.textContent, '着せ替え');
  assert.equal(entry.className, 'grPartnerCostumeEntry');
  assert.equal(typeof fixture.observer(), 'function');
  assert.equal(mountPartnerCostumeRuntime(fixture.global), runtime);
});

test('costume overlay supports provisional equip, second-tap detail, complete owned set, revert, and caller-owned save', async () => {
  const fixture = costumeFixture();
  const saves = [];
  fixture.global[PARTNER_COSTUME_PROVIDER_NAME] = {
    loadState: async () => canonicalState(),
    saveState: async (request) => {
      saves.push(request);
      return { ...canonicalState(), snapshot: request.snapshot };
    },
  };

  const opened = await openPartnerCostumeFromCurrentBrowser(fixture.global);
  assert.equal(opened.opened, true);
  const overlay = fixture.document.querySelector('[data-gr-partner-costume-overlay="1"]');
  assert.ok(overlay);
  assert.equal(findAllByClass(overlay, 'grPartnerCostumePreview')[0].children.some((child) => child.src === '/base.png'), true);

  let itemButtons = findAllByClass(overlay, 'grPartnerCostumeItem');
  assert.deepEqual(itemButtons.map((button) => button.textContent), ['靴']);
  itemButtons[0].click();
  assert.equal(itemButtons[0].dataset.selected, 'false');
  itemButtons = findAllByClass(overlay, 'grPartnerCostumeItem');
  assert.equal(itemButtons[0].dataset.selected, 'true');
  assert.equal(findAllByClass(overlay, 'grPartnerCostumePreview')[0].children.some((child) => child.src === '/shoe.png'), true);

  itemButtons[0].click();
  assert.ok(fixture.document.querySelector('[data-gr-partner-costume-detail="1"]'));

  const recommended = findAllByClass(overlay, 'grPartnerCostumeAction').find((button) => button.textContent === 'おすすめ一式');
  recommended.click();
  const preview = findByClass(overlay, 'grPartnerCostumePreview');
  assert.deepEqual(preview.children.filter((child) => child.tag === 'img').map((child) => child.src), [
    '/base.png', '/coord.png', '/shoe.png', '/accessory.png',
  ]);

  const revert = findAllByClass(overlay, 'grPartnerCostumeAction').find((button) => button.textContent === '元へ戻す');
  revert.click();
  assert.deepEqual(preview.children.filter((child) => child.tag === 'img').map((child) => child.src), ['/base.png']);

  findAllByClass(overlay, 'grPartnerCostumeItem')[0].click();
  recommended.click();
  const save = findAllByClass(overlay, 'grPartnerCostumeAction').find((button) => button.textContent === '保存');
  await save.click();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].requestId, 'request-1');
  assert.deepEqual(saves[0].snapshot.partners.partner_1.savedSelection, {
    shoes: 'shoes_1',
    coord: 'coord_1',
    accessory: 'accessory_1',
  });
});

test('failed save restores the last canonical saved state instead of confirming the draft', async () => {
  const fixture = costumeFixture();
  fixture.global[PARTNER_COSTUME_PROVIDER_NAME] = {
    loadState: async () => canonicalState(),
    saveState: async () => { throw new Error('network down'); },
  };
  await openPartnerCostumeFromCurrentBrowser(fixture.global);
  const overlay = fixture.document.querySelector('[data-gr-partner-costume-overlay="1"]');
  findAllByClass(overlay, 'grPartnerCostumeItem')[0].click();
  const save = findAllByClass(overlay, 'grPartnerCostumeAction').find((button) => button.textContent === '保存');
  await save.click();
  const preview = findByClass(overlay, 'grPartnerCostumePreview');
  assert.deepEqual(preview.children.filter((child) => child.tag === 'img').map((child) => child.src), ['/base.png']);
  assert.match(findByClass(overlay, 'grPartnerCostumeStatus').textContent, /保存できませんでした/);
});

test('blank outside tap closes the overlay without saving', async () => {
  const fixture = costumeFixture();
  let saveCount = 0;
  fixture.global[PARTNER_COSTUME_PROVIDER_NAME] = {
    loadState: async () => canonicalState(),
    saveState: async ({ snapshot }) => { saveCount += 1; return { ...canonicalState(), snapshot }; },
  };
  await openPartnerCostumeFromCurrentBrowser(fixture.global);
  const overlay = fixture.document.querySelector('[data-gr-partner-costume-overlay="1"]');
  overlay.dispatch('click', { target: overlay });
  assert.equal(fixture.document.querySelector('[data-gr-partner-costume-overlay="1"]'), null);
  assert.equal(saveCount, 0);
});
