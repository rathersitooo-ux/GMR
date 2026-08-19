export const FIELD_MUSIC_ROLE = 'FIELD_MUSIC';

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number <= 0) return 0;
  if (number >= 1) return 1;
  return number;
}

function clampWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number <= 0) return 0;
  if (number >= 100) return 100;
  return number;
}

function safeKey(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  const seen = new Set();
  const normalized = [];
  for (const track of tracks) {
    if (!track || typeof track !== 'object') continue;
    const key = safeKey(track.key);
    if (!key || seen.has(key)) continue;
    if (track.role != null && track.role !== FIELD_MUSIC_ROLE) continue;
    seen.add(key);
    normalized.push(Object.freeze({
      key,
      weight: clampWeight(track.weight),
      defaultWeight: clampWeight(track.defaultWeight),
      baseVolume: clamp01(track.baseVolume == null ? 1 : track.baseVolume),
    }));
  }
  return normalized;
}

function normalizedRandom(random) {
  if (typeof random !== 'function') return 0;
  const value = Number(random());
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1 - Number.EPSILON;
  return value;
}

function chooseWeighted(tracks, weightOf, random) {
  const weighted = tracks
    .map((track) => ({ track, weight: clampWeight(weightOf(track)) }))
    .filter(({ weight }) => weight > 0);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(total > 0)) return null;
  let cursor = normalizedRandom(random) * total;
  for (const entry of weighted) {
    if (cursor < entry.weight) return entry.track;
    cursor -= entry.weight;
  }
  return weighted.at(-1)?.track ?? null;
}

function silent(reason, context = {}) {
  return Object.freeze({
    kind: 'silent',
    role: FIELD_MUSIC_ROLE,
    reason,
    fieldId: safeKey(context.fieldId),
    sessionId: safeKey(context.sessionId),
    trackKey: null,
    source: null,
  });
}

export function resolveFieldMusicSelection({
  role,
  fieldId,
  sessionId,
  tracks,
  previousSelection = null,
  random = Math.random,
} = {}) {
  const normalizedFieldId = safeKey(fieldId);
  const normalizedSessionId = safeKey(sessionId);
  if (role !== FIELD_MUSIC_ROLE) return silent('unsupported_role', { fieldId, sessionId });
  if (!normalizedFieldId || !normalizedSessionId) return silent('invalid_context', { fieldId, sessionId });

  const normalizedTracks = normalizeTracks(tracks);
  if (normalizedTracks.length === 0) return silent('no_tracks', { fieldId, sessionId });

  if (
    previousSelection
    && previousSelection.kind === 'selected'
    && previousSelection.role === FIELD_MUSIC_ROLE
    && previousSelection.fieldId === normalizedFieldId
    && previousSelection.sessionId === normalizedSessionId
  ) {
    const cachedTrack = normalizedTracks.find((track) => track.key === previousSelection.trackKey);
    if (!cachedTrack) return silent('cached_track_missing', { fieldId, sessionId });
    return Object.freeze({
      kind: 'selected',
      role: FIELD_MUSIC_ROLE,
      reason: 'session_cached',
      fieldId: normalizedFieldId,
      sessionId: normalizedSessionId,
      trackKey: cachedTrack.key,
      baseVolume: cachedTrack.baseVolume,
      source: 'session_cache',
    });
  }

  const hasConfiguredWeight = normalizedTracks.some((track) => track.weight > 0);
  const source = hasConfiguredWeight ? 'configured_weight' : 'default_weight';
  const selected = chooseWeighted(
    normalizedTracks,
    hasConfiguredWeight ? (track) => track.weight : (track) => track.defaultWeight,
    random,
  );
  if (!selected) return silent('no_positive_weight', { fieldId, sessionId });

  return Object.freeze({
    kind: 'selected',
    role: FIELD_MUSIC_ROLE,
    reason: 'selected',
    fieldId: normalizedFieldId,
    sessionId: normalizedSessionId,
    trackKey: selected.key,
    baseVolume: selected.baseVolume,
    source,
  });
}

export function resolveEffectiveMusicVolume({ baseVolume = 1, musicVolume = 1, musicMuted = false } = {}) {
  if (musicMuted === true) return 0;
  return clamp01(baseVolume) * clamp01(musicVolume);
}

export function resolveOneShotFallback({
  role,
  failedTrackKey,
  tracks,
  attemptedTrackKeys = [],
  random = Math.random,
} = {}) {
  if (role !== FIELD_MUSIC_ROLE) return null;
  const failedKey = safeKey(failedTrackKey);
  if (!failedKey) return null;

  const attempted = new Set(
    (Array.isArray(attemptedTrackKeys) ? attemptedTrackKeys : [])
      .map(safeKey)
      .filter(Boolean),
  );
  attempted.add(failedKey);
  if (attempted.size >= 2) return null;

  const candidates = normalizeTracks(tracks).filter(
    (track) => !attempted.has(track.key) && track.weight > 0,
  );
  const selected = chooseWeighted(candidates, (track) => track.weight, random);
  if (!selected) return null;

  return Object.freeze({
    kind: 'fallback',
    role: FIELD_MUSIC_ROLE,
    trackKey: selected.key,
    baseVolume: selected.baseVolume,
    reason: 'primary_failed_once',
  });
}

export const FIELD_MUSIC_POLICY_CORE = Object.freeze({
  schema: 'gameroad.field-music-policy.v1',
  role: FIELD_MUSIC_ROLE,
  resolveSelection: resolveFieldMusicSelection,
  resolveEffectiveVolume: resolveEffectiveMusicVolume,
  resolveOneShotFallback,
});
