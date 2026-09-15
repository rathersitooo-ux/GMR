export const GLOBAL_JOURNEY_SCHEMA = 'gameroad.global-journey-projection.v1';

export const GLOBAL_JOURNEY_STOP_STATES = Object.freeze({
  COMPLETED: 'completed',
  AVAILABLE: 'available',
  AHEAD: 'ahead',
});

const VALID_STATES = new Set(Object.values(GLOBAL_JOURNEY_STOP_STATES));

function requiredString(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${name} must be a non-empty string`);
  return normalized;
}

function freezeStop(stop) {
  return Object.freeze({ ...stop });
}

function normalizeStop(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // This projection never decides whether a mode was completed or unlocked.
  // Only a caller-owned authoritative, visible fact may appear on the journey line.
  if (raw.authoritative !== true || raw.visible !== true) return null;

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const state = typeof raw.state === 'string' ? raw.state.trim() : '';
  const sourceRef = typeof raw.sourceRef === 'string' ? raw.sourceRef.trim() : '';
  if (!id || !label || !sourceRef || !VALID_STATES.has(state)) return null;

  return freezeStop({
    id,
    label,
    state,
    sourceRef,
    presentationOnly: true,
    interactive: false,
    navigationAuthority: false,
  });
}

export function projectGlobalJourney({ journeyKey, stops = [] } = {}) {
  const resolvedJourneyKey = requiredString(journeyKey, 'journeyKey');
  if (!Array.isArray(stops)) throw new TypeError('stops must be an array');

  const seen = new Set();
  const route = [];
  for (const raw of stops) {
    const stop = normalizeStop(raw);
    if (!stop) continue;
    if (seen.has(stop.id)) throw new TypeError(`duplicate journey stop id: ${stop.id}`);
    seen.add(stop.id);
    route.push(stop);
  }

  const completedStopCount = route.filter((stop) => stop.state === GLOBAL_JOURNEY_STOP_STATES.COMPLETED).length;
  const availableStopCount = route.filter((stop) => stop.state === GLOBAL_JOURNEY_STOP_STATES.AVAILABLE).length;
  const aheadStopCount = route.filter((stop) => stop.state === GLOBAL_JOURNEY_STOP_STATES.AHEAD).length;

  return Object.freeze({
    schema: GLOBAL_JOURNEY_SCHEMA,
    journeyKey: resolvedJourneyKey,
    route: Object.freeze(route),
    completedStopCount,
    availableStopCount,
    aheadStopCount,
    presentationOnly: true,
    interactive: false,
    requiresHomeTransit: false,
    createsNavigationAuthority: false,
    createsGameplayAuthority: false,
    createsSaveAuthority: false,
    createsRewardAuthority: false,
    createsCurrency: false,
    mutatesDailyTour: false,
    mutatesStory: false,
  });
}

export function summarizeGlobalJourney(projection) {
  if (!projection || projection.schema !== GLOBAL_JOURNEY_SCHEMA) {
    throw new TypeError('projection must be a global journey projection');
  }
  return Object.freeze({
    journeyKey: projection.journeyKey,
    stopCount: projection.route.length,
    completedStopCount: projection.completedStopCount,
    availableStopCount: projection.availableStopCount,
    aheadStopCount: projection.aheadStopCount,
    settled: projection.route.length > 0
      && projection.route.every((stop) => stop.state === GLOBAL_JOURNEY_STOP_STATES.COMPLETED),
    presentationOnly: true,
  });
}
