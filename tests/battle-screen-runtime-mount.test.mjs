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
    this.onload = null;
    this.onerror = null;
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

const IDLE_VISUAL_STATES = ['idle', 'idle', 'idle', 'idle'];
const ATTACK_VISUAL_STATES = ['attack', 'idle', 'idle', 'hit'];
const FINISHER_VISUAL_STATES = ['defeated', 'defeated', 'defeated', 'joy'];

function assertFailVisibleCharacters(runtime, expectedReason = null, expectedVisualStates = IDLE_VISUAL_STATES) {
  assert.equal(runtime.characterSurfaces.length, 4);
  for (let index = 0; index < 4; index += 1) {
    const host = runtime.characterSurfaces[index];
    const fallback = host.children[0];
    const image = host.children[1];
    assert.equal(host.dataset.participantId, participants[index].id);
    assert.equal(host.dataset.characterId, 'naki');
    assert.equal(host.dataset.visualState, expectedVisualStates[index]);
    assert.equal(host.dataset.visualMode, 'fallback');
    assert.equal(host.dataset.visible, 'true');
    assert.equal(host.dataset.usableSource, 'true');
    assert.equal(host.dataset.transparentOnlyPlaceholder, 'false');
    if (expectedReason) assert.equal(host.dataset.visualReason, expectedReason);
    assert.equal(fallback.hidden, false);
    assert.equal(fallback.textContent, 'ナキ');
    assert.equal(fallback.dataset.fallback, 'character_silhouette_label');
    assert.equal(image.hidden, true);
    assert.equal(image.getAttribute('alt'), '緋累ナキ');
  }
}

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
assert.equal(runtime.characterSurfaces.length, 4);
assert.equal(runtime.laneSurfaces.some(node => 'visualFixture' in node.dataset), false);
assert.equal(runtime.laneSurfaces.some(node => walk(node, child => child.className === 'grBattleLaneRole')), false);
assert.equal(runtime.phaseSurface.id, 'battlePhaseSurface');
assert.equal(runtime.resolutionSurface.id, 'battleResolution');
assert.equal(runtime.planSlot.dataset.owner, 'caller');
assert.equal(runtime.phaseSurface.hidden, true);
const injectedStyle = document.getElementById('gameroad-battle-screen-runtime-r1-style');
assert.ok(injectedStyle);
assert.match(injectedStyle.textContent, /data-battle-character-visual/);
assert.match(injectedStyle.textContent, /min-width:46px/);
assert.match(injectedStyle.textContent, /min-height:88px/);
assert.match(injectedStyle.textContent, /opacity:1/);
assert.match(injectedStyle.textContent, /visibility:visible/);
assert.doesNotMatch(injectedStyle.textContent, /grBattleLaneRole|inset-left|inset-right|inset-top|inset-bottom/);

const idle = createBattleScreenModel({ participants });
runtime.render(idle);
assert.equal(runtime.shell.dataset.mode, 'MATCH_PLAN');
assert.equal(runtime.phaseSurface.hidden, true);
assert.equal(runtime.planSlot.hidden, false);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['idle', 'idle', 'idle', 'idle']);
assertFailVisibleCharacters(runtime, 'resolver_unavailable');

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
assertFailVisibleCharacters(runtime, 'resolver_unavailable', ATTACK_VISUAL_STATES);
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
assert.equal(runtime.shell.dataset.motion, 'static_only');
assert.equal(runtime.shell.dataset.returnIntent, 'RESULT');
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['loser', 'loser', 'loser', 'winner']);
assertFailVisibleCharacters(runtime, 'resolver_unavailable', FINISHER_VISUAL_STATES);
assert.equal(runtime.phaseSurface.dataset.battleScreenPhase, 'finisher');
runtime.render(attack);
assert.deepEqual(runtime.laneSurfaces.map(node => node.dataset.role), ['source', 'idle', 'idle', 'target']);
assertFailVisibleCharacters(runtime, 'resolver_unavailable', ATTACK_VISUAL_STATES);

