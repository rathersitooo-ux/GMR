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
  BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT,
  BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON,
  createBattleHiddenHandAddButtonController,
  mountBattleHiddenHandAddButton,
  projectBattleHiddenHandAddButton,
} from '../browser/battle-hidden-hand-add-button-runtime.mjs';

const CARD_KIND = Object.freeze({
  HT_2: 'ROAD',
  DI_3: 'ROAD',
  SP_A: 'BATTLE',
});
const isRoadCardId = (cardId) => CARD_KIND[cardId] === 'ROAD';

function runtime() {
  const deck = withDeckHiddenHandRegistration({
    main: ['SP_A', 'HT_2', 'DI_3'],
    ex: [],
  }, 'HT_2');
  return createNewBaseHiddenHandRuntime(createDeckHiddenHandRegistrationSnapshot(deck));
}

function controllerFixture({
  currentRuntime = runtime(),
  owner = true,
  membership = [],
  addImpl = null,
} = {}) {
  let hiddenRuntime = currentRuntime;
  let ownsHidden = owner;
  let roadJankenCardIds = membership;
  const calls = [];
  const controller = createBattleHiddenHandAddButtonController({
    readHiddenHandRuntime: () => hiddenRuntime,
    readViewerOwnsHiddenHand: () => ownsHidden,
    readRoadJankenCardIds: () => roadJankenCardIds,
    isRoadCardId,
    addRoadJankenCardId: async (payload) => {
      calls.push(payload);
      if (addImpl) {
        return addImpl({
          payload,
          runtime: hiddenRuntime,
          membership: roadJankenCardIds,
          setRuntime: (next) => { hiddenRuntime = next; },
          setMembership: (next) => { roadJankenCardIds = next; },
          setOwner: (next) => { ownsHidden = next; },
        });
      }
      roadJankenCardIds = [...roadJankenCardIds, payload.cardId];
    },
  });
  return {
    controller,
    calls,
    runtime: () => hiddenRuntime,
    membership: () => roadJankenCardIds,
    setRuntime: (next) => { hiddenRuntime = next; },
    setMembership: (next) => { roadJankenCardIds = next; },
    setOwner: (next) => { ownsHidden = next; },
  };
}

test('projects enabled only for owner with available reserved Road and no Road in current membership', () => {
  const projection = projectBattleHiddenHandAddButton({
    hiddenHandRuntime: runtime(),
    viewerOwnsHiddenHand: true,
    roadJankenCardIds: ['SP_A'],
    isRoadCardId,
  });

  assert.equal(projection.visible, true);
  assert.equal(projection.enabled, true);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.READY);
  assert.equal(projection.reservedCardId, 'HT_2');
  assert.equal(projection.roadAlreadyPresent, false);
  assert.equal(projection.visualIntent, 'DEEP_LEMON_GUMMY_GOLD');
  assert.equal(projection.exactColorAuthority, 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY');
  assert.equal(projection.hiddenHandAuthority, undefined);
  assert.equal(projection.privilegeAuthority, 'EXISTING_NEW_BASE_HIDDEN_HAND_RUNTIME_ONLY');
  assert.equal(projection.gameplayAuthority, false);
  assert.equal(projection.membershipAuthority, false);
});

test('already-present Road is semantic-disabled and press delegates no write', async () => {
  const fixture = controllerFixture({ membership: ['DI_3'] });
  const projection = fixture.controller.sync();
  assert.equal(projection.visible, true);
  assert.equal(projection.enabled, false);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.ROAD_ALREADY_PRESENT);
  assert.equal(projection.roadAlreadyPresent, true);

  const result = await fixture.controller.press();
  assert.equal(result.ok, false);
  assert.equal(result.added, false);
  assert.equal(result.membershipWriteDelegated, false);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(fixture.membership(), ['DI_3']);
});

test('exact reserved physical-card identity already in membership cannot be duplicated', async () => {
  const fixture = controllerFixture({ membership: ['HT_2'] });
  const projection = fixture.controller.sync();
  assert.equal(projection.enabled, false);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_ALREADY_PRESENT);

  const result = await fixture.controller.press();
  assert.equal(result.ok, false);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(fixture.membership(), ['HT_2']);
});

test('non-owner and consumed privilege do not expose reserved identity', () => {
  const current = runtime();
  const nonOwner = projectBattleHiddenHandAddButton({
    hiddenHandRuntime: current,
    viewerOwnsHiddenHand: false,
    roadJankenCardIds: [],
    isRoadCardId,
  });
  assert.equal(nonOwner.visible, false);
  assert.equal(nonOwner.enabled, false);
  assert.equal(nonOwner.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NOT_OWNER);
  assert.equal(nonOwner.reservedCardId, null);

  const consumed = consumeNewBaseHiddenHandPrivilege(current, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: true,
  }).runtime;
  const unavailable = projectBattleHiddenHandAddButton({
    hiddenHandRuntime: consumed,
    viewerOwnsHiddenHand: true,
    roadJankenCardIds: [],
    isRoadCardId,
  });
  assert.equal(unavailable.visible, false);
  assert.equal(unavailable.enabled, false);
  assert.equal(unavailable.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NO_RESERVED_PRIVILEGE);
  assert.equal(unavailable.reservedCardId, null);
});

test('button fails closed if registered reserved identity is not Road according to caller card authority', () => {
  const projection = projectBattleHiddenHandAddButton({
    hiddenHandRuntime: runtime(),
    viewerOwnsHiddenHand: true,
    roadJankenCardIds: [],
    isRoadCardId: () => false,
  });
  assert.equal(projection.visible, false);
  assert.equal(projection.enabled, false);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_NOT_ROAD);
  assert.equal(projection.reservedCardId, null);
});

