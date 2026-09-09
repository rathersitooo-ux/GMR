import { createBattleJankenOrderLiveAdapter } from './battle-janken-order-live-adapter.mjs';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function requireRuntime(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('slidepadRuntime must be an object');
  }
  requireFunction(value.presentOrderMotion, 'slidepadRuntime.presentOrderMotion');
  return value;
}

function isDocumentHidden(documentRef) {
  if (!documentRef) return false;
  if (documentRef.hidden === true) return true;
  return documentRef.visibilityState === 'hidden';
}

function snapshotKey(snapshot) {
  return JSON.stringify({
    sessionId: snapshot?.sessionId ?? null,
    turnId: snapshot?.turnId ?? null,
    publicCards: Array.isArray(snapshot?.publicCards)
      ? snapshot.publicCards.map((card) => ({
          playerId: card?.playerId ?? null,
          cardId: card?.cardId ?? null,
          displayNumber: card?.displayNumber ?? null,
          hand: card?.hand ?? null,
        }))
      : null,
    resolution: snapshot?.resolution ?? null,
  });
}

function hiddenReceipt(reason = 'DOCUMENT_HIDDEN') {
  return Object.freeze({ ok: false, presented: false, deduped: false, reason });
}

export function createBattleJankenOrderLiveMount({
  readAuthoritativeOrderSnapshot,
  slidepadRuntime,
  documentRef = globalThis.document,
  source = 'battle-janken-order-live-mount',
} = {}) {
  const read = requireFunction(readAuthoritativeOrderSnapshot, 'readAuthoritativeOrderSnapshot');
  const runtime = requireRuntime(slidepadRuntime);
  let disposed = false;
  let mounted = false;
  let stagedSnapshot = null;
  let lastAcceptedSnapshotKey = null;
  let lastReceipt = null;
  let presentationCalls = 0;
  let dedupeHits = 0;

  const adapter = createBattleJankenOrderLiveAdapter({
    async readAuthoritativeOrderSnapshot() {
      stagedSnapshot = await read();
      return stagedSnapshot;
    },
    async presentOrderMotion(_motion, metadata) {
      if (!stagedSnapshot) throw new Error('authoritative order snapshot was not staged');
      if (isDocumentHidden(documentRef)) return false;
      const key = snapshotKey(stagedSnapshot);
      if (key === lastAcceptedSnapshotKey) {
        dedupeHits += 1;
        return true;
      }
      const result = await runtime.presentOrderMotion(stagedSnapshot, {
        source,
        chain: metadata?.chain ?? null,
      });
      const accepted = result !== false && result != null;
      if (accepted) {
        lastAcceptedSnapshotKey = key;
        presentationCalls += 1;
      }
      return accepted;
    },
  });

  async function sync(options = {}) {
    if (disposed) {
      const receipt = Object.freeze({ ok: false, presented: false, deduped: false, reason: 'MOUNT_DISPOSED' });
      lastReceipt = receipt;
      return receipt;
    }
    if (isDocumentHidden(documentRef)) {
      const receipt = hiddenReceipt();
      lastReceipt = receipt;
      return receipt;
    }
    const presentationsBefore = presentationCalls;
    const dedupeBefore = dedupeHits;
    const receipt = await adapter.sync(options);
    const deduped = dedupeHits > dedupeBefore && presentationCalls === presentationsBefore;
    const mountedReceipt = Object.freeze({
      ...receipt,
      presented: receipt.presented === true && !deduped,
      deduped,
      reason: deduped ? 'ALREADY_PRESENTED' : receipt.reason,
    });
    lastReceipt = mountedReceipt;
    return mountedReceipt;
  }

  function onVisibilityChange() {
    if (disposed || isDocumentHidden(documentRef)) return;
    void sync().catch(() => {});
  }

  function mount({ syncNow = true } = {}) {
    if (disposed) throw new Error('battle janken order live mount is disposed');
    if (!mounted) {
      documentRef?.addEventListener?.('visibilitychange', onVisibilityChange);
      mounted = true;
    }
    if (!syncNow || isDocumentHidden(documentRef)) {
      return Promise.resolve(hiddenReceipt(syncNow ? 'DOCUMENT_HIDDEN' : 'SYNC_DEFERRED'));
    }
    return sync();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (mounted) documentRef?.removeEventListener?.('visibilitychange', onVisibilityChange);
    mounted = false;
    stagedSnapshot = null;
  }

  return Object.freeze({
    mount,
    sync,
    dispose,
    status() {
      return Object.freeze({
        mounted,
        disposed,
        hidden: isDocumentHidden(documentRef),
        adapterInFlight: adapter.status().inFlight,
        presentationCalls,
        dedupeHits,
        hasAcceptedSnapshot: lastAcceptedSnapshotKey !== null,
        lastReceipt,
      });
    },
  });
}

export const BATTLE_JANKEN_ORDER_LIVE_MOUNT_CONTRACT = Object.freeze({
  sourceAuthority: 'CALLER_ATOMIC_PUBLIC_CARDS_PLUS_RESOLUTION',
  processingOrderPolicy: 'PRESERVE_CALLER_PROCESSING_ORDER_EXACTLY',
  hiddenPolicy: 'DEFER_UNTIL_VISIBLE',
  duplicatePolicy: 'DO_NOT_REPRESENT_ACCEPTED_IDENTICAL_SNAPSHOT',
  sortingOwnedHere: false,
  comparisonOwnedHere: false,
  winnerOwnedHere: false,
  targetOwnedHere: false,
  destinationOwnedHere: false,
  gameplayOwnedHere: false,
  gameStateWrite: false,
  physicalTimingOwnedHere: false,
  secondJankenEngine: false,
});
