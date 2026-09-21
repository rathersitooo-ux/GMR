import assert from 'node:assert/strict';
import { projectBattleActionOrderChain } from '../browser/battle-action-order-presentation-core.mjs';
import { createBattleScreenModel } from '../browser/battle-screen-presentation-core.mjs';
import {
  BATTLE_SCREEN_RUNTIME,
  mountBattleScreenExternalSurface,
  resolveViewerLocalPlayedCardArt
} from '../browser/battle-screen-runtime-mount.mjs';

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
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  querySelector(selector) {
    if (selector === '[data-role="fanart-local-skin-overlay"]') {
      return walk(this, node => node !== this && node.dataset?.role === 'fanart-local-skin-overlay');
    }
    if (selector === '[data-physical-card-id]') {
      return walk(this, node => node !== this && typeof node.dataset?.physicalCardId === 'string');
    }
    if (selector === '[data-janken-role]') {
      return walk(this, node => node !== this && typeof node.dataset?.jankenRole === 'string');
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
    if (selector === '[data-gr-janken-focus-runtime]') {
      return walk(this.body, node => node.attributes?.has('data-gr-janken-focus-runtime'));
    }
    return null;
  }
  querySelectorAll(selector) {
    if (selector !== '#collectionGrid [data-id]') return [];
    const grid = this.getElementById('collectionGrid');
    return grid?.children?.filter(node => typeof node.dataset?.id === 'string') ?? [];
  }
}

const participants = [
  { id: 'P1', label: 'A-1', team: 'A' },
  { id: 'P2', label: 'A-2', team: 'A' },
  { id: 'P3', label: 'B-1', team: 'B' },
  { id: 'P4', label: 'B-2', team: 'B' }
];

const document = new FakeDocument();
const collectionGrid = document.createElement('section');
collectionGrid.id = 'collectionGrid';
const collectionC1 = document.createElement('article');
collectionC1.dataset.id = 'C1';
const localC1Art = document.createElement('img');
localC1Art.dataset.role = 'fanart-local-skin-overlay';
localC1Art.src = 'blob:gameroad-local-c1';
collectionC1.appendChild(localC1Art);
collectionGrid.appendChild(collectionC1);
document.body.appendChild(collectionGrid);
assert.deepEqual(resolveViewerLocalPlayedCardArt(document, 'C1'), {
  src: 'blob:gameroad-local-c1',
  source: 'viewer_local'
});
assert.equal(resolveViewerLocalPlayedCardArt(document, 'C2'), null);

const battleMap = document.createElement('section');
battleMap.id = 'battleMap';
document.body.appendChild(battleMap);
const root = document.createElement('main');
root.setAttribute('data-gr-battle-screen-root', '');
document.body.appendChild(root);
const cinematicCharacterCalls = [];
const cinematicCharacterGlobal = {
  document,
  GAMEROAD_PARTNER_STATE: { player: () => ({ id: 'partner.naki' }) },
  GameRoadThreeCharRuntime: {
    mount(host, options) {
      const mount = { host, characterId: options.characterId, state: options.state };
      cinematicCharacterCalls.push({ type: 'mount', characterId: options.characterId, state: options.state, allowNetwork: options.allowNetwork });
      return mount;
    },
    setState(mount, state, options) {
      mount.state = state;
      cinematicCharacterCalls.push({ type: 'setState', characterId: mount.characterId, state, facing: options?.facing ?? null });
      return true;
    },
    unmount(mount) {
      cinematicCharacterCalls.push({ type: 'unmount', characterId: mount.characterId });
      return true;
    }
  },
  setTimeout(callback) { callback(); return 1; },
  clearTimeout() {}
};
const runtime = mountBattleScreenExternalSurface(cinematicCharacterGlobal, {
  root,
  viewerParticipantId: 'P1',
  cinematicCharacterByParticipant: { P4: 'partner.saasuna' }
});

assert.equal(runtime.presentationOnly, true);
assert.equal(runtime.gameplayAuthority, false);
assert.equal(runtime.gameStateWrite, false);
assert.equal(runtime.adoptedPhaseSurface, false);
assert.equal(runtime.adoptedResolutionSurface, false);
assert.equal(runtime.laneSurfaces.length, 4);
assert.equal(runtime.phaseSurface.id, 'battlePhaseSurface');
assert.equal(runtime.resolutionSurface.id, 'battleResolution');
assert.equal(runtime.planSlot.dataset.owner, 'caller');
assert.equal(runtime.phaseSurface.hidden, true);
assert.equal(runtime.hud.root.getAttribute('data-battle-r75-hud'), '1');
assert.equal(runtime.hud.root.dataset.authority, 'caller');
assert.equal(runtime.hud.settingsButton.dataset.action, 'settings');
assert.equal(runtime.hud.settingsButton.getAttribute('aria-label'), '設定');
assert.equal(runtime.hud.scoreValue.textContent, 'X');
assert.equal(runtime.hud.hateValue.textContent, 'XXX');
assert.equal(runtime.hud.turnValue.textContent, 'XX');
assert.equal(runtime.hud.loadValue.textContent, '?');
assert.equal(runtime.hud.scoreValue.dataset.resolved, 'false');
assert.equal(runtime.hud.hateValue.dataset.resolved, 'false');
assert.equal(runtime.hud.turnValue.dataset.resolved, 'false');
assert.equal(runtime.hud.loadValue.dataset.resolved, 'false');
assert.equal(runtime.hud.chain.children.length, 0);
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'idle');
assert.ok(runtime.resourceHud);
assert.equal(runtime.resourceHud.resourceAuthority, 'CALLER_ONLY');
assert.equal(runtime.resourceHud.gameStateWrite, false);
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '—');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '—');
assert.ok(runtime.currentActionCue);
assert.equal(runtime.currentActionCue.getAttribute('data-battle-current-action'), '1');
assert.equal(runtime.currentActionCue.getAttribute('role'), 'status');
assert.equal(runtime.currentActionCue.getAttribute('aria-live'), 'polite');
assert.equal(runtime.currentActionCue.dataset.presentationOnly, 'true');
assert.equal(runtime.currentActionCue.dataset.authority, 'accepted-public-model-only');
assert.equal(runtime.currentActionCue.hidden, true);
assert.ok(runtime.causalTrace);
assert.equal(runtime.causalTrace.getAttribute('data-battle-causal-trace'), '1');
assert.equal(runtime.causalTrace.getAttribute('role'), 'status');
assert.equal(runtime.causalTrace.getAttribute('aria-live'), 'polite');
assert.equal(runtime.causalTrace.dataset.presentationOnly, 'true');
assert.equal(runtime.causalTrace.dataset.authority, 'accepted-causal-return-stages-only');
assert.equal(runtime.causalTrace.hidden, true);
assert.ok(runtime.progressGuide);
assert.equal(runtime.progressGuide.getAttribute('data-battle-progress-guide'), '1');
assert.equal(runtime.progressGuide.getAttribute('aria-label'), 'ROADからGOALへの進行方向');
assert.equal(runtime.progressGuide.dataset.presentationOnly, 'true');
assert.equal(runtime.progressGuide.dataset.authority, 'existing-road-goal-meaning-only');
assert.equal(runtime.progressGuide.parentNode, runtime.phaseSurface);
assert.deepEqual(runtime.progressGuide.children.map(node => node.textContent), ['GOAL', '', 'ROAD']);
assert.ok(runtime.cinematicOrderRail);
assert.equal(runtime.cinematicOrderRail.getAttribute('data-battle-cinematic-order'), '1');
assert.equal(runtime.cinematicOrderRail.dataset.presentationOnly, 'true');
assert.equal(runtime.cinematicOrderRail.dataset.authority, 'accepted-causal-processing-order-only');
assert.equal(runtime.cinematicOrderRail.hidden, true);
assert.equal(runtime.cinematicOrderRail.children.length, 0);
assert.equal(runtime.cinematicOrderRail.parentNode, runtime.phaseSurface);
assert.ok(runtime.cinematicDuel);
assert.equal(runtime.cinematicDuel.getAttribute('data-battle-cinematic-duel'), '1');
assert.equal(runtime.cinematicDuel.dataset.presentationOnly, 'true');
assert.equal(runtime.cinematicDuel.dataset.authority, 'model-lane-role-only-no-target-inference');
assert.equal(runtime.cinematicDuel.hidden, true);
assert.equal(runtime.cinematicDuel.children.length, 0);
assert.equal(runtime.cinematicDuel.parentNode, runtime.phaseSurface);
assert.ok(runtime.cinematicEnvironment);
assert.equal(runtime.cinematicEnvironment.getAttribute('data-battle-cinematic-environment'), '1');
assert.equal(runtime.cinematicEnvironment.dataset.presentationOnly, 'true');
assert.equal(runtime.cinematicEnvironment.dataset.authority, 'presentation-context-local-visual-only-no-gameplay-authority');
assert.equal(runtime.cinematicEnvironment.hidden, true);
assert.equal(runtime.cinematicEnvironment.parentNode, runtime.phaseSurface);
assert.deepEqual(runtime.cinematicEnvironment.children.map(node => node.dataset.layer), ['background-distant', 'ground-terrain', 'lighting-flash']);
assert.ok(runtime.fieldLandmark);
assert.equal(runtime.fieldLandmark.parentNode, runtime.phaseSurface);
assert.equal(runtime.fieldLandmark.hidden, true);
assert.equal(runtime.fieldLandmark.getAttribute('data-battle-field-landmark'), '');
assert.equal(runtime.fieldLandmark.dataset.presentationOnly, 'true');
assert.equal(runtime.fieldLandmark.dataset.authority, 'existing-field-selection-id-only');

