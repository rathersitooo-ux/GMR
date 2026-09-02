import test from 'node:test';
import assert from 'node:assert/strict';
import '../deploy/cloudflare/tests/normal-match-r3.test.mjs';
import {
  DEFAULT_FIELD_MUSIC_WEIGHT,
  FIELD_MUSIC_ROLE,
  applyFieldMusicSettings,
  normalizeFieldMusicSettings,
  resolveEffectiveMusicVolume,
  resolveFieldMusicSelection,
  resolveOneShotFallback,
} from '../browser/field-music-policy-core.mjs';

const TRACKS = [
  { key: 'field.a', role: FIELD_MUSIC_ROLE, weight: 50, defaultWeight: 50, baseVolume: 0.65 },
  { key: 'field.b', role: FIELD_MUSIC_ROLE, weight: 50, defaultWeight: 50, baseVolume: 0.5 },
];

const TEN_TRACKS = Array.from({ length: 10 }, (_, index) => ({
  key: `field.track.${index + 1}`,
  role: FIELD_MUSIC_ROLE,
  weight: DEFAULT_FIELD_MUSIC_WEIGHT,
  defaultWeight: DEFAULT_FIELD_MUSIC_WEIGHT,
  baseVolume: 1,
}));

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

test('playback failure can nominate at most one alternate and all-zero configured weights use defaults', () => {
  const fallback = resolveOneShotFallback({
    role: FIELD_MUSIC_ROLE,
    failedTrackKey: 'field.a',
    attemptedTrackKeys: ['field.a'],
    tracks: TRACKS,
    random: () => 0,
  });
  assert.equal(fallback.trackKey, 'field.b');
  assert.equal(fallback.reason, 'primary_failed_once');
  assert.equal(fallback.source, 'configured_weight');

  const noSecondFallback = resolveOneShotFallback({
    role: FIELD_MUSIC_ROLE,
    failedTrackKey: 'field.b',
    attemptedTrackKeys: ['field.a', 'field.b'],
    tracks: TRACKS,
    random: () => 0,
  });
  assert.equal(noSecondFallback, null);

  const defaultFallback = resolveOneShotFallback({
    role: FIELD_MUSIC_ROLE,
    failedTrackKey: 'field.a',
    attemptedTrackKeys: ['field.a'],
    tracks: TRACKS.map((track) => ({ ...track, weight: 0 })),
    random: () => 0,
  });
  assert.equal(defaultFallback.trackKey, 'field.b');
  assert.equal(defaultFallback.source, 'default_weight');
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

test('My Music settings expose all 10 tracks at equal defaults and preserve independent volume/mute', () => {
  const settings = normalizeFieldMusicSettings({
    trackKeys: TEN_TRACKS.map((track) => track.key),
    musicVolume: 0.7,
    musicMuted: false,
  });
  assert.equal(settings.defaultWeight, 50);
  assert.equal(Object.keys(settings.trackWeights).length, 10);
  assert.ok(Object.values(settings.trackWeights).every((weight) => weight === 50));
  assert.equal(settings.musicVolume, 0.7);
  assert.equal(settings.musicMuted, false);

  const applied = applyFieldMusicSettings({ tracks: TEN_TRACKS, settings });
  assert.equal(applied.length, 10);
  assert.ok(applied.every((track) => track.weight === 50 && track.defaultWeight === 50));
});

test('My Music can pin one song with 100/0/... and all-zero intentionally falls back to equal defaults', () => {
  const pinnedWeights = Object.fromEntries(TEN_TRACKS.map((track, index) => [track.key, index === 6 ? 100 : 0]));
  const pinnedSettings = normalizeFieldMusicSettings({
    trackKeys: TEN_TRACKS.map((track) => track.key),
    trackWeights: pinnedWeights,
  });
  const pinnedTracks = applyFieldMusicSettings({ tracks: TEN_TRACKS, settings: pinnedSettings });
  const pinned = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-pinned',
    tracks: pinnedTracks,
    random: () => 0.99,
  });
  assert.equal(pinned.trackKey, TEN_TRACKS[6].key);
  assert.equal(pinned.source, 'configured_weight');

  const zeroSettings = normalizeFieldMusicSettings({
    trackKeys: TEN_TRACKS.map((track) => track.key),
    trackWeights: Object.fromEntries(TEN_TRACKS.map((track) => [track.key, 0])),
  });
  const zeroTracks = applyFieldMusicSettings({ tracks: TEN_TRACKS, settings: zeroSettings });
  const defaulted = resolveFieldMusicSelection({
    role: FIELD_MUSIC_ROLE,
    fieldId: 'field.initial',
    sessionId: 'match-zero',
    tracks: zeroTracks,
    random: () => 0.95,
  });
  assert.equal(defaulted.trackKey, TEN_TRACKS[9].key);
  assert.equal(defaulted.source, 'default_weight');
});
