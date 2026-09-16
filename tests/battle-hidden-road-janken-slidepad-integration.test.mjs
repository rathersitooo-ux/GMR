import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeckHiddenHandRegistrationSnapshot,
  withDeckHiddenHandRegistration,
} from '../browser/deck-hidden-hand-registration-core.mjs';
import {
  consumeNewBaseHiddenHandPrivilege,
  createNewBaseHiddenHandRuntime,
} from '../browser/new-base-hidden-hand-runtime-core.mjs';
import {
  BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_CONTRACT,
  mountBattleHiddenRoadJankenSlidePadIntegration,
} from '../browser/battle-hidden-road-janken-slidepad-integration.mjs';

const CARD_KIND = Object.freeze({
  HT_2: 'ROAD',
  DI_3: 'ROAD',
  SP_A: 'BATTLE',
});
const isRoadCardId = (cardId) => CARD_KIND[cardId] === 'ROAD';

function hiddenRuntime() {
  const deck = withDeckHiddenHandRegistration({
    main: ['SP_A', 'HT_2', 'DI_3'],
    ex: [],
  }, 'HT_2');
  return createNewBaseHiddenHandRuntime(createDeckHiddenHandRegistrationSnapshot(deck));
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.type = '';
    this.removed = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  remove() { this.removed = true; }
}

function fakeDocument() {
  const head = new FakeElement('head');
  return {
    head,
    createElement(tagName) { return new FakeElement(tagName); },
    querySelector() { return null; },
  };
}

function fixture({
  runtime = hiddenRuntime(),
  owner = true,
  membership = ['SP_A'],
} = {}) {
  const documentRef = fakeDocument();
  const slidePadHost = new FakeElement('aside');
  slidePadHost.setAttribute('data-battle-janken-slidepad', '1');
  const existingSlidePadChild = new FakeElement('section');
  existingSlidePadChild.setAttribute('data-existing-slidepad-child', '1');
  slidePadHost.appendChild(existingSlidePadChild);

  let currentRuntime = runtime;
  let currentOwner = owner;
  let currentMembership = membership;
  const addCalls = [];

  const integration = mountBattleHiddenRoadJankenSlidePadIntegration({
    documentRef,
    slidePadHost,
    readHiddenHandRuntime: () => currentRuntime,
    readViewerOwnsHiddenHand: () => currentOwner,
    readRoadJankenCardIds: () => currentMembership,
    isRoadCardId,
    addRoadJankenCardId: async (payload) => {
      addCalls.push(payload);
      currentMembership = [...currentMembership, payload.cardId];
    },
  });

  return {
    integration,
    documentRef,
    slidePadHost,
    existingSlidePadChild,
    addCalls,
    runtime: () => currentRuntime,
    membership: () => currentMembership,
    setRuntime: (next) => { currentRuntime = next; },
    setOwner: (next) => { currentOwner = next; },
    setMembership: (next) => { currentMembership = next; },
  };
}

test('mount composes the current Hidden Hand add button into the caller-provided existing SlidePad host only', () => {
  const f = fixture();

  assert.strictEqual(f.integration.host, f.slidePadHost);
  assert.equal(f.slidePadHost.children.length, 2);
  assert.strictEqual(f.slidePadHost.children[0], f.existingSlidePadChild);
  assert.strictEqual(f.slidePadHost.children[1], f.integration.button);
  assert.equal(f.existingSlidePadChild.removed, false);
  assert.equal(f.integration.button.getAttribute('data-state'), 'ready');
  assert.equal(f.integration.button.getAttribute('data-reserved-physical-card-id'), 'HT_2');
  assert.equal(f.documentRef.head.children.length, 1);
});

test('press delegates the exact reserved physical Road once and does not consume Hidden Hand privilege', async () => {
  const f = fixture();
  const beforeRuntime = f.runtime();

  const result = await f.integration.press();

  assert.equal(result.ok, true);
  assert.equal(result.cardId, 'HT_2');
  assert.equal(result.privilegeConsumed, false);
  assert.deepEqual(f.addCalls, [{ source: 'HIDDEN_HAND', cardId: 'HT_2' }]);
  assert.deepEqual(f.membership(), ['SP_A', 'HT_2']);
  assert.strictEqual(f.runtime(), beforeRuntime);
  assert.equal(f.runtime().hiddenPrivilegeAvailable, true);
  assert.equal(f.integration.button.disabled, true);
  assert.equal(f.integration.button.getAttribute('data-reason'), 'RESERVED_CARD_ALREADY_PRESENT');
});