const runtimeStyle = document.getElementById('gameroad-battle-screen-runtime-r1-style');
assert.ok(runtimeStyle);
assert.ok(runtimeStyle.textContent.includes('.grBattleScreenAdoptedOverlay{position:absolute;inset:0;z-index:3'));
assert.ok(runtimeStyle.textContent.includes('background:transparent;color:inherit;font-family:inherit;pointer-events:none'));
assert.ok(runtimeStyle.textContent.includes('#battlePhaseSurface{position:static!important;inset:auto!important;z-index:auto!important;overflow:visible!important;background:none!important;pointer-events:none!important;display:contents}'));
assert.ok(runtimeStyle.textContent.includes('#battlePhaseSurface[hidden]{display:none!important}'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] #battlePhaseSurface::before,[data-gr-battle-screen="1"] #battlePhaseSurface::after{content:none!important;display:none!important}'));
assert.equal(runtimeStyle.textContent.includes('#battlePhaseSurface{position:absolute;inset:0;z-index:3;overflow:hidden;background:'), false);
assert.equal(runtimeStyle.textContent.includes('#battlePhaseSurface::before{content:"";position:absolute;'), false);
assert.ok(runtimeStyle.textContent.includes('left:40%;height:clamp(86px,15vh,116px);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr)'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-screen-causal-grid]::before'));
assert.ok(runtimeStyle.textContent.includes('clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]::before{content:"";display:none;'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-screen-causal-grid] > [data-battle-screen-lane]{left:0!important;top:0!important}'));
assert.ok(runtimeStyle.textContent.includes('[data-viewer-role=\"self\"]{border-color:transparent'));
assert.ok(runtimeStyle.textContent.includes('.grBattleLaneViewerRole'));
assert.ok(runtimeStyle.textContent.includes('@media(max-height:470px) and (orientation:landscape)'));
assert.ok(runtimeStyle.textContent.includes('@media(max-height:420px){[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{top:78px;bottom:auto;height:72px;left:36%;right:4px;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}'));
assert.ok(runtimeStyle.textContent.includes('.battle .royalUsageStrip{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:151px!important;gap:2px!important}'));
assert.ok(runtimeStyle.textContent.includes('@media(max-width:540px){[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{left:4px;right:4px;gap:3px;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}'));
assert.ok(runtimeStyle.textContent.includes('@media(max-width:540px) and (orientation:portrait){[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{top:88px;right:8px;bottom:96px;left:8px;height:auto;gap:6px;grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr))}'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]::before{display:none}'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] [data-battle-screen-lane]{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(20px,auto);'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] #battleResolution{left:8px;right:8px;bottom:12px;transform:none;max-width:none}'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudSettings{pointer-events:auto'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudChainArrow'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudLoad'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudPlayedCardArt'));
assert.ok(runtimeStyle.textContent.includes('.grBattleLanePublicCard'));
assert.ok(runtimeStyle.textContent.includes('.grBattleCinematicOrderCard'));
assert.ok(runtimeStyle.textContent.includes('data-battle-cinematic-order'));
assert.ok(runtimeStyle.textContent.includes('grBattleCinematicStrike'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-cinematic-environment]'));
assert.ok(runtimeStyle.textContent.includes('.grBattleCinematicEnvironmentDistant'));
assert.ok(runtimeStyle.textContent.includes('.grBattleCinematicEnvironmentGround'));
assert.ok(runtimeStyle.textContent.includes('.grBattleCinematicEnvironmentLight'));
assert.ok(runtimeStyle.textContent.includes('@keyframes grBattleCinematicEnvironmentDrift'));
assert.ok(runtimeStyle.textContent.includes('@keyframes grBattleCinematicEnvironmentImpact'));
assert.ok(runtimeStyle.textContent.includes('[data-motion="static_only"] .grBattleCinematicEnvironmentDistant'));
assert.ok(runtimeStyle.textContent.includes('grBattleCinematicCompare'));
assert.ok(runtimeStyle.textContent.includes('grBattleCinematicWinner'));
assert.ok(runtimeStyle.textContent.includes('data-final-state="resolved-win"'));
assert.ok(runtimeStyle.textContent.includes('color:transparent!important;font-size:0!important'));
assert.ok(runtimeStyle.textContent.includes('[data-public-card-visible'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-current-action]'));
assert.ok(runtimeStyle.textContent.includes('max-width:min(42vw,420px)'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-causal-trace]'));
assert.ok(runtimeStyle.textContent.includes('.grBattleCausalTraceStage'));
assert.ok(runtimeStyle.textContent.includes('@keyframes grBattleCausalTraceStage'));
assert.ok(runtimeStyle.textContent.includes('[data-motion="static_causal_trace"] .grBattleCausalTraceStage{animation:none!important'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-progress-guide]'));
assert.ok(runtimeStyle.textContent.includes('.grBattleProgressArrow::before{content:"◀"'));
assert.ok(runtimeStyle.textContent.includes('.grBattleProgressArrow::before{content:"▲"'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-shield-slot][data-board-return-target="true"]'));
assert.ok(runtimeStyle.textContent.includes('@keyframes grBattleShieldReturn'));
assert.ok(runtimeStyle.textContent.includes('[data-motion="static_only"] [data-battle-shield-slot][data-board-return-target="true"]{animation:none!important;transform:none!important}'));
for (const fieldId of ['FIELD-01', 'FIELD-02', 'FIELD-03', 'FIELD-04', 'FIELD-05', 'FIELD-08', 'FIELD-09']) {
  assert.ok(runtimeStyle.textContent.includes(`[data-battle-field-landmark=\"${fieldId}\"]`));
}
assert.ok(runtimeStyle.textContent.includes('clip-path:polygon'));
assert.ok(runtimeStyle.textContent.includes('repeating-linear-gradient'));
assert.ok(runtimeStyle.textContent.includes('@media(max-width:540px) and (orientation:portrait){[data-gr-battle-screen=\"1\"] [data-battle-field-landmark]'));
assert.ok(runtimeStyle.textContent.includes('@media(max-height:420px) and (orientation:landscape){[data-gr-battle-screen=\"1\"] [data-battle-field-landmark]'));
assert.equal(runtimeStyle.textContent.includes('10000'), false);
assert.equal(runtimeStyle.textContent.includes('1000 / 100 / 10 / 1'), false);
assert.equal(runtimeStyle.textContent.includes('data-role="loser"'), false);
assert.equal(runtimeStyle.textContent.includes('♥'), false);

// X9: LOAD must preserve the exact physical card identity and move to the
// already-played chain only after that same cardId is appended once.
const hudPlayedCardIds = () => runtime.hud.chain.children
  .map(node => node.dataset?.cardId)
  .filter(Boolean);

runtime.renderHud({
  playedCards: [
    { label: 'identity-missing-must-drop' },
    { cardId: 'C1', label: 'CARD-1' }
  ]
});
assert.deepEqual(hudPlayedCardIds(), ['C1']);
assert.equal(runtime.hud.root.dataset.playedCardCount, '1');
assert.equal(runtime.hud.chain.children.some(node => node.dataset?.cardId === 'played-1'), false);

const played123 = [
  { cardId: 'C1', label: 'CARD-1' },
  { cardId: 'C2', label: 'CARD-2' },
  { cardId: 'C3', label: 'CARD-3' }
];
runtime.renderHud({ playedCards: played123 });

const focusHost = document.createElement('div');
focusHost.setAttribute('data-gr-janken-focus-runtime', '');
focusHost.dataset.surface = 'COMMITTING';
const focusCardC4 = document.createElement('div');
focusCardC4.dataset.physicalCardId = 'C4';
focusCardC4.dataset.cardIdentitySource = 'PACKAGE_CARD_ID_ONLY';
focusCardC4.dataset.nativeSuit = 'SP';
focusCardC4.dataset.printedRank = '7';
const focusRoleC4 = document.createElement('span');
focusRoleC4.dataset.jankenRole = 'ROCK';
focusCardC4.appendChild(focusRoleC4);
focusHost.appendChild(focusCardC4);
root.appendChild(focusHost);

runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'committing');
assert.notEqual(runtime.hud.loadCard.dataset.cardId, 'C4');

focusHost.hidden = true;
focusHost.replaceChildren();
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'accepted-load');
assert.equal(runtime.hud.loadCard.dataset.cardId, 'C4');
assert.equal(runtime.hud.loadCard.dataset.nativeSuit, 'SP');
assert.equal(runtime.hud.loadCard.dataset.displayNumber, '7');
assert.equal(runtime.hud.loadValue.textContent, 'グー');

runtime.renderHud({ playedCards: played123 });
assert.equal(runtime.hud.loadCard.dataset.cardId, 'C4');
assert.deepEqual(hudPlayedCardIds(), ['C1', 'C2', 'C3']);

const played1234 = [...played123, { cardId: 'C4', label: 'CARD-4' }];
runtime.renderHud({ playedCards: played1234 });
assert.equal(runtime.hud.loadCard.hidden, true);
assert.deepEqual(hudPlayedCardIds(), ['C1', 'C2', 'C3', 'C4']);
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'moved-to-played-chain');
assert.equal(runtime.hud.root.dataset.loadLineageCardId, 'C4');

focusHost.hidden = false;
focusHost.dataset.surface = 'COMMITTING';
const focusCardC5 = document.createElement('div');
focusCardC5.dataset.physicalCardId = 'C5';
focusCardC5.dataset.cardIdentitySource = 'GLOBAL_CARD_DATA_EXACT_ID';
const focusRoleC5 = document.createElement('span');
focusRoleC5.dataset.jankenRole = 'PAPER';
focusCardC5.appendChild(focusRoleC5);
focusHost.appendChild(focusCardC5);
runtime.syncLoadCardFocusDom();
focusHost.hidden = true;
focusHost.replaceChildren();
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.loadCard.dataset.cardId, 'C5');

const playedWrong = [...played1234, { cardId: 'C6', label: 'CARD-6' }];
runtime.renderHud({ playedCards: playedWrong });
assert.equal(runtime.hud.loadCard.hidden, true);
assert.deepEqual(hudPlayedCardIds(), ['C1', 'C2', 'C3', 'C4', 'C6']);
assert.equal(hudPlayedCardIds().includes('C5'), false);
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'continuity-unresolved');
assert.equal(runtime.hud.root.dataset.loadLineageCardId, 'C5');

focusHost.hidden = false;
focusHost.dataset.surface = 'COMMITTING';
const focusCardC7 = document.createElement('div');
focusCardC7.dataset.physicalCardId = 'C7';
focusCardC7.dataset.cardIdentitySource = 'PACKAGE_CARD_ID_ONLY';
focusHost.appendChild(focusCardC7);
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'committing');
focusHost.dataset.surface = 'LOAD_FOCUS';
focusHost.replaceChildren();
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'idle');
assert.notEqual(runtime.hud.loadCard.dataset.cardId, 'C7');

assert.equal(BATTLE_SCREEN_RUNTIME.loadCardLiveProjectionSource, 'EXISTING_FOCUS_DOM_EXACT_PHYSICAL_CARD_ID_ACCEPTED_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.loadCardFocusDomMutation, false);
assert.equal(BATTLE_SCREEN_RUNTIME.viewerRoleAuthority, 'CALLER_EXPLICIT_PARTICIPANT_ID_ONLY_NO_ORDER_INFERENCE');
assert.equal(BATTLE_SCREEN_RUNTIME.viewerRoleFallback, 'NEUTRAL_PUBLIC_SUMMARIES');
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicEnvironmentAuthority, 'PRESENTATION_CONTEXT_LOCAL_VISUAL_OR_PROCEDURAL_FALLBACK_ONLY_NO_GAMEPLAY_AUTHORITY');
assert.deepEqual(BATTLE_SCREEN_RUNTIME.cinematicEnvironmentLayers, ['BACKGROUND_DISTANT', 'GROUND_TERRAIN', 'LIGHTING_FLASH']);
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicEnvironmentNetwork, false);
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicEnvironmentFormalArt, false);
assert.equal(BATTLE_SCREEN_RUNTIME.viewerSelfPresentation, 'SAME_AUTHORITATIVE_PARTICIPANT_NO_DUPLICATE_PEER_ENTITY');

