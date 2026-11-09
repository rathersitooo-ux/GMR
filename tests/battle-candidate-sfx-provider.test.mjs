import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BATTLE_CANDIDATE_SFX_ASSETS,
  BATTLE_CANDIDATE_SFX_EVENT_MAP,
  BATTLE_CANDIDATE_SFX_KEYS,
  BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT,
  createBattleCandidateSfxProvider,
  resolveBattleCandidateSfxAsset,
  resolveBattleCandidateSfxKeyForEvent,
} from '../browser/battle-candidate-sfx-provider.mjs';
import {
  BATTLE_FORMAL_SFX_ASSETS,
} from '../browser/battle-formal-sfx-provider.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const KEYS = BATTLE_CANDIDATE_SFX_KEYS;

test('candidate provider covers the nine missing battle scenes and stays candidate', () => {
  assert.deepEqual(
    BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.candidateKeys.slice().sort(),
    Object.values(KEYS).sort(),
  );
  assert.equal(BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.formalAsset, false);
  assert.equal(BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.candidateAsset, true);
  assert.equal(BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.humanAcceptance, '未確認');
  assert.equal(BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.replacesFormalProvider, false);
  assert.equal(BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.audioSettingsAuthority, false);
  assert.equal(BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT.playbackAuthority, false);
  // 正式3音の置き場所とは重ならない
  const formalPaths = new Set(Object.values(BATTLE_FORMAL_SFX_ASSETS).map((a) => a.sourcePath));
  for (const asset of Object.values(BATTLE_CANDIDATE_SFX_ASSETS)) {
    assert.equal(formalPaths.has(asset.sourcePath), false, asset.sourcePath);
  }
});

test('battle start candidate matches the BATTLE START movie length (title 0.6s + entry 0.8s)', () => {
  const asset = resolveBattleCandidateSfxAsset(KEYS.BATTLE_START);
  assert.equal(asset.durationMs, 1400);
  assert.equal(asset.publicPath, './battleStart.ogg');
  assert.equal(asset.sourcePath, 'assets/audio/sfx/candidate/battleStart.ogg');
});

test('every candidate key resolves to a real Ogg Vorbis file in the copy', () => {
  for (const asset of Object.values(BATTLE_CANDIDATE_SFX_ASSETS)) {
    const file = path.join(repoRoot, asset.sourcePath);
    const size = statSync(file).size;
    assert.ok(size > 1000, `${asset.sourcePath} should be a real sound file, got ${size} bytes`);
    const head = readFileSync(file).subarray(0, 4).toString('latin1');
    assert.equal(head, 'OggS', `${asset.sourcePath} should be Ogg`);
  }
});

test('provider delegates playback with candidate context and no settings authority', () => {
  const calls = [];
  const provider = createBattleCandidateSfxProvider({
    playAsset: (publicPath, context) => {
      calls.push({ publicPath, context });
      return 'started';
    },
  });

  assert.equal(provider.playCandidateSfx(KEYS.BATTLE_START), 'started');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].publicPath, './battleStart.ogg');
  assert.equal(calls[0].context.candidateSfxKey, KEYS.BATTLE_START);
  assert.equal(calls[0].context.formalAsset, false);
  assert.equal(calls[0].context.candidateAsset, true);
  assert.equal(calls[0].context.settingsAuthority, false);
  assert.equal(calls[0].context.playbackAuthority, false);
  assert.equal(calls[0].context.gameStateWrite, false);
});

test('provider fails closed for unmapped keys and events', () => {
  let called = false;
  const provider = createBattleCandidateSfxProvider({
    playAsset: () => { called = true; },
  });
  assert.throws(() => provider.playCandidateSfx('click'), /BATTLE_CANDIDATE_SFX_KEY_UNMAPPED/);
  assert.throws(() => provider.playCandidateSfx('winner-lock'), /BATTLE_CANDIDATE_SFX_KEY_UNMAPPED/);
  assert.throws(() => provider.playCandidateEvent('COMMIT_ACCEPTED'), /BATTLE_CANDIDATE_SFX_EVENT_UNMAPPED/);
  assert.equal(called, false);
  assert.equal(resolveBattleCandidateSfxAsset('click'), null);
  assert.equal(resolveBattleCandidateSfxAsset(' cardSlide '), null);
});

test('event map routes battle events to candidate keys without touching formal scenes', () => {
  assert.equal(resolveBattleCandidateSfxKeyForEvent('BATTLE_START'), KEYS.BATTLE_START);
  assert.equal(resolveBattleCandidateSfxKeyForEvent('PUBLIC_REVEAL'), KEYS.CARD_REVEAL);
  assert.equal(resolveBattleCandidateSfxKeyForEvent('GATE_OPENED'), KEYS.GOAL_OPEN);
  assert.equal(resolveBattleCandidateSfxKeyForEvent('GOAL_REACHED'), KEYS.GOAL_OPEN);
  // 正式3音が担う場面（入力・決定）は候補へ回さない
  assert.equal(BATTLE_CANDIDATE_SFX_EVENT_MAP.INPUT_ACCEPTED, undefined);
  assert.equal(BATTLE_CANDIDATE_SFX_EVENT_MAP.COMMIT_ACCEPTED, undefined);
  assert.equal(BATTLE_CANDIDATE_SFX_EVENT_MAP.STAGED_SELECTION, undefined);

  const played = [];
  const provider = createBattleCandidateSfxProvider({
    playAsset: (publicPath) => played.push(publicPath),
  });
  provider.playCandidateEvent('MATCH_VICTORY');
  provider.playCandidateEvent('INVALID_ACTION');
  assert.deepEqual(played, ['./victory.ogg', './invalid.ogg']);
});