test('switching away to another choice restores the same Hidden Hand add eligibility while privilege remains unused', async () => {
  const f = fixture();
  const originalRuntime = f.runtime();

  const first = await f.integration.press();
  assert.equal(first.ok, true);
  assert.equal(f.integration.button.disabled, true);

  f.setMembership(['SP_A']);
  const restored = f.integration.sync();
  assert.equal(restored.enabled, true);
  assert.equal(restored.reservedCardId, 'HT_2');
  assert.strictEqual(f.runtime(), originalRuntime);
  assert.equal(f.runtime().hiddenPrivilegeAvailable, true);

  const second = await f.integration.press();
  assert.equal(second.ok, true);
  assert.equal(second.cardId, 'HT_2');
  assert.equal(f.addCalls.length, 2);
  assert.deepEqual(f.addCalls[1], { source: 'HIDDEN_HAND', cardId: 'HT_2' });
});

test('an authoritative Road already in membership disables the bridge and delegates no write', async () => {
  const f = fixture({ membership: ['SP_A', 'DI_3'] });

  const projection = f.integration.sync();
  assert.equal(projection.enabled, false);
  assert.equal(projection.reason, 'ROAD_ALREADY_PRESENT');
  assert.equal(f.integration.button.getAttribute('data-state'), 'disabled-road-present');

  const result = await f.integration.press();
  assert.equal(result.ok, false);
  assert.equal(result.membershipWriteDelegated, false);
  assert.equal(f.addCalls.length, 0);
});

test('non-owner or consumed privilege remains unavailable and exposes no new authority', () => {
  const nonOwner = fixture({ owner: false });
  assert.equal(nonOwner.integration.button.hidden, true);
  assert.equal(nonOwner.integration.sync().reason, 'NOT_OWNER');

  const available = hiddenRuntime();
  const consumed = consumeNewBaseHiddenHandPrivilege(available, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: true,
  }).runtime;
  const afterUse = fixture({ runtime: consumed });
  const projection = afterUse.integration.sync();
  assert.equal(projection.enabled, false);
  assert.equal(projection.visible, false);
  assert.equal(projection.reason, 'NO_RESERVED_PRIVILEGE');
});

test('destroy removes only the mounted button and never owns or destroys the existing SlidePad host', () => {
  const f = fixture();

  assert.equal(f.integration.destroy(), true);
  assert.equal(f.integration.button.removed, true);
  assert.equal(f.slidePadHost.removed, false);
  assert.equal(f.existingSlidePadChild.removed, false);
  assert.equal(f.integration.destroy(), false);
  assert.throws(() => f.integration.sync(), /HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_DESTROYED/);
});

test('contract forbids a second SlidePad, Hidden Hand runtime, hand store, save, gameplay or production HTML authority', () => {
  const contract = BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_CONTRACT;
  assert.equal(contract.slidePadAuthority, 'CALLER_SUPPLIED_EXISTING_SLIDEPAD_HOST_ONLY');
  assert.equal(contract.createsSlidePadHost, false);
  assert.equal(contract.hiddenHandAuthority, 'EXISTING_NEW_BASE_HIDDEN_HAND_RUNTIME_ONLY');
  assert.equal(contract.membershipAuthority, 'CALLER_SUPPLIED_EXISTING_ROAD_JANKEN_MEMBERSHIP');
  assert.equal(contract.pressAdds, 'EXACT_EXISTING_RESERVED_CARD_ID');
  assert.equal(contract.pressConsumesPrivilege, false);
  assert.equal(contract.switchAwayRestoresEligibilityWhenMembershipHasNoRoadAndPrivilegeRemains, true);
  assert.equal(contract.computesRoadLegality, false);
  assert.equal(contract.gameplayAuthority, false);
  assert.equal(contract.ownsSecondHiddenHandRuntime, false);
  assert.equal(contract.ownsSecondHandStore, false);
  assert.equal(contract.ownsSave, false);
  assert.equal(contract.mutatesProductionHtml, false);
});
