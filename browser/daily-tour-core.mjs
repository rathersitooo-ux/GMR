export const DAILY_TOUR_MODES = Object.freeze({
  RECOMMENDED: 'recommended',
  CUSTOM: 'custom',
  BATTLE_ONLY: 'battle_only',
});

const STOP_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
});

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || value.trim() === '' || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeStops(stops, registeredStopIds) {
  const explicitRegistered = Array.isArray(registeredStopIds)
    ? new Set(uniqueStrings(registeredStopIds))
    : null;
  const seen = new Set();
  const normalized = [];

  for (const raw of Array.isArray(stops) ? stops : []) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const kind = raw.kind === 'background' ? 'background' : 'interactive';
    const registered = explicitRegistered ? explicitRegistered.has(id) : raw.registered !== false;
    const eligible = raw.eligible !== false && raw.enabled !== false;

    normalized.push(Object.freeze({ id, kind, registered, eligible }));
  }
  return normalized;
}

function orderedEligibleIds(stops, preferredOrder, { custom = false } = {}) {
  const eligible = stops.filter((stop) => stop.kind === 'interactive' && stop.registered && stop.eligible);
  const eligibleIds = new Set(eligible.map((stop) => stop.id));
  const preferred = uniqueStrings(preferredOrder).filter((id) => eligibleIds.has(id));

  if (custom) return preferred.length > 0 ? preferred : eligible.map((stop) => stop.id);

  const used = new Set(preferred);
  return [...preferred, ...eligible.map((stop) => stop.id).filter((id) => !used.has(id))];
}

function freezePlan(plan) {
  const route = plan.route.map((stop) => Object.freeze({ ...stop }));
  return Object.freeze({
    ...plan,
    route: Object.freeze(route),
    battle: Object.freeze({ ...plan.battle }),
  });
}

export function createDailyTourPlan({
  dayKey,
  mode = DAILY_TOUR_MODES.RECOMMENDED,
  stops = [],
  registeredStopIds,
  recommendationOrder = [],
  customOrder = [],
  includeBattleFinale = true,
  battleStopId = 'battle',
} = {}) {
  assertNonEmptyString(dayKey, 'dayKey');
  if (!Object.values(DAILY_TOUR_MODES).includes(mode)) {
    throw new TypeError(`unsupported Daily Tour mode: ${mode}`);
  }
  assertNonEmptyString(battleStopId, 'battleStopId');

  const normalizedStops = normalizeStops(stops, registeredStopIds);
  let routeIds = [];
  if (mode === DAILY_TOUR_MODES.RECOMMENDED) {
    routeIds = orderedEligibleIds(normalizedStops, recommendationOrder);
  } else if (mode === DAILY_TOUR_MODES.CUSTOM) {
    routeIds = orderedEligibleIds(normalizedStops, customOrder, { custom: true });
  }

  const battleEnabled = mode === DAILY_TOUR_MODES.BATTLE_ONLY ? true : includeBattleFinale === true;
  return freezePlan({
    schemaVersion: 'daily-tour-plan-v1',
    dayKey,
    mode,
    interrupted: false,
    route: routeIds.map((id) => ({ id, status: STOP_STATUS.PENDING })),
    battle: {
      id: battleStopId,
      enabled: battleEnabled,
      status: battleEnabled ? STOP_STATUS.PENDING : STOP_STATUS.SKIPPED,
    },
  });
}

export function getNextDailyTourStop(plan) {
  if (!plan || plan.schemaVersion !== 'daily-tour-plan-v1' || plan.interrupted) return null;
  const next = plan.route.find((stop) => stop.status === STOP_STATUS.PENDING);
  if (next) return Object.freeze({ id: next.id, type: 'daily_stop' });
  if (plan.battle.enabled && plan.battle.status === STOP_STATUS.PENDING) {
    return Object.freeze({ id: plan.battle.id, type: 'battle_finale' });
  }
  return null;
}

function updateRouteStatus(plan, stopId, nextStatus) {
  let changed = false;
  const route = plan.route.map((stop) => {
    if (stop.id !== stopId || stop.status !== STOP_STATUS.PENDING) return stop;
    changed = true;
    return { ...stop, status: nextStatus };
  });
  return changed ? freezePlan({ ...plan, route }) : plan;
}

export function advanceDailyTour(plan, action = {}) {
  if (!plan || plan.schemaVersion !== 'daily-tour-plan-v1') {
    throw new TypeError('plan must be a daily-tour-plan-v1 object');
  }
  const type = action?.type;

  if (type === 'interrupt') {
    return plan.interrupted ? plan : freezePlan({ ...plan, interrupted: true });
  }
  if (type === 'resume') {
    return plan.interrupted ? freezePlan({ ...plan, interrupted: false }) : plan;
  }
  if (type === 'complete_stop' || type === 'skip_stop') {
    const stopId = assertNonEmptyString(action.stopId, 'action.stopId');
    return updateRouteStatus(
      plan,
      stopId,
      type === 'complete_stop' ? STOP_STATUS.COMPLETED : STOP_STATUS.SKIPPED,
    );
  }
  if (type === 'complete_battle' || type === 'skip_battle') {
    if (!plan.battle.enabled || plan.battle.status !== STOP_STATUS.PENDING) return plan;
    const status = type === 'complete_battle' ? STOP_STATUS.COMPLETED : STOP_STATUS.SKIPPED;
    return freezePlan({ ...plan, battle: { ...plan.battle, status } });
  }

  throw new TypeError(`unsupported Daily Tour action: ${String(type)}`);
}

export function summarizeDailyTour(plan) {
  if (!plan || plan.schemaVersion !== 'daily-tour-plan-v1') {
    throw new TypeError('plan must be a daily-tour-plan-v1 object');
  }
  const completedStopCount = plan.route.filter((stop) => stop.status === STOP_STATUS.COMPLETED).length;
  const skippedStopCount = plan.route.filter((stop) => stop.status === STOP_STATUS.SKIPPED).length;
  const pendingStopCount = plan.route.filter((stop) => stop.status === STOP_STATUS.PENDING).length;
  const dailyRouteSettled = pendingStopCount === 0;
  const battleSettled = !plan.battle.enabled || plan.battle.status !== STOP_STATUS.PENDING;

  return Object.freeze({
    dayKey: plan.dayKey,
    mode: plan.mode,
    completedStopCount,
    skippedStopCount,
    pendingStopCount,
    meaningfulDailyParticipation: completedStopCount > 0,
    battleCompleted: plan.battle.status === STOP_STATUS.COMPLETED,
    interrupted: plan.interrupted,
    dailyRouteSettled,
    tourSettled: dailyRouteSettled && battleSettled,
    hasDebt: false,
  });
}
