import {
  COMPLETION_CONSEQUENCE,
  projectCompletionRule,
  resolveCompletionRule
} from './new-base-legacy-seven-win-gate-core.mjs';

const PROFILE_SCHEMA = 'GAMEROAD_ROOM_MATCH_COMPLETION_PROFILE_V1';
const EVALUATION_SCHEMA = 'GAMEROAD_ROOM_MATCH_COMPLETION_EVALUATION_V1';
const SPECTATOR_POLICY_SCHEMA = 'GAMEROAD_ROOM_MATCH_SPECTATOR_POLICY_V1';

export const ROOM_COMPLETION_COUNT_CHOICES = Object.freeze([5, 7, 10]);

/**
 * Series choices decided by the user (Plan A, 2026-11-08): BO1 or BO3.
 * BO1 means one match decides the room; BO3 means first to two match wins.
 * This module only holds and shows the series choice; counting wins
 * across matches lives in room-match-series-core.mjs (hon-aka item 4,
 * 2026-11-08, provisional first-to-two shape, decision still pending).
 */
export const ROOM_SERIES_CHOICES = Object.freeze([1, 3]);
export const STANDARD_ROOM_SERIES_BEST_OF = 1;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function withSeriesBestOf(gateRule, seriesBestOf) {
  return deepFreeze({ ...gateRule, seriesBestOf });
}

/**
 * The standard completion rule decided by the user (2026-11-08):
 * seven cards in one lane open every gate, and victory still needs a
 * GOAL arrival afterwards. The gate opening alone never ends a match.
 * Rooms never offer a direct win (Plan A, 2026-11-08): the gate path
 * is the only room rule; the series is BO1 by default.
 */
export const STANDARD_ROOM_COMPLETION_RULE = withSeriesBestOf(resolveCompletionRule({
  completionTargetCount: 7,
  completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH
}), STANDARD_ROOM_SERIES_BEST_OF);

function plainRule(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return {
    completionTargetCount: input.completionTargetCount,
    seriesBestOf: input.seriesBestOf,
    maxReachableCount: input.maxReachableCount ?? null
  };
}

/**
 * Resolves the room completion rule from host-chosen raw choices.
 * Missing input means the standard rule. A count outside the room
 * choices, or a series outside BO1/BO3, fails closed with a throw
 * instead of silently inventing another rule. A stored direct-win
 * consequence is never a room rule (Plan A): it is normalized to the
 * gate path and the count is kept.
 */
export function resolveRoomCompletionRule(input = null) {
  if (input == null) return STANDARD_ROOM_COMPLETION_RULE;
  const raw = plainRule(input);
  if (!raw) throw new TypeError('ROOM_COMPLETION_RULE_REQUIRED');
  if (!ROOM_COMPLETION_COUNT_CHOICES.includes(raw.completionTargetCount)) {
    throw new RangeError('ROOM_COMPLETION_COUNT_CHOICE_REQUIRED');
  }
  const seriesBestOf = raw.seriesBestOf == null ? STANDARD_ROOM_SERIES_BEST_OF : raw.seriesBestOf;
  if (!ROOM_SERIES_CHOICES.includes(seriesBestOf)) {
    throw new RangeError('ROOM_SERIES_CHOICE_REQUIRED');
  }
  return withSeriesBestOf(resolveCompletionRule({
    completionTargetCount: raw.completionTargetCount,
    completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH,
    maxReachableCount: raw.maxReachableCount
  }), seriesBestOf);
}

/**
 * Reads the effective rule for a match: the match's own rule first,
 * then the friend-room profile attached to it, then the standard rule.
 * An invalid stored rule falls back to the standard rule instead of
 * breaking the match.
 */
export function resolveMatchCompletionRule(match = null) {
  const candidates = [
    match?.completionRule,
    match?.friendRoom?.completionRule
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    try {
      return resolveRoomCompletionRule(candidate);
    } catch {
      continue;
    }
  }
  return STANDARD_ROOM_COMPLETION_RULE;
}

export function describeRoomCompletionRule(rule) {
  const resolved = resolveRoomCompletionRule(rule);
  const count = resolved.completionTargetCount;
  const seriesBestOf = resolved.seriesBestOf ?? STANDARD_ROOM_SERIES_BEST_OF;
  return deepFreeze({
    schema: PROFILE_SCHEMA,
    completionTargetCount: count,
    completionConsequence: resolved.completionConsequence,
    seriesBestOf,
    seriesLabel: `BO${seriesBestOf}`,
    title: `${count}枚で門が開いてゴール`,
    detail: `一列に${count}枚ためると門が全部開き、そのあとゴール到達で勝利`,
    shortText: `一列${count}枚で門が開き、ゴール到達で勝利`
  });
}

function maxLaneLength(player) {
  const lanes = player?.lanes;
  if (!lanes || typeof lanes !== 'object') return 0;
  const lengths = Object.values(lanes).map((lane) => (Array.isArray(lane) ? lane.length : 0));
  return lengths.length ? Math.max(...lengths) : 0;
}

function validPlayers(match) {
  if (!match || !Array.isArray(match.players)) return [];
  return match.players.filter((player) => player && typeof player === 'object' && typeof player.id === 'string');
}

/**
 * Evaluates one match through its completion rule.
 *
 * Room rules are gate-only (Plan A, 2026-11-08): reaching players only
 * open the gate. Winners stay empty here; a GOAL arrival is decided by
 * the separate authoritative GOAL flow, which this module never invents.
 * The series (BO1/BO3) is carried on the rule so the room can show it;
 * counting match wins across a series is done in
 * room-match-series-core.mjs, not here.
 */
export function evaluateMatchCompletion(match = null) {
  const rule = resolveMatchCompletionRule(match);
  const players = validPlayers(match);
  const perPlayer = players.map((player) => {
    const maxLane = maxLaneLength(player);
    const projection = projectCompletionRule({ authoritativeCount: maxLane, resolvedRule: rule });
    return deepFreeze({
      id: player.id,
      team: typeof player.team === 'string' ? player.team : null,
      maxLane,
      thresholdReached: projection.thresholdReached,
      gateUnlockPresentationText: projection.gateUnlockPresentationText
    });
  });

  const reached = perPlayer.filter((entry) => entry.thresholdReached);
  const gateOpened = rule.completionConsequence === COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH
    && reached.length > 0;
  const gateOpenedBy = reached.map((entry) => entry.id);

  return deepFreeze({
    schema: EVALUATION_SCHEMA,
    rule: {
      completionTargetCount: rule.completionTargetCount,
      completionConsequence: rule.completionConsequence,
      seriesBestOf: rule.seriesBestOf ?? STANDARD_ROOM_SERIES_BEST_OF
    },
    winners: [],
    gateOpened,
    gateOpenedBy,
    gateUnlockPresentationText: gateOpened ? 'ゲート解放！' : null,
    goalReachStillRequired: gateOpened,
    perPlayer
  });
}

/**
 * Room spectator policy. The host decides; the default is that
 * spectating is allowed, matching the usual open-room default.
 */
export function resolveRoomSpectatorPolicy(input = null) {
  if (input == null) return deepFreeze({ schema: SPECTATOR_POLICY_SCHEMA, spectatorAllowed: true });
  if (typeof input === 'boolean') {
    return deepFreeze({ schema: SPECTATOR_POLICY_SCHEMA, spectatorAllowed: input });
  }
  if (typeof input === 'object' && !Array.isArray(input)) {
    if (input.spectatorAllowed === undefined) {
      return deepFreeze({ schema: SPECTATOR_POLICY_SCHEMA, spectatorAllowed: true });
    }
    if (typeof input.spectatorAllowed !== 'boolean') {
      throw new TypeError('SPECTATOR_ALLOWED_REQUIRED');
    }
    return deepFreeze({ schema: SPECTATOR_POLICY_SCHEMA, spectatorAllowed: input.spectatorAllowed });
  }
  throw new TypeError('SPECTATOR_POLICY_REQUIRED');
}

export function describeRoomSpectatorPolicy(policy) {
  const resolved = resolveRoomSpectatorPolicy(policy);
  return deepFreeze({
    schema: SPECTATOR_POLICY_SCHEMA,
    spectatorAllowed: resolved.spectatorAllowed,
    label: resolved.spectatorAllowed ? '観戦できる' : '観戦できない'
  });
}

export const ROOM_MATCH_COMPLETION_PROFILE = Object.freeze({
  schema: PROFILE_SCHEMA,
  standardRule: 'SEVEN_CARDS_OPEN_GATE_THEN_GOAL_WINS',
  countChoices: ROOM_COMPLETION_COUNT_CHOICES,
  seriesChoices: ROOM_SERIES_CHOICES,
  seriesStandard: STANDARD_ROOM_SERIES_BEST_OF,
  gateOpeningIsTerminal: false,
  goalReachedInference: false,
  winnerInference: false,
  spectatorDefault: true
});
