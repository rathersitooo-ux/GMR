import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT,
  collectBattleWorldBuiltCountByLaneKey,
  collectLegacyBoardInteractionSnapshot,
  mountBattleBoardWorldLive,
} from '../browser/battle-board-world-live-mount.mjs';

function node(tag = 'div') {
  const attrs = new Map();
  return {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    className: '',
    parentNode: null,
    children: [],
    isConnected: true,
    classList: {
      values: new Set(),
      contains(value) { return this.values.has(value); },
      add(...values) { values.forEach((value) => this.values.add(value)); },
      remove(...values) { values.forEach((value) => this.values.delete(value)); },
    },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    hasAttribute(name) { return attrs.has(name); },
    removeAttribute(name) { attrs.delete(name); },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    prepend(child) { child.parentNode = this; this.children.unshift(child); return child; },
    insertBefore(child, before) {
      child.parentNode = this;
      const index = this.children.indexOf(before);
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    querySelector() { return null; },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
      this.isConnected = false;
    },
    getContext() { return {}; },
  };
}

function fixture() {
  const battleRoot = node('section');
  battleRoot.classList.add('active');
  battleRoot.dataset.screen = 'battle';
  const battleMap = node('div');
  const board = node('div');
  battleMap.appendChild(board);
  const head = node('head');

  const byId = new Map([
    ['battleMap', battleMap],
    ['board', board],
  ]);
  const document = {
    head,
    documentElement: node('html'),
    body: node('body'),
    createElement: (tag) => node(tag),
    getElementById(id) { return byId.get(id) ?? null; },
    querySelector(selector) {
      if (selector.includes('screen.battle') || selector === '.screen.battle') return battleRoot;
      if (selector.startsWith('script[')) return null;
      return null;
    },
  };
  return { document, battleRoot, battleMap, board };
}

test('live mount connects the existing world-field seam to a graphical renderer without touching rules', async () => {
  const fx = fixture();
  let received = null;
  let destroyed = false;
  const fakeRenderer = {
    async replaceBoard(model) { received = model; },
    inspect() { return { ready: true, engine: 'FAKE_WEBGL' }; },
    destroy() { destroyed = true; return true; },
  };
  const global = {
    document: fx.document,
    navigator: { deviceMemory: 8 },
    matchMedia: () => ({ matches: false }),
  };

  const runtime = await mountBattleBoardWorldLive(global, {
    createRenderer: async () => fakeRenderer,
  });

  assert.equal(runtime.mounted, true);
  assert.equal(received.renderSpace, 'WORLD_FIELD');
  assert.equal(received.gameplayAuthority, false);
  assert.equal(fx.battleMap.getAttribute('data-gr-world3d-mounted'), 'true');
  assert.equal(fx.battleMap.children[0].className, 'grBattleWorld3dCanvas');
  assert.equal(runtime.snapshot().gameStateWrite, false);
  assert.equal(runtime.destroy(), true);
  assert.equal(destroyed, true);
  assert.equal(fx.battleMap.getAttribute('data-gr-world3d-mounted'), null);
});

test('live mount fails closed when the graphics renderer cannot be created', async () => {
  const fx = fixture();
  const global = {
    document: fx.document,
    navigator: { deviceMemory: 8 },
    matchMedia: () => ({ matches: false }),
  };
  const result = await mountBattleBoardWorldLive(global, {
    createRenderer: async () => { throw new Error('NO_WEBGL'); },
  });
  assert.equal(result.mounted, false);
  assert.equal(result.reason, 'WORLD_RENDERER_CREATE_FAILED');
});

test('live mount preserves the existing absolute board layout above the 3D canvas', () => {
  const source = fs.readFileSync(new URL('../browser/battle-board-world-live-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, />#board\{position:absolute;inset:0;z-index:5;background:transparent!important/);
  assert.doesNotMatch(source, />#board\{position:relative/);
  assert.match(source, />\.grBattleWorld3dCanvas\{[^}]*z-index:0;pointer-events:none/);
});

test('live mount contract preserves the existing board as interaction authority', () => {
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.consumesExistingWorldFieldModel, true);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.infersLowerFieldSemantics, false);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.existingBoardDomRemainsInteractiveAuthority, true);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.secondBoardEngine, false);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.gameStateWrite, false);
});