test('press adds the exact existing reservedCardId once without consuming current Hidden Hand privilege', async () => {
  const fixture = controllerFixture({ membership: ['SP_A'] });
  const beforeRuntime = fixture.runtime();
  const result = await fixture.controller.press();

  assert.equal(result.ok, true);
  assert.equal(result.added, true);
  assert.equal(result.reason, 'ADDED_SAME_RESERVED_PHYSICAL_CARD');
  assert.equal(result.cardId, 'HT_2');
  assert.equal(result.privilegeConsumed, false);
  assert.equal(result.membershipWriteDelegated, true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.calls[0], { source: 'HIDDEN_HAND', cardId: 'HT_2' });
  assert.deepEqual(fixture.membership(), ['SP_A', 'HT_2']);
  assert.strictEqual(fixture.runtime(), beforeRuntime);
  assert.equal(fixture.runtime().hiddenPrivilegeAvailable, true);

  const after = fixture.controller.sync();
  assert.equal(after.enabled, false);
  assert.equal(after.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_ALREADY_PRESENT);
});

test('delegated membership write must reflect exactly one reserved identity', async () => {
  const missing = controllerFixture({ addImpl: async () => {} });
  const missingResult = await missing.controller.press();
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.reason, 'ADD_NOT_REFLECTED_IN_AUTHORITATIVE_MEMBERSHIP');
  assert.equal(missingResult.membershipWriteDelegated, true);

  const duplicate = controllerFixture({
    addImpl: async ({ payload, setMembership }) => {
      setMembership([payload.cardId, payload.cardId]);
    },
  });
  const duplicateResult = await duplicate.controller.press();
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.reason, 'DUPLICATE_RESERVED_PHYSICAL_CARD');
  assert.equal(duplicateResult.membershipWriteDelegated, true);
});

test('button action may not consume or replace the existing Hidden Hand privilege', async () => {
  const initial = runtime();
  const consumed = consumeNewBaseHiddenHandPrivilege(initial, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: true,
  }).runtime;
  const fixture = controllerFixture({
    currentRuntime: initial,
    addImpl: async ({ payload, setMembership, setRuntime }) => {
      setMembership([payload.cardId]);
      setRuntime(consumed);
    },
  });
  const result = await fixture.controller.press();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ADD_MUST_NOT_CONSUME_OR_REPLACE_HIDDEN_HAND_PRIVILEGE');
  assert.equal(result.privilegeConsumed, true);
  assert.equal(result.membershipWriteDelegated, true);
});

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

test('mount uses 44px semantic gummy-gold/deep-lemon tokens and native disabled state without invented exact colors', () => {
  const documentRef = fakeDocument();
  const container = new FakeElement('div');
  const fixture = controllerFixture({ membership: ['DI_3'] });
  const mount = mountBattleHiddenHandAddButton({ documentRef, container, controller: fixture.controller });

  assert.equal(container.children.length, 1);
  assert.strictEqual(container.children[0], mount.button);
  assert.equal(mount.button.disabled, true);
  assert.equal(mount.button.getAttribute('aria-disabled'), 'true');
  assert.equal(mount.button.getAttribute('data-state'), 'disabled-road-present');
  assert.equal(mount.button.getAttribute('data-visual-intent'), 'DEEP_LEMON_GUMMY_GOLD');
  assert.equal(mount.button.getAttribute('data-reason'), 'ROAD_ALREADY_PRESENT');
  assert.equal(documentRef.head.children.length, 1);
  const css = documentRef.head.children[0].textContent;
  assert.match(css, /min-width:44px/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /var\(--gameroad-hidden-hand-deep-lemon\)/);
  assert.match(css, /var\(--gameroad-hidden-hand-gummy-gold\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /rgba?\(/i);

  mount.destroy();
  assert.equal(mount.button.removed, true);
});

test('mounted successful press resyncs to duplicate-disabled without changing privilege runtime', async () => {
  const documentRef = fakeDocument();
  const container = new FakeElement('div');
  const fixture = controllerFixture();
  const originalRuntime = fixture.runtime();
  const mount = mountBattleHiddenHandAddButton({ documentRef, container, controller: fixture.controller });

  assert.equal(mount.button.disabled, false);
  assert.equal(mount.button.getAttribute('data-state'), 'ready');
  const result = await mount.press();
  assert.equal(result.ok, true);
  assert.strictEqual(fixture.runtime(), originalRuntime);
  assert.equal(fixture.runtime().hiddenPrivilegeAvailable, true);
  assert.equal(mount.button.disabled, true);
  assert.equal(mount.button.getAttribute('data-state'), 'disabled-road-present');
  assert.equal(mount.button.getAttribute('data-reason'), 'RESERVED_CARD_ALREADY_PRESENT');
});

test('contract declares existing new-base runtime as the single Hidden Hand authority', () => {
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.hiddenHandAuthority, 'EXISTING_NEW_BASE_HIDDEN_HAND_RUNTIME_ONLY');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.visualIntent, 'DEEP_LEMON_GUMMY_GOLD');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.exactColorValueInvented, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.alreadyRoadPresent, 'GRAY_SEMANTIC_DISABLED_NO_HIT');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.pressAdds, 'EXACT_EXISTING_RESERVED_CARD_ID');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.duplicateCardAllowed, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.pressConsumesPrivilege, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.computesRoadLegality, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.ownsSecondHiddenHandRuntime, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.ownsSecondHandStore, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.ownsSave, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.mutatesProductionHtml, false);
});
