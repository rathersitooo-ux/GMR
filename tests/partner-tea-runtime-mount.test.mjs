import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mountPartnerTeaQuickChoiceRuntime,
  partnerTeaQuickChoiceProjectionPlan,
  projectPartnerTeaQuickChoices,
} from '../browser/partner-tea-runtime-mount.mjs';

function element(tag = 'div') {
  return {
    tag,
    id: '',
    className: '',
    dataset: {},
    textContent: '',
    type: '',
    value: '',
    disabled: false,
    children: [],
    listeners: new Map(),
    attributes: new Map(),
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    click() {
      if (this.disabled) return;
      this.listeners.get('click')?.({ preventDefault() {} });
    },
  };
}

function teaFixture({ draft = '下書き' } = {}) {
  const input = element('textarea');
  input.className = 'grPartnerConversationInput';
  input.value = draft;
  const send = element('button');
  send.className = 'grPartnerConversationSend';
  const form = element('form');
  form.className = 'grPartnerConversationComposer';
  form.submittedValues = [];
  form.requestSubmit = () => {
    form.submittedValues.push(input.value);
    input.value = '';
    input.disabled = true;
    send.disabled = true;
  };
  form.before = (node) => { form.insertedBefore = node; };

  const surface = element('section');
  surface.querySelector = (selector) => {
    if (selector === '[data-gr-partner-tea-quick-choice="1"]') return form.insertedBefore || null;
    if (selector === 'form.grPartnerConversationComposer') return form;
    if (selector === '.grPartnerConversationInput') return input;
    if (selector === '.grPartnerConversationSend') return send;
    return null;
  };

  const head = element('head');
  const document = {
    head,
    body: element('body'),
    documentElement: element('html'),
    getElementById(id) { return head.children.find((child) => child.id === id) || null; },
    createElement(tag) { return element(tag); },
    querySelectorAll(selector) { return selector === '[data-gr-partner-conversation="1"]' ? [surface] : []; },
  };

  return { document, surface, form, input, send };
}

test('Tea runtime plan exposes only the approved two choices and no mutation authority', () => {
  const plan = partnerTeaQuickChoiceProjectionPlan();
  assert.deepEqual(plan.choices, [
    { id: 'study', label: '勉強する' },
    { id: 'consult', label: '相談する' },
  ]);
  assert.equal(plan.minimumTargetPx, 44);
  assert.equal(plan.reusesConversationForm, true);
  assert.equal(plan.createsConversationSession, false);
  assert.equal(plan.relationshipMutationAllowed, false);
  assert.equal(plan.rewardMutationAllowed, false);
  assert.equal(plan.saveMutationAllowed, false);
  assert.equal(Object.isFrozen(plan), true);
});

test('mount is a no-op when browser DOM lifecycle is unavailable', () => {
  assert.equal(mountPartnerTeaQuickChoiceRuntime({}), null);
  assert.equal(mountPartnerTeaQuickChoiceRuntime({ document: {} }), null);
});

test('projects two touch-sized Tea actions into the existing conversation form', () => {
  const fixture = teaFixture();
  const count = projectPartnerTeaQuickChoices({ document: fixture.document });
  assert.equal(count, 1);
  const bar = fixture.form.insertedBefore;
  assert.equal(bar.dataset.grPartnerTeaQuickChoice, '1');
  assert.equal(bar.children[0].textContent, 'お茶会');
  const buttons = bar.children.slice(1);
  assert.equal(buttons.length, 2);
  assert.deepEqual(buttons.map((button) => [button.dataset.choiceId, button.textContent]), [
    ['study', '勉強する'],
    ['consult', '相談する'],
  ]);
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false]);
});

test('Tea click reuses the existing submit path and preserves a free-talk draft', () => {
  const fixture = teaFixture({ draft: 'あとで送る下書き' });
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const study = fixture.form.insertedBefore.children[1];
  study.click();
  assert.deepEqual(fixture.form.submittedValues, ['勉強する']);
  assert.equal(fixture.input.value, 'あとで送る下書き');
  assert.equal(fixture.input.disabled, true);
  assert.equal(fixture.send.disabled, true);
});

test('Tea quick choices mirror the existing conversation busy state and recover when it clears', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const buttons = fixture.form.insertedBefore.children.slice(1);

  fixture.input.disabled = true;
  fixture.send.disabled = true;
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 0);
  assert.deepEqual(buttons.map((button) => button.disabled), [true, true]);

  buttons[0].click();
  assert.deepEqual(fixture.form.submittedValues, []);

  fixture.input.disabled = false;
  fixture.send.disabled = false;
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 0);
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false]);

  buttons[1].click();
  assert.deepEqual(fixture.form.submittedValues, ['相談する']);
});

test('projection is idempotent on an already-mounted conversation surface', () => {
  const fixture = teaFixture();
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 1);
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 0);
});

test('runtime observes future surfaces and disabled-state changes and fails closed on global collision', () => {
  const fixture = teaFixture();
  let observerCallback = null;
  let observedOptions = null;
  let disconnected = false;
  class FakeObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target, options) { this.target = target; observedOptions = options; }
    disconnect() { disconnected = true; }
  }
  const global = { document: fixture.document, MutationObserver: FakeObserver };
  const runtime = mountPartnerTeaQuickChoiceRuntime(global);
  assert.equal(runtime.version, 'gameroad.partner-tea-quick-choice-runtime.v1');
  assert.equal(typeof observerCallback, 'function');
  assert.deepEqual(observedOptions, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  assert.equal(mountPartnerTeaQuickChoiceRuntime(global), runtime);
  runtime.disconnect();
  assert.equal(disconnected, true);

  assert.throws(() => mountPartnerTeaQuickChoiceRuntime({
    document: fixture.document,
    MutationObserver: FakeObserver,
    GAMEROAD_PARTNER_TEA_QUICK_CHOICE_RUNTIME: { version: 'foreign' },
  }), /PARTNER_TEA_RUNTIME_GLOBAL_COLLISION/);
});