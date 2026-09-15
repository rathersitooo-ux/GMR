import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mountBattleCardZoneInformationRuntimeSurface,
} from '../browser/battle-card-zone-information-runtime-surface.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.type = '';
    this.textContent = '';
    this.onclick = null;
    this.attributes = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function createMount(overrides = {}) {
  const document = new FakeDocument();
  const host = document.createElement('div');
  const details = [];
  const surface = mountBattleCardZoneInformationRuntimeSurface({
    document,
    host,
    onCardDetailRequest: (cardId) => details.push(cardId),
    ...overrides,
  });
  return { document, host, surface, details };
}

const fullSnapshot = () => ({
  viewerSafe: true,
  zoneId: 'battle-zone:self:discard',
  generation: 'match-19:turn-6:rev-4',
  permissions: { count: true, recent: true, list: true, detail: true },
  count: 3,
  recentCardId: 'CARD-C',
  cardIds: ['CARD-A', 'CARD-B', 'CARD-C'],
});

test('mount starts hidden and remains presentation-only with zero gameplay authority', () => {
  const { host, surface } = createMount();
  assert.equal(host.children.length, 1);
  assert.equal(surface.root.hidden, true);
  assert.equal(surface.entryButton.textContent, '墓地');
  assert.equal(surface.presentationOnly, true);
  assert.equal(surface.gameplayAuthority, false);
  assert.equal(surface.gameStateWrite, false);
  assert.equal(surface.root.dataset.viewerSafeBoundary, 'required');
});

test('count-only permission exposes only the graveyard count and cannot open a contents panel', () => {
  const { surface, details } = createMount();
  const model = surface.render({
    viewerSafe: true,
    zoneId: 'battle-zone:self:discard',
    generation: 'match-19:turn-6:rev-4',
    permissions: { count: true, recent: false, list: false, detail: false },
    count: 5,
    recentCardId: 'SECRET-RECENT',
    cardIds: ['SECRET-A'],
  });

  assert.equal(model.visible, true);
  assert.equal(surface.root.hidden, false);
  assert.equal(surface.entryButton.textContent, '墓地 5');
  assert.equal(surface.recent.hidden, true);
  assert.equal(surface.recent.textContent, '');
  assert.equal(surface.list.hidden, true);
  assert.equal(surface.list.children.length, 0);
  assert.equal(surface.entryButton.onclick(), false);
  assert.equal(surface.panel.hidden, true);
  assert.deepEqual(details, []);
});

test('fully authorized contents render exact caller cardIds and validated detail handoff', () => {
  const { surface, details } = createMount();
  const model = surface.render(fullSnapshot());

  assert.equal(model.visible, true);
  assert.equal(surface.root.hidden, false);
  assert.equal(surface.entryButton.textContent, '墓地 3');
  assert.equal(surface.recent.hidden, false);
  assert.equal(surface.recent.textContent, '直近 CARD-C');
  assert.equal(surface.list.hidden, false);
  assert.deepEqual(surface.list.children.map((item) => item.textContent), [
    'CARD-A',
    'CARD-B',
    'CARD-C',
  ]);

  assert.equal(surface.entryButton.onclick(), true);
  assert.equal(surface.panel.hidden, false);
  assert.equal(surface.entryButton.getAttribute('aria-expanded'), 'true');
  assert.equal(surface.list.children[1].onclick(), true);
  assert.deepEqual(details, ['CARD-B']);
  assert.equal(surface.close(), false);
  assert.equal(surface.panel.hidden, true);
});

test('list without detail permission stays readable but cannot invoke card detail', () => {
  const { surface, details } = createMount();
  surface.render({
    ...fullSnapshot(),
    permissions: { count: true, recent: true, list: true, detail: false },
  });

  assert.equal(surface.list.children.length, 3);
  assert.equal(surface.list.children[0].disabled, true);
  assert.equal(surface.list.children[0].onclick(), false);
  assert.deepEqual(details, []);
});

test('unsafe or malformed snapshots fail closed and clear previously visible contents', () => {
  const { surface } = createMount();
  surface.render(fullSnapshot());
  surface.entryButton.onclick();
  assert.equal(surface.panel.hidden, false);
  assert.equal(surface.list.children.length, 3);

  const unsafe = surface.render({ ...fullSnapshot(), viewerSafe: false });
  assert.equal(unsafe.visible, false);
  assert.equal(surface.root.hidden, true);
  assert.equal(surface.panel.hidden, true);
  assert.equal(surface.recent.textContent, '');
  assert.equal(surface.list.children.length, 0);
  assert.equal(surface.entryButton.textContent, '墓地');

  const malformed = surface.render({ ...fullSnapshot(), count: 4 });
  assert.equal(malformed.visible, false);
  assert.equal(surface.root.hidden, true);
  assert.equal(surface.list.children.length, 0);
});

test('recent permission may show caller-authorized empty recent state without inventing a card', () => {
  const { surface } = createMount();
  const model = surface.render({
    viewerSafe: true,
    zoneId: 'battle-zone:self:discard',
    generation: 'match-19:turn-7:rev-1',
    permissions: { count: false, recent: true, list: false, detail: false },
    recentCardId: null,
  });

  assert.equal(model.visible, true);
  assert.equal(surface.entryButton.textContent, '墓地');
  assert.equal(surface.recent.hidden, false);
  assert.equal(surface.recent.textContent, '直近 なし');
  assert.equal(surface.entryButton.onclick(), true);
  assert.equal(surface.panel.hidden, false);
});

test('destroy removes the isolated surface and subsequent render is inert', () => {
  const { host, surface } = createMount();
  surface.render(fullSnapshot());
  surface.destroy();
  assert.equal(host.children.length, 0);
  assert.equal(surface.root.hidden, true);
  assert.equal(surface.render(fullSnapshot()), null);
});

test('invalid mount dependencies fail before creating a partial surface', () => {
  assert.throws(
    () => mountBattleCardZoneInformationRuntimeSurface({ document: {}, host: {} }),
    /document with createElement is required/,
  );
  const document = new FakeDocument();
  assert.throws(
    () => mountBattleCardZoneInformationRuntimeSurface({ document, host: {} }),
    /host with appendChild is required/,
  );
  const host = document.createElement('div');
  assert.throws(
    () => mountBattleCardZoneInformationRuntimeSurface({
      document,
      host,
      onCardDetailRequest: 'not-a-function',
    }),
    /onCardDetailRequest must be a function or null/,
  );
});
