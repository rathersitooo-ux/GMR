import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TITLE_BOOT_QUICK_DESTINATIONS,
  projectTitleQuickDestinations,
  readTitleBootContext,
  runTitleBoot,
} from '../browser/title-boot-runtime-mount.mjs';

function findNode(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.id = '';
    this.value = 0;
    this.max = 0;
  }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ handler, once: options?.once === true });
    this.listeners.set(type, list);
  }
  click() {
    const list = [...(this.listeners.get('click') || [])];
    for (const entry of list) {
      entry.handler({ currentTarget: this, target: this });
      if (entry.once) {
        const active = this.listeners.get('click') || [];
        this.listeners.set('click', active.filter((candidate) => candidate !== entry));
      }
    }
  }
  querySelector(selector) {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return findNode(this, (node) => String(node.className || '').split(/\s+/).includes(className));
    }
    return null;
  }
  set innerHTML(value) {
    this.children = [];
    if (!String(value).includes('grTitleBootPanel')) return;
    const panel = new FakeNode('div', this.ownerDocument); panel.className = 'grTitleBootPanel';
    const name = new FakeNode('h1', this.ownerDocument); name.className = 'grTitleBootName'; name.textContent = 'GAMEROAD';
    const status = new FakeNode('div', this.ownerDocument); status.className = 'grTitleBootStatus';
    const progress = new FakeNode('progress', this.ownerDocument); progress.className = 'grTitleBootProgress'; progress.max = 1;
    const actions = new FakeNode('div', this.ownerDocument); actions.className = 'grTitleBootActions';
    panel.append(name, status, progress, actions);
    this.appendChild(panel);
  }
}

function fakeDocument(screenNames = ['home', 'setup', 'cards', 'characters', 'battle']) {
  const doc = {
    readyState: 'complete',
    screenNames: new Set(screenNames),
    createElement(tagName) { return new FakeNode(tagName, doc); },
    querySelector(selector) {
      const match = /^\.screen\[data-screen="([^"]+)"\]$/.exec(selector);
      if (match) return doc.screenNames.has(match[1]) ? { dataset: { screen: match[1] } } : null;
      return null;
    },
    getElementById(id) {
      return findNode(doc.head, (node) => node.id === id) || findNode(doc.body, (node) => node.id === id);
    },
  };
  doc.head = new FakeNode('head', doc);
  doc.body = new FakeNode('body', doc);
  return doc;
}