const neutralRoot = document.createElement('main');
document.body.appendChild(neutralRoot);
const neutralRuntime = mountBattleScreenExternalSurface({ document }, { root: neutralRoot });
const neutralIdle = createBattleScreenModel({ participants });
neutralRuntime.render(neutralIdle);
assert.deepEqual(neutralRuntime.laneSurfaces.map(node => node.dataset.viewerRole), ['neutral', 'neutral', 'neutral', 'neutral']);
assert.equal(neutralRuntime.grid.dataset.viewerRoleResolution, 'not-provided');
assert.equal(neutralRuntime.grid.dataset.viewerParticipantId, undefined);
assert.deepEqual(neutralRuntime.laneSurfaces.map(node => node.children[0].children[0].hidden), [true, true, true, true]);
neutralRuntime.destroy();

const idle = createBattleScreenModel({ participants });
runtime.render(idle);
assert.equal(runtime.shell.dataset.mode, 'MATCH_PLAN');
assert.equal(runtime.shell.hidden, false);
assert.equal(runtime.phaseSurface.hidden, true);
assert.equal(runtime.hud.root.hidden, false);
assert.equal(runtime.currentActionCue.hidden, false);
assert.equal(runtime.currentActionCue.textContent, '今：選択');
assert.equal(runtime.currentActionCue.dataset.phase, 'plan');
assert.equal(runtime.currentActionCue.dataset.boardReturnDestination, undefined);
assert.equal(runtime.planSlot.hidden, false);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['idle', 'idle', 'idle', 'idle']);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.viewerRole), ['self', 'peer', 'peer', 'peer']);
assert.equal(runtime.grid.dataset.viewerRoleResolution, 'caller-explicit');
assert.equal(runtime.grid.dataset.viewerParticipantId, 'P1');
assert.equal(runtime.laneSurfaces[0].getAttribute('aria-label'), 'A-1（自分）');
assert.equal(runtime.laneSurfaces[0].children[0].children[0].textContent, '自分');
const roleSurfaces = runtime.laneSurfaces.map(node => node.children[1]);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [true, true, true, true]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['', '', '', '']);
assert.equal(runtime.publicCardSurfaces.length, 4);
assert.deepEqual(runtime.publicCardSurfaces.map(node => node.hidden), [true, true, true, true]);

const fourPublicCards = [
  { playerId: 'P1', cardId: 'C1', displayNumber: 5, hand: 'PAPER' },
  { playerId: 'P2', cardId: 'C2', displayNumber: 2, hand: 'ROCK' },
  { playerId: 'P3', cardId: 'C3', displayNumber: 9, hand: null },
  { playerId: 'P4', cardId: 'C4', displayNumber: 7, hand: 'SCISSORS' }
];
const revealPublicPlan = {
  presentationOnly: true,
  authorityBoundary: 'accepted_public_event_only',
  eventId: 'reveal-public-1',
  kind: 'reveal',
  transition: 'ENTRY',
  groupTargets: [],
  importance: 'ambient',
  publicData: { playerIds: ['P1', 'P2', 'P3', 'P4'], publicCards: fourPublicCards }
};
const revealPublic = createBattleScreenModel({ participants, plan: revealPublicPlan });
runtime.render(revealPublic);
assert.deepEqual(runtime.publicCardSurfaces.map(node => node.hidden), [false, false, false, false]);
assert.deepEqual(runtime.publicCardSurfaces.map(node => node.dataset.playerId), ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(runtime.publicCardSurfaces.map(node => node.dataset.cardId), ['C1', 'C2', 'C3', 'C4']);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.publicCardVisible), ['true', 'true', 'true', 'true']);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.viewerRole), ['self', 'peer', 'peer', 'peer']);
assert.equal(runtime.publicCardSurfaces[0].hidden, false);
assert.equal(runtime.publicCardSurfaces[0].dataset.artSource, 'viewer_local');
assert.equal(runtime.publicCardSurfaces[0].children[0].tagName, 'IMG');
assert.equal(runtime.publicCardSurfaces[0].children[0].src, 'blob:gameroad-local-c1');
assert.equal(runtime.publicCardSurfaces[0].dataset.displayNumber, '5');
assert.equal(runtime.publicCardSurfaces[0].dataset.hand, 'PAPER');
assert.equal(runtime.publicCardSurfaces[0].getAttribute('aria-label'), '公開カード C1 / 5 / パー');
assert.equal(runtime.publicCardSurfaces[1].children[0].className, 'grBattleLanePublicCardFallback');
assert.equal(runtime.publicCardSurfaces[1].children[0].textContent, 'C2');
assert.equal(runtime.publicCardSurfaces[1].getAttribute('aria-label'), '公開カード C2 / 2 / グー');
assert.equal(runtime.cinematicOrderRail.hidden, true);
assert.equal(runtime.cinematicOrderRail.children.length, 0);

