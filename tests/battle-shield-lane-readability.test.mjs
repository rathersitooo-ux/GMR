import assert from 'node:assert/strict';
import { createBattleScreenModel } from '../browser/battle-screen-presentation-core.mjs';
import {
  BATTLE_SCREEN_RUNTIME,
  mountBattleScreenExternalSurface
} from '../browser/battle-screen-runtime-mount.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
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
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
}

function walk(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
  }
  createElement(tag) {
    return new FakeElement(tag);
  }
  getElementById(id) {
    return walk(this.head, node => node.id === id) ?? walk(this.body, node => node.id === id);
  }
  querySelector(selector) {
    if (selector === '[data-gr-battle-screen-root]') {
      return walk(this.body, node => node.attributes?.has('data-gr-battle-screen-root'));
    }
    return null;
  }
}

const participants = [
  { id: 'P1', label: 'A-1', team: 'A' },
  { id: 'P2', label: 'A-2', team: 'A' },
  { id: 'P3', label: 'B-1', team: 'B' },
  { id: 'P4', label: 'B-2', team: 'B' }
];

const document = new FakeDocument();
const root = document.createElement('main');
root.setAttribute('data-gr-battle-screen-root', '');
document.body.appendChild(root);
const runtime = mountBattleScreenExternalSurface({ document }, { root });

assert.equal(runtime.shieldRails.length, 4);
assert.equal(BATTLE_SCREEN_RUNTIME.shieldLanePresentation, 'STRUCTURE_ONLY_NO_SHIELD_STATE_INFERENCE');
assert.deepEqual(BATTLE_SCREEN_RUNTIME.shieldSlots, ['L', 'C', 'R']);

for (const rail of runtime.shieldRails) {
  assert.equal(rail.getAttribute('data-battle-shield-lane-rail'), '1');
  assert.equal(rail.dataset.presentationOnly, 'true');
  assert.equal(rail.dataset.authority, 'existing-shield-linked-lane-structure-only');
  assert.equal(rail.children.length, 3);
  assert.deepEqual(rail.children.map(node => node.getAttribute('data-battle-shield-slot')), ['L', 'C', 'R']);
  assert.deepEqual(rail.children.map(node => node.dataset.roadLane), ['L', 'C', 'R']);
  assert.deepEqual(rail.children.map(node => node.getAttribute('aria-label')), [
    'Shield L → ROAD L',
    'Shield C → ROAD C',
    'Shield R → ROAD R'
  ]);
  for (const link of rail.children) {
    assert.equal(link.children[0].className, 'grBattleShieldToken');
    assert.equal(link.children[1].className, 'grBattleShieldSlot');
    assert.equal(link.children[2].className, 'grBattleShieldTrack');
  }
}

const idle = createBattleScreenModel({ participants });
runtime.render(idle);
assert.deepEqual(runtime.shieldRails.map(node => node.dataset.participantId), ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(runtime.shieldRails.map(node => node.getAttribute('aria-label')), [
  'A-1: Shield L/C/R と対応ROAD',
  'A-2: Shield L/C/R と対応ROAD',
  'B-1: Shield L/C/R と対応ROAD',
  'B-2: Shield L/C/R と対応ROAD'
]);
for (let index = 0; index < runtime.shieldRails.length; index += 1) {
  assert.deepEqual(runtime.shieldRails[index].children.map(node => node.dataset.participantId), Array(3).fill(participants[index].id));
}

const style = document.getElementById('gameroad-battle-screen-runtime-r1-style');
assert.ok(style.textContent.includes('[data-battle-shield-lane-rail]'));
assert.ok(style.textContent.includes('[data-battle-shield-slot]'));
assert.ok(style.textContent.includes('clip-path:polygon(50% 0,92% 15%,82% 72%,50% 100%,18% 72%,8% 15%)'));
assert.ok(style.textContent.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
assert.equal(style.textContent.includes('shield-broken'), false);
assert.equal(style.textContent.includes('shield-intact'), false);

assert.equal(runtime.destroy(), true);

console.log(JSON.stringify({
  ok: true,
  shieldRailCount: 4,
  shieldSlotsPerParticipant: 3,
  authority: BATTLE_SCREEN_RUNTIME.shieldLanePresentation,
  visualMeaning: 'SHIELD_SLOT_TO_SAME_NAMED_ROAD_LANE'
}, null, 2));
