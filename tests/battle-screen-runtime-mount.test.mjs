import assert from 'node:assert/strict';
import { createBattleScreenModel } from '../browser/battle-screen-presentation-core.mjs';
import {
  BATTLE_SCREEN_RUNTIME,
  mountBattleScreenExternalSurface
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
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
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
    return null;
  }
}

const participants = [
  { id: 'P1', label: 'A-1', team: 'A' },
  { id: 'P2', label: 'A-2', team: 'A' },
  { id: 'P3', label: 'B-1', team: 'B' },
  { id: 'P4', label: 'B-2', team: 'B' }
];

const document = new FakeDocument();
const root = document.createElement('main');
root.setAttribute('data-gr-battle-screen-root', '');
document.body.appendChild(root);
const runtime = mountBattleScreenExternalSurface({ document }, { root });

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
assert.ok(runtime.currentActionCue);
assert.equal(runtime.currentActionCue.getAttribute('data-battle-current-action'), '1');
assert.equal(runtime.currentActionCue.getAttribute('role'), 'status');
assert.equal(runtime.currentActionCue.getAttribute('aria-live'), 'polite');
assert.equal(runtime.currentActionCue.dataset.presentationOnly, 'true');
assert.equal(runtime.currentActionCue.dataset.authority, 'accepted-public-model-only');
assert.equal(runtime.currentActionCue.hidden, true);
assert.ok(runtime.progressGuide);
assert.equal(runtime.progressGuide.getAttribute('data-battle-progress-guide'), '1');
assert.equal(runtime.progressGuide.getAttribute('aria-label'), 'ROADからGOALへの進行方向');
assert.equal(runtime.progressGuide.dataset.presentationOnly, 'true');
assert.equal(runtime.progressGuide.dataset.authority, 'existing-road-goal-meaning-only');
assert.equal(runtime.progressGuide.parentNode, runtime.phaseSurface);
assert.deepEqual(runtime.progressGuide.children.map(node => node.textContent), ['GOAL', '', 'ROAD']);
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
assert.ok(runtimeStyle.textContent.includes('left:52%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-screen-causal-grid]::before'));
assert.ok(runtimeStyle.textContent.includes('clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)'));
assert.ok(runtimeStyle.textContent.includes('@media(max-height:470px) and (orientation:landscape)'));
assert.ok(runtimeStyle.textContent.includes('.battle .royalUsageStrip{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:151px!important;gap:2px!important}'));
assert.ok(runtimeStyle.textContent.includes('@media(max-width:540px){[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{left:4px;right:4px;gap:3px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}'));
assert.ok(runtimeStyle.textContent.includes('@media(max-width:540px) and (orientation:portrait){[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{top:88px;right:8px;bottom:96px;left:8px;gap:6px;grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr))}'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]::before{display:none}'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] [data-battle-screen-lane]{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(20px,auto);'));
assert.ok(runtimeStyle.textContent.includes('[data-gr-battle-screen="1"] #battleResolution{left:8px;right:8px;bottom:12px;transform:none;max-width:none}'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudSettings{pointer-events:auto'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudChainArrow'));
assert.ok(runtimeStyle.textContent.includes('.grBattleHudLoad'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-current-action]'));
assert.ok(runtimeStyle.textContent.includes('max-width:min(42vw,420px)'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-progress-guide]'));
assert.ok(runtimeStyle.textContent.includes('.grBattleProgressArrow::before{content:"◀"'));
assert.ok(runtimeStyle.textContent.includes('.grBattleProgressArrow::before{content:"▲"'));
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

const idle = createBattleScreenModel({ participants });
runtime.render(idle);
assert.equal(runtime.shell.dataset.mode, 'MATCH_PLAN');
assert.equal(runtime.shell.hidden, false);
assert.equal(runtime.phaseSurface.hidden, true);
assert.equal(runtime.hud.root.hidden, true);
assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.textContent, '');
assert.equal(runtime.planSlot.hidden, false);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['idle', 'idle', 'idle', 'idle']);
const roleSurfaces = runtime.laneSurfaces.map(node => node.children[1]);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [true, true, true, true]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['', '', '', '']);

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
  playedCards: [
    { cardId: 'C1', label: 'CARD-1' },
    { cardId: 'C2', label: 'CARD-2' },
    { cardId: 'C3', label: 'CARD-3' }
  ]
});
assert.equal(runtime.phaseSurface.hidden, false);
assert.equal(runtime.hud.root.hidden, false);
assert.equal(runtime.currentActionCue.hidden, false);
assert.equal(runtime.currentActionCue.textContent, '今：攻撃 A-1 → B-2');
assert.equal(runtime.currentActionCue.dataset.phase, 'attack');
assert.equal(runtime.currentActionCue.dataset.eventId, 'attack-1');
assert.equal(runtime.planSlot.hidden, true);
assert.equal(runtime.shell.dataset.mode, 'BATTLE_PHASE');
assert.equal(runtime.shell.dataset.eventId, 'attack-1');
assert.equal(runtime.phaseSurface.dataset.battleScreenInput, 'skip|public_info|accessibility');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.participantId), ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['source', 'idle', 'idle', 'target']);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [false, true, true, false]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['攻撃', '', '', '対象']);
assert.equal(runtime.resolutionSurface.textContent, 'EXISTING LIVE ADAPTER OWNS THIS CONTENT');
assert.equal(runtime.resolutionSurface.dataset.battleScreenEventId, 'attack-1');
assert.equal(runtime.hud.scoreValue.textContent, '12');
assert.equal(runtime.hud.hateValue.textContent, '00:18');
assert.equal(runtime.hud.turnValue.textContent, '4');
assert.equal(runtime.hud.loadValue.textContent, 'グー');
assert.equal(runtime.hud.scoreValue.dataset.resolved, 'true');
assert.equal(runtime.hud.hateValue.dataset.resolved, 'true');
assert.equal(runtime.hud.turnValue.dataset.resolved, 'true');
assert.equal(runtime.hud.loadValue.dataset.resolved, 'true');
assert.equal(runtime.hud.root.dataset.playedCardCount, '3');
assert.equal(runtime.hud.chain.children.length, 5);
assert.deepEqual(
  runtime.hud.chain.children.filter(node => node.className === 'grBattleHudPlayedCard').map(node => node.dataset.cardId),
  ['C1', 'C2', 'C3']
);
assert.deepEqual(
  runtime.hud.chain.children.filter(node => node.className === 'grBattleHudChainArrow').map(node => node.textContent),
  ['▷', '▷']
);