const attackPlan = {
  presentationOnly: true,
  authorityBoundary: 'accepted_public_event_only',
  eventId: 'attack-1',
  kind: 'attack',
  transition: 'ENTRY',
  groupTargets: ['P4'],
  importance: 'normal',
  publicData: { sourceId: 'P1', targetIds: ['P4'] }
};
const attack = createBattleScreenModel({
  participants,
  plan: attackPlan,
  persistentAfterstate: [
    { id: 'p4-lane', participantId: 'P4', text: '列進行 4' }
  ],
  returnIntent: 'MATCH_PLAN'
});
runtime.resolutionSurface.textContent = 'EXISTING LIVE ADAPTER OWNS THIS CONTENT';
runtime.render(attack, {
  score: 12,
  hate: '00:18',
  turn: 4,
  loadJanken: 'rock',
  honey: 3,
  chipCount: 2,
  honeyDelta: 1,
  honeyDeltaSource: 'rank_number',
  playedCards: [
    { cardId: 'C1', label: 'CARD-1' },
    { cardId: 'C2', label: 'CARD-2' },
    { cardId: 'C3', label: 'CARD-3' }
  ]
});
await Promise.resolve();
await Promise.resolve();
assert.equal(runtime.phaseSurface.hidden, false);
assert.equal(runtime.shell.dataset.presentationMode, 'cinematic');
assert.equal(runtime.phaseSurface.dataset.battlePhasePresentation, 'FULLSCREEN_ANIMATION');
assert.equal(runtime.externalBattleMap, battleMap);
assert.equal(battleMap.style.visibility, 'hidden');
assert.equal(battleMap.style.pointerEvents, 'none');
assert.equal(battleMap.dataset.battlePhaseSuppressed, 'true');
assert.equal(battleMap.getAttribute('aria-hidden'), 'true');
assert.equal(runtime.hud.root.hidden, true);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.textContent, '');
assert.equal(runtime.currentActionCue.dataset.phase, undefined);
assert.equal(runtime.currentActionCue.dataset.eventId, undefined);
assert.equal(runtime.currentActionCue.dataset.boardReturnDestination, undefined);
assert.equal(runtime.progressGuide.hidden, true);
assert.equal(runtime.fieldLandmark.hidden, true);
assert.equal(runtime.planSlot.hidden, true);
assert.equal(runtime.shell.dataset.mode, 'BATTLE_PHASE');
assert.equal(runtime.shell.dataset.eventId, 'attack-1');
assert.equal(runtime.shell.dataset.boardReturnDestination, undefined);
assert.equal(runtime.phaseSurface.dataset.battleScreenInput, 'skip|public_info|accessibility');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.participantId), ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['source', 'idle', 'idle', 'target']);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [false, true, true, false]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['攻撃', '', '', '対象']);
assert.equal(runtime.cinematicDuel.hidden, false);
assert.equal(runtime.cinematicDuel.getAttribute('aria-hidden'), 'false');
assert.equal(runtime.cinematicDuel.dataset.eventId, 'attack-1');
assert.equal(runtime.cinematicDuel.dataset.sourceId, 'P1');
assert.equal(runtime.cinematicDuel.dataset.targetId, 'P4');
assert.equal(runtime.cinematicDuel.dataset.handoff, 'ENTRY');
assert.equal(runtime.cinematicDuel.dataset.conveyorTransition, 'ENTRY');
assert.equal(runtime.cinematicDuel.dataset.retainedParticipants, undefined);
assert.equal(runtime.cinematicDuel.dataset.incomingParticipants, 'P1|P4');
assert.equal(runtime.cinematicDuel.dataset.outgoingParticipants, undefined);
assert.equal(runtime.cinematicDuel.dataset.phase, 'attack');
assert.equal(runtime.cinematicDuel.dataset.transition, 'ENTRY');
assert.equal(runtime.cinematicDuel.dataset.saasunaMotionRuntime, 'gameroad.saasuna-battle-motion-core.v1');
assert.equal(runtime.cinematicDuel.dataset.sourceCharacterId, 'partner.naki');
assert.equal(runtime.cinematicDuel.dataset.targetCharacterId, 'partner.saasuna');
assert.equal(runtime.cinematicDuel.dataset.vfx, 'provisional-neutral-compressed-shot');
assert.equal(runtime.cinematicEnvironment.hidden, false);
assert.equal(runtime.cinematicEnvironment.getAttribute('aria-hidden'), 'false');
assert.equal(runtime.cinematicEnvironment.dataset.phase, 'attack');
assert.equal(runtime.cinematicEnvironment.dataset.eventId, 'attack-1');
assert.equal(runtime.cinematicEnvironment.dataset.assetMode, 'procedural-fallback');
assert.equal(runtime.cinematicEnvironment.children[0].dataset.asset, undefined);
assert.equal(runtime.cinematicEnvironment.children[1].dataset.asset, undefined);

const cinematicSides = runtime.cinematicDuel.children.filter(node => node.dataset.role);
const cinematicVfx = runtime.cinematicDuel.children.find(node => node.dataset.layer === 'vfx');
assert.deepEqual(cinematicSides.map(node => node.dataset.role), ['source', 'target']);
assert.deepEqual(cinematicSides.map(node => node.dataset.participantId), ['P1', 'P4']);
assert.deepEqual(cinematicSides.map(node => node.children[1].children[0].textContent), ['攻撃側', '受け側']);
assert.deepEqual(cinematicSides.map(node => node.children[1].children[1].textContent), ['A-1', 'B-2']);
assert.ok(cinematicVfx);
assert.equal(cinematicVfx.dataset.presentationOnly, 'true');
assert.equal(cinematicVfx.dataset.vfxKind, 'provisional-neutral-compressed-shot');
assert.equal(cinematicSides[0].children[0].dataset.visualKind, 'character-runtime');
assert.equal(cinematicSides[0].children[0].dataset.characterId, 'partner.naki');
assert.equal(cinematicSides[1].children[0].dataset.visualKind, 'character-runtime');
assert.equal(cinematicSides[1].children[0].dataset.characterId, 'partner.saasuna');
assert.equal(cinematicSides[1].children[0].dataset.motionVisualKind, 'provisional-keyframe-sheet');
assert.equal(cinematicSides[1].children[0].dataset.provisionalArt, 'true');
const saasunaMotionSurface = cinematicSides[1].children[0].children.find(
  node => node.dataset.role === 'saasuna-battle-motion-surface'
);
assert.ok(saasunaMotionSurface);
assert.equal(saasunaMotionSurface.dataset.motionState, 'HIT_RECOIL');
assert.equal(saasunaMotionSurface.children[0].dataset.keyframeId, 'wind-cut');
assert.equal(saasunaMotionSurface.children[3].hidden, false);
assert.equal(cinematicSides[0].children[0].children[0].getAttribute('data-battle-cinematic-character'), '');
assert.equal(cinematicSides[1].children[0].children[0].getAttribute('data-battle-cinematic-character'), '');
assert.deepEqual(
  cinematicCharacterCalls.filter(call => call.type === 'mount').map(call => [call.characterId, call.state, call.allowNetwork]),
  [['partner.naki', 'idle', false], ['partner.saasuna', 'idle', false]]
);
assert.ok(cinematicCharacterCalls.some(call => call.type === 'setState' && call.characterId === 'partner.naki' && call.state === 'attack'));
assert.ok(cinematicCharacterCalls.some(call => call.type === 'setState' && call.characterId === 'partner.naki' && call.state === 'idle'));
assert.ok(cinematicCharacterCalls.some(call => call.type === 'setState' && call.characterId === 'partner.saasuna' && call.state === 'idle'));
assert.equal(cinematicCharacterCalls.some(call => call.state === 'hit' || call.state === 'defeated'), false);

runtime.render(attack, null, {
  cinematicEnvironment: {
    distantUrl: './assets/visual/provisional/battle-forest.webp',
    groundUrl: 'blob:gameroad-battle-ground'
  }
});
await Promise.resolve();
await Promise.resolve();
assert.equal(runtime.cinematicEnvironment.dataset.assetMode, 'local-asset');
assert.equal(runtime.cinematicEnvironment.children[0].dataset.asset, 'true');
assert.equal(runtime.cinematicEnvironment.children[1].dataset.asset, 'true');
assert.ok(runtime.cinematicEnvironment.children[0].style.backgroundImage.includes('./assets/visual/provisional/battle-forest.webp'));
assert.ok(runtime.cinematicEnvironment.children[1].style.backgroundImage.includes('blob:gameroad-battle-ground'));

