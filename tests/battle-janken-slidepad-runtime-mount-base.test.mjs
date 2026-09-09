import test from 'node:test';
import assert from 'node:assert/strict';

import * as baseRuntime from '../browser/battle-janken-slidepad-runtime-mount-base.mjs';
import {
  BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_CSS,
  BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID,
  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
  installBattleJankenPortraitLiveOverride,
  mountBattleJankenSlidePadRuntime,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

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

test('canonical janken module re-exports the byte-identical base runtime', () => {
  assert.equal(BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA, baseRuntime.BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA);
  assert.equal(mountBattleJankenSlidePadRuntime, baseRuntime.mountBattleJankenSlidePadRuntime);
});

test('portrait live override returns SlidePad and optional roulette to the bottom-right thumb family', () => {
  const documentRef = fakeDocument();
  const first = installBattleJankenPortraitLiveOverride(documentRef);
  const second = installBattleJankenPortraitLiveOverride(documentRef);
  assert.equal(first, second);
  assert.equal(documentRef.children.length, 1);
  assert.equal(first.id, BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID);
  assert.equal(first.textContent, BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_CSS);
  assert.match(first.textContent, /data-battle-janken-slidepad="1"\]\{right:max\(12px,env\(safe-area-inset-right\)\)!important;bottom:max\(12px,env\(safe-area-inset-bottom\)\)!important\}/);
  assert.match(first.textContent, /right:176px!important;left:auto!important/);
  assert.match(first.textContent, /max-width:min\(164px,42vw\)!important/);
});