const resolverDocument = new FakeDocument();
const resolverRoot = resolverDocument.createElement('main');
resolverDocument.body.appendChild(resolverRoot);
const resolverCalls = [];
const resolverRuntime = mountBattleScreenExternalSurface(
  { document: resolverDocument },
  {
    root: resolverRoot,
    characterVisualResolver(participant, visualState) {
      resolverCalls.push([participant.id, visualState]);
      return { sources: [`naki-idle-${participant.id}.webp`, 'naki-accepted-fallback.webp'] };
    }
  }
);
resolverRuntime.render(idle);
assert.deepEqual(resolverCalls, [
  ['P1', 'idle'], ['P2', 'idle'], ['P3', 'idle'], ['P4', 'idle']
]);
for (let index = 0; index < 4; index += 1) {
  const host = resolverRuntime.characterSurfaces[index];
  const fallback = host.children[0];
  const image = host.children[1];
  assert.equal(host.dataset.participantId, participants[index].id);
  assert.equal(host.dataset.visualMode, 'asset_pending');
  assert.equal(host.dataset.visible, 'true');
  assert.equal(host.dataset.usableSource, 'true');
  assert.equal(host.dataset.transparentOnlyPlaceholder, 'false');
  assert.equal(fallback.hidden, false);
  assert.equal(image.hidden, true);
  assert.equal(image.getAttribute('src'), `naki-idle-${participants[index].id}.webp`);
  image.onload();
  assert.equal(host.dataset.visualMode, 'asset');
  assert.equal(host.dataset.visualReason, 'loaded');
  assert.equal(fallback.hidden, true);
  assert.equal(image.hidden, false);
}

const embeddedCalls = [];
let embeddedUnmounts = 0;
const embeddedThreeCharRuntime = {
  mount(container, options) {
    embeddedCalls.push({ ...options });
    const image = new FakeElement('img');
    image.setAttribute('src', options.performance === 'low'
      ? 'data:image/png;base64,NAKI_IDLE_POSTER'
      : 'data:image/webp;base64,NAKI_IDLE_FORMAL');
    container.replaceChildren(image);
    return Promise.resolve({ root: container });
  },
  unmount() { embeddedUnmounts += 1; }
};
const embeddedDocument = new FakeDocument();
const embeddedRoot = embeddedDocument.createElement('main');
embeddedDocument.body.appendChild(embeddedRoot);
const embeddedRuntime = mountBattleScreenExternalSurface(
  { document: embeddedDocument, GameRoadThreeCharRuntime: embeddedThreeCharRuntime },
  { root: embeddedRoot }
);
embeddedRuntime.render(idle);
assert.equal(embeddedCalls.length, 1);
assert.deepEqual(embeddedCalls[0], {
  characterId: 'partner.naki',
  state: 'idle',
  assetMode: 'embedded',
  performance: 'normal',
  allowNetwork: false
});
assert.deepEqual(embeddedRuntime.characterSurfaces.map(host => host.dataset.participantId), ['P1', 'P2', 'P3', 'P4']);
for (const host of embeddedRuntime.characterSurfaces) {
  const fallback = host.children[0];
  const image = host.children[1];
  assert.equal(image.getAttribute('src'), 'data:image/webp;base64,NAKI_IDLE_FORMAL');
  assert.equal(host.dataset.visualMode, 'asset_pending');
  assert.equal(host.dataset.visible, 'true');
  assert.equal(host.dataset.usableSource, 'true');
  assert.equal(host.dataset.transparentOnlyPlaceholder, 'false');
  assert.equal(fallback.hidden, false);
  image.onload();
  assert.equal(host.dataset.visualMode, 'asset');
  assert.equal(host.dataset.visualReason, 'loaded');
  assert.equal(fallback.hidden, true);
  assert.equal(image.hidden, false);
}
await Promise.resolve();
await Promise.resolve();
assert.equal(embeddedUnmounts, 1);

