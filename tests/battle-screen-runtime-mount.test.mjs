import './battle-screen-runtime-mount-base-r4c.test.mjs';
import assert from 'node:assert/strict';
import { mountBattleScreenExternalSurface } from '../browser/battle-screen-runtime-mount.mjs';

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
  querySelector(selector) {
    if (selector === '[data-role="fanart-local-skin-overlay"]') {
      return walk(this, node => node !== this && node.dataset?.role === 'fanart-local-skin-overlay');
    }
    return null;
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
  querySelectorAll() {
    return [];
  }
}

const document = new FakeDocument();
const root = document.createElement('main');
root.setAttribute('data-gr-battle-screen-root', '');
document.body.appendChild(root);

const runtime = mountBattleScreenExternalSurface({ document }, {
  root,
  hud: {
    score: 1,
    honey: 4,
    chipCount: 2,
    honeyDelta: 2,
    honeyDeltaSource: '順位2位'
  }
});

assert.ok(runtime.resourceHud);
assert.equal(runtime.resourceHud.presentationOnly, true);
assert.equal(runtime.resourceHud.gameStateWrite, false);
assert.equal(runtime.resourceHud.resourceAuthority, 'CALLER_ONLY');
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '4');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '2');
assert.equal(runtime.resourceHud.honeyCell.children[2].textContent, '+2・順位2位');
assert.equal(runtime.resourceHud.honeyCell.children[2].hidden, false);
assert.equal(runtime.resourceHud.root.parentNode, runtime.hud.root.children[0]);

runtime.renderHud({ score: 9, honey: 7, chipCount: 3 });
assert.equal(runtime.hud.scoreValue.textContent, '9');
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '7');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '3');
assert.equal(runtime.resourceHud.honeyCell.children[2].hidden, true);

runtime.renderHud({ score: 10 });
assert.equal(runtime.hud.scoreValue.textContent, '10');
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '7');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '3');

runtime.renderHud({ honey: 0, chipCount: 0, honeyDelta: 0, honeyDeltaSource: '順位1位' });
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '0');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '0');
assert.equal(runtime.resourceHud.honeyCell.children[2].textContent, '0・順位1位');

const resourceRoot = runtime.resourceHud.root;
assert.equal(runtime.destroy(), true);
assert.equal(runtime.destroy(), false);
assert.equal(resourceRoot.parentNode, null);
assert.throws(() => runtime.renderHud({ honey: 1 }), /RUNTIME_DESTROYED/);
