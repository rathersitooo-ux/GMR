import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateBattleHiddenHandReservation,
  applyBattleHiddenHandAuthoritativeRoadCommit,
} from '../browser/battle-hidden-hand-core.mjs';
import {
  BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT,
  BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON,
  createBattleHiddenHandAddButtonController,
  mountBattleHiddenHandAddButton,
  projectBattleHiddenHandAddButton,
} from '../browser/battle-hidden-hand-add-button-runtime.mjs';

const roadA = Object.freeze({ physicalId: 'P-R-A', type: 'ROAD', cardId: 'ROAD-A' });
const roadB = Object.freeze({ physicalId: 'P-R-B', type: 'ROAD', cardId: 'ROAD-B' });
const battleA = Object.freeze({ physicalId: 'P-B-A', type: 'BATTLE', cardId: 'BATTLE-A' });
const identityOf = (card) => card.physicalId;
const isRoadCard = (card) => card.type === 'ROAD';

function hiddenState() {
  return allocateBattleHiddenHandReservation({
    ownerPlayerId: 'P1',
    normalDeckCards: [roadA, battleA, roadB],
    reservedCardIdentity: roadA.physicalId,
    identityOf,
    isRoadCard,
  }).state;
}

function controllerFixture({ membership = [], state = hiddenState(), addImpl = null } = {}) {
  let currentMembership = membership;
  let currentState = state;
  const calls = [];
  const controller = createBattleHiddenHandAddButtonController({
    viewerPlayerId: 'P1',
    readHiddenHandState: () => currentState,
    readRoadJankenCards: () => currentMembership,
    identityOf,
    isRoadCard,
    addRoadJankenCard: async (payload) => {
      calls.push(payload);
      if (addImpl) {
        const result = await addImpl({
          payload,
          membership: currentMembership,
          state: currentState,
          setMembership: (next) => { currentMembership = next; },
          setState: (next) => { currentState = next; },
        });
        return result;
      }
      currentMembership = [...currentMembership, payload.card];
    },
  });
  return {
    controller,
    calls,
    membership: () => currentMembership,
    state: () => currentState,
    setMembership: (next) => { currentMembership = next; },
    setState: (next) => { currentState = next; },
  };
}

test('owner sees enabled button only when reserved privilege exists and Road-janken membership has no Road card', () => {
  const projection = projectBattleHiddenHandAddButton({
    hiddenHandState: hiddenState(),
    viewerPlayerId: 'P1',
    roadJankenCards: [battleA],
    identityOf,
    isRoadCard,
  });

  assert.equal(projection.visible, true);
  assert.equal(projection.enabled, true);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.READY);
  assert.strictEqual(projection.reservedCard, roadA);
  assert.equal(projection.reservedCardIdentity, 'P-R-A');
  assert.equal(projection.roadAlreadyPresent, false);
  assert.equal(projection.visualIntent, 'DEEP_LEMON_GUMMY_GOLD');
  assert.equal(projection.exactColorAuthority, 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY');
  assert.equal(projection.gameplayAuthority, false);
  assert.equal(projection.membershipAuthority, false);
});

test('any existing Road in Road-janken membership makes button gray-semantic disabled with no hit', async () => {
  const fixture = controllerFixture({ membership: [roadB] });
  const projection = fixture.controller.sync();

  assert.equal(projection.visible, true);
  assert.equal(projection.enabled, false);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.ROAD_ALREADY_PRESENT);
  assert.equal(projection.roadAlreadyPresent, true);

  const result = await fixture.controller.press();
  assert.equal(result.ok, false);
  assert.equal(result.added, false);
  assert.equal(result.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.ROAD_ALREADY_PRESENT);
  assert.equal(result.membershipWriteDelegated, false);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(fixture.membership(), [roadB]);
});

test('exact reserved physical card already present is disabled and cannot be duplicated', async () => {
  const fixture = controllerFixture({ membership: [roadA] });
  const projection = fixture.controller.sync();

  assert.equal(projection.enabled, false);
  assert.equal(projection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_ALREADY_PRESENT);

  const result = await fixture.controller.press();
  assert.equal(result.ok, false);
  assert.equal(result.added, false);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.membership().filter((card) => card === roadA).length, 1);
});

test('button is hidden from non-owner and after authoritative privilege consumption', () => {
  const available = hiddenState();
  const nonOwner = projectBattleHiddenHandAddButton({
    hiddenHandState: available,
    viewerPlayerId: 'P2',
    roadJankenCards: [],
    identityOf,
    isRoadCard,
  });
  assert.equal(nonOwner.visible, false);
  assert.equal(nonOwner.enabled, false);
  assert.equal(nonOwner.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NOT_OWNER);
  assert.equal(nonOwner.reservedCard, null);

  const consumed = applyBattleHiddenHandAuthoritativeRoadCommit(available, {
    committedPhysicalCardIdentity: 'P-R-A',
    authoritativeLegalRoadCommit: true,
  }).state;
  const consumedProjection = projectBattleHiddenHandAddButton({
    hiddenHandState: consumed,
    viewerPlayerId: 'P1',
    roadJankenCards: [],
    identityOf,
    isRoadCard,
  });
  assert.equal(consumedProjection.visible, false);
  assert.equal(consumedProjection.enabled, false);
  assert.equal(consumedProjection.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NO_RESERVED_PRIVILEGE);
});

