import assert from 'node:assert/strict';
import test from 'node:test';

import { mountPartnerCostumeScreen } from '../browser/partner-costume-screen-runtime-mount.mjs';

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.type = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click(target = this) { return this.listeners.click?.({ target }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
}

const document = { createElement: (tag) => new FakeElement(tag) };

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
}

function createSession() {
  let draft = { shoes: null, coord: null, accessory: null };
  let saved = { ...draft };
  let saving = false;
  let saveCalls = 0;
  return {
    async start() { return this.getView(); },
    getView() { return { partnerId: 'partner_a', draftSelection: { ...draft }, savedSelection: { ...saved }, saving, lastError: null }; },
    equip(category, itemId) {
      if (draft[category] === itemId) return { action: 'DETAIL', itemId, category, view: this.getView() };
      draft[category] = itemId;
      return { action: 'EQUIPPED', itemId, category, view: this.getView() };
    },
    revert() { draft = { ...saved }; return this.getView(); },
    equipRecommendedSet(set) { draft = { ...draft, ...set }; return this.getView(); },
    async save() { saving = true; saveCalls += 1; saved = { ...draft }; saving = false; return this.getView(); },
    get saveCalls() { return saveCalls; },
  };
}

const catalog = {
  shoe_a: { id: 'shoe_a', category: 'shoes', label: '靴A' },
  coord_a: { id: 'coord_a', category: 'coord', label: 'コーデA' },
  acc_a: { id: 'acc_a', category: 'accessory', label: 'アクセA' },
  hidden_coord: { id: 'hidden_coord', category: 'coord', label: '未所持' },
};

test('three categories render owned-only items and truthful fallback preview', async () => {
  const root = new FakeElement('main');
  const session = createSession();
  const screen = mountPartnerCostumeScreen({
    root, document, sessionRuntime: session, catalog,
    getOwnedItemIds: () => ['shoe_a', 'coord_a', 'acc_a'],
    createSaveRequestId: () => 'save-1',
    renderPreview: () => false,
  });
  await screen.start();
  assert.ok(find(root, (el) => el.dataset?.costumeCategory === 'shoes'));
  assert.ok(find(root, (el) => el.dataset?.costumeCategory === 'coord'));
  assert.ok(find(root, (el) => el.dataset?.costumeCategory === 'accessory'));
  assert.ok(find(root, (el) => el.dataset?.costumeItemId === 'coord_a'));
  assert.equal(find(root, (el) => el.dataset?.costumeItemId === 'hidden_coord'), null);
  assert.ok(find(root, (el) => el.textContent === '基本の姿を表示中'));
});

test('first item tap equips, second tap opens detail, outside tap closes it', async () => {
  const root = new FakeElement('main');
  const session = createSession();
  const screen = mountPartnerCostumeScreen({
    root, document, sessionRuntime: session, catalog,
    getOwnedItemIds: () => ['coord_a'],
    createSaveRequestId: () => 'save-2',
  });
  await screen.start();
  let item = find(root, (el) => el.dataset?.costumeItemId === 'coord_a');
  item.click();
  assert.equal(session.getView().draftSelection.coord, 'coord_a');
  item = find(root, (el) => el.dataset?.costumeItemId === 'coord_a');
  item.click();
  const detail = find(root, (el) => el.dataset?.costumeDetail === 'true');
  assert.equal(detail.open, true);
  detail.click(detail);
  assert.equal(detail.open, false);
});

test('revert, recommended set and save use existing session authority only', async () => {
  const root = new FakeElement('main');
  const session = createSession();
  let sequence = 0;
  const screen = mountPartnerCostumeScreen({
    root, document, sessionRuntime: session, catalog,
    getOwnedItemIds: () => ['shoe_a', 'coord_a', 'acc_a'],
    getRecommendedSet: () => ({ shoes: 'shoe_a', coord: 'coord_a', accessory: 'acc_a' }),
    createSaveRequestId: () => `save-${++sequence}`,
  });
  await screen.start();
  find(root, (el) => el.textContent === 'おすすめ一式').click();
  assert.deepEqual(session.getView().draftSelection, { shoes: 'shoe_a', coord: 'coord_a', accessory: 'acc_a' });
  await find(root, (el) => el.textContent === '保存').click();
  assert.equal(session.saveCalls, 1);
  assert.deepEqual(session.getView().savedSelection, session.getView().draftSelection);
  find(root, (el) => el.dataset?.costumeCategory === 'shoes').click();
  find(root, (el) => el.dataset?.costumeItemId === 'shoe_a').click();
  find(root, (el) => el.textContent === '元へ戻す').click();
  assert.deepEqual(session.getView().draftSelection, session.getView().savedSelection);
});