function activeMatch(matchId = 'match-1') {
  return { resumable: true, authority: 'authoritative-match-session', matchId };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('Title quick destinations stay small and hide destinations absent from the live screen set', () => {
  assert.deepEqual(TITLE_BOOT_QUICK_DESTINATIONS.map(({ screen }) => screen), ['setup', 'cards', 'characters', 'home']);
  const doc = fakeDocument(['home', 'setup', 'cards']);
  assert.deepEqual(projectTitleQuickDestinations({ document: doc }).map(({ screen }) => screen), ['setup', 'cards', 'home']);
});

test('missing or failing boot context provider falls back to Title instead of inventing state', async () => {
  assert.deepEqual(readTitleBootContext({}), {});
  const failingSource = { GAMEROAD_TITLE_BOOT_CONTEXT_PROVIDER() { throw new Error('provider-down'); } };
  const context = readTitleBootContext(failingSource);
  assert.match(context.contextProviderError, /provider-down/);
  const result = await runTitleBoot({ source: failingSource, document: null, context });
  assert.equal(result.status, 'title');
  assert.equal(result.reason, 'context_provider_error');
});

test('validated direct destination uses the existing screen-transition authority without Home transit', async () => {
  const calls = [];
  const source = {
    GAMEROAD_GET_CURRENT_SCREEN: () => 'home',
    GAMEROAD_SCREEN_TRANSITION: {
      async navigate(target, meta) { calls.push({ target, meta }); return { status: 'completed' }; },
    },
  };
  const result = await runTitleBoot({
    source,
    document: null,
    context: { directDestination: { validated: true, screen: 'cards' } },
  });
  assert.equal(result.status, 'navigation');
  assert.deepEqual(calls, [{ target: 'cards', meta: { reason: 'root' } }]);
  assert.equal(calls.some(({ target }) => target === 'home'), false);
});

test('safe current resume skips Title and performs no navigation', async () => {
  let navigations = 0;
  const result = await runTitleBoot({
    source: { GAMEROAD_SCREEN_TRANSITION: { async navigate() { navigations += 1; } } },
    document: null,
    context: { safeCurrentResume: true },
  });
  assert.equal(result.status, 'resumed-current');
  assert.equal(navigations, 0);
});

test('authoritative resumable match starts reconnect immediately without a confirmation click and then enters Battle', async () => {
  const gate = deferred();
  let reconnectCalls = 0;
  const navigations = [];
  const source = {
    GAMEROAD_GET_CURRENT_SCREEN: () => 'home',
    GAMEROAD_MATCH_RECOVERY: {
      reconnect(match, { signal }) {
        reconnectCalls += 1;
        assert.equal(match.matchId, 'live-match');
        assert.equal(signal.aborted, false);
        return gate.promise;
      },
    },
    GAMEROAD_SCREEN_TRANSITION: {
      async navigate(target, meta) { navigations.push({ target, meta }); return { status: 'completed' }; },
    },
  };
  const run = runTitleBoot({ source, document: fakeDocument(), context: { activeMatch: activeMatch('live-match') } });
  assert.equal(reconnectCalls, 1, 'reconnect must start synchronously before any user click');
  assert.deepEqual(navigations, []);
  gate.resolve({ committed: true });
  const result = await run;
  assert.equal(result.status, 'committed');
  assert.deepEqual(navigations, [{ target: 'battle', meta: { reason: 'root' } }]);
});

test('precommit Cancel aborts only the recovery attempt and never navigates to Battle', async () => {
  const doc = fakeDocument();
  let reconnectSignal = null;
  let cancelCall = null;
  let navigations = 0;
  const source = {
    GAMEROAD_GET_CURRENT_SCREEN: () => 'home',
    GAMEROAD_MATCH_RECOVERY: {
      reconnect(match, { signal }) {
        reconnectSignal = signal;
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      },
      cancel(match, meta) { cancelCall = { match, meta }; },
    },
    GAMEROAD_SCREEN_TRANSITION: { async navigate() { navigations += 1; return { status: 'completed' }; } },
  };
  const run = runTitleBoot({ source, document: doc, context: { activeMatch: activeMatch('cancel-me') } });
  assert.ok(reconnectSignal);
  const surface = doc.getElementById('gameroad-title-boot-runtime');
  const cancelButton = findNode(surface, (node) => node.dataset?.titleBootAction === 'CANCEL');
  assert.ok(cancelButton, 'RECOVERY must expose a precommit Cancel action');
  cancelButton.click();
  assert.equal(reconnectSignal.aborted, true);
  assert.equal(cancelCall.match.matchId, 'cancel-me');
  assert.equal(cancelCall.meta.reason, 'ABORT_RECOVERY_ATTEMPT_ONLY');
  const result = await run;
  assert.equal(result.status, 'cancelled');
  assert.equal(navigations, 0);
});

test('after recovery commit Boot-owned Cancel is removed before Battle navigation completes', async () => {
  const doc = fakeDocument();
  const navigationGate = deferred();
  const source = {
    GAMEROAD_GET_CURRENT_SCREEN: () => 'home',
    GAMEROAD_MATCH_RECOVERY: { async reconnect() { return { committed: true }; } },
    GAMEROAD_SCREEN_TRANSITION: { async navigate() { return navigationGate.promise; } },
  };
  const run = runTitleBoot({ source, document: doc, context: { activeMatch: activeMatch('committed-match') } });
  await new Promise((resolve) => setImmediate(resolve));
  const surface = doc.getElementById('gameroad-title-boot-runtime');
  const cancelButton = findNode(surface, (node) => node.dataset?.titleBootAction === 'CANCEL');
  assert.equal(cancelButton, null, 'once committed, departure is no longer owned by Boot Cancel');
  navigationGate.resolve({ status: 'completed' });
  const result = await run;
  assert.equal(result.status, 'committed');
});

test('postcommit Battle navigation rejection returns to Title without restoring Boot Cancel', async () => {
  const doc = fakeDocument();
  const source = {
    GAMEROAD_GET_CURRENT_SCREEN: () => 'home',
    GAMEROAD_MATCH_RECOVERY: { async reconnect() { return { committed: true }; } },
    GAMEROAD_SCREEN_TRANSITION: { async navigate() { return { status: 'rejected', reason: 'screen-blocked' }; } },
  };
  const result = await runTitleBoot({ source, document: doc, context: { activeMatch: activeMatch('committed-reject') } });
  assert.equal(result.status, 'committed');
  assert.equal(result.navigationResult.status, 'rejected');
  const surface = doc.getElementById('gameroad-title-boot-runtime');
  assert.equal(surface.dataset.titleBootMode, 'title');
  assert.equal(surface.hidden, false);
  assert.equal(surface.querySelector('.grTitleBootStatus').textContent, '対戦画面を開けませんでした');
  assert.equal(findNode(surface, (node) => node.dataset?.titleBootAction === 'CANCEL'), null);
});

test('postcommit Battle navigation exception is contained and returns to Title', async () => {
  const doc = fakeDocument();
  const source = {
    GAMEROAD_GET_CURRENT_SCREEN: () => 'home',
    GAMEROAD_MATCH_RECOVERY: { async reconnect() { return { committed: true }; } },
    GAMEROAD_SCREEN_TRANSITION: { async navigate() { throw new Error('transition-down'); } },
  };
  const result = await runTitleBoot({ source, document: doc, context: { activeMatch: activeMatch('committed-throw') } });
  assert.equal(result.status, 'committed');
  assert.equal(result.navigationResult.status, 'rejected');
  assert.equal(result.navigationResult.reason, 'screen_transition_failed');
  assert.match(result.navigationResult.error, /transition-down/);
  const surface = doc.getElementById('gameroad-title-boot-runtime');
  assert.equal(surface.dataset.titleBootMode, 'title');
  assert.equal(surface.hidden, false);
  assert.equal(surface.querySelector('.grTitleBootStatus').textContent, '対戦画面を開けませんでした');
  assert.equal(findNode(surface, (node) => node.dataset?.titleBootAction === 'CANCEL'), null);
});

test('missing match-recovery provider fails soft and does not fabricate Battle navigation', async () => {
  let navigations = 0;
  const result = await runTitleBoot({
    source: { GAMEROAD_SCREEN_TRANSITION: { async navigate() { navigations += 1; } } },
    document: null,
    context: { activeMatch: activeMatch('authority-without-consumer') },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'match_recovery_runtime_unavailable');
  assert.equal(navigations, 0);
});

test('required gate stays ahead of ordinary direct navigation when it explicitly blocks match recovery', async () => {
  let reconnects = 0;
  let navigations = 0;
  const result = await runTitleBoot({
    source: {
      GAMEROAD_MATCH_RECOVERY: { async reconnect() { reconnects += 1; return { committed: true }; } },
      GAMEROAD_SCREEN_TRANSITION: { async navigate() { navigations += 1; return { status: 'completed' }; } },
    },
    document: null,
    context: {
      activeMatch: activeMatch('version-gated'),
      requiredGate: { required: true, kind: 'MATCH_PROTOCOL_UPDATE', blocksMatchRecovery: true },
      directDestination: { validated: true, screen: 'cards' },
    },
  });
  assert.equal(result.status, 'required-gate');
  assert.equal(result.route.pendingDestination, 'battle');
  assert.equal(reconnects, 0);
  assert.equal(navigations, 0);
});
