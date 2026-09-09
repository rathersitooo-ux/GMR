export const BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_SCHEMA =
  'gameroad.battle-janken-slidepad-live-input-coordinator.v1';

const JANKEN_HANDS = new Set(['ROCK', 'SCISSORS', 'PAPER']);

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requiredMethod(owner, name, ownerName) {
  if (typeof owner?.[name] !== 'function') {
    throw new TypeError(`${ownerName}.${name} must be a function`);
  }
  return owner[name].bind(owner);
}

function requireJankenHand(value) {
  if (typeof value !== 'string' || !JANKEN_HANDS.has(value)) {
    throw new RangeError('jankenHand must be ROCK, SCISSORS, or PAPER');
  }
  return value;
}

function frozenResult(value) {
  return Object.freeze(value);
}

/**
 * Presentation/input sequencing boundary for the existing Battle NEW BASE
 * consumer + compound-preview bridge.
 *
 * It intentionally does not know how a hand maps to a card, target, Shield,
 * route, legality result, or Battle transport payload. Those remain inside the
 * injected live bridge and its existing authorities.
 *
 * Why this exists:
 * pointer focus can move again while an authoritative preview request is still
 * resolving. The SlidePad must never leave that older async result staged and
 * commit-capable after the user's thumb has moved elsewhere. This coordinator
 * serializes bridge mutations and accepts only the latest focus intent.
 */
export function createBattleJankenSlidePadLiveInputCoordinator({
  liveBridge,
} = {}) {
  requiredObject(liveBridge, 'liveBridge');
  const stageCompoundAttack = requiredMethod(liveBridge, 'stageCompoundAttack', 'liveBridge');
  const clearCompoundAttack = requiredMethod(liveBridge, 'clearCompoundAttack', 'liveBridge');
  const commitCompoundAttack = requiredMethod(liveBridge, 'commitCompoundAttack', 'liveBridge');
  const bridgeStatus = requiredMethod(liveBridge, 'status', 'liveBridge');

  let queue = Promise.resolve();
  let intentVersion = 0;
  let desiredHand = null;
  let readyFocus = null;
  let phase = 'IDLE';
  let commitPending = false;
  let destroyed = false;

  function enqueue(operation) {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  }

  function staleResult(hand, version, reason = 'FOCUS_SUPERSEDED') {
    return frozenResult({
      ok: false,
      staged: false,
      stale: true,
      reason,
      jankenHand: hand,
      intentVersion: version,
    });
  }

  function clearLocalFocus(nextPhase = 'IDLE') {
    readyFocus = null;
    phase = nextPhase;
  }

  async function clearBridgeFailSoft() {
    try {
      return await clearCompoundAttack();
    } catch {
      return null;
    }
  }

  function statusSnapshot() {
    let upstream = null;
    try {
      upstream = bridgeStatus();
    } catch {}
    return frozenResult({
      schema: BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_SCHEMA,
      phase,
      intentVersion,
      desiredHand,
      readyHand: readyFocus?.jankenHand ?? null,
      previewReady: readyFocus !== null,
      commitPending,
      destroyed,
      bridge: upstream,
      presentationOnly: true,
      gameplayAuthority: false,
      targetInference: false,
      legalTargetRecompute: false,
      routeRecompute: false,
      handAssignmentAuthority: false,
      gameStateWrite: false,
    });
  }

  return Object.freeze({
    schema: BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_SCHEMA,

    focus(jankenHandValue) {
      const jankenHand = requireJankenHand(jankenHandValue);
      if (destroyed) {
        return Promise.resolve(frozenResult({ ok: false, staged: false, reason: 'DESTROYED' }));
      }
      if (commitPending) {
        return Promise.resolve(frozenResult({
          ok: false,
          staged: false,
          reason: 'COMMIT_IN_FLIGHT',
          jankenHand,
        }));
      }

      const version = ++intentVersion;
      desiredHand = jankenHand;
      readyFocus = null;
      phase = 'STAGING';

      return enqueue(async () => {
        if (destroyed) return staleResult(jankenHand, version, 'DESTROYED');
        if (version !== intentVersion || desiredHand !== jankenHand) {
          return staleResult(jankenHand, version);
        }

        let result;
        try {
          result = await stageCompoundAttack(jankenHand);
        } catch {
          await clearBridgeFailSoft();
          if (version === intentVersion && desiredHand === jankenHand) {
            clearLocalFocus('IDLE');
          }
          return frozenResult({
            ok: false,
            staged: false,
            stale: version !== intentVersion || desiredHand !== jankenHand,
            reason: 'STAGE_FAILED',
            jankenHand,
            intentVersion: version,
          });
        }

        // Bridge mutations are serialized. If intent changed while the
        // authoritative preview was resolving, this just-resolved stage is the
        // most recent bridge mutation and is therefore safe to clear before the
        // newer focus operation begins.
        if (destroyed || version !== intentVersion || desiredHand !== jankenHand) {
          await clearBridgeFailSoft();
          return staleResult(jankenHand, version, destroyed ? 'DESTROYED' : 'FOCUS_SUPERSEDED');
        }

        const previewReady = result?.ok === true
          && result?.staged === true
          && result?.preview?.active === true;
        if (!previewReady) {
          await clearBridgeFailSoft();
          clearLocalFocus('IDLE');
          return frozenResult({
            ok: false,
            staged: false,
            stale: false,
            reason: result?.reason ?? 'VISIBLE_PREVIEW_REQUIRED',
            jankenHand,
            intentVersion: version,
            result: result ?? null,
          });
        }

        readyFocus = Object.freeze({
          jankenHand,
          intentVersion: version,
          stage: result.stage ?? null,
          preview: result.preview,
        });
        phase = 'READY';
        return frozenResult({
          ok: true,
          staged: true,
          stale: false,
          reason: 'LATEST_FOCUS_PREVIEW_READY',
          jankenHand,
          intentVersion: version,
          stage: readyFocus.stage,
          preview: readyFocus.preview,
        });
      });
    },

    cancel() {
      if (destroyed) {
        return Promise.resolve(frozenResult({ ok: false, cleared: false, reason: 'DESTROYED' }));
      }
      if (commitPending) {
        return Promise.resolve(frozenResult({ ok: false, cleared: false, reason: 'COMMIT_IN_FLIGHT' }));
      }

      ++intentVersion;
      desiredHand = null;
      readyFocus = null;
      phase = 'CLEARING';
      return enqueue(async () => {
        const cleared = await clearBridgeFailSoft();
        if (!destroyed && desiredHand === null) phase = 'IDLE';
        return frozenResult({
          ok: true,
          cleared: true,
          reason: 'FOCUS_CANCELLED',
          bridge: cleared,
        });
      });
    },

    commit() {
      if (destroyed) {
        return Promise.resolve(frozenResult({ ok: false, committed: false, reason: 'DESTROYED' }));
      }
      if (commitPending) {
        return Promise.resolve(frozenResult({ ok: false, committed: false, reason: 'COMMIT_IN_FLIGHT' }));
      }

      const version = intentVersion;
      const hand = desiredHand;
      commitPending = true;

      return enqueue(async () => {
        try {
          const exactReady = readyFocus !== null
            && readyFocus.intentVersion === version
            && readyFocus.jankenHand === hand
            && intentVersion === version
            && desiredHand === hand;
          if (!exactReady) {
            return frozenResult({
              ok: false,
              committed: false,
              reason: 'LATEST_FOCUS_PREVIEW_REQUIRED',
              jankenHand: hand,
              intentVersion: version,
            });
          }

          phase = 'COMMITTING';
          let result;
          try {
            result = await commitCompoundAttack();
          } catch {
            phase = 'READY';
            return frozenResult({
              ok: false,
              committed: false,
              reason: 'COMMIT_FAILED',
              jankenHand: hand,
              intentVersion: version,
            });
          }

          if (result?.ok === true && result?.committed === true) {
            ++intentVersion;
            desiredHand = null;
            clearLocalFocus('IDLE');
            return frozenResult({
              ...result,
              reason: result.reason ?? 'COMMITTED',
              jankenHand: hand,
              intentVersion: version,
            });
          }

          // The existing preview bridge intentionally keeps its visible preview
          // and stage on a rejected commit. Mirror that state so the caller can
          // retry or explicitly cancel without inventing rollback semantics.
          phase = 'READY';
          return frozenResult({
            ok: false,
            committed: false,
            reason: result?.reason ?? 'COMMIT_REJECTED',
            jankenHand: hand,
            intentVersion: version,
            result: result ?? null,
          });
        } finally {
          commitPending = false;
        }
      });
    },

    status() {
      return statusSnapshot();
    },

    destroy() {
      if (destroyed) return Promise.resolve(false);
      if (commitPending) return Promise.resolve(false);
      destroyed = true;
      ++intentVersion;
      desiredHand = null;
      readyFocus = null;
      phase = 'DESTROYED';
      return enqueue(async () => {
        await clearBridgeFailSoft();
        return true;
      });
    },
  });
}

export const BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT = Object.freeze({
  schema: BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_SCHEMA,
  authority: 'NONE',
  focusSource: 'CALLER_SLIDEPAD_INPUT',
  stageAndPreview: 'EXISTING_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_ONLY',
  commitTransport: 'EXISTING_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_ONLY',
  asyncMutationPolicy: 'SERIAL_LATEST_FOCUS_WINS',
  staleFocusPolicy: 'CLEAR_BEFORE_NEXT_FOCUS_STAGE',
  commitRequiresLatestVisiblePreview: true,
  commitInFlightFocusMutation: false,
  commitRejectKeepsPreview: true,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesHandAssignment: false,
  gameStateWrite: false,
  mutatesProductionHtml: false,
  mutatesJankenRuntime: false,
});
