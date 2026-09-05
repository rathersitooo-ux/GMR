import assert from 'node:assert/strict';
import {
  QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS,
  bindQuickSettingsTrigger,
  createExistingSettingsBridge,
  inspectExistingSettingsAuthority,
  mountQuickSettingsPanel,
} from '../browser/quick-settings-panel-runtime.mjs';

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles === true;
    this.key = init.key ?? '';
    this.target = init.target ?? null;
    this.defaultPrevented = false;
    this.propagationStopped = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}

function matches(node, selector) {
  if (selector === 'section[data-screen="settings"]') {
    return node.tagName === 'SECTION' && node.dataset.screen === 'settings';
  }
  return false;
}

function walk(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.focusCount = 0;
  }
  append(...children) {
    for (const child of children) this.appendChild(child);
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
  remove() {
    this.parentNode?.removeChild(this);
  }
  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === 'id') this.id = stringValue;
    if (name === 'data-screen') this.dataset.screen = stringValue;
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  addEventListener(type, listener, capture = false) {
    const list = this.listeners.get(type) ?? [];
    list.push({ listener, capture: capture === true });
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener, capture = false) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((entry) => entry.listener !== listener || entry.capture !== (capture === true)));
  }
  dispatchEvent(event) {
    if (!(event instanceof FakeEvent)) {
      const copied = new FakeEvent(event?.type ?? '', { bubbles: event?.bubbles, key: event?.key });
      Object.assign(copied, event);
      event = copied;
    }
    if (!event.target) event.target = this;
    const path = [];
    for (let cursor = this; cursor; cursor = cursor.parentNode) path.push(cursor);
    for (const current of [...path].reverse()) {
      for (const entry of current.listeners.get(event.type) ?? []) {
        if (!entry.capture) continue;
        entry.listener.call(current, event);
        if (event.propagationStopped) return !event.defaultPrevented;
      }
    }
    for (const current of path) {
      for (const entry of current.listeners.get(event.type) ?? []) {
        if (entry.capture) continue;
        entry.listener.call(current, event);
        if (event.propagationStopped) return !event.defaultPrevented;
      }
      if (!event.bubbles) break;
    }
    return !event.defaultPrevented;
  }
  click() {
    this.dispatchEvent(new FakeEvent('click', { bubbles: true }));
  }
  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }
  querySelector(selector) {
    return walk(this, (candidate) => candidate !== this && matches(candidate, selector));
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document', null);
    this.ownerDocument = this;
    this.activeElement = null;
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.append(this.head, this.body);
  }
  createElement(tag) {
    return new FakeElement(tag, this);
  }
  getElementById(id) {
    return walk(this, (node) => node.id === id);
  }
  querySelector(selector) {
    return walk(this, (node) => node !== this && matches(node, selector));
  }
}

