import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT,
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
      add(value) { this.values.add(value); },
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

test('live mount contract preserves the existing board as interaction authority', () => {
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.consumesExistingWorldFieldMount, true);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.existingBoardDomRemainsInteractiveAuthority, true);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.secondBoardEngine, false);
  assert.equal(BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT.gameStateWrite, false);
});
