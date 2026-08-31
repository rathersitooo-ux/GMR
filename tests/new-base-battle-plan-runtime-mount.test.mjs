import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNewBaseBattlePlanPresentation } from '../browser/new-base-battle-plan-presentation-core.mjs';
import { mountNewBaseBattlePlan } from '../browser/new-base-battle-plan-runtime-mount.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector) {
    const attributeMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (!attributeMatch) throw new Error(`unsupported fake selector: ${selector}`);
    const [, name, expected] = attributeMatch;
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        const actual = child.getAttribute(name);
        if (actual !== null && (expected === undefined || actual === expected)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function makeProjection(extra = {}) {
  return projectNewBaseBattlePlanPresentation({
    enabled: true,
    fixedSlots: [
      { slotId: 'slot-r', jankenHand: 'ROCK' },
      { slotId: 'slot-s', jankenHand: 'SCISSORS' },
      { slotId: 'slot-p', jankenHand: 'PAPER' },
    ],
    assignments: [
      { slotId: 'slot-r', jankenHand: 'ROCK', cardId: 'card-a' },
      { slotId: 'slot-s', jankenHand: 'SCISSORS', cardId: 'card-b' },
      { slotId: 'slot-p', jankenHand: 'PAPER', cardId: 'card-c' },
    ],
    cards: [
      { cardId: 'card-a', intrinsicSuit: 'FOREST', label: 'Alpha' },
      { cardId: 'card-b', intrinsicSuit: 'SWORD', label: 'Beta' },
      { cardId: 'card-c', intrinsicSuit: 'DINO', label: 'Gamma' },
    ],
    selectedSlotId: 'slot-r',
    selectedCardId: 'card-a',
    dice: { rollValue: 5, movementDelta: 5 },
    movementBudget: { base: 2, dice: 5, total: 7 },
    mana: { current: 3, max: 6, recoveryStatus: 'UNDECIDED', recoveryAmount: null },
    board: {
      zonePositionIds: {
        goal: ['g1'],
        shield: ['s1', 's2'],
        roadSlot: ['r1', 'r2'],
        field: ['f1'],
      },
    },
    camera: { mode: 'PLAN', focusPositionId: 'r2', transform: { scale: 2 } },
    ...extra,
  });
}

test('mounts only inside the explicit caller-owned root', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const sibling = document.createElement('aside');
  sibling.setAttribute('data-external-owner', '1');
  root.appendChild(sibling);
  const handle = mountNewBaseBattlePlan({ root, projection: makeProjection() });
  assert.ok(handle.element);
  assert.equal(root.children.includes(sibling), true);
  assert.equal(root.querySelectorAll('[data-new-base-battle-plan-root="1"]').length, 1);
  assert.equal(root.querySelectorAll('[data-slot-id]').length, 3);
});

test('mount marks selected card/slot but installs no gameplay event authority', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  mountNewBaseBattlePlan({ root, projection: makeProjection() });
  const selected = root.querySelector('[data-selected="true"]');
  assert.equal(selected.getAttribute('data-slot-id'), 'slot-r');
  assert.equal(selected.getAttribute('data-card-id'), 'card-a');
  assert.equal('onclick' in selected, false);
});

test('intrinsic suit remains a separate card attribute from janken hand', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  mountNewBaseBattlePlan({ root, projection: makeProjection() });
  const rock = root.querySelector('[data-slot-id="slot-r"]');
  assert.equal(rock.getAttribute('data-janken-hand'), 'ROCK');
  assert.equal(rock.querySelector('[data-intrinsic-suit="FOREST"]').getAttribute('data-intrinsic-suit'), 'FOREST');
});

test('renders caller-supplied board zone identities without creating adjacency or winner state', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const handle = mountNewBaseBattlePlan({ root, projection: makeProjection() });
  assert.equal(root.querySelectorAll('[data-position-id]').length, 6);
  assert.equal(handle.element.getAttribute('data-winner'), null);
  assert.equal(handle.element.getAttribute('data-adjacency'), null);
});

test('camera is rendered as presentation metadata only', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const handle = mountNewBaseBattlePlan({ root, projection: makeProjection() });
  assert.equal(handle.element.getAttribute('data-camera-mode'), 'PLAN');
  assert.equal(handle.element.getAttribute('data-camera-focus-position-id'), 'r2');
  assert.equal(handle.element.getAttribute('data-presentation-only'), 'true');
});

test('inactive projection removes only this mount and preserves caller siblings', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const sibling = document.createElement('aside');
  sibling.setAttribute('data-external-owner', '1');
  root.appendChild(sibling);
  mountNewBaseBattlePlan({ root, projection: makeProjection() });
  const inactive = projectNewBaseBattlePlanPresentation({ enabled: false });
  const handle = mountNewBaseBattlePlan({ root, projection: inactive });
  assert.equal(handle.element, null);
  assert.equal(root.querySelector('[data-external-owner="1"]'), sibling);
  assert.equal(root.querySelector('[data-new-base-battle-plan-root="1"]'), null);
});

test('destroy removes only its own mount', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const sibling = document.createElement('aside');
  sibling.setAttribute('data-external-owner', '1');
  root.appendChild(sibling);
  const handle = mountNewBaseBattlePlan({ root, projection: makeProjection() });
  handle.destroy();
  assert.equal(root.querySelector('[data-new-base-battle-plan-root="1"]'), null);
  assert.equal(root.querySelector('[data-external-owner="1"]'), sibling);
});