const lowDocument = new FakeDocument();
const lowToggle = lowDocument.createElement('button');
lowToggle.id = 'lowPerf';
lowToggle.textContent = 'ON';
lowDocument.body.appendChild(lowToggle);
const lowRoot = lowDocument.createElement('main');
lowDocument.body.appendChild(lowRoot);
const lowRuntime = mountBattleScreenExternalSurface(
  { document: lowDocument, GameRoadThreeCharRuntime: embeddedThreeCharRuntime },
  { root: lowRoot }
);
lowRuntime.render(idle);
assert.equal(embeddedCalls.length, 2);
assert.equal(embeddedCalls[1].performance, 'low');
for (const host of lowRuntime.characterSurfaces) {
  const image = host.children[1];
  assert.equal(image.getAttribute('src'), 'data:image/png;base64,NAKI_IDLE_POSTER');
  assert.equal(host.dataset.visible, 'true');
  image.onload();
  assert.equal(host.dataset.visualMode, 'asset');
  assert.equal(image.hidden, false);
}
await Promise.resolve();
await Promise.resolve();
assert.equal(embeddedUnmounts, 2);

const failureDocument = new FakeDocument();
const failureRoot = failureDocument.createElement('main');
failureDocument.body.appendChild(failureRoot);
const failureRuntime = mountBattleScreenExternalSurface(
  { document: failureDocument },
  {
    root: failureRoot,
    characterVisualResolver() {
      return { sources: ['naki-idle.webp', 'naki-accepted-fallback.webp'] };
    }
  }
);
failureRuntime.render(attack);
for (let index = 0; index < 4; index += 1) {
  const host = failureRuntime.characterSurfaces[index];
  const fallback = host.children[0];
  const image = host.children[1];
  assert.equal(host.dataset.visualState, ATTACK_VISUAL_STATES[index]);
  assert.equal(image.getAttribute('src'), 'naki-idle.webp');
  assert.equal(fallback.hidden, false);
  image.onerror();
  assert.equal(image.getAttribute('src'), 'naki-accepted-fallback.webp');
  assert.equal(host.dataset.visualMode, 'asset_pending');
  assert.equal(fallback.hidden, false);
  assert.equal(host.dataset.visible, 'true');
  image.onerror();
  assert.equal(host.dataset.visualMode, 'fallback');
  assert.equal(host.dataset.visualReason, 'asset_error');
  assert.equal(host.dataset.visible, 'true');
  assert.equal(host.dataset.usableSource, 'true');
  assert.equal(host.dataset.transparentOnlyPlaceholder, 'false');
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.textContent, 'ナキ');
  assert.equal(image.hidden, true);
}

const throwDocument = new FakeDocument();
const throwRoot = throwDocument.createElement('main');
throwDocument.body.appendChild(throwRoot);
const throwRuntime = mountBattleScreenExternalSurface(
  { document: throwDocument },
  {
    root: throwRoot,
    characterVisualResolver() {
      throw new Error('resolver failed');
    }
  }
);
throwRuntime.render(attack);
assertFailVisibleCharacters(throwRuntime, 'resolver_unavailable', ATTACK_VISUAL_STATES);

