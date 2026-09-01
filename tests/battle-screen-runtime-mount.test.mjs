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
const runtimeStyle = document.getElementById('gameroad-battle-screen-runtime-r1-style');
assert.ok(runtimeStyle);
assert.ok(runtimeStyle.textContent.includes('@media(max-width:540px){[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{left:4px;right:4px;gap:3px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}'));

const idle = createBattleScreenModel({ participants });
runtime.render(idle);
assert.equal(runtime.shell.dataset.mode, 'MATCH_PLAN');
assert.equal(runtime.shell.hidden, false);
assert.equal(runtime.phaseSurface.hidden, true);
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
runtime.render(attack);
assert.equal(runtime.phaseSurface.hidden, false);
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

const p4View = runtime.laneSurfaces[3];
const p4Afterstate = p4View.children[2];
assert.equal(p4Afterstate.children.length, 1);
assert.equal(p4Afterstate.children[0].textContent, '列進行 4');
assert.equal(p4Afterstate.children[0].dataset.afterstateId, 'p4-lane');

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
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['loser', 'loser', 'loser', 'winner']);
assert.equal(runtime.phaseSurface.dataset.battleScreenPhase, 'finisher');
assert.deepEqual(roleSurfaces.map(node => node.hidden), [true, true, true, true]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['', '', '', '']);

const terminalResult = createBattleScreenModel({ participants, returnIntent: 'RESULT' });
runtime.render(terminalResult);
assert.equal(runtime.shell.hidden, true);
assert.equal(runtime.phaseSurface.hidden, true);
assert.equal(runtime.planSlot.hidden, true);

runtime.render(attack);
assert.equal(runtime.shell.hidden, false);
assert.equal(runtime.phaseSurface.hidden, false);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['source', 'idle', 'idle', 'target']);
assert.deepEqual(roleSurfaces.map(node => node.hidden), [false, true, true, false]);
assert.deepEqual(roleSurfaces.map(node => node.textContent), ['攻撃', '', '', '対象']);

assert.equal(runtime.destroy(), true);
assert.equal(runtime.destroy(), false);
assert.equal(root.children.includes(runtime.shell), false);
assert.throws(() => runtime.render(idle), /RUNTIME_DESTROYED/);

const adoptedDocument = new FakeDocument();
const existingShell = adoptedDocument.createElement('div');
existingShell.setAttribute('data-gr-existing-battle-shell', '1');
adoptedDocument.body.appendChild(existingShell);
const existingPhase = adoptedDocument.createElement('section');
existingPhase.id = 'battlePhaseSurface';
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
assert.equal(adopted.planSlot, null);
assert.equal(adopted.phaseSurface, existingPhase);
assert.equal(adopted.resolutionSurface, existingResolution);
adopted.render(attack);
assert.equal(existingResolution.textContent, 'KEEP');
assert.equal(adopted.laneSurfaces.length, 4);
adopted.render(terminalResult);
assert.equal(existingShell.hidden, false);
assert.equal(existingPhase.hidden, true);
assert.equal(adopted.destroy(), true);
assert.equal(adoptedDocument.body.children.includes(existingShell), true);
assert.equal(existingShell.children.includes(existingPhase), true);
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

assert.equal(BATTLE_SCREEN_RUNTIME.authority, 'NONE');
assert.equal(BATTLE_SCREEN_RUNTIME.laneCount, 4);
assert.equal(BATTLE_SCREEN_RUNTIME.productionHtmlMutationOwnedHere, false);
assert.equal(BATTLE_SCREEN_RUNTIME.formalArtOwnedHere, false);

console.log(JSON.stringify({
  ok: true,
  tests: 72,
  freshMount: {
    laneCount: runtime.laneSurfaces.length,
    phaseAnchor: runtime.phaseSurface.id,
    resolutionAnchor: runtime.resolutionSurface.id
  },
  adoptedMount: {
    adoptedPhaseSurface: adopted.adoptedPhaseSurface,
    adoptedResolutionSurface: adopted.adoptedResolutionSurface
  }
}, null, 2));