runtime.render(attack, null, {
  cinematicEnvironment: {
    distantUrl: 'https://example.invalid/remote.webp',
    groundUrl: 'javascript:alert(1)'
  }
});
await Promise.resolve();
await Promise.resolve();
assert.equal(runtime.cinematicEnvironment.dataset.assetMode, 'procedural-fallback');
assert.equal(runtime.cinematicEnvironment.children[0].dataset.asset, undefined);
assert.equal(runtime.cinematicEnvironment.children[1].dataset.asset, undefined);

const attack2 = createBattleScreenModel({
  participants,
  plan: {
    ...attackPlan,
    eventId: 'attack-2',
    transition: 'IMPACT_CARRY_RIGHT',
    groupTargets: ['P3'],
    publicData: { sourceId: 'P1', targetIds: ['P3'] }
  },
  persistentAfterstate: [],
  returnIntent: 'MATCH_PLAN'
});
runtime.render(attack2);
await Promise.resolve();
await Promise.resolve();
assert.equal(runtime.cinematicDuel.dataset.handoff, 'IMPACT_CARRY_RIGHT');
assert.equal(runtime.cinematicDuel.dataset.retainedParticipants, 'P1');
assert.equal(runtime.cinematicDuel.dataset.incomingParticipants, 'P3');
assert.equal(runtime.cinematicDuel.dataset.outgoingParticipants, 'P4');
assert.deepEqual(
  runtime.cinematicDuel.children.filter(node => node.dataset.role).map(node => node.dataset.movementIntent),
  ['REMAIN_STAGE', 'ENTER_STAGE']
);

runtime.render(attack, null, {
  cinematicMotionByParticipant: { P4: 'KNEE_PILLOW' }
});
await Promise.resolve();
await Promise.resolve();
const explicitSaasunaSurface = runtime.cinematicDuel.children
  .find(node => node.dataset.role === 'target')
  .children[0].children.find(node => node.dataset.role === 'saasuna-battle-motion-surface');
assert.equal(explicitSaasunaSurface.dataset.motionState, 'KNEE_PILLOW');

assert.equal(runtime.resolutionSurface.textContent, 'EXISTING LIVE ADAPTER OWNS THIS CONTENT');
assert.equal(runtime.resolutionSurface.dataset.battleScreenEventId, 'attack-1');
assert.equal(runtime.resolutionSurface.dataset.battleBoardReturnDestination, undefined);
assert.equal(runtime.hud.scoreValue.textContent, '12');
assert.equal(runtime.hud.hateValue.textContent, '00:18');
assert.equal(runtime.hud.turnValue.textContent, '4');
assert.equal(runtime.hud.loadValue.textContent, 'グー');
assert.equal(runtime.hud.scoreValue.dataset.resolved, 'true');
assert.equal(runtime.hud.hateValue.dataset.resolved, 'true');
assert.equal(runtime.hud.turnValue.dataset.resolved, 'true');
assert.equal(runtime.hud.loadValue.dataset.resolved, 'true');
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '3');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '2');
assert.equal(runtime.resourceHud.honeyCell.dataset.resolved, 'true');
assert.equal(runtime.resourceHud.chipCell.dataset.resolved, 'true');
assert.equal(runtime.resourceHud.honeyCell.children[2].textContent, '+1・rank_number');
assert.equal(runtime.resourceHud.honeyCell.children[2].hidden, false);
assert.equal(runtime.hud.root.dataset.playedCardCount, '3');
assert.equal(runtime.hud.chain.children.length, 5);
const playedCardNodes = runtime.hud.chain.children.filter(node => node.className === 'grBattleHudPlayedCard');
assert.deepEqual(playedCardNodes.map(node => node.dataset.cardId), ['C1', 'C2', 'C3']);
assert.equal(playedCardNodes[0].dataset.artSource, 'viewer_local');
assert.equal(playedCardNodes[0].getAttribute('aria-label'), 'CARD-1');
assert.equal(playedCardNodes[0].children.length, 1);
assert.equal(playedCardNodes[0].children[0].tagName, 'IMG');
assert.equal(playedCardNodes[0].children[0].src, 'blob:gameroad-local-c1');
assert.equal(playedCardNodes[0].children[0].getAttribute('aria-hidden'), 'true');
assert.equal(playedCardNodes[1].textContent, 'CARD-2');
assert.equal(playedCardNodes[1].dataset.artSource, undefined);
assert.deepEqual(
  runtime.hud.chain.children.filter(node => node.className === 'grBattleHudChainArrow').map(node => node.textContent),
  ['▷', '▷']
);

for (const fieldId of ['FIELD-01', 'FIELD-02', 'FIELD-03', 'FIELD-04', 'FIELD-05', 'FIELD-08', 'FIELD-09']) {
  root.dataset.battleFieldId = fieldId;
  runtime.render(attack);
  assert.equal(runtime.fieldLandmark.hidden, true);
  assert.equal(runtime.fieldLandmark.getAttribute('data-battle-field-landmark'), fieldId);
  assert.equal(runtime.fieldLandmark.dataset.fieldId, fieldId);
}
root.dataset.battleFieldId = 'FIELD-UNKNOWN';
runtime.render(attack);
assert.equal(runtime.fieldLandmark.hidden, true);
assert.equal(runtime.fieldLandmark.getAttribute('data-battle-field-landmark'), '');
root.dataset.battleFieldId = 'FIELD-01';
runtime.render(attack);
assert.equal(runtime.fieldLandmark.hidden, true);

const p4View = runtime.laneSurfaces[3];
const p4Afterstate = p4View.children[2];
assert.equal(p4Afterstate.children.length, 1);
assert.equal(p4Afterstate.children[0].textContent, '列進行 4');
assert.equal(p4Afterstate.children[0].dataset.afterstateId, 'p4-lane');

const settlePlan = {
  presentationOnly: true,
  authorityBoundary: 'accepted_public_event_only',
  eventId: 'settle-1',
  kind: 'settle',
  transition: 'CONTINUE',
  groupTargets: [],
  importance: 'ambient',
  publicData: {
    compoundAttackPackage: {
      schema: 'gameroad.battle-janken-compound-attack-package.v1',
      jankenHand: 'ROCK',
      cardId: 'C1',
      path: [{ nodeId: 'ROAD-A' }, { nodeId: 'ROAD-B' }],
      direction: 'LEFT',
      roadId: 'ROAD-01',
      battleId: 'BATTLE-01',
      opponentId: 'P3',
      shieldLane: 'R',
      shieldRef: 'shield:P3:R'
    }
  }
};
const settle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN' });
runtime.render(settle);
assert.equal(runtime.shell.dataset.presentationMode, 'cinematic');
assert.equal(runtime.phaseSurface.dataset.battlePhasePresentation, 'FULLSCREEN_ANIMATION');
assert.equal(runtime.hud.root.hidden, true);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.textContent, '');
assert.equal(runtime.currentActionCue.dataset.phase, undefined);
assert.equal(runtime.currentActionCue.dataset.boardReturnDestination, undefined);
assert.equal(runtime.currentActionCue.dataset.causalTraceKey, undefined);
assert.equal(runtime.currentActionCue.dataset.causalCardId, undefined);
assert.equal(runtime.currentActionCue.dataset.causalJanken, undefined);
assert.equal(runtime.cinematicDuel.hidden, true);
assert.equal(runtime.cinematicDuel.children.length, 0);
assert.equal(runtime.cinematicDuel.getAttribute('aria-hidden'), 'true');
assert.equal(runtime.cinematicEnvironment.hidden, false);
assert.equal(runtime.cinematicEnvironment.dataset.phase, 'settle');
assert.equal(runtime.cinematicEnvironment.dataset.assetMode, 'procedural-fallback');
assert.equal(runtime.shell.dataset.boardReturnDestination, 'P3:R');
assert.equal(runtime.phaseSurface.dataset.battleBoardReturnDestination, 'P3:R');
assert.equal(runtime.resolutionSurface.dataset.battleBoardReturnDestination, 'P3:R');
assert.equal(runtime.resolutionSurface.dataset.battleBoardReturnShieldRef, 'shield:P3:R');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['idle', 'idle', 'target', 'idle']);
assert.equal(runtime.shieldRails[2].dataset.boardReturnParticipant, 'true');
assert.equal(runtime.shieldRails[0].dataset.boardReturnParticipant, undefined);
const p3ShieldSlots = runtime.shieldRails[2].children;
assert.deepEqual(p3ShieldSlots.map(node => node.getAttribute('data-battle-shield-slot')), ['L', 'C', 'R']);
assert.deepEqual(p3ShieldSlots.map(node => node.dataset.boardReturnTarget), [undefined, undefined, 'true']);
assert.equal(p3ShieldSlots[2].dataset.boardReturnEventId, 'settle-1');
assert.equal(p3ShieldSlots[2].dataset.boardReturnDestination, 'P3:R');
assert.equal(p3ShieldSlots[2].getAttribute('aria-label'), 'Shield R → ROAD R、解決結果の帰着先');
assert.equal(runtime.shieldRails[3].children[2].dataset.boardReturnTarget, undefined);
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);
assert.equal(runtime.progressGuide.hidden, true);
assert.equal(runtime.fieldLandmark.hidden, true);