const invalidDocument = new FakeDocument();
const invalidRoot = invalidDocument.createElement('main');
invalidDocument.body.appendChild(invalidRoot);
const invalidRuntime = mountBattleScreenExternalSurface(
  { document: invalidDocument },
  { root: invalidRoot, characterVisualResolver: () => ({ sources: ['', '   '] }) }
);
invalidRuntime.render(attack);
assertFailVisibleCharacters(invalidRuntime, 'source_invalid', ATTACK_VISUAL_STATES);

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
assert.equal(existingShell.getAttribute('data-gr-battle-screen'), null);
assert.notEqual(adopted.shell, existingShell);
assert.equal(adopted.shell.parentNode, existingPhase);
assert.equal(adopted.shell.className, 'grBattleScreenAdoptedOverlay');
assert.equal(adopted.shell.dataset.owner, 'runtime_overlay');
assert.equal(adopted.shell.getAttribute('data-gr-battle-screen'), '1');
assert.equal(adopted.grid.parentNode, adopted.shell);
assert.equal(walk(existingShell, node => node.className === 'grBattleScreenTop'), null);
adopted.render(attack);
assert.equal(existingResolution.textContent, 'KEEP');
assert.equal(adopted.laneSurfaces.length, 4);
assert.equal(adopted.characterSurfaces.length, 4);
assert.equal(adopted.laneSurfaces.some(node => 'visualFixture' in node.dataset), false);
assert.equal(adopted.laneSurfaces.some(node => walk(node, child => child.className === 'grBattleLaneRole')), false);
assertFailVisibleCharacters(adopted, 'resolver_unavailable', ATTACK_VISUAL_STATES);
assert.equal(existingShell.getAttribute('data-gr-battle-screen'), null);
assert.equal(adopted.destroy(), true);
assert.equal(adoptedDocument.body.children.includes(existingShell), true);
assert.equal(existingShell.children.includes(existingPhase), true);
assert.equal(existingPhase.children.includes(existingResolution), true);
assert.equal(existingPhase.children.includes(adopted.shell), false);

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
assert.equal(BATTLE_SCREEN_RUNTIME.characterVisualBinding, 'SHARED_PARAMETERIZED_ONE_BINDING_FOUR_PROJECTIONS');
assert.equal(BATTLE_SCREEN_RUNTIME.defaultCharacter, 'NAKI');
assert.equal(BATTLE_SCREEN_RUNTIME.defaultVisualState, 'idle');
assert.equal(BATTLE_SCREEN_RUNTIME.roleVisualStatePolicy, 'source=attack|target=hit|winner=joy|loser=defeated|other=idle');
assert.equal(BATTLE_SCREEN_RUNTIME.liveNakiVisualSource, 'GameRoadThreeCharRuntime:participant.character||partner.naki:embedded');
assert.equal(BATTLE_SCREEN_RUNTIME.participantVisualFallback, 'NAKI_RESOLVER_THEN_VISIBLE_LABELED_SILHOUETTE');
assert.equal(BATTLE_SCREEN_RUNTIME.existingAnchorPolicy, 'EXPLICIT_PHASE_GETS_RUNTIME_OVERLAY__ANCESTOR_NEVER_DECORATED');
assert.equal(BATTLE_SCREEN_RUNTIME.externalPhaseShellOwner, 'CALLER');
assert.equal(BATTLE_SCREEN_RUNTIME.productionHtmlMutationOwnedHere, false);
assert.equal(BATTLE_SCREEN_RUNTIME.formalArtOwnedHere, false);

console.log(JSON.stringify({
  ok: true,
  route: 'embedded_naki_4p_fail_visible',
  sharedCharacterBinding: true,
  embeddedNakiRuntime: true,
  failVisible: true,
  freshMount: {
    laneCount: runtime.laneSurfaces.length,
    characterCount: runtime.characterSurfaces.length,
    visibleFallbacks: runtime.characterSurfaces.filter(node => node.dataset.visualMode === 'fallback').length,
    phaseAnchor: runtime.phaseSurface.id,
    resolutionAnchor: runtime.resolutionSurface.id
  },
  embeddedMount: {
    resolverMountCalls: embeddedCalls.length,
    fourSeatFormalSource: embeddedRuntime.characterSurfaces.every(node => node.dataset.visualMode === 'asset'),
    lowPerfFormalSource: lowRuntime.characterSurfaces.every(node => node.dataset.visualMode === 'asset')
  },
  adoptedMount: {
    adoptedPhaseSurface: adopted.adoptedPhaseSurface,
    adoptedResolutionSurface: adopted.adoptedResolutionSurface,
    characterCount: adopted.characterSurfaces.length
  }
}, null, 2));