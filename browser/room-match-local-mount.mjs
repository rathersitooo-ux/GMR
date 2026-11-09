import {
  ROOM_COMPLETION_COUNT_CHOICES,
  ROOM_MATCH_COMPLETION_PROFILE,
  ROOM_SERIES_CHOICES,
  STANDARD_ROOM_COMPLETION_RULE,
  STANDARD_ROOM_SERIES_BEST_OF,
  describeRoomCompletionRule,
  describeRoomSpectatorPolicy,
  evaluateMatchCompletion,
  resolveMatchCompletionRule,
  resolveRoomCompletionRule,
  resolveRoomSpectatorPolicy
} from './room-match-completion-profile-core.mjs';
import {
  ROOM_MATCH_SPECTATOR_PROJECTION,
  buildSpectatorPlayer,
  isSpectatorProjection,
  isSpectatorViewer,
  normalizeSpectatorViewer,
  spectatorReplayEventsFromProjection
} from './room-match-spectator-projection-core.mjs';
import {
  ROOM_MATCH_SERIES,
  createRoomSeriesState,
  describeRoomSeries,
  recordRoomSeriesMatch,
  resolveRoomSeriesState,
  roomSeriesSnapshot,
  seriesWinnerKeysForMatch,
  winsNeededForSeries
} from './room-match-series-core.mjs';

const MOUNT_SCHEMA = 'GAMEROAD_ROOM_MATCH_LOCAL_MOUNT_V1';

const api = Object.freeze({
  schema: MOUNT_SCHEMA,
  completion: Object.freeze({
    schema: ROOM_MATCH_COMPLETION_PROFILE.schema,
    standardRule: STANDARD_ROOM_COMPLETION_RULE,
    countChoices: ROOM_COMPLETION_COUNT_CHOICES,
    seriesChoices: ROOM_SERIES_CHOICES,
    seriesStandard: STANDARD_ROOM_SERIES_BEST_OF,
    resolveRoomCompletionRule,
    resolveMatchCompletionRule,
    describeRoomCompletionRule,
    evaluateMatchCompletion,
    resolveRoomSpectatorPolicy,
    describeRoomSpectatorPolicy
  }),
  spectator: Object.freeze({
    schema: ROOM_MATCH_SPECTATOR_PROJECTION.viewerRole,
    normalizeSpectatorViewer,
    isSpectatorViewer,
    buildSpectatorPlayer,
    isSpectatorProjection,
    spectatorReplayEventsFromProjection
  }),
  series: Object.freeze({
    schema: ROOM_MATCH_SERIES.schema,
    winsNeededByBestOf: ROOM_MATCH_SERIES.winsNeededByBestOf,
    provisional: ROOM_MATCH_SERIES.provisional,
    winsNeededForSeries,
    createRoomSeriesState,
    resolveRoomSeriesState,
    seriesWinnerKeysForMatch,
    recordRoomSeriesMatch,
    roomSeriesSnapshot,
    describeRoomSeries
  })
});

const existing = globalThis.GAMEROAD_ROOM_MATCH;
if (existing && existing.schema !== MOUNT_SCHEMA) {
  throw new Error('GAMEROAD_ROOM_MATCH_CONFLICT');
}
if (!existing) {
  Object.defineProperty(globalThis, 'GAMEROAD_ROOM_MATCH', {
    value: api,
    enumerable: false,
    configurable: false
  });
}

export const GAMEROAD_ROOM_MATCH_API = api;
