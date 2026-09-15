import assert from 'node:assert/strict';
import { mountBattleCurrentPlayerUi } from '../browser/battle-current-player-ui-runtime.mjs';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
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

  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(before);
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector() {
    return null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] ?? null : null;
  }
}

class FakeDocument {
  constructor(root) {
    this.root = root;
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.body.appendChild(root);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    return this.head.children.find((node) => node.id === id) ?? null;
  }

  querySelector(selector) {
    if (selector === 'section.screen.battle[data-screen="battle"]' || selector === '.screen.battle') return this.root;
    return null;
  }
}

function fixture() {
  const root = new FakeElement('section');
  const document = new FakeDocument(root);
  return { root, document };
}

{
  const { root, document } = fixture();
  const first = mountBattleCurrentPlayerUi({ document }, { root });
  const second = mountBattleCurrentPlayerUi({ document }, { root });

  assert.notEqual(first, second);
  assert.equal(document.head.children.length, 1);
  assert.equal(root.getAttribute('data-gr-current-player-ui'), '1');

  assert.equal(first.destroy(), true);
  assert.equal(first.destroy(), false);
  assert.equal(root.getAttribute('data-gr-current-player-ui'), '1');
  assert.equal(document.head.children.length, 1);
  assert.throws(() => first.sync({ focus: 'STALE_CALLER' }), /BATTLE_CURRENT_PLAYER_UI_DESTROYED/);

  const synced = second.sync({ focus: 'PLAN_FOCUS' });
  assert.equal(synced.mounted, true);
  assert.equal(root.dataset.grFocus, 'PLAN_FOCUS');

  assert.equal(second.destroy(), true);
  assert.equal(root.getAttribute('data-gr-current-player-ui'), null);
  assert.equal(document.head.children.length, 0);
}

{
  const { root, document } = fixture();
  const first = mountBattleCurrentPlayerUi({ document }, { root });
  const second = mountBattleCurrentPlayerUi({ document }, { root });

  assert.equal(second.destroy(), true);
  assert.equal(root.getAttribute('data-gr-current-player-ui'), '1');
  assert.equal(document.head.children.length, 1);
  assert.equal(first.inspect().mounted, true);

  assert.equal(first.destroy(), true);
  assert.equal(root.getAttribute('data-gr-current-player-ui'), null);
  assert.equal(document.head.children.length, 0);
}

console.log('battle-current-player-ui-runtime-lifecycle.test.mjs: PASS');
