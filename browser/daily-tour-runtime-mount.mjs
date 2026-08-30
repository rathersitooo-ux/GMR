import {
  advanceDailyTour,
  createDailyTourPlan,
  getNextDailyTourStop,
  summarizeDailyTour,
} from './daily-tour-core.mjs';

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function normalizeStopId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function navigationRejected(result) {
  return result === false || (result && typeof result === 'object' && result.ok === false);
}

export function createDailyTourRuntimeMount({
  plan,
  planOptions,
  navigateToStop,
} = {}) {
  if (plan && planOptions) throw new TypeError('provide plan or planOptions, not both');
  const navigate = assertFunction(navigateToStop, 'navigateToStop');
  let currentPlan = plan ?? createDailyTourPlan(planOptions);
  summarizeDailyTour(currentPlan);
  let navigationInFlight = false;

  function getState() {
    return Object.freeze({
      plan: currentPlan,
      next: getNextDailyTourStop(currentPlan),
      summary: summarizeDailyTour(currentPlan),
      navigationInFlight,
    });
  }

  function result(ok, reason, extra = {}) {
    return Object.freeze({ ok, reason, ...extra, state: getState() });
  }

  async function navigateNext(reason = 'daily_tour_next') {
    if (navigationInFlight) return result(false, 'navigation_pending');
    if (currentPlan.interrupted) return result(false, 'tour_interrupted');

    const next = getNextDailyTourStop(currentPlan);
    if (!next) {
      const summary = summarizeDailyTour(currentPlan);
      return result(summary.tourSettled, summary.tourSettled ? 'tour_settled' : 'no_available_stop');
    }

    navigationInFlight = true;
    try {
      const navigation = await navigate(next, Object.freeze({
        reason,
        plan: currentPlan,
        summary: summarizeDailyTour(currentPlan),
      }));
      if (navigationRejected(navigation)) {
        return result(false, 'navigation_rejected', { next, navigation });
      }
      return result(true, 'navigated', { next, navigation });
    } catch (error) {
      return result(false, 'navigation_failed', {
        next,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      navigationInFlight = false;
    }
  }

  function interrupt() {
    if (navigationInFlight) return result(false, 'navigation_pending');
    currentPlan = advanceDailyTour(currentPlan, { type: 'interrupt' });
    return result(true, 'tour_interrupted');
  }

  async function resume() {
    if (navigationInFlight) return result(false, 'navigation_pending');
    currentPlan = advanceDailyTour(currentPlan, { type: 'resume' });
    return navigateNext('daily_tour_resume');
  }

  async function settleCurrent(stopId, outcome) {
    if (navigationInFlight) return result(false, 'navigation_pending');
    if (currentPlan.interrupted) return result(false, 'tour_interrupted');
    const expected = getNextDailyTourStop(currentPlan);
    const normalizedId = normalizeStopId(stopId);
    if (!expected) return result(false, 'no_pending_stop');
    if (!normalizedId || normalizedId !== expected.id) {
      return result(false, 'unexpected_stop', { expected, receivedStopId: normalizedId || null });
    }
    if (outcome !== 'completed' && outcome !== 'skipped') {
      throw new TypeError('outcome must be completed or skipped');
    }

    const actionType = expected.type === 'battle_finale'
      ? (outcome === 'completed' ? 'complete_battle' : 'skip_battle')
      : (outcome === 'completed' ? 'complete_stop' : 'skip_stop');
    const action = expected.type === 'battle_finale'
      ? { type: actionType }
      : { type: actionType, stopId: expected.id };

    currentPlan = advanceDailyTour(currentPlan, action);
    const settledState = getState();
    if (settledState.summary.tourSettled) {
      return result(true, 'tour_settled', { settled: expected, outcome, progressApplied: true });
    }

    const navigation = await navigateNext('daily_tour_mode_return');
    return Object.freeze({
      ...navigation,
      settled: expected,
      outcome,
      progressApplied: true,
    });
  }

  return Object.freeze({
    getState,
    start: () => navigateNext('daily_tour_start'),
    navigateNext,
    completeCurrent: (stopId) => settleCurrent(stopId, 'completed'),
    skipCurrent: (stopId) => settleCurrent(stopId, 'skipped'),
    interrupt,
    resume,
  });
}
