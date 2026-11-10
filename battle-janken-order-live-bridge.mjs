import { buildBattleJankenProcessingOrderAuthoritySnapshot } from './battle-janken-processing-order-authority-adapter.mjs';
import { createBattleJankenOrderLiveAdapter } from './battle-janken-order-live-adapter.mjs';

export const BATTLE_JANKEN_ORDER_LIVE_BRIDGE_SCHEMA = 'gameroad.battle-janken-order-live-bridge.v1';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

/**
 * The one missing link between the janken order authority and the slidepad
 * presenter: read live public cards, build the authoritative snapshot, and
 * present it through the existing live adapter exactly once.
 *
 * The bridge owns no ordering rule, no hand comparison, no winner choice and
 * no game-state write. It only gates: an UNRESOLVED snapshot (equal printed
 * numbers, no approved tie-break) is reported to the caller and never handed
 * to the live adapter, because the adapter's contract requires a resolution
 * object and inventing an order would violate the authority's explicit
 * no-tie-break policy.
 *
 * The live caller (GAMEROAD.html) still supplies two things this file cannot
 * know: `readPublicCards` (the four accepted public cards of the live match)
 * and the moment to call `sync()` (when the public cards are revealed). The
 * presentation surface is the slidepad runtime's `presentOrderMotion`, which
 * unhides the order presenter when motion arrives.
 */
export function createBattleJankenOrderLiveBridge({
  readPublicCards,
  presentOrderMotion,
  buildAuthoritySnapshot = buildBattleJankenProcessingOrderAuthoritySnapshot,
} = {}) {
  const read = requireFunction(readPublicCards, 'readPublicCards');
  const present = requireFunction(presentOrderMotion, 'presentOrderMotion');
  const buildSnapshot = requireFunction(buildAuthoritySnapshot, 'buildAuthoritySnapshot');
  let pendingSnapshot = null;
  let inFlight = false;

  const adapter = createBattleJankenOrderLiveAdapter({
    async readAuthoritativeOrderSnapshot() {
      if (!pendingSnapshot) {
        throw new Error('battle janken order bridge has no authoritative snapshot to present');
      }
      return pendingSnapshot;
    },
    presentOrderMotion: present,
  });

  return Object.freeze({
    async sync(options = {}) {
      if (inFlight) {
        return Object.freeze({
          ok: false,
          presented: false,
          reason: 'SYNC_IN_FLIGHT',
        });
      }
      inFlight = true;
      try {
        const snapshot = await buildSnapshot({ publicCards: await read() });
        if (!snapshot || snapshot.status !== 'RESOLVED') {
          return Object.freeze({
            ok: false,
            presented: false,
            reason: snapshot?.reason ?? 'AUTHORITATIVE_ORDER_SNAPSHOT_UNRESOLVED',
            status: snapshot?.status ?? 'UNKNOWN',
            tiedPrintedNumbers: Object.freeze([...(snapshot?.tiedPrintedNumbers ?? [])]),
            processingOrder: null,
          });
        }
        pendingSnapshot = snapshot;
        try {
          return await adapter.sync(options);
        } finally {
          pendingSnapshot = null;
        }
      } finally {
        inFlight = false;
      }
    },

    status() {
      return Object.freeze({ inFlight });
    },
  });
}

export const BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT = Object.freeze({
  schema: BATTLE_JANKEN_ORDER_LIVE_BRIDGE_SCHEMA,
  snapshotAuthority: 'battle-janken-processing-order-authority-adapter.mjs',
  presentationTransport: 'battle-janken-order-live-adapter.mjs',
  presentationSurface: 'battle-janken-slidepad-runtime-mount.mjs presentOrderMotion',
  sortingOwnedHere: false,
  comparisonOwnedHere: false,
  winnerOwnedHere: false,
  targetOwnedHere: false,
  destinationOwnedHere: false,
  gameStateWrite: false,
  unresolvedTieBreak: false,
  unresolvedTiePolicy: 'REPORT_WITHOUT_PRESENTING',
  liveCallerSupplies: Object.freeze(['readPublicCards', 'sync trigger']),
});
