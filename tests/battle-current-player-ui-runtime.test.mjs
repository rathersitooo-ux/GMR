import assert from 'node:assert/strict';
import {
  BATTLE_CURRENT_PLAYER_UI_RUNTIME,
  BATTLE_CURRENT_PLAYER_UI_SELECTORS,
  mountBattleCurrentPlayerUi
} from '../browser/battle-current-player-ui-runtime.mjs';

class FakeElement {
  constructor(tagName = 'div', rect = null) {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.selectorMap = new Map();
    this.rect = rect ?? { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 };
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
  querySelector(selector) {
    return this.selectorMap.get(selector) ?? null;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] ?? null : null;
  }
  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeDocument {
  constructor(root = null) {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.root = root;
  }
  createElement(tagName) {
    return new FakeElement(tagName);
  }
  getElementById(id) {
    return this.head.children.find((node) => node.id === id) ?? null;
  }
  querySelector(selector) {
    if (!this.root) return null;
    if (selector === 'section.screen.battle[data-screen="battle"]' || selector === '.screen.battle') return this.root;
    return null;
  }
}

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function bind(root, selectors, node) {
  for (const selector of selectors) root.selectorMap.set(selector, node);
}

function fixture() {
  const root = new FakeElement('section', rect(0, 0, 667, 375));
  const document = new FakeDocument(root);
  const battleMap = new FakeElement('div', rect(0, 0, 667, 375));
  const board = new FakeElement('div', rect(116, 56, 336, 205));
  const boardPlayers = new FakeElement('div', rect(130, 66, 310, 185));
  const controlledCharacter = new FakeElement('div', rect(286, 122, 84, 84));
  const currentAction = new FakeElement('div', rect(8, 52, 224, 42));
  const battleScreenHud = new FakeElement('div', rect(0, 0, 667, 48));
  const resources = new FakeElement('div', rect(8, 327, 96, 40));
  const public4p = new FakeElement('div', rect(235, 7, 198, 38));
  const battleInfo = new FakeElement('div', rect(106, 277, 336, 90));
  const hand = new FakeElement('div', rect(110, 286, 300, 81));
  const thumbActions = new FakeElement('div', rect(304, 302, 138, 65));
  const quickDecision = new FakeElement('div', rect(350, 334, 88, 28));
  const quickCoil = new FakeElement('span', rect(410, 338, 24, 20));
  const jankenSlidePad = new FakeElement('div', rect(452, 208, 208, 160));
  const roulette = new FakeElement('div', rect(470, 158, 190, 44));
  const targetConfirm = new FakeElement('div', rect(230, 178, 210, 96));
  const secondaryActions = new FakeElement('div', rect(505, 8, 154, 36));
  const supportEntry = new FakeElement('button', rect(8, 285, 44, 36));
  const legacyPhaseStrip = new FakeElement('div', rect(0, 48, 667, 20));
  const detailsDrawer = new FakeElement('aside', rect(80, 40, 507, 294));
  const partner = new FakeElement('aside', rect(8, 177, 96, 98));
  const partnerVisual = new FakeElement('div', rect(0, 165, 150, 210));
  const manaArt = new FakeElement('section', rect(82, 205, 112, 112));

  root.appendChild(battleMap);
  battleMap.appendChild(board);
  battleMap.appendChild(boardPlayers);
  battleMap.appendChild(controlledCharacter);
  battleMap.appendChild(currentAction);
  battleMap.appendChild(battleScreenHud);
  battleScreenHud.appendChild(resources);
  battleMap.appendChild(public4p);
  battleMap.appendChild(battleInfo);
  battleInfo.appendChild(hand);
  battleInfo.appendChild(thumbActions);
  thumbActions.appendChild(quickDecision);
  quickDecision.appendChild(quickCoil);
  battleMap.appendChild(jankenSlidePad);
  battleMap.appendChild(roulette);
  battleMap.appendChild(targetConfirm);
  battleMap.appendChild(secondaryActions);
  secondaryActions.appendChild(supportEntry);
  battleMap.appendChild(legacyPhaseStrip);
  battleMap.appendChild(detailsDrawer);
  root.appendChild(partner);
  battleMap.appendChild(partnerVisual);
  battleMap.appendChild(manaArt);
  document.body.appendChild(root);

  const nodes = {
    battleMap, board, boardPlayers, controlledCharacter, currentAction, resources, battleScreenHud,
    public4p, hand, battleInfo, thumbActions, quickDecision, quickCoil, jankenSlidePad,
    roulette, targetConfirm, secondaryActions, supportEntry, legacyPhaseStrip, detailsDrawer, partner,
    partnerVisual, manaArt
  };
  for (const [key, selectors] of Object.entries(BATTLE_CURRENT_PLAYER_UI_SELECTORS)) {
    const node = nodes[key];
    if (node) bind(root, selectors.slice(0, 1), node);
  }
  return { document, root, nodes };
}

assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.schema, 'gameroad.battle-current-player-ui-runtime.v3');
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.presentationOnly, true);
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.gameplayAuthority, false);
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.gameStateWrite, false);
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.primaryViewport, '667x375');
assert.deepEqual(BATTLE_CURRENT_PLAYER_UI_RUNTIME.viewports, ['667x375', '1280x720', '390x844']);
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.productionHtmlMutationOwnedHere, false);
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.currentAction[0], '[data-battle-current-action="1"]');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.resources[0], '[data-battle-critical-resource-hud="1"]');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.partner[0], '#partnerAdviceChatPresentation');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.partnerVisual[0], '#battleAdvicePartnerStage');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.manaArt[0], '#battleManaArtR8');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.jankenSlidePad[0], '[data-battle-janken-slidepad="1"]');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.roulette[0], '[data-battle-playable-hand-row-roulette-live="1"]');
assert.equal(BATTLE_CURRENT_PLAYER_UI_SELECTORS.supportEntry[0], '#detailsBtn');
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.supportEntryPolicy, 'EXISTING_DETAILS_HISTORY_DECK_ENTRY_LOWER_LEFT');
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.attentionPolicy, 'ADVICE_WEAK_UNTIL_ACTIVE_WAITING_STRONG_ONLY_WHILE_WAITING_DETAILS_ON_DEMAND');
assert.equal(BATTLE_CURRENT_PLAYER_UI_RUNTIME.boardProtagonistPolicy, 'BOUND_EXISTING_PARTNER_VISUAL_AND_MANA_ART_WITHOUT_RELOCATION_OR_STATE_WRITE');

