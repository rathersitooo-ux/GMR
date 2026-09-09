import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME,
  mountBattleCompoundAttackPreview,
  normalizeCompoundAttackPreviewPackage
} from '../browser/battle-compound-attack-preview-runtime.mjs';
import { BATTLE_JANKEN_COMPOUND_PREVIEW_SCHEMA } from '../browser/battle-janken-compound-attack-package-core.mjs';

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.parentNode = null;
    this.textContent = '';
    this.hidden = false;
    this.id = '';
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
}

class FakeDocument {
  constructor() { this.head = new FakeNode('head'); this.body = new FakeNode('body'); }
  createElement(tagName) { return new FakeNode(tagName); }
  getElementById(id) {
    const scan = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) { const hit = scan(child); if (hit) return hit; }
      return null;
    };
    return scan(this.head) || scan(this.body);
  }
}

function makeScreenRuntime(document) {
  const shell = new FakeNode('section');
  document.body.appendChild(shell);
  const laneSurfaces = [];
  const shieldRails = [];
  for (let i = 1; i <= 4; i += 1) {
    const lane = new FakeNode('article');
    lane.dataset.participantId = `P${i}`;
    lane.setAttribute('data-battle-screen-lane', String(i));
    const rail = new FakeNode('div');
    rail.dataset.participantId = `P${i}`;
    for (const slot of ['L', 'C', 'R']) {
      const link = new FakeNode('span');
      link.setAttribute('data-battle-shield-slot', slot);
      link.dataset.roadLane = slot;
      const token = new FakeNode('span');
      const track = new FakeNode('span');
      token.setAttribute('class', 'grBattleShieldToken');
      track.setAttribute('class', 'grBattleShieldTrack');
      link.appendChild(token);
      link.appendChild(track);
      rail.appendChild(link);
    }
    laneSurfaces.push(lane);
    shieldRails.push(rail);
    shell.appendChild(lane);
    lane.appendChild(rail);
  }
  return Object.freeze({ shell, laneSurfaces, shieldRails });
}

function candidate(overrides = {}) {
  return {
    jankenHand: 'ROCK',
    cardId: 'CARD-17',
    path: ['NODE-A', { nodeId: 'NODE-B' }],
    direction: 'NE',
    roadId: 'ROAD-P2-R',
    battleId: 'BATTLE-1',
    opponentId: 'P2',
    shieldLane: 'R',
    shieldRef: 'SHIELD-P2-R',
    ...overrides
  };
}

function targetLinks(runtime) {
  return runtime.shieldRails.flatMap((rail) => rail.children).filter((link) => link.dataset.compoundPreviewTarget === 'true');
}

test('normalizer delegates package semantics to the authoritative compound-package core', () => {
  const value = normalizeCompoundAttackPreviewPackage(candidate());
  assert.equal(value.schema, BATTLE_JANKEN_COMPOUND_PREVIEW_SCHEMA);
  assert.equal(value.jankenHand, 'ROCK');
  assert.equal(value.cardId, 'CARD-17');
  assert.deepEqual(value.route, {
    path: ['NODE-A', { nodeId: 'NODE-B' }],
    direction: 'NE',
    roadId: 'ROAD-P2-R',
    battleId: 'BATTLE-1'
  });
  assert.equal(value.opponentId, 'P2');
  assert.equal(value.shieldLane, 'R');
  assert.equal(Object.isFrozen(value), true);
  assert.equal(normalizeCompoundAttackPreviewPackage(candidate({ path: [] })), null);
  assert.equal(normalizeCompoundAttackPreviewPackage(candidate({ jankenHand: '✊' })), null);
  assert.equal(normalizeCompoundAttackPreviewPackage(candidate({ shieldLane: 'X' })), null);
});

