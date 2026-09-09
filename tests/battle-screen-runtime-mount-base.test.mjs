import test from 'node:test';
import assert from 'node:assert/strict';

import * as baseRuntime from '../browser/battle-screen-runtime-mount-base.mjs';
import {
  BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_CSS,
  BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID,
  BATTLE_SCREEN_RUNTIME,
  installBattleScreenPortraitLiveOverride,
  mountBattleScreenExternalSurface,
} from '../browser/battle-screen-runtime-mount.mjs';

function fakeDocument() {
  const byId = new Map();
  const children = [];
  return {
    children,
    getElementById(id) {
      return byId.get(id) ?? null;
    },
    createElement(tagName) {
      return { tagName, id: '', textContent: '' };
    },
    head: {
      appendChild(node) {
        children.push(node);
        if (node.id) byId.set(node.id, node);
        return node;
      },
    },
  };
}

test('canonical battle-screen module re-exports the byte-identical base runtime', () => {
  assert.equal(BATTLE_SCREEN_RUNTIME, baseRuntime.BATTLE_SCREEN_RUNTIME);
  assert.equal(mountBattleScreenExternalSurface, baseRuntime.mountBattleScreenExternalSurface);
});

test('portrait live override installs once and restores compact 4P world-first composition', () => {
  const documentRef = fakeDocument();
  const first = installBattleScreenPortraitLiveOverride(documentRef);
  const second = installBattleScreenPortraitLiveOverride(documentRef);
  assert.equal(first, second);
  assert.equal(documentRef.children.length, 1);
  assert.equal(first.id, BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID);
  assert.equal(first.textContent, BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_CSS);
  assert.match(first.textContent, /height:52px!important/);
  assert.match(first.textContent, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(first.textContent, /bottom:248px!important/);
  assert.match(first.textContent, /data-battle-progress-guide\]\{display:none!important\}/);
  assert.match(first.textContent, /grBattleLaneRole.*grBattleLaneAfterstate\{display:none!important\}/);
});
