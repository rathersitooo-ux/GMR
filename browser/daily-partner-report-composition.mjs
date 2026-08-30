const STOP_ID = 'partner_report';
const CORE_ID = 'gameroad.daily-partner-report-composition.v1';
const READY = 'READY';

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
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

function safetyBoundary(extra = {}) {
  return freezeDeep({
    coreId: CORE_ID,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveAuthorityOwnedHere: false,
    rawFreeTalkAutoCollectionAllowed: false,
    mandatoryDailyAllowed: false,
    streakDebtAllowed: false,
    autoInsertUnregisteredAllowed: false,
    ...extra,
  });
}

export function composePartnerReportDailyStop({
  registeredStopIds = [],
  providerState = 'ABSENT',
  statusAvailable = false,
} = {}) {
  const registered = uniqueStrings(registeredStopIds).includes(STOP_ID);
  if (!registered) {
    return safetyBoundary({
      ok: true,
      available: false,
      disposition: 'UNREGISTERED',
      reason: 'EXPLICIT_REGISTRATION_REQUIRED',
      stop: null,
      handoff: null,
    });
  }

  if (providerState !== READY) {
    return safetyBoundary({
      ok: true,
      available: false,
      disposition: 'DEFERRED_PROVIDER_REQUIRED',
      reason: 'REPORT_PROVIDER_NOT_READY',
      stop: null,
      handoff: null,
    });
  }

  return safetyBoundary({
    ok: true,
    available: true,
    disposition: 'AVAILABLE',
    reason: null,
    stop: freezeDeep({
      id: STOP_ID,
      kind: 'interactive',
      registered: true,
      eligible: true,
    }),
    handoff: freezeDeep({
      kind: 'partner_report_daily_handoff',
      downstreamUseSite: 'partner-conversation',
      action: 'open_report',
      reportProviderRequired: true,
      statusAvailable: statusAvailable === true,
    }),
  });
}

export function composeDailyStopsWithPartnerReport({
  stops = [],
  registeredStopIds = [],
  providerState = 'ABSENT',
  statusAvailable = false,
} = {}) {
  const registered = uniqueStrings(registeredStopIds);
  const baseStops = Array.isArray(stops)
    ? stops.filter((stop) => stop && typeof stop === 'object' && stop.id !== STOP_ID)
    : [];
  const partnerReport = composePartnerReportDailyStop({ registeredStopIds: registered, providerState, statusAvailable });
  const composedStops = partnerReport.available ? [...baseStops, partnerReport.stop] : baseStops;

  return freezeDeep({
    coreId: CORE_ID,
    stops: composedStops,
    registeredStopIds: registered,
    partnerReport,
  });
}

export const DAILY_PARTNER_REPORT_COMPOSITION_CORE_ID = CORE_ID;
export const DAILY_PARTNER_REPORT_STOP_ID = STOP_ID;
export const DAILY_PARTNER_REPORT_READY_STATE = READY;