function createSettingsFixture() {
  const document = new FakeDocument();
  const settings = document.createElement('section');
  settings.setAttribute('data-screen', 'settings');
  document.body.append(settings);
  const controls = {};
  const make = (id, { value = '', on = false, toggle = false } = {}) => {
    const control = document.createElement(toggle ? 'button' : 'input');
    control.id = id;
    control.value = value;
    if (toggle) {
      const render = () => {
        control.textContent = on ? 'ON' : 'OFF';
        control.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      render();
      control.addEventListener('click', () => { on = !on; render(); });
    }
    settings.append(control);
    controls[id] = control;
    return control;
  };
  make('reduceMotion', { toggle: true });
  make('lowPerf', { toggle: true });
  make('musicVolume', { value: '80' });
  make('sfxVolume', { value: '70' });
  make('partnerVoiceVolume', { value: '60' });
  make('musicMute', { toggle: true });
  make('sfxMute', { toggle: true });
  make('partnerVoiceMute', { toggle: true });
  return { document, settings, controls };
}

const { document, settings, controls } = createSettingsFixture();
const global = { document, Event: FakeEvent };
const authority = inspectExistingSettingsAuthority(document);
assert.equal(authority.settingsSection, settings);
assert.deepEqual(authority.missing, []);
assert.deepEqual(authority.knownAuthorityGaps, ['masterVolume']);
assert.deepEqual(QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS, ['masterVolume']);

let musicInputs = 0;
let musicChanges = 0;
controls.musicVolume.addEventListener('input', () => { musicInputs += 1; });
controls.musicVolume.addEventListener('change', () => { musicChanges += 1; });

const bridge = createExistingSettingsBridge(document, global);
let state = bridge.read();
assert.equal(state.musicVolume, 80);
assert.equal(state.sfxVolume, 70);
assert.equal(state.partnerVoiceVolume, 60);
assert.equal(state.reduceMotion, false);
assert.equal(state.lowPerf, false);
assert.equal(state.musicMuted, false);
assert.equal(state.sfxMuted, false);
assert.equal(state.partnerVoiceMuted, false);
assert.deepEqual(state.knownAuthorityGaps, ['masterVolume']);

assert.equal(bridge.setVolume('musicVolume', 35), true);
assert.equal(controls.musicVolume.value, '35');
assert.equal(musicInputs, 1);
assert.equal(musicChanges, 1);
assert.equal(bridge.setVolume('unknown', 10), false);
assert.equal(bridge.toggle('reduceMotion'), true);
assert.equal(bridge.toggle('musicMute'), true);
state = bridge.read();
assert.equal(state.musicVolume, 35);
assert.equal(state.reduceMotion, true);
assert.equal(state.musicMuted, true);

const homeTrigger = document.createElement('button');
homeTrigger.textContent = '設定';
document.body.append(homeTrigger);
let originalHomeRouteCount = 0;
homeTrigger.addEventListener('click', (event) => {
  if (!event.defaultPrevented) originalHomeRouteCount += 1;
});
const homeBinding = bindQuickSettingsTrigger(global, { trigger: homeTrigger, surface: 'home' });
assert.equal(homeBinding.connected, true);
assert.equal(homeTrigger.getAttribute('aria-haspopup'), 'dialog');
assert.equal(homeBinding.panel.overlay.hidden, true);
homeTrigger.click();
assert.equal(homeBinding.panel.overlay.hidden, false);
assert.equal(homeTrigger.getAttribute('aria-expanded'), 'true');
assert.equal(originalHomeRouteCount, 0);
assert.equal(homeBinding.panel.overlay.dataset.surface, 'home');
assert.equal(homeBinding.panel.overlay.dataset.authorityGap, 'masterVolume');
assert.ok(homeBinding.panel.detailButton);

homeBinding.panel.detailButton.click();
assert.equal(homeBinding.panel.overlay.hidden, true);
assert.equal(originalHomeRouteCount, 1);
assert.equal(homeTrigger.getAttribute('aria-expanded'), 'false');

homeTrigger.click();
assert.equal(homeBinding.panel.overlay.hidden, false);
homeBinding.panel.overlay.dispatchEvent(new FakeEvent('click', { bubbles: true, target: homeBinding.panel.overlay }));
assert.equal(homeBinding.panel.overlay.hidden, true);

homeTrigger.click();
assert.equal(homeBinding.panel.overlay.hidden, false);
document.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
assert.equal(homeBinding.panel.overlay.hidden, true);

const battleTrigger = document.createElement('button');
battleTrigger.textContent = '⚙';
document.body.append(battleTrigger);
const battleBinding = bindQuickSettingsTrigger(global, { trigger: battleTrigger, surface: 'battle' });
assert.equal(battleBinding.connected, true);
battleTrigger.click();
assert.equal(battleBinding.panel.overlay.hidden, false);
assert.equal(battleBinding.panel.overlay.dataset.surface, 'battle');
assert.equal(battleBinding.panel.detailButton, null);
assert.equal(battleBinding.panel.bridge.setVolume('sfxVolume', 45), true);
assert.equal(controls.sfxVolume.value, '45');
assert.equal(battleBinding.panel.bridge.toggle('lowPerf'), true);
assert.equal(bridge.read().lowPerf, true);

assert.equal(homeBinding.destroy(), true);
assert.equal(homeBinding.destroy(), false);
assert.equal(battleBinding.destroy(), true);
assert.equal(battleBinding.destroy(), false);

const sparseDocument = new FakeDocument();
const sparsePanel = mountQuickSettingsPanel({ document: sparseDocument, Event: FakeEvent }, { surface: 'battle' });
const sparseState = sparsePanel.refresh();
assert.ok(sparseState.missing.includes('musicVolume'));
assert.equal(sparsePanel.overlay.dataset.authorityGap, 'masterVolume');
assert.equal(sparsePanel.destroy(), true);

console.log('quick-settings-panel-runtime tests: PASS');
