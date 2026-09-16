import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT,
} from '../browser/battle-interaction-feedback-cue-core.mjs';
import {
  createBattleInteractionFeedbackRuntime,
} from '../browser/battle-interaction-feedback-runtime.mjs';
import {
  BATTLE_FORMAL_SFX_ASSETS,
  BATTLE_FORMAL_SFX_PROVIDER_CONTRACT,
  createBattleFormalSfxProvider,
  resolveBattleFormalSfxAsset,
} from '../browser/battle-formal-sfx-provider.mjs';

const FORMAL_KEYS = BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.formalSfxKeys;

test('formal provider maps only the three currently accepted Battle SFX keys', () => {
  assert.deepEqual(
    BATTLE_FORMAL_SFX_PROVIDER_CONTRACT.acceptedFormalKeys.slice().sort(),
    [FORMAL_KEYS.CLICK, FORMAL_KEYS.CARD_SLIDE, FORMAL_KEYS.CARD_PLACE].sort(),
  );
  assert.equal(BATTLE_FORMAL_SFX_ASSETS[FORMAL_KEYS.CLICK].publicPath, './click_002.ogg');
  assert.equal(BATTLE_FORMAL_SFX_ASSETS[FORMAL_KEYS.CARD_SLIDE].publicPath, './cardSlide6.ogg');
  assert.equal(BATTLE_FORMAL_SFX_ASSETS[FORMAL_KEYS.CARD_PLACE].publicPath, './cardPlace1.ogg');
  assert.equal(resolveBattleFormalSfxAsset('winner-lock'), null);
  assert.equal(BATTLE_FORMAL_SFX_PROVIDER_CONTRACT.createsNewSfxVocabulary, false);
  assert.equal(BATTLE_FORMAL_SFX_PROVIDER_CONTRACT.audioSettingsAuthority, false);
  assert.equal(BATTLE_FORMAL_SFX_PROVIDER_CONTRACT.playbackAuthority, false);
});

test('provider delegates playback without creating mute or volume authority', () => {
  const calls = [];
  const provider = createBattleFormalSfxProvider({
    playAsset: (publicPath, context) => {
      calls.push({ publicPath, context });
      return 'started';
    },
  });

  assert.equal(provider.playFormalSfx(FORMAL_KEYS.CARD_SLIDE), 'started');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].publicPath, './cardSlide6.ogg');
  assert.equal(calls[0].context.formalSfxKey, FORMAL_KEYS.CARD_SLIDE);
  assert.equal(calls[0].context.formalAsset, true);
  assert.equal(calls[0].context.settingsAuthority, false);
  assert.equal(calls[0].context.playbackAuthority, false);
});

test('provider fails closed for unmapped future semantic sound classes', () => {
  let called = false;
  const provider = createBattleFormalSfxProvider({
    playAsset: () => {
      called = true;
    },
  });

  assert.throws(
    () => provider.playFormalSfx('winner-lock'),
    /BATTLE_FORMAL_SFX_KEY_UNMAPPED/,
  );
  assert.equal(called, false);
});

test('existing Battle feedback runtime routes accepted cues through the formal provider', () => {
  const played = [];
  const provider = createBattleFormalSfxProvider({
    playAsset: (publicPath, context) => played.push({ publicPath, context }),
  });
  const runtime = createBattleInteractionFeedbackRuntime({
    playFormalSfx: provider.playFormalSfx,
  });

  const input = runtime.publish('INPUT_ACCEPTED', { feedbackId: 'input-1' });
  const staged = runtime.publish('STAGED_SELECTION', { feedbackId: 'stage-1' });
  const commit = runtime.publish('COMMIT_ACCEPTED', {
    feedbackId: 'commit-1',
    authoritativeAccepted: true,
  });

  assert.equal(input.delivery.audio, 'DELIVERED');
  assert.equal(staged.delivery.audio, 'DELIVERED');
  assert.equal(commit.delivery.audio, 'DELIVERED');
  assert.deepEqual(played.map((entry) => entry.publicPath), [
    './click_002.ogg',
    './cardSlide6.ogg',
    './cardPlace1.ogg',
  ]);

  const duplicate = runtime.publish('COMMIT_ACCEPTED', {
    feedbackId: 'commit-1',
    authoritativeAccepted: true,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(played.length, 3);
});
