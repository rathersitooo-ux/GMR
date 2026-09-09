import { buildBattleJankenOrderChain } from './battle-janken-order-chain-presentation-core.mjs';
import {
  auditBattleJankenOrderMotion,
  buildBattleJankenOrderMotion,
} from './battle-janken-order-motion-core.mjs';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function requireSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('authoritative order snapshot must be an object');
  }
  if (!Array.isArray(value.publicCards)) {
    throw new TypeError('authoritative order snapshot publicCards must be an array');
  }
  if (!value.resolution || typeof value.resolution !== 'object' || Array.isArray(value.resolution)) {
    throw new TypeError('authoritative order snapshot resolution must be an object');
  }
  return value;
}

function normalizePresentationOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('presentation options must be an object');
  }
  return Object.freeze({
    reducedMotion: value.reducedMotion === true,
    lowPerf: value.lowPerf === true,
  });
}

/**
 * Compose one caller-authoritative janken resolution snapshot into the already
 * merged order-chain and order-motion presentation models.
 *
 * This adapter deliberately receives publicCards + resolution atomically from
 * one callback so it cannot join data from different authoritative moments.
 * It never sorts, compares hands, chooses winners/targets/destinations, writes
 * gameplay state, or owns presentation timing.
 */
export function projectBattleJankenOrderSnapshot(snapshotValue, optionsValue = {}) {
  const snapshot = requireSnapshot(snapshotValue);
  const options = normalizePresentationOptions(optionsValue);
  const chain = buildBattleJankenOrderChain({
    publicCards: snapshot.publicCards,
    resolution: snapshot.resolution,
  });
  const motion = buildBattleJankenOrderMotion({
    chain,
    reducedMotion: options.reducedMotion,
    lowPerf: options.lowPerf,
  });
  const audit = auditBattleJankenOrderMotion(motion);
  if (!audit.ok) {
    throw new Error(`battle janken order motion audit failed: ${audit.defects.join(',')}`);
  }
  return Object.freeze({ chain, motion });
}

export function createBattleJankenOrderLiveAdapter({
  readAuthoritativeOrderSnapshot,
  presentOrderMotion,
} = {}) {
  const read = requireFunction(readAuthoritativeOrderSnapshot, 'readAuthoritativeOrderSnapshot');
  const present = requireFunction(presentOrderMotion, 'presentOrderMotion');
  let inFlight = false;

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
        const snapshot = requireSnapshot(await read());
        const projected = projectBattleJankenOrderSnapshot(snapshot, options);
        const accepted = await present(projected.motion, Object.freeze({ chain: projected.chain }));
        return Object.freeze({
          ok: accepted === true,
          presented: accepted === true,
          reason: accepted === true ? 'PRESENTATION_ACCEPTED' : 'PRESENTATION_REJECTED',
          chain: projected.chain,
          motion: projected.motion,
        });
      } finally {
        inFlight = false;
      }
    },

    status() {
      return Object.freeze({ inFlight });
    },
  });
}

export const BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT = Object.freeze({
  authoritativeSnapshotRead: 'CALLER_ATOMIC_PUBLIC_CARDS_PLUS_RESOLUTION',
  sortingOwnedHere: false,
  comparisonOwnedHere: false,
  winnerOwnedHere: false,
  targetOwnedHere: false,
  destinationOwnedHere: false,
  gameplayOwnedHere: false,
  gameStateWrite: false,
  physicalTimingOwnedHere: false,
  presentationTransportOwnedHere: false,
  reducedMotionSupported: true,
  lowPerfSupported: true,
  secondJankenEngine: false,
});