function interactionBoard({ lowerCurrent = false } = {}) {
  const positions = [];
  for (let depth = 1; depth <= 7; depth += 1) {
    const item = node('div'); item.dataset.pos = 'R:P1:L:' + depth;
    item.classList.add('node', 'placedCard');
    if (depth === 1) item.classList.add('currentPosition', 'reachable', 'pathStep');
    if (depth === 2) item.classList.add('nextStep', 'reachable', 'pathStep');
    positions.push(item);
  }
  if (lowerCurrent) { const lower = node('div'); lower.dataset.pos = 'C:0:0'; lower.classList.add('node','currentPosition','reachable','pathStep'); positions.unshift(lower); positions[1].classList.remove('currentPosition'); }
  return {
    positions,
    querySelectorAll(selector) {
      if (selector === '.node.placedCard[data-pos]') return positions.filter((item) => item.classList.contains('placedCard'));
      if (selector === '.node.reachable[data-pos]') return positions.filter((item) => item.classList.contains('reachable'));
      if (selector === '.node.path[data-pos]') return positions.filter((item) => item.classList.contains('path'));
      if (selector === '.node.pathStep[data-pos]') return positions.filter((item) => item.classList.contains('pathStep'));
      return [];
    },
    querySelector(selector) {
      if (selector === '.node.currentPosition[data-pos]') return positions.find((item) => item.classList.contains('currentPosition')) ?? null;
      if (selector === '.node.nextStep[data-pos]') return positions.find((item) => item.classList.contains('nextStep')) ?? null;
      return null;
    },
  };
}

test('DOM collectors reuse existing placed-card and interaction truth without owning rules', () => {
  const board = interactionBoard();
  assert.deepEqual(collectBattleWorldBuiltCountByLaneKey(board), { 'P1:L': 7 });
  const interaction = collectLegacyBoardInteractionSnapshot(board);
  assert.equal(interaction.currentPositionId, 'R:P1:L:1'); assert.equal(interaction.nextPositionId, 'R:P1:L:2');
  assert.deepEqual(interaction.reachablePositionIds, ['R:P1:L:1', 'R:P1:L:2']);
});

test('complete road mapping can suppress legacy square cues only after the renderer resolves the canonical nodes', async () => {
  const fx = fixture(); const board = interactionBoard();
  fx.board.querySelector = board.querySelector.bind(board); fx.board.querySelectorAll = board.querySelectorAll.bind(board);
  const models = []; const overlays = [];
  const fakeRenderer = {
    async replaceBoard(model) { models.push(model); },
    applyInteractionOverlay(overlay) { overlays.push(overlay); const ids = new Set(models.at(-1).roundCells.map((entry) => entry.id)); const unresolvedNodeIds = overlay.overlays.map((entry) => entry.nodeId).filter((id) => !ids.has(id)); return { complete: unresolvedNodeIds.length === 0, applied: overlay.overlays.length - unresolvedNodeIds.length, unresolvedNodeIds }; },
    inspect() { return { ready: true }; }, destroy() { return true; },
  };
  const runtime = await mountBattleBoardWorldLive({ document: fx.document, navigator: { deviceMemory: 8 }, matchMedia: () => ({ matches: false }) }, { createRenderer: async () => fakeRenderer });
  assert.equal(models.at(-1).counts.builtUpperCards, 7);
  assert.equal(overlays.at(-1).currentNodeId, 'upper:P1:L:7'); assert.equal(overlays.at(-1).nextNodeId, 'upper:P1:L:6');
  assert.equal(fx.battleMap.getAttribute('data-gr-world3d-interaction-authority'), 'canonical');
  assert.equal(runtime.snapshot().interaction.complete, true); runtime.destroy();
});

test('unresolved lower identity fails open visually and never invents lower-world semantics', async () => {
  const fx = fixture(); const board = interactionBoard({ lowerCurrent: true });
  fx.board.querySelector = board.querySelector.bind(board); fx.board.querySelectorAll = board.querySelectorAll.bind(board);
  const fakeRenderer = { async replaceBoard() {}, applyInteractionOverlay(overlay) { return { complete: true, applied: overlay.overlays.length, unresolvedNodeIds: [] }; }, inspect() { return { ready: true }; }, destroy() { return true; } };
  const runtime = await mountBattleBoardWorldLive({ document: fx.document, navigator: { deviceMemory: 8 }, matchMedia: () => ({ matches: false }) }, { createRenderer: async () => fakeRenderer });
  assert.equal(runtime.snapshot().interaction.complete, false); assert.equal(runtime.snapshot().interaction.reason, 'LEGACY_MAPPING_INCOMPLETE');
  assert.equal(fx.battleMap.getAttribute('data-gr-world3d-interaction-authority'), null); runtime.destroy();
});

test('Battle screen runtime installs the shared lazy 3D presentation instead of adding another HTML/router path', () => {
  const source = fs.readFileSync(new URL('../browser/battle-screen-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /installBattleBoardWorldLazyMount\(global\)/);
  assert.match(source, /world3dComposition: 'SHARED_LAZY_PRESENTATION_RUNTIME_NO_GAMEPLAY_AUTHORITY'/);
});