test('press delegates exactly the same reserved physical card once and does not consume privilege', async () => {
  const fixture = controllerFixture({ membership: [battleA] });
  const result = await fixture.controller.press();

  assert.equal(result.ok, true);
  assert.equal(result.added, true);
  assert.equal(result.reason, 'ADDED_SAME_RESERVED_PHYSICAL_CARD');
  assert.strictEqual(result.card, roadA);
  assert.equal(result.physicalCardIdentity, 'P-R-A');
  assert.equal(result.privilegeConsumed, false);
  assert.equal(result.membershipWriteDelegated, true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].source, 'HIDDEN_HAND');
  assert.strictEqual(fixture.calls[0].card, roadA);
  assert.equal(fixture.calls[0].physicalCardIdentity, 'P-R-A');
  assert.deepEqual(fixture.membership(), [battleA, roadA]);
  assert.equal(fixture.state().privilegeAvailable, true);
  assert.equal(fixture.state().privilegeConsumed, false);

  const after = fixture.controller.sync();
  assert.equal(after.enabled, false);
  assert.equal(after.reason, BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_ALREADY_PRESENT);
});

test('press fails closed when delegated write is not reflected in authoritative membership', async () => {
  const fixture = controllerFixture({
    addImpl: async () => {},
  });
  const result = await fixture.controller.press();

  assert.equal(result.ok, false);
  assert.equal(result.added, false);
  assert.equal(result.reason, 'ADD_NOT_REFLECTED_IN_AUTHORITATIVE_MEMBERSHIP');
  assert.equal(result.membershipWriteDelegated, true);
  assert.equal(result.privilegeConsumed, false);
  assert.equal(fixture.calls.length, 1);
});

test('press fails closed when delegated membership creates a duplicate physical identity', async () => {
  const fixture = controllerFixture({
    addImpl: async ({ payload, setMembership }) => {
      setMembership([payload.card, payload.card]);
    },
  });
  const result = await fixture.controller.press();

  assert.equal(result.ok, false);
  assert.equal(result.added, false);
  assert.equal(result.reason, 'DUPLICATE_RESERVED_PHYSICAL_CARD');
  assert.equal(result.membershipWriteDelegated, true);
});

test('press fails closed if delegated add incorrectly consumes Hidden Hand privilege', async () => {
  const available = hiddenState();
  const consumed = applyBattleHiddenHandAuthoritativeRoadCommit(available, {
    committedPhysicalCardIdentity: 'P-R-A',
    authoritativeLegalRoadCommit: true,
  }).state;
  const fixture = controllerFixture({
    state: available,
    addImpl: async ({ payload, setMembership, setState }) => {
      setMembership([payload.card]);
      setState(consumed);
    },
  });
  const result = await fixture.controller.press();

  assert.equal(result.ok, false);
  assert.equal(result.added, false);
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

test('mounted button uses semantic deep-lemon/gummy-gold tokens, 44px target, and native disabled state without invented color values', () => {
  const documentRef = fakeDocument();
  const container = new FakeElement('div');
  const fixture = controllerFixture({ membership: [roadB] });
  const mount = mountBattleHiddenHandAddButton({
    documentRef,
    container,
    controller: fixture.controller,
  });

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

test('mount resyncs from authoritative membership after a successful press', async () => {
  const documentRef = fakeDocument();
  const container = new FakeElement('div');
  const fixture = controllerFixture();
  const mount = mountBattleHiddenHandAddButton({ documentRef, container, controller: fixture.controller });

  assert.equal(mount.button.disabled, false);
  assert.equal(mount.button.getAttribute('data-state'), 'ready');
  const result = await mount.press();
  assert.equal(result.ok, true);
  assert.equal(mount.button.disabled, true);
  assert.equal(mount.button.getAttribute('data-state'), 'disabled-road-present');
  assert.equal(mount.button.getAttribute('data-reason'), 'RESERVED_CARD_ALREADY_PRESENT');
});

test('contract preserves current Hidden Hand boundaries', () => {
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.visualIntent, 'DEEP_LEMON_GUMMY_GOLD');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.exactColorValueInvented, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.exactColorAuthority, 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.alreadyRoadPresent, 'GRAY_SEMANTIC_DISABLED_NO_HIT');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.pressAdds, 'EXACT_SAME_RESERVED_PHYSICAL_CARD');
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.duplicateCardAllowed, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.pressConsumesPrivilege, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.ownsSecondHandStore, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.ownsSave, false);
  assert.equal(BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.mutatesProductionHtml, false);
});
