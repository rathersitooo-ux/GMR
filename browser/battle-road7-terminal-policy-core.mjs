export const ROAD7_TERMINAL_POLICY = Object.freeze({
  LEGACY_IMMEDIATE_MATCH_WIN: 'LEGACY_ROAD7_IMMEDIATE_MATCH_WIN',
  NON_TERMINAL: 'ROAD7_NON_TERMINAL',
});

function assertLegacyPlayers(players) {
  if (!Array.isArray(players)) {
    throw new TypeError('players must be an array for legacy ROAD7 terminal resolution');
  }
  for (const player of players) {
    if (!player || typeof player !== 'object' || Array.isArray(player)) {
      throw new TypeError('legacy ROAD7 player must be an object');
    }
    if (!player.lanes || typeof player.lanes !== 'object' || Array.isArray(player.lanes)) {
      throw new TypeError('legacy ROAD7 player lanes must be an object');
    }
    for (const lane of Object.values(player.lanes)) {
      if (!Array.isArray(lane)) {
        throw new TypeError('legacy ROAD7 lane must be an array');
      }
    }
  }
}

function maxLegacyLaneDepth(player) {
  return Math.max(0, ...Object.values(player.lanes).map((lane) => lane.length));
}

export function resolveRoad7TerminalWinners({ policy, mode, players } = {}) {
  if (policy === ROAD7_TERMINAL_POLICY.NON_TERMINAL) {
    return Object.freeze([]);
  }
  if (policy !== ROAD7_TERMINAL_POLICY.LEGACY_IMMEDIATE_MATCH_WIN) {
    throw new TypeError('explicit ROAD7 terminal policy is required');
  }
  if (typeof mode !== 'string' || mode.length === 0) {
    throw new TypeError('mode is required for legacy ROAD7 terminal resolution');
  }

  assertLegacyPlayers(players);

  if (mode === '2v2') {
    return Object.freeze(
      ['A', 'B'].filter((team) =>
        players
          .filter((player) => player.team === team)
          .some((player) => maxLegacyLaneDepth(player) >= 7),
      ),
    );
  }

  const winners = players
    .filter((player) => maxLegacyLaneDepth(player) >= 7)
    .map((player) => {
      if (player.id === undefined || player.id === null) {
        throw new TypeError('legacy ROAD7 qualifying player id is required');
      }
      return player.id;
    });

  return Object.freeze(winners);
}