for (const fieldId of ['FIELD-01', 'FIELD-02', 'FIELD-03', 'FIELD-04', 'FIELD-05', 'FIELD-08', 'FIELD-09']) {
  root.dataset.battleFieldId = fieldId;
  runtime.render(attack);
  assert.equal(runtime.fieldLandmark.hidden, false);
  assert.equal(runtime.fieldLandmark.getAttribute('data-battle-field-landmark'), fieldId);
  assert.equal(runtime.fieldLandmark.dataset.fieldId, fieldId);
}
root.dataset.battleFieldId = 'FIELD-UNKNOWN';
runtime.render(attack);
assert.equal(runtime.fieldLandmark.hidden, true);
assert.equal(runtime.fieldLandmark.getAttribute('data-battle-field-landmark'), '');
root.dataset.battleFieldId = 'FIELD-01';
runtime.render(attack);
assert.equal(runtime.fieldLandmark.hidden, false);

const p4View = runtime.laneSurfaces[3];
const p4Afterstate = p4View.children[2];
assert.equal(p4Afterstate.children.length, 1);
assert.equal(p4Afterstate.children[0].textContent, '列進行 4');
assert.equal(p4Afterstate.children[0].dataset.afterstateId, 'p4-lane');

runtime.renderHud({ score: '', hate: null, turn: undefined, loadJanken: 'heart' });
assert.equal(runtime.hud.scoreValue.textContent, 'X');
assert.equal(runtime.hud.hateValue.textContent, 'XXX');
assert.equal(runtime.hud.turnValue.textContent, 'XX');
assert.equal(runtime.hud.loadValue.textContent, '?');
assert.equal(runtime.hud.root.dataset.scoreResolved, 'false');
assert.equal(runtime.hud.root.dataset.loadJankenResolved, 'false');
assert.equal(runtime.hud.loadValue.textContent.includes('♥'), false);

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
assert.equal(runtime.hud.root.hidden, false);
assert.equal(runtime.currentActionCue.hidden, false);
assert.equal(runtime.currentActionCue.textContent, '今：決着 B-2');
assert.equal(runtime.currentActionCue.dataset.phase, 'finisher');
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
assert.equal(runtime.phaseSurface.hidden, false);
assert.equal(runtime.hud.root.hidden, false);
assert.equal(runtime.currentActionCue.textContent, '今：攻撃 A-1 → B-2');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['source', 'idle', 'idle', 'target']);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [false, true, true, false]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['攻撃', '', '', '対象']);

const progressGuide = runtime.progressGuide;
const fieldLandmark = runtime.fieldLandmark;
const currentActionCue = runtime.currentActionCue;
assert.equal(runtime.destroy(), true);
assert.equal(runtime.destroy(), false);
assert.equal(progressGuide.parentNode, null);
assert.equal(fieldLandmark.parentNode, null);
assert.equal(currentActionCue.parentNode, null);
assert.equal(root.children.includes(runtime.shell), false);
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
assert.equal(adopted.currentActionCue.parentNode, adopted.shell);
assert.equal(adopted.currentActionCue.dataset.presentationOnly, 'true');
assert.equal(adopted.progressGuide.parentNode, adopted.shell);
assert.equal(adopted.progressGuide.dataset.presentationOnly, 'true');
assert.equal(adopted.fieldLandmark.parentNode, adopted.shell);
assert.equal(adopted.grid.parentNode, adopted.shell);
assert.equal(adopted.fieldLandmark.hidden, false);
assert.equal(adopted.fieldLandmark.getAttribute('data-battle-field-landmark'), 'FIELD-09');
adopted.render(attack, { score: 'S', hate: 'H', turn: 'T', loadJanken: 'paper' });
assert.equal(existingResolution.textContent, 'KEEP');
assert.equal(adopted.laneSurfaces.length, 4);
assert.equal(adopted.hud.loadValue.textContent, 'パー');
assert.equal(adopted.currentActionCue.textContent, '今：攻撃 A-1 → B-2');
adopted.render(terminalResult);
assert.equal(existingShell.hidden, false);
assert.equal(existingPhase.hidden, true);
assert.equal(adopted.shell.hidden, true);
assert.equal(adopted.hud.root.hidden, true);
assert.equal(adopted.currentActionCue.hidden, true);
const adoptedOverlay = adopted.shell;
const adoptedCurrentActionCue = adopted.currentActionCue;
const adoptedProgressGuide = adopted.progressGuide;
const adoptedFieldLandmark = adopted.fieldLandmark;
assert.equal(adopted.destroy(), true);
assert.equal(adoptedOverlay.parentNode, null);
assert.equal(adoptedCurrentActionCue.parentNode, null);
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
assert.equal(BATTLE_SCREEN_RUNTIME.productionHtmlMutationOwnedHere, false);