test('projects exactly one core-preview opponent, Shield and Shield-linked ROAD track', () => {
  const document = new FakeDocument();
  const screen = makeScreenRuntime(document);
  const preview = mountBattleCompoundAttackPreview({ document, battleScreenRuntime: screen });
  const pkg = candidate({
    jankenHand: 'SCISSORS',
    cardId: 'CARD-22',
    path: ['A', 'B', 'C'],
    roadId: 'route-alpha',
    direction: null,
    opponentId: 'P3',
    shieldLane: 'C',
    shieldRef: 'SHIELD-P3-C'
  });
  const result = preview.render(pkg);
  assert.equal(result.active, true);
  assert.equal(result.reason, 'package_core_preview_projected');
  assert.equal(screen.shell.dataset.compoundPreviewOpponentId, 'P3');
  assert.equal(screen.shell.dataset.compoundPreviewShieldLane, 'C');
  assert.equal(screen.shell.dataset.compoundPreviewRoadId, 'route-alpha');
  assert.equal(screen.shell.dataset.compoundPreviewPath, JSON.stringify(['A', 'B', 'C']));
  assert.equal(screen.laneSurfaces[2].dataset.compoundPreviewTarget, 'true');
  assert.equal(screen.shieldRails[2].dataset.compoundPreviewTarget, 'true');
  const links = targetLinks(screen);
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('data-battle-shield-slot'), 'C');
  assert.equal(links[0].getAttribute('aria-current'), 'true');
  assert.match(preview.cue.textContent, /P3 \/ Shield C \/ ROAD route-alpha \/ 経路 3点/);
  assert.equal(preview.cue.getAttribute('title'), JSON.stringify(['A', 'B', 'C']));
});

test('switching package clears the previous target before projecting the next target', () => {
  const document = new FakeDocument();
  const screen = makeScreenRuntime(document);
  const preview = mountBattleCompoundAttackPreview({ document, battleScreenRuntime: screen });
  preview.render(candidate({ opponentId: 'P2', shieldLane: 'L', roadId: 'r1' }));
  preview.render(candidate({ jankenHand: 'PAPER', cardId: 'B', path: ['Z'], direction: 'south-east', roadId: null, opponentId: 'P4', shieldLane: 'R' }));
  assert.equal(screen.laneSurfaces[1].dataset.compoundPreviewTarget, undefined);
  assert.equal(screen.laneSurfaces[3].dataset.compoundPreviewTarget, 'true');
  const links = targetLinks(screen);
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('data-battle-shield-slot'), 'R');
  assert.equal(screen.shell.dataset.compoundPreviewRoadId, undefined);
  assert.equal(screen.shell.dataset.compoundPreviewDirection, 'south-east');
  assert.equal(screen.shell.dataset.compoundPreviewPath, JSON.stringify(['Z']));
});

test('refresh reprojects the same frozen core preview after lane surfaces are rebound', () => {
  const document = new FakeDocument();
  const screen = makeScreenRuntime(document);
  const preview = mountBattleCompoundAttackPreview({ document, battleScreenRuntime: screen });
  preview.render(candidate({ opponentId: 'P2', shieldLane: 'C' }));
  screen.laneSurfaces[1].dataset.participantId = 'P9';
  screen.shieldRails[1].dataset.participantId = 'P9';
  screen.laneSurfaces[3].dataset.participantId = 'P2';
  screen.shieldRails[3].dataset.participantId = 'P2';
  const refreshed = preview.refresh();
  assert.equal(refreshed.active, true);
  assert.equal(screen.laneSurfaces[1].dataset.compoundPreviewTarget, undefined);
  assert.equal(screen.laneSurfaces[3].dataset.compoundPreviewTarget, 'true');
});

test('invalid or unresolved packages fail closed with no partial target highlight', () => {
  const document = new FakeDocument();
  const screen = makeScreenRuntime(document);
  const preview = mountBattleCompoundAttackPreview({ document, battleScreenRuntime: screen });
  preview.render(candidate({ opponentId: 'P2', shieldLane: 'L' }));
  const missingOpponent = preview.render(candidate({ opponentId: 'P9', shieldLane: 'C' }));
  assert.equal(missingOpponent.active, false);
  assert.equal(missingOpponent.reason, 'opponent_surface_not_found');
  assert.equal(targetLinks(screen).length, 0);
  assert.equal(screen.shell.dataset.compoundPreviewActive, undefined);
  assert.equal(preview.cue.hidden, true);

  const incomplete = preview.render(candidate({ path: [] }));
  assert.equal(incomplete.active, false);
  assert.equal(incomplete.reason, 'invalid_or_incomplete_package');
  assert.equal(targetLinks(screen).length, 0);
});

test('adapter is presentation-only and does not claim legality, targeting or state authority', () => {
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.presentationOnly, true);
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.authority, 'NONE');
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.legalTargetRecompute, false);
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.targetInference, false);
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.gameStateWrite, false);
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.packageAuthority, 'BATTLE_JANKEN_COMPOUND_ATTACK_PACKAGE_CORE_PREVIEW_ONLY');
  assert.equal(BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME.invalidPackagePolicy, 'FAIL_CLOSED_CLEAR_ALL');
});
