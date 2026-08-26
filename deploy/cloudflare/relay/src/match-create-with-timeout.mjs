import {
  createStoredMatchTicket,
  serviceStoredMatchTimeout,
} from './match-store.mjs';

/**
 * Server-side create gate for the existing 60s human-priority contract.
 *
 * A late create request must service any already-expired 2H/3H waiting cohort
 * before the arriving Human is admitted. Otherwise the fourth arrival can
 * rewrite an expired 3H+AI1 cohort into a new 4H HUMAN_QUORUM match when the
 * scheduled alarm has been delayed.
 *
 * This does not change the one-Human rule: a single waiting Human is not
 * timeout-filled, so a second Human arriving after 60s is admitted first and
 * the existing create path can form the established 2H+AI2 timeout match.
 */
export async function createStoredMatchTicketWithExpiredCohortGate(storage, input, generated) {
  const nowMs = Number(generated?.nowMs);
  const generatedMatchId = String(generated?.matchId || '');
  const serviced = await serviceStoredMatchTimeout(storage, { nowMs, generatedMatchId });
  if (!serviced.ok) return serviced;
  return createStoredMatchTicket(storage, input, generated);
}
