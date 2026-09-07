import test from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_TRANSIENT_KIND, resolveSafeTransientState} from '../browser/transient-cancel-runtime.mjs';

test('no transient leaves navigation untouched', () => {
  assert.deepEqual(resolveSafeTransientState(), {kind: null, dismissible: false, reason: 'none'});
});

test('each approved safe transient is independently dismissible', () => {
  assert.deepEqual(resolveSafeTransientState({cardPreview: true}), {
    kind: SAFE_TRANSIENT_KIND.CARD_PREVIEW, dismissible: true, reason: 'safe-transient',
  });
  assert.deepEqual(resolveSafeTransientState({gachaFocus: true}), {
    kind: SAFE_TRANSIENT_KIND.GACHA_FOCUS, dismissible: true, reason: 'safe-transient',
  });
  assert.deepEqual(resolveSafeTransientState({battleDrawer: true}), {
    kind: SAFE_TRANSIENT_KIND.BATTLE_DRAWER, dismissible: true, reason: 'safe-transient',
  });
});

test('required-choice and battle-phase blockers fail closed', () => {
  assert.deepEqual(resolveSafeTransientState({blocker: true, battleDrawer: true}), {
    kind: null, dismissible: false, reason: 'blocking-surface',
  });
});

test('ambiguous multiple transients fail closed rather than guessing frontmost', () => {
  assert.deepEqual(resolveSafeTransientState({cardPreview: true, gachaFocus: true}), {
    kind: null, dismissible: false, reason: 'ambiguous-frontmost',
  });
});