const acceptedActionOrder = projectBattleActionOrderChain({
  orderedCards: [
    { participantId: 'P2', cardId: 'C2', printedNumber: 2, jankenHand: 'SCISSORS' },
    { participantId: 'P4', cardId: 'C4', printedNumber: 4, jankenHand: 'PAPER' },
    { participantId: 'P1', cardId: 'C1', printedNumber: 7, jankenHand: 'ROCK' },
    { participantId: 'P3', cardId: 'C3', printedNumber: 9, jankenHand: 'ROCK' }
  ],
  resolution: {
    processingOrder: ['P2', 'P4', 'P1', 'P3'],
    resolvedWinners: ['P3'],
    invalidated: ['P2', 'P4', 'P1'],
    unresolvedSurvivors: [],
    steps: [
      { processedPlayerId: 'P2', winningHand: null, resolvedWinner: false, invalidated: [], survivors: ['P2', 'P4', 'P1', 'P3'] },
      { processedPlayerId: 'P4', winningHand: null, resolvedWinner: false, invalidated: ['P2'], survivors: ['P4', 'P1', 'P3'] },
      { processedPlayerId: 'P1', winningHand: null, resolvedWinner: false, invalidated: ['P4'], survivors: ['P1', 'P3'] },
      { processedPlayerId: 'P3', winningHand: 'ROCK', resolvedWinner: true, invalidated: ['P1'], survivors: ['P3'] }
    ]
  }
});

const revealWithAcceptedOrder = createBattleScreenModel({
  participants,
  plan: revealPublicPlan,
  actionOrder: acceptedActionOrder
});
runtime.render(revealWithAcceptedOrder);
assert.equal(runtime.cinematicOrderRail.hidden, true);
assert.equal(runtime.cinematicOrderRail.children.length, 0);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.finalState), [undefined, undefined, undefined, undefined]);

const compareOrderPlan = {
  presentationOnly: true,
  authorityBoundary: 'accepted_public_event_only',
  eventId: 'compare-order-1',
  kind: 'compare4',
  transition: 'CONTINUE',
  groupTargets: [],
  importance: 'normal',
  publicData: {
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    winnerIds: ['P3'],
    publicCards: fourPublicCards
  }
};
const orderedCompare = createBattleScreenModel({
  participants,
  plan: compareOrderPlan,
  returnIntent: 'MATCH_PLAN',
  actionOrder: acceptedActionOrder
});
runtime.render(orderedCompare);
assert.equal(runtime.shell.dataset.presentationMode, 'cinematic');
assert.equal(runtime.phaseSurface.dataset.battlePhasePresentation, 'FULLSCREEN_ANIMATION');
assert.equal(runtime.cinematicOrderRail.hidden, false);
assert.equal(runtime.cinematicOrderRail.dataset.cardCount, '4');
assert.equal(runtime.cinematicOrderRail.dataset.eventId, 'compare-order-1');
assert.equal(runtime.cinematicOrderRail.dataset.orderSource, 'accepted-action-order-compare4');
assert.deepEqual(runtime.cinematicOrderRail.children.map(node => node.dataset.playerId), ['P2', 'P4', 'P1', 'P3']);
assert.deepEqual(runtime.cinematicOrderRail.children.map(node => node.dataset.cardId), ['C2', 'C4', 'C1', 'C3']);
assert.deepEqual(runtime.cinematicOrderRail.children.map(node => node.dataset.finalState), ['invalidated', 'invalidated', 'invalidated', 'resolved-win']);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.finalState), ['invalidated', 'invalidated', 'resolved-win', 'invalidated']);

const orderedSettle = createBattleScreenModel({
  participants,
  plan: settlePlan,
  returnIntent: 'MATCH_PLAN',
  actionOrder: acceptedActionOrder
});
runtime.render(orderedSettle);
assert.equal(runtime.shell.dataset.presentationMode, 'cinematic');
assert.equal(runtime.phaseSurface.dataset.battlePhasePresentation, 'FULLSCREEN_ANIMATION');
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);
assert.equal(runtime.cinematicOrderRail.hidden, false);
assert.equal(runtime.cinematicOrderRail.dataset.cardCount, '4');
assert.equal(runtime.cinematicOrderRail.dataset.eventId, 'settle-1');
assert.equal(runtime.cinematicOrderRail.dataset.orderSource, 'accepted-causal-processing-order');
assert.deepEqual(runtime.cinematicOrderRail.children.map(node => node.dataset.playerId), ['P2', 'P4', 'P1', 'P3']);
assert.deepEqual(runtime.cinematicOrderRail.children.map(node => node.dataset.cardId), ['C2', 'C4', 'C1', 'C3']);
assert.deepEqual(runtime.cinematicOrderRail.children.map(node => node.dataset.finalState), ['invalidated', 'invalidated', 'invalidated', 'resolved-win']);
assert.equal(runtime.cinematicOrderRail.children[0].children[0].className, 'grBattleCinematicOrderCardFallback');
assert.equal(runtime.cinematicOrderRail.children[0].children[0].textContent, '');
assert.equal(runtime.cinematicOrderRail.children[2].dataset.artSource, 'viewer_local');
assert.equal(runtime.cinematicOrderRail.children[2].children[0].tagName, 'IMG');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.finalState), ['invalidated', 'invalidated', 'resolved-win', 'invalidated']);

const reducedSettle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN', reducedMotion: true, actionOrder: acceptedActionOrder });
runtime.render(reducedSettle);
assert.equal(runtime.shell.dataset.motion, 'static_only');
assert.equal(runtime.cinematicOrderRail.hidden, false);
assert.equal(runtime.cinematicOrderRail.children.length, 4);
assert.equal(runtime.shieldRails[2].children[2].dataset.boardReturnTarget, 'true');
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);

const lowPerfSettle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN', lowPerf: true });
runtime.render(lowPerfSettle);
assert.equal(runtime.shell.dataset.motion, 'static_only');
assert.equal(runtime.cinematicOrderRail.hidden, true);
assert.equal(runtime.cinematicOrderRail.children.length, 0);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.dataset.causalCardId, undefined);

const malformedReturn = { ...settle, boardReturn: { ...settle.boardReturn, shieldLane: 'X' } };
assert.throws(() => runtime.render(malformedReturn), /BATTLE_SCREEN_MODEL_REJECTED/);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.dataset.causalCardId, undefined);
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);
assert.equal(runtime.causalTrace.dataset.traceKey, undefined);
assert.equal(runtime.shell.dataset.boardReturnDestination, undefined);
assert.equal(runtime.shieldRails[2].dataset.boardReturnParticipant, undefined);
assert.equal(runtime.shieldRails.flatMap(rail => rail.children).some(node => node.dataset.boardReturnTarget === 'true'), false);
assert.equal(p3ShieldSlots[2].getAttribute('aria-label'), 'Shield R → ROAD R');

runtime.render(attack);
assert.equal(runtime.cinematicOrderRail.hidden, true);
assert.equal(runtime.cinematicOrderRail.children.length, 0);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.finalState), [undefined, undefined, undefined, undefined]);
assert.equal(runtime.shell.dataset.boardReturnDestination, undefined);
assert.equal(runtime.phaseSurface.dataset.battleBoardReturnDestination, undefined);
assert.equal(runtime.resolutionSurface.dataset.battleBoardReturnDestination, undefined);
assert.equal(runtime.resolutionSurface.dataset.battleBoardReturnShieldRef, undefined);
assert.equal(runtime.currentActionCue.dataset.boardReturnDestination, undefined);
assert.equal(runtime.currentActionCue.dataset.causalTraceKey, undefined);
assert.equal(runtime.currentActionCue.dataset.causalCardId, undefined);
assert.equal(runtime.currentActionCue.dataset.causalJanken, undefined);
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);
assert.equal(runtime.shieldRails[2].dataset.boardReturnParticipant, undefined);
assert.equal(runtime.shieldRails.flatMap(rail => rail.children).some(node => node.dataset.boardReturnTarget === 'true'), false);
assert.equal(p3ShieldSlots[2].getAttribute('aria-label'), 'Shield R → ROAD R');

