export const DAILY_TOUR_STOP_KINDS = Object.freeze({
  FREE: 'free',
  CLAIMABLE: 'claimable',
});

export const DAILY_TOUR_GACHA_STOP_ID = 'gacha_collection';

const STOP_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
});

const NEVER_AUTO_TOUR_IDS = new Set([
  'battle',
  'missions',
  'mission',
  'mission_progress',
  'season_mission',
]);

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeStop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id || NEVER_AUTO_TOUR_IDS.has(id)) return null;
  if (!Object.values(DAILY_TOUR_STOP_KINDS).includes(raw.kind)) return null;

  // Daily Tour consumes no eligibility authority of its own. A stop exists only when the
  // feature's current production authority explicitly says the free/claimable action is usable.
  if (raw.authoritative !== true || raw.eligible !== true || raw.consumed === true) return null;

  // A Tour stop may never substitute a paid action for a missing free/claimable right.
  if (raw.requiresPaidResource === true || raw.paidFallbackAllowed === true) return null;

  return Object.freeze({ id, kind: raw.kind });
}

function normalizeStops(stops, gachaStopId) {
  const seen = new Set();
  const normalized = [];
  for (const raw of Array.isArray(stops) ? stops : []) {
    const stop = normalizeStop(raw);
    if (!stop || seen.has(stop.id)) continue;
    seen.add(stop.id);
    normalized.push(stop);
  }

  // Gacha is the first Tour destination only when its own authority says today's free action
  // is actually eligible. Absence of that authority never fabricates a Gacha stop.
  const gachaIndex = normalized.findIndex((stop) => stop.id === gachaStopId);
  if (gachaIndex > 0) {
    const [gacha] = normalized.splice(gachaIndex, 1);
    normalized.unshift(gacha);
  }
  return normalized;
}

function freezePlan(plan) {
  return Object.freeze({
    ...plan,
    route: Object.freeze(plan.route.map((stop) => Object.freeze({ ...stop }))),
  });
}

export function createDailyTourPlan({
  dayKey,
  stops = [],
  gachaStopId = DAILY_TOUR_GACHA_STOP_ID,
} = {}) {
  const resolvedDayKey = assertNonEmptyString(dayKey, 'dayKey');
  const resolvedGachaStopId = assertNonEmptyString(gachaStopId, 'gachaStopId');
  const route = normalizeStops(stops, resolvedGachaStopId)
    .map((stop) => ({ ...stop, status: STOP_STATUS.PENDING }));

  return freezePlan({
    schemaVersion: 'daily-tour-plan-v2',
    dayKey: resolvedDayKey,
    interrupted: false,
    route,
  });
}

export function getNextDailyTourStop(plan) {
  if (!plan || plan.schemaVersion !== 'daily-tour-plan-v2' || plan.interrupted) return null;
  const next = plan.route.find((stop) => stop.status === STOP_STATUS.PENDING);
  return next ? Object.freeze({ id: next.id, kind: next.kind, type: 'daily_free_or_claimable' }) : null;
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
  if (!plan || plan.schemaVersion !== 'daily-tour-plan-v2') {
    throw new TypeError('plan must be a daily-tour-plan-v2 object');
  }

  if (action?.type === 'interrupt') {
    return plan.interrupted ? plan : freezePlan({ ...plan, interrupted: true });
  }
  if (action?.type === 'resume') {
    return plan.interrupted ? freezePlan({ ...plan, interrupted: false }) : plan;
  }
  if (action?.type === 'complete_stop' || action?.type === 'skip_stop' || action?.type === 'fail_stop') {
    const stopId = assertNonEmptyString(action.stopId, 'action.stopId');
    return updateRouteStatus(
      plan,
      stopId,
      action.type === 'complete_stop' ? STOP_STATUS.COMPLETED : STOP_STATUS.SKIPPED,
    );
  }

  throw new TypeError(`unsupported Daily Tour action: ${String(action?.type)}`);
}

export function summarizeDailyTour(plan) {
  if (!plan || plan.schemaVersion !== 'daily-tour-plan-v2') {
    throw new TypeError('plan must be a daily-tour-plan-v2 object');
  }
  const completedStopCount = plan.route.filter((stop) => stop.status === STOP_STATUS.COMPLETED).length;
  const skippedStopCount = plan.route.filter((stop) => stop.status === STOP_STATUS.SKIPPED).length;
  const pendingStopCount = plan.route.filter((stop) => stop.status === STOP_STATUS.PENDING).length;

  return Object.freeze({
    dayKey: plan.dayKey,
    completedStopCount,
    skippedStopCount,
    pendingStopCount,
    interrupted: plan.interrupted,
    tourSettled: pendingStopCount === 0,
    hasDebt: false,
  });
}
