import test from 'node:test';
import assert from 'node:assert/strict';
import '../deploy/cloudflare/tests/normal-match-r3.test.mjs';
import {
  FIELD_MUSIC_ROLE,
  resolveEffectiveMusicVolume,
  resolveFieldMusicSelection,
  resolveOneShotFallback,
} from '../browser/field-music-policy-core.mjs';

const TRACKS = [
  { key: 'field.a', role: FIELD_MUSIC_ROLE, weight: 50, defaultWeight: 50, baseVolume: 0.65 },
  { key: 'field.b', role: FIELD_MUSIC_ROLE, weight: 50, defaultWeight: 50, baseVolume: 0.5 },
];

test('FIELD_MUSIC never aliases an unsupported BATTLE_MUSIC role and invalid context stays silent', () => {
  assert.deepEqual(
    resolveFieldMusicSelection({ role: 'BATTLE_MUSIC', fieldId: 'field.initial', sessionId: 'm1', tracks: TRACKS }),
    {
      kind: 'silent', role: FIELD_MUSIC_ROLE, reason: 'unsupported_role', fieldId: 'field.initial', sessionId: 'm1', trackKey: null, source: null,
    },
  );
  assert.equal(resolveFieldMusicSelection({ role: FIELD_MUSIC_ROLE, tracks: TRACKS }).reason, 'invalid_context');
});

test('weighted selection is stable for the same field/session and does not redraw when weights change', () => {
  const first = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-1',
    tracks: TRACKS,
    random: () => 0.9,
  });
  assert.equal(first.trackKey, 'field.b');
  assert.equal(first.source, 'configured_weight');

  const cached = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-1',
    tracks: [
      { ...TRACKS[0], weight: 100 },
      { ...TRACKS[1], weight: 0 },
    ],
    previousSelection: first,
    random: () => 0,
  });
  assert.equal(cached.trackKey, 'field.b');
  assert.equal(cached.source, 'session_cache');
  assert.equal(cached.reason, 'session_cached');
});

test('all configured weights zero uses only caller-supplied defaults; no positive defaults is silent', () => {
  const fallbackDefaults = TRACKS.map((track, index) => ({ ...track, weight: 0, defaultWeight: index === 0 ? 25 : 75 }));
  const selected = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-2',
    tracks: fallbackDefaults,
    random: () => 0.5,
  });
  assert.equal(selected.trackKey, 'field.b');
  assert.equal(selected.source, 'default_weight');

  const silent = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-3',
    tracks: fallbackDefaults.map((track) => ({ ...track, defaultWeight: 0 })),
  });
  assert.equal(silent.kind, 'silent');
  assert.equal(silent.reason, 'no_positive_weight');
});

test('effective volume is baseVolume multiplied by user volume and mute is authoritative', () => {
  assert.equal(resolveEffectiveMusicVolume({ baseVolume: 0.65, musicVolume: 0.5 }), 0.325);
  assert.equal(resolveEffectiveMusicVolume({ baseVolume: 2, musicVolume: -1 }), 0);
  assert.equal(resolveEffectiveMusicVolume({ baseVolume: 0.65, musicVolume: 0.5, musicMuted: true }), 0);
});

test('playback failure can nominate at most one positive-weight alternate and then stops', () => {
  const fallback = resolveOneShotFallback({
    role: FIELD_MUSIC_ROLE,
    failedTrackKey: 'field.a',
    attemptedTrackKeys: ['field.a'],
    tracks: TRACKS,
    random: () => 0,
  });
  assert.equal(fallback.trackKey, 'field.b');
  assert.equal(fallback.reason, 'primary_failed_once');

  const noSecondFallback = resolveOneShotFallback({
    role: FIELD_MUSIC_ROLE,
    failedTrackKey: 'field.b',
    attemptedTrackKeys: ['field.a', 'field.b'],
    tracks: TRACKS,
    random: () => 0,
  });
  assert.equal(noSecondFallback, null);

  const noZeroWeightFallback = resolveOneShotFallback({
    role: FIELD_MUSIC_ROLE,
    failedTrackKey: 'field.a',
    attemptedTrackKeys: ['field.a'],
    tracks: TRACKS.map((track) => ({ ...track, weight: 0 })),
  });
  assert.equal(noZeroWeightFallback, null);
});

test('duplicate, malformed, and non-FIELD track entries cannot create an implicit playable choice', () => {
  const selected = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-4',
    tracks: [
      null,
      { key: '' },
      { key: 'battle.only', role: 'BATTLE_MUSIC', weight: 100, defaultWeight: 100 },
      { key: 'field.a', role: FIELD_MUSIC_ROLE, weight: 100, defaultWeight: 100 },
      { key: 'field.a', role: FIELD_MUSIC_ROLE, weight: 100, defaultWeight: 100 },
    ],
  });
  assert.equal(selected.trackKey, 'field.a');
});