{
  const { document, root, nodes } = fixture();
  const originalResourceParent = nodes.resources.parentNode;
  const originalPartnerParent = nodes.partner.parentNode;
  const originalSupportEntryParent = nodes.supportEntry.parentNode;
  const originalPartnerVisualParent = nodes.partnerVisual.parentNode;
  const originalManaArtParent = nodes.manaArt.parentNode;
  const runtime = mountBattleCurrentPlayerUi({ document }, {
    initialState: {
      decisionActive: false,
      jankenActive: true,
      rouletteEnabled: true,
      adviceActive: false,
      waitingForOthers: false,
      stale: false,
      reconnecting: false,
      reducedMotion: true,
      lowPerf: true,
      focus: 'JANKEN_FOCUS'
    }
  });

  assert.equal(runtime.presentationOnly, true);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.gameStateWrite, false);
  assert.equal(root.getAttribute('data-gr-current-player-ui'), '1');
  assert.equal(root.getAttribute('data-gr-ui-authority'), 'presentation-only');
  assert.equal(root.getAttribute('data-gr-ui-layout'), 'world-primary-thumb-reserved');
  assert.equal(root.getAttribute('data-gr-board-protagonist'), '1');
  assert.equal(nodes.currentAction.getAttribute('data-gr-current-ui-zone'), 'current-action');
  assert.equal(nodes.resources.getAttribute('data-gr-current-ui-zone'), 'resources');
  assert.equal(nodes.partner.getAttribute('data-gr-current-ui-zone'), 'partner');
  assert.equal(nodes.partnerVisual.getAttribute('data-gr-current-ui-zone'), 'partner-visual');
  assert.equal(nodes.manaArt.getAttribute('data-gr-current-ui-zone'), 'mana-art');
  assert.equal(nodes.supportEntry.getAttribute('data-gr-current-ui-zone'), 'support-entry');
  assert.equal(nodes.jankenSlidePad.getAttribute('data-gr-current-ui-zone'), 'janken-slidepad');
  assert.equal(nodes.roulette.getAttribute('data-gr-current-ui-zone'), 'conditional-roulette');
  assert.equal(nodes.legacyPhaseStrip.getAttribute('data-gr-current-ui-disposition'), 'legacy-hidden');
  assert.equal(nodes.detailsDrawer.getAttribute('data-gr-current-ui-disposition'), 'on-demand');
  assert.equal(nodes.resources.parentNode, nodes.battleMap);
  assert.equal(nodes.partner.parentNode, nodes.battleMap);
  assert.equal(nodes.supportEntry.parentNode, nodes.battleMap);
  assert.equal(nodes.partnerVisual.parentNode, originalPartnerVisualParent);
  assert.equal(nodes.manaArt.parentNode, originalManaArtParent);
  assert.equal(nodes.secondaryActions.children.includes(nodes.supportEntry), false);
  assert.equal(document.head.children.length, 1);
  assert.match(document.head.children[0].textContent, /data-battle-janken-slidepad/);
  assert.match(document.head.children[0].textContent, /data-battle-playable-hand-row-roulette-live/);
  assert.match(document.head.children[0].textContent, /data-gr-current-ui-zone="support-entry"/);
  assert.match(document.head.children[0].textContent, /data-gr-current-ui-zone="partner-visual"/);
  assert.match(document.head.children[0].textContent, /data-gr-current-ui-zone="mana-art"/);
  assert.match(document.head.children[0].textContent, /backdrop-filter:none/);
  const styleText = document.head.children[0].textContent;
  const roulettePlacementRules = [...styleText.matchAll(/\[data-battle-playable-hand-row-roulette-live="1"\]\{([^}]*)\}/g)]
    .map((match) => match[1]);
  assert.ok(roulettePlacementRules.length >= 3);
  for (const rule of roulettePlacementRules) {
    assert.doesNotMatch(rule, /(?:^|;)(?:left|right|top|bottom|transform-origin):/);
  }
  const partnerVisualRules = [...styleText.matchAll(/\[data-gr-current-ui-zone="partner-visual"\]\{([^}]*)\}/g)]
    .map((match) => match[1]);
  assert.ok(partnerVisualRules.length >= 3);
  for (const rule of partnerVisualRules) {
    assert.doesNotMatch(rule, /(?:^|;)(?:left|right|top|bottom):/);
  }
  const manaArtRules = [...styleText.matchAll(/\[data-gr-current-ui-zone="mana-art"\]\{([^}]*)\}/g)]
    .map((match) => match[1]);
  assert.ok(manaArtRules.length >= 3);
  for (const rule of manaArtRules) {
    assert.doesNotMatch(rule, /(?:^|;)(?:left|right|top|bottom):/);
  }
  assert.match(styleText, /\[data-gr-current-ui-zone="support-entry"\]\{[^}]*left:var\(--gr-ui-edge\)!important[^}]*bottom:calc\(var\(--gr-ui-edge\) \+ 46px\)!important/);
  assert.match(styleText, /\[data-gr-current-ui-zone="partner"\]\{[^}]*bottom:calc\(var\(--gr-ui-edge\) \+ 92px\)!important[^}]*opacity:\.22[^}]*pointer-events:none!important/);
  assert.match(styleText, /data-gr-advice-active="true"[\s\S]*?\[data-gr-current-ui-zone="partner"\]\{opacity:1;pointer-events:auto!important\}/);
  assert.match(styleText, /data-gr-waiting-for-others="true"[\s\S]*?#publicTurnHud\{opacity:1;filter:brightness\(1\.08\)\}/);
  assert.match(styleText, /data-gr-waiting-for-others="true"[\s\S]*?\[data-gr-current-ui-zone="current-action"\]\{[^}]*border-color:/);
  assert.match(styleText, /\[data-gr-current-ui-zone="details-on-demand"\]\[hidden\]\{display:none!important\}/);
  assert.match(styleText, /\[data-gr-current-ui-zone="partner-visual"\]\{width:clamp\(132px,15vw,190px\)!important;height:min\(34vh,245px\)!important\}/);
  assert.match(styleText, /\[data-gr-current-ui-zone="mana-art"\]\{--r8-size:clamp\(84px,8\.5vw,108px\)!important;width:var\(--r8-size\)!important;height:var\(--r8-size\)!important\}/);
  assert.match(styleText, /\.planBox\{[^}]*transform:none!important/);
  assert.match(styleText, /\.battleRail\{[^}]*max-width:min\(28vw,340px\)!important[^}]*transform:none!important/);
  assert.match(styleText, /data-battle-janken-slidepad=\"1\"\]\{[^}]*width:var\(--gr-thumb-w\)!important[^}]*height:var\(--gr-thumb-h\)!important/);
  assert.match(styleText, /@media\(max-height:430px\)[\s\S]*\[data-gr-current-ui-zone="partner-visual"\]\{width:112px!important;height:160px!important\}/);
  assert.match(styleText, /@media\(max-height:430px\)[\s\S]*\[data-gr-current-ui-zone="mana-art"\]\{--r8-size:84px!important\}/);
  assert.match(styleText, /@media\(max-width:520px\)[\s\S]*\.battleInfo\{[^}]*right:calc\(var\(--gr-thumb-w\) \+ var\(--gr-ui-edge\) \+ var\(--gr-ui-gap\)\)!important/);
  assert.match(styleText, /@media\(max-width:520px\)[\s\S]*\[data-gr-current-ui-zone="support-entry"\]\{[^}]*bottom:calc\(28vh \+ var\(--gr-ui-edge\) \+ var\(--gr-ui-gap\) \+ 46px\)!important/);
  assert.match(styleText, /@media\(max-width:520px\)[\s\S]*\[data-gr-current-ui-zone="partner"\]\{[^}]*bottom:calc\(28vh \+ var\(--gr-ui-edge\) \+ var\(--gr-ui-gap\) \+ 92px\)!important/);
  assert.match(styleText, /@media\(max-width:520px\)[\s\S]*\[data-gr-current-ui-zone="partner-visual"\]\{width:96px!important;height:154px!important\}/);
  assert.match(styleText, /@media\(max-width:520px\)[\s\S]*\[data-gr-current-ui-zone="mana-art"\]\{--r8-size:82px!important\}/);
  assert.match(styleText, /@media\(max-width:520px\)[\s\S]*\.battleRail\{[^}]*top:118px!important[^}]*max-width:none!important/);
  assert.equal(styleText.includes('.battleRail{top:144px!important;bottom:auto!important;max-width:168px!important}'), true);

  assert.match(styleText, /@media\(max-width:520px\) and \(orientation:portrait\)\{[\s\S]*?\[data-gr-current-ui-zone="current-action"\]\{transform:translateY\(6px\)!important\}/);
  const snapshot = runtime.inspect();
  assert.equal(snapshot.boardProtagonist, true);
  assert.deepEqual(snapshot.resolvedLiveConsumers, {
    currentAction: true,
    resources: true,
    partner: true,
    supportEntry: true,
    jankenSlidePad: true,
    roulette: true,
    partnerVisual: true,
    manaArt: true
  });
  assert.equal(snapshot.collisions.handVsJanken, false);
  assert.equal(snapshot.collisions.thumbActionsVsJanken, false);
  assert.equal(snapshot.collisions.rouletteVsJanken, false);
  assert.equal(snapshot.collisions.targetVsJanken, false);
  assert.equal(snapshot.collisions.resourcesVsHand, false);
  assert.equal(snapshot.collisions.partnerVsHand, false);
  assert.equal(snapshot.collisions.supportEntryVsHand, false);
  assert.equal(snapshot.collisions.supportEntryVsResources, false);
  assert.equal(snapshot.collisions.supportEntryVsPartner, false);
  assert.deepEqual(snapshot.attentionState, {
    adviceActive: false,
    waitingForOthers: false,
    adviceDefaultWeak: true,
    fourPlayerPublicDefaultWeak: true
  });
  assert.equal(root.dataset.grRouletteEnabled, 'true');
  assert.equal(root.dataset.grAdviceActive, 'false');
  assert.equal(root.dataset.grWaitingForOthers, 'false');
  assert.equal(root.dataset.grReducedMotion, 'true');
  assert.equal(root.dataset.grLowPerf, 'true');
  assert.equal(root.dataset.grFocus, 'JANKEN_FOCUS');

  const attention = runtime.sync({
    stale: true,
    reconnecting: true,
    rouletteEnabled: false,
    adviceActive: true,
    waitingForOthers: true
  });
  assert.equal(root.dataset.grStale, 'true');
  assert.equal(root.dataset.grReconnecting, 'true');
  assert.equal(root.dataset.grRouletteEnabled, 'false');
  assert.equal(root.dataset.grAdviceActive, 'true');
  assert.equal(root.dataset.grWaitingForOthers, 'true');
  assert.deepEqual(attention.attentionState, {
    adviceActive: true,
    waitingForOthers: true,
    adviceDefaultWeak: false,
    fourPlayerPublicDefaultWeak: false
  });

  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(root.hasAttribute('data-gr-current-player-ui'), false);
  assert.equal(root.hasAttribute('data-gr-board-protagonist'), false);
  assert.equal(nodes.resources.parentNode, originalResourceParent);
  assert.equal(nodes.partner.parentNode, originalPartnerParent);
  assert.equal(nodes.supportEntry.parentNode, originalSupportEntryParent);
  assert.equal(nodes.partnerVisual.parentNode, originalPartnerVisualParent);
  assert.equal(nodes.manaArt.parentNode, originalManaArtParent);
  assert.equal(document.head.children.length, 0);
}

{
  const root = new FakeElement('section');
  const document = new FakeDocument(root);
  const legacyAction = new FakeElement('div');
  const legacyResource = new FakeElement('div');
  root.selectorMap.set('.battleTopStatus', legacyAction);
  root.selectorMap.set('.resourceStrip', legacyResource);
  const runtime = mountBattleCurrentPlayerUi({ document });
  assert.equal(runtime.surfaces.currentAction, legacyAction);
  assert.equal(runtime.surfaces.resources, legacyResource);
  runtime.destroy();
}

{
  const document = new FakeDocument();
  assert.throws(
    () => mountBattleCurrentPlayerUi({ document }, {}),
    /BATTLE_CURRENT_PLAYER_UI_ROOT_REQUIRED/
  );
}

{
  const { document, root } = fixture();
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
  const { document, root } = fixture();
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

console.log('battle-current-player-ui-runtime: live-consumer focused tests passed');