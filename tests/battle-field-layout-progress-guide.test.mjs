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
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get firstChild() { return this.children[0] ?? null; }
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
  createElement(tag) { return new FakeElement(tag); }
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

const document = new FakeDocument();
const root = document.createElement('main');
root.setAttribute('data-gr-battle-screen-root', '');
document.body.appendChild(root);

const runtime = mountBattleScreenExternalSurface({ document }, { root });
const guide = runtime.progressGuide;
assert.ok(guide);
assert.equal(guide.getAttribute('data-battle-progress-guide'), '1');
assert.equal(guide.getAttribute('aria-label'), 'ROADからGOALへの進行方向');
assert.equal(guide.dataset.presentationOnly, 'true');
assert.equal(guide.dataset.authority, 'existing-road-goal-meaning-only');
assert.equal(guide.parentNode, runtime.phaseSurface);
assert.deepEqual(guide.children.map(node => node.textContent), ['GOAL', '', 'ROAD']);
assert.equal(runtime.presentationOnly, true);
assert.equal(runtime.gameplayAuthority, false);
assert.equal(runtime.gameStateWrite, false);

const style = document.getElementById('gameroad-battle-screen-runtime-r1-style');
assert.ok(style);
assert.ok(style.textContent.includes('[data-battle-progress-guide]'));
assert.ok(style.textContent.includes('.grBattleProgressArrow::before{content:"◀"'));
assert.ok(style.textContent.includes('.grBattleProgressArrow::before{content:"▲"'));
assert.ok(style.textContent.includes('@media(max-width:540px) and (orientation:portrait)'));
assert.equal(style.textContent.includes('10000'), false);
assert.equal(style.textContent.includes('1000 / 100 / 10 / 1'), false);

assert.equal(runtime.destroy(), true);
assert.equal(guide.parentNode, null);
assert.equal(runtime.destroy(), false);