runtime.renderHud({ score: '', hate: null, turn: undefined, loadJanken: 'heart', honey: -1, chipCount: '2' });
assert.equal(runtime.hud.scoreValue.textContent, 'X');
assert.equal(runtime.hud.hateValue.textContent, 'XXX');
assert.equal(runtime.hud.turnValue.textContent, 'XX');
assert.equal(runtime.hud.loadValue.textContent, '?');
assert.equal(runtime.hud.root.dataset.scoreResolved, 'false');
assert.equal(runtime.hud.root.dataset.loadJankenResolved, 'false');
assert.equal(runtime.hud.loadValue.textContent.includes('♥'), false);
assert.equal(runtime.resourceHud.honeyCell.children[1].textContent, '—');
assert.equal(runtime.resourceHud.chipCell.children[1].textContent, '—');
assert.equal(runtime.resourceHud.honeyCell.dataset.resolved, 'false');
assert.equal(runtime.resourceHud.chipCell.dataset.resolved, 'false');

const finisherPlan = {
  presentationOnly: true,
  authorityBoundary: 'accepted_public_event_only',
  eventId: 'finish-1',
  kind: 'finisher',
  transition: 'FINISHER_GATHER',
  groupTargets: ['P1', 'P2', 'P3'],
  importance: 'major',
  publicData: { winnerId: 'P4', loserIds: ['P1', 'P2', 'P3'] }
};
const finisher = createBattleScreenModel({
  participants,
  plan: finisherPlan,
  returnIntent: 'RESULT',
  reducedMotion: true
});
runtime.render(finisher);
assert.equal(runtime.shell.hidden, false);
assert.equal(runtime.shell.dataset.motion, 'static_only');
assert.equal(runtime.shell.dataset.returnIntent, 'RESULT');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['idle', 'idle', 'idle', 'winner']);
assert.equal(runtime.phaseSurface.dataset.battleScreenPhase, 'finisher');
assert.equal(runtime.hud.root.hidden, true);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.textContent, '');
assert.equal(runtime.currentActionCue.dataset.phase, undefined);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [true, true, true, true]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['', '', '', '']);

const terminalResult = createBattleScreenModel({ participants, returnIntent: 'RESULT' });
runtime.render(terminalResult);
assert.equal(runtime.shell.hidden, true);
assert.equal(runtime.phaseSurface.hidden, true);
assert.equal(runtime.hud.root.hidden, true);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.planSlot.hidden, true);

runtime.render(attack);
assert.equal(runtime.shell.hidden, false);
assert.equal(runtime.shell.dataset.presentationMode, 'cinematic');
assert.equal(runtime.phaseSurface.hidden, false);
assert.equal(runtime.phaseSurface.dataset.battlePhasePresentation, 'FULLSCREEN_ANIMATION');
assert.equal(runtime.hud.root.hidden, true);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.textContent, '');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['source', 'idle', 'idle', 'target']);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [false, true, true, false]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['攻撃', '', '', '対象']);

const progressGuide = runtime.progressGuide;
const fieldLandmark = runtime.fieldLandmark;
const currentActionCue = runtime.currentActionCue;
const causalTrace = runtime.causalTrace;
const cinematicEnvironment = runtime.cinematicEnvironment;
const cinematicOrderRail = runtime.cinematicOrderRail;
const cinematicDuel = runtime.cinematicDuel;
const resourceHudRoot = runtime.resourceHud.root;
assert.equal(runtime.destroy(), true);
assert.equal(runtime.destroy(), false);
assert.equal(progressGuide.parentNode, null);
assert.equal(fieldLandmark.parentNode, null);
assert.equal(currentActionCue.parentNode, null);
assert.equal(causalTrace.parentNode, null);
assert.equal(cinematicEnvironment.parentNode, null);
assert.equal(cinematicOrderRail.parentNode, null);
assert.equal(cinematicDuel.parentNode, null);
assert.equal(resourceHudRoot.parentNode, null);
assert.equal(root.children.includes(runtime.shell), false);
assert.equal(battleMap.style.visibility, '');
assert.equal(battleMap.style.pointerEvents, '');
assert.equal(battleMap.dataset.battlePhaseSuppressed, undefined);
assert.equal(battleMap.getAttribute('aria-hidden'), null);
assert.throws(() => runtime.render(idle), /RUNTIME_DESTROYED/);
assert.throws(() => runtime.renderHud({ score: 1 }), /RUNTIME_DESTROYED/);

const adoptedDocument = new FakeDocument();
const existingShell = adoptedDocument.createElement('div');
existingShell.setAttribute('data-gr-existing-battle-shell', '1');
adoptedDocument.body.appendChild(existingShell);
const existingPhase = adoptedDocument.createElement('section');
existingPhase.id = 'battlePhaseSurface';
existingShell.dataset.battleFieldId = 'FIELD-09';
existingShell.appendChild(existingPhase);
const existingResolution = adoptedDocument.createElement('div');
existingResolution.id = 'battleResolution';
existingResolution.textContent = 'KEEP';
existingPhase.appendChild(existingResolution);

const adopted = mountBattleScreenExternalSurface(
  { document: adoptedDocument },
  { shell: existingShell, phaseSurface: existingPhase, resolutionSurface: existingResolution }
);
assert.equal(adopted.adoptedPhaseSurface, true);
assert.equal(adopted.adoptedResolutionSurface, true);
assert.equal(adopted.callerShellDecorated, false);
assert.equal(adopted.planSlot, null);
assert.equal(adopted.phaseSurface, existingPhase);
assert.equal(adopted.resolutionSurface, existingResolution);
assert.equal(existingShell.getAttribute('data-gr-battle-screen'), null);
assert.equal(adopted.shell.parentNode, existingPhase);
assert.equal(adopted.shell.className, 'grBattleScreenAdoptedOverlay');
assert.equal(adopted.shell.getAttribute('data-gr-battle-screen'), '1');
assert.equal(adopted.shell.dataset.owner, 'runtime_overlay');
assert.equal(adopted.hud.root.parentNode, adopted.shell);
assert.equal(adopted.currentActionCue.parentNode, existingShell);
assert.equal(adopted.currentActionCue.dataset.presentationOnly, 'true');
assert.equal(adopted.causalTrace.parentNode, existingShell);
assert.equal(adopted.causalTrace.dataset.presentationOnly, 'true');
assert.equal(adopted.progressGuide.parentNode, adopted.shell);
assert.equal(adopted.progressGuide.dataset.presentationOnly, 'true');
assert.equal(adopted.fieldLandmark.parentNode, adopted.shell);
assert.equal(adopted.grid.parentNode, adopted.shell);
assert.equal(adopted.fieldLandmark.hidden, false);
assert.equal(adopted.fieldLandmark.getAttribute('data-battle-field-landmark'), 'FIELD-09');
adopted.render(idle);
assert.equal(existingPhase.hidden, true);
assert.equal(adopted.currentActionCue.hidden, false);
assert.equal(adopted.currentActionCue.textContent, '今：選択');
assert.equal(adopted.currentActionCue.dataset.phase, 'plan');
adopted.render(attack, { score: 'S', hate: 'H', turn: 'T', loadJanken: 'paper', honey: 0, chipCount: 0 });
assert.equal(existingResolution.textContent, 'KEEP');
assert.equal(adopted.laneSurfaces.length, 4);
assert.equal(adopted.hud.loadValue.textContent, 'パー');
assert.equal(adopted.resourceHud.honeyCell.children[1].textContent, '0');
assert.equal(adopted.resourceHud.chipCell.children[1].textContent, '0');
assert.equal(adopted.shell.dataset.presentationMode, 'cinematic');
assert.equal(existingPhase.dataset.battlePhasePresentation, 'FULLSCREEN_ANIMATION');
assert.equal(adopted.hud.root.hidden, true);
assert.equal(adopted.currentActionCue.hidden, true);
adopted.render(settle);
assert.equal(existingResolution.textContent, 'KEEP');
assert.equal(adopted.currentActionCue.hidden, true);
assert.equal(adopted.causalTrace.hidden, true);
assert.equal(adopted.causalTrace.children.length, 0);
assert.equal(adopted.resolutionSurface.dataset.battleBoardReturnDestination, 'P3:R');
assert.equal(adopted.shieldRails[2].children[2].dataset.boardReturnTarget, 'true');
adopted.render(terminalResult);
assert.equal(existingShell.hidden, false);
assert.equal(existingPhase.hidden, true);
assert.equal(adopted.shell.hidden, true);
assert.equal(adopted.hud.root.hidden, true);
assert.equal(adopted.currentActionCue.hidden, true);
assert.equal(adopted.causalTrace.hidden, true);
assert.equal(adopted.causalTrace.children.length, 0);
assert.equal(adopted.resolutionSurface.dataset.battleBoardReturnDestination, undefined);
const adoptedOverlay = adopted.shell;
const adoptedCurrentActionCue = adopted.currentActionCue;
const adoptedCausalTrace = adopted.causalTrace;
const adoptedProgressGuide = adopted.progressGuide;
const adoptedFieldLandmark = adopted.fieldLandmark;
assert.equal(adopted.destroy(), true);
assert.equal(adoptedOverlay.parentNode, null);
assert.equal(adoptedCurrentActionCue.parentNode, null);
assert.equal(adoptedCausalTrace.parentNode, null);
assert.equal(adoptedProgressGuide.parentNode, null);
assert.equal(adoptedFieldLandmark.parentNode, null);
assert.equal(adoptedDocument.body.children.includes(existingShell), true);
assert.equal(existingShell.children.includes(existingPhase), true);
assert.equal(existingShell.children.includes(adopted.hud.root), false);
assert.equal(existingPhase.children.includes(existingResolution), true);

