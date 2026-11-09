// season-monthly-event-core.mjs -- S1-06 + S1-07 + S1-10 + S1-11
// Monthly events A/B/D state machines (festival C lives in festival core).
// All state is pure and frozen; day keys are explicit strings like '01-05'
// so tests and the closing job can drive any day.
// A: solo drop vs CPU -- first 3 wins of the day pay big, later wins pay small.
// B: weekly missions (7 missions, 4th-10th) -- each mission once, all-done bonus.
// D: exchange -- spend event tokens on a chosen reward; leftover tokens
// convert to manny at month end (1 token = 5 manny, plan baseline).

const SCHEMA_DROP = 'gameroad.season-drop.v1';
const SCHEMA_MISSIONS = 'gameroad.season-weekly-missions.v1';
const SCHEMA_EXCHANGE = 'gameroad.season-exchange.v1';
export const DROP_BIG_WINS_PER_DAY = 3;
export const EXCHANGE_TOKEN_TO_MANNY = 5;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertDayKey(dayKey) {
  if (typeof dayKey !== 'string' || !/^\d{2}-\d{2}$/.test(dayKey)) throw new TypeError('DAY_KEY_INVALID');
  return dayKey;
}

// --- A: solo drop ---
export function createDropState({ seasonId, month } = {}) {
  if (typeof seasonId !== 'string' || !seasonId) throw new TypeError('SEASON_ID_REQUIRED');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  return freeze({ schema: SCHEMA_DROP, seasonId, month, winsByDay: Object.freeze({}) });
}

export function recordDropBattle(state, { dayKey, won } = {}) {
  if (!state || state.schema !== SCHEMA_DROP) throw new TypeError('DROP_STATE_REQUIRED');
  assertDayKey(dayKey);
  if (won !== true && won !== false) throw new TypeError('WON_INVALID');
  const wins = state.winsByDay[dayKey] ?? 0;
  if (!won) return freeze({ state, reward: null, reason: 'LOST' });
  const nextWins = wins + 1;
  const big = nextWins <= DROP_BIG_WINS_PER_DAY;
  const next = freeze({
    ...state,
    winsByDay: Object.freeze({ ...state.winsByDay, [dayKey]: nextWins }),
  });
  return freeze({
    state: next,
    reward: big
      ? freeze({ kind: 'drop-big', tokens: 3, catalogPoints: 10 })
      : freeze({ kind: 'drop-small', tokens: 1, catalogPoints: 5 }),
    reason: big ? 'BIG' : 'SMALL',
  });
}

// --- B: weekly missions ---
export const WEEKLY_MISSION_IDS = freeze([
  'battle-3', 'win-1', 'grow-1', 'watch-1', 'deck-1', 'partner-1', 'festival-1',
]);

export function createWeeklyMissions({ seasonId, month } = {}) {
  if (typeof seasonId !== 'string' || !seasonId) throw new TypeError('SEASON_ID_REQUIRED');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  return freeze({
    schema: SCHEMA_MISSIONS, seasonId, month,
    done: Object.freeze([]),
    allDoneBonusClaimed: false,
  });
}

export function completeWeeklyMission(state, missionId) {
  if (!state || state.schema !== SCHEMA_MISSIONS) throw new TypeError('MISSIONS_STATE_REQUIRED');
  if (!WEEKLY_MISSION_IDS.includes(missionId)) throw new TypeError('MISSION_INVALID');
  if (state.done.includes(missionId)) {
    return freeze({ state, completed: false, reason: 'ALREADY_DONE', reward: null });
  }
  const done = Object.freeze([...state.done, missionId]);
  const allDone = done.length === WEEKLY_MISSION_IDS.length;
  return freeze({
    state: freeze({ ...state, done }),
    completed: true,
    reason: allDone ? 'ALL_DONE' : 'OK',
    reward: freeze({ kind: 'mission', catalogPoints: 15, manny: 50 }),
  });
}

export function claimWeeklyAllDoneBonus(state) {
  if (!state || state.schema !== SCHEMA_MISSIONS) throw new TypeError('MISSIONS_STATE_REQUIRED');
  if (state.done.length !== WEEKLY_MISSION_IDS.length) {
    return freeze({ state, claimed: false, reason: 'NOT_ALL_DONE' });
  }
  if (state.allDoneBonusClaimed) return freeze({ state, claimed: false, reason: 'ALREADY_CLAIMED' });
  return freeze({
    state: freeze({ ...state, allDoneBonusClaimed: true }),
    claimed: true,
    reason: 'OK',
    reward: freeze({ kind: 'weekly-bonus', catalogPoints: 20, manny: 100 }),
  });
}

// --- D: exchange ---
export function createExchangeState({ seasonId, month, tokens = 0, items = [] } = {}) {
  if (typeof seasonId !== 'string' || !seasonId) throw new TypeError('SEASON_ID_REQUIRED');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  if (!Number.isInteger(tokens) || tokens < 0) throw new TypeError('TOKENS_INVALID');
  return freeze({
    schema: SCHEMA_EXCHANGE, seasonId, month, tokens,
    items: Object.freeze(items.map((item) => freeze({ ...item }))),
    bought: Object.freeze([]),
  });
}

export function exchangeItem(state, itemId) {
  if (!state || state.schema !== SCHEMA_EXCHANGE) throw new TypeError('EXCHANGE_STATE_REQUIRED');
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return freeze({ state, exchanged: false, reason: 'NOT_FOUND' });
  if (state.bought.includes(itemId)) return freeze({ state, exchanged: false, reason: 'ALREADY_BOUGHT' });
  if (state.tokens < item.costTokens) return freeze({ state, exchanged: false, reason: 'NOT_ENOUGH_TOKENS' });
  return freeze({
    state: freeze({ ...state, tokens: state.tokens - item.costTokens, bought: Object.freeze([...state.bought, itemId]) }),
    exchanged: true,
    reason: 'OK',
    reward: freeze({ ...item.reward }),
  });
}

export function convertLeftoverTokens(state) {
  if (!state || state.schema !== SCHEMA_EXCHANGE) throw new TypeError('EXCHANGE_STATE_REQUIRED');
  return freeze({ manny: state.tokens * EXCHANGE_TOKEN_TO_MANNY, tokensConverted: state.tokens });
}