const mismatchDocument = new FakeDocument();
const mismatchRoot = mismatchDocument.createElement('div');
mismatchDocument.body.appendChild(mismatchRoot);
const wrongPhase = mismatchDocument.createElement('section');
wrongPhase.id = 'wrong';
assert.throws(
  () => mountBattleScreenExternalSurface({ document: mismatchDocument }, { root: mismatchRoot, phaseSurface: wrongPhase }),
  /ANCHOR_ID_MISMATCH:battlePhaseSurface/
);
assert.throws(
  () => mountBattleScreenExternalSurface({ document: null }, { root: mismatchRoot }),
  /DOCUMENT_REQUIRED/
);
assert.equal(BATTLE_SCREEN_RUNTIME.presentationOnly, true);
assert.equal(BATTLE_SCREEN_RUNTIME.authority, 'NONE');
assert.equal(BATTLE_SCREEN_RUNTIME.currentActionAuthority, 'ACCEPTED_PUBLIC_MODEL_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.battlePhasePresentationMode, 'FULLSCREEN_ANIMATION');
assert.equal(BATTLE_SCREEN_RUNTIME.battlePhaseNormalHudVisible, false);
assert.equal(BATTLE_SCREEN_RUNTIME.battlePhaseNormalPlanUiVisible, false);
assert.equal(BATTLE_SCREEN_RUNTIME.battlePhaseBoardSurfacePolicy, 'HIDE_EXISTING_BATTLE_MAP_AND_DISABLE_POINTERS');
assert.deepEqual(BATTLE_SCREEN_RUNTIME.battlePhaseAllowedInputs, ['skip', 'public_info', 'accessibility']);
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicOrderAuthority, 'MODEL_CAUSAL_RETURN_PROCESSING_ORDER_ONLY_NO_SORT_OR_INFERENCE');
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicOrderVisibleCardIdText, false);
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicDuelAuthority, 'MODEL_LANE_ROLE_EXACT_ONE_SOURCE_EXACT_ONE_TARGET_ONLY_NO_INFERENCE');
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicDuelArt, 'EXISTING_CHARACTER_RUNTIME_PLUS_PROVISIONAL_SAASUNA_9_KEYFRAME_SHEET_NO_FORMAL_ART');
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicDuelReaction, 'EXISTING_CHARACTER_RUNTIME_PLUS_PROVISIONAL_SAASUNA_STATEFUL_REACTION_NO_GAMEPLAY_STATE');
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicDuelVfx, 'PROVISIONAL_ICE_WIND_IMPACT_LAYERS_PLUS_EXISTING_NEUTRAL_SHOT_NO_FORMAL_ART');
assert.equal(BATTLE_SCREEN_RUNTIME.cinematicDuelHandoff, 'ACCEPTED_CONVEYOR_TRANSITION_PLUS_CONSECUTIVE_ACCEPTED_PAIR_CONTINUITY_NO_ORDER_INFERENCE');
assert.equal(BATTLE_SCREEN_RUNTIME.saasunaBattleMotion, 'PRESENTATION_ONLY_9_KEYFRAME_SHEET_PLUS_CSS_TIMELINE_NO_GAMEPLAY_AUTHORITY');
assert.deepEqual(BATTLE_SCREEN_RUNTIME.saasunaBattleMotionStates.length, 11);
assert.deepEqual(BATTLE_SCREEN_RUNTIME.saasunaBattleMotionEffects, ['ice', 'wind', 'impact']);
assert.equal(BATTLE_SCREEN_RUNTIME.saasunaBattleMotionFormalArt, false);
assert.deepEqual(BATTLE_SCREEN_RUNTIME.cinematicPhaseMotion, ['reveal', 'attack', 'ability', 'compare4', 'finisher', 'settle']);
assert.equal(BATTLE_SCREEN_RUNTIME.causalTraceAuthority, 'MODEL_CAUSAL_RETURN_STAGES_ONLY_NO_RECALCULATION');
assert.equal(BATTLE_SCREEN_RUNTIME.causalTraceStageOrder, 'MODEL_ORDER_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.shieldLanePresentation, 'STRUCTURE_PLUS_EXACT_ACCEPTED_BOARD_RETURN_CUE_NO_SHIELD_STATE_INFERENCE');
assert.equal(BATTLE_SCREEN_RUNTIME.boardReturnAuthority, 'MODEL_ONLY_EXACT_OPPONENT_PLUS_SHIELD_LANE');
assert.equal(BATTLE_SCREEN_RUNTIME.productionHtmlMutationOwnedHere, false);

const { readFile: readPortraitScreenSource } = await import('node:fs/promises');
const portraitScreenSource = await readPortraitScreenSource(new URL('../browser/battle-screen-runtime-mount.mjs', import.meta.url), 'utf8');
assert.match(portraitScreenSource, /BATTLE_PORTRAIT_390X844_R7B/);
assert.match(portraitScreenSource, /data-battle-phase-presentation="FULLSCREEN_ANIMATION"/);
assert.match(portraitScreenSource, /grBattleCinematicReveal/);
assert.match(portraitScreenSource, /grBattleCinematicStrike/);
assert.match(portraitScreenSource, /data-battle-cinematic-duel/);
assert.match(portraitScreenSource, /grBattleCinematicDuelAnticipation/);
assert.match(portraitScreenSource, /grBattleCinematicDuelRelease/);
assert.match(portraitScreenSource, /grBattleCinematicDuelReaction/);
assert.match(portraitScreenSource, /grBattleCinematicDuelReturnSource/);
assert.match(portraitScreenSource, /grBattleCinematicDuelReturnTarget/);
assert.match(portraitScreenSource, /grBattleCinematicDuelEnter/);
assert.match(portraitScreenSource, /data-movement-intent/);
assert.match(portraitScreenSource, /saasuna-battle-motion-core/);
assert.match(portraitScreenSource, /SAASUNA_BATTLE_MOTION_RUNTIME/);
assert.match(portraitScreenSource, /provisional-keyframe-sheet/);
assert.match(portraitScreenSource, /PROVISIONAL_SAASUNA_9_KEYFRAME_SHEET_NO_FORMAL_ART/);
assert.match(portraitScreenSource, /STATEFUL_REACTION_NO_GAMEPLAY_STATE/);
assert.match(portraitScreenSource, /provisional-neutral-compressed-shot/);
assert.match(portraitScreenSource, /grBattleCinematicCompressedShot/);
assert.match(portraitScreenSource, /data-battle-cinematic-character/);
assert.match(portraitScreenSource, /grBattleCinematicCompare/);
assert.match(portraitScreenSource, /grBattleCinematicWinner/);
assert.match(portraitScreenSource, /data-battle-cinematic-order/);
assert.match(portraitScreenSource, /MODEL_CAUSAL_RETURN_PROCESSING_ORDER_ONLY_NO_SORT_OR_INFERENCE/);
assert.match(portraitScreenSource, /data-presentation-mode="cinematic"/);
assert.match(portraitScreenSource, /@media\(max-width:430px\) and \(orientation:portrait\)/);
assert.match(portraitScreenSource, /grBattleScreenTop\{height:56px!important/);
assert.match(portraitScreenSource, /bottom:248px!important/);
assert.match(portraitScreenSource, /height:52px!important/);
assert.match(portraitScreenSource, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
assert.match(portraitScreenSource, /grBattleLaneRole,.*grBattleLaneAfterstate\{display:none!important\}/s);
assert.match(portraitScreenSource, /#battleResolution\{left:8px!important;right:8px!important;bottom:12px!important/);
assert.match(portraitScreenSource, /\[\$\{PROGRESS_GUIDE_ATTR\}\]\{display:none!important\}/);
assert.doesNotMatch(portraitScreenSource, /battle-screen-runtime-mount-base\.mjs/);
