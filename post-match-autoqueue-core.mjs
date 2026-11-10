export const POST_MATCH_AUTOQUEUE_STATUS = Object.freeze({
  IDLE: 'idle',
  DISABLED: 'disabled',
  INELIGIBLE: 'ineligible',
  STARTING: 'starting',
  SEARCHING: 'searching',
  CANCEL_REQUESTED: 'cancel_requested',
  CANCELLED: 'cancelled',
  MATCHED: 'matched',
  CONNECTING: 'connecting',
  FAILED: 'failed',
});

export function normalizePostMatchAutoQueueSetting(value) {
  return value !== false;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultError(error) {
  return error instanceof Error ? error.message : String(error ?? 'unknown_error');
}

export function createPostMatchAutoQueueController({
  createTicket,
  cancelTicket,
  onChange = () => {},
  initialEnabled,
} = {}) {
  if (typeof createTicket !== 'function') throw new TypeError('createTicket function required');
  if (typeof cancelTicket !== 'function') throw new TypeError('cancelTicket function required');

  let enabled = normalizePostMatchAutoQueueSetting(initialEnabled);
  let current = null;
  let generation = 0;

  function snapshot() {
    return {
      enabled,
      resultId: current?.resultId ?? null,
      status: current?.status ?? POST_MATCH_AUTOQUEUE_STATUS.IDLE,
      ticketId: current?.ticketId ?? null,
      matchId: current?.matchId ?? null,
      queueSignature: clone(current?.queueSignature ?? null),
      attempt: current?.attempt ?? 0,
      cancelTooLate: !!current?.cancelTooLate,
      error: current?.error ?? null,
    };
  }

  function emit() {
    const view = snapshot();
    onChange(view);
    return view;
  }

  function sameResult(resultId) {
    return current && current.resultId === String(resultId);
  }

  function makeCycle({ resultId, eligible, queueSignature, attempt = 1 }) {
    current = {
      generation: ++generation,
      resultId: String(resultId),
      eligible: eligible !== false,
      queueSignature: clone(queueSignature ?? null),
      attempt,
      status: POST_MATCH_AUTOQUEUE_STATUS.IDLE,
      ticketId: null,
      matchId: null,
      cancelAfterStart: false,
      cancelTooLate: false,
      error: null,
    };
    return current;
  }

  async function requestCancel(cycle) {
    if (!cycle || cycle !== current || !cycle.ticketId) return emit();
    cycle.status = POST_MATCH_AUTOQUEUE_STATUS.CANCEL_REQUESTED;
    cycle.error = null;
    emit();
    try {
      await cancelTicket({
        ticketId: cycle.ticketId,
        resultId: cycle.resultId,
        queueSignature: clone(cycle.queueSignature),
      });
    } catch (error) {
      if (cycle !== current) return snapshot();
      cycle.error = defaultError(error);
      // A cancel API failure does not prove the ticket is still searching or cancelled.
      // Keep CANCEL_REQUESTED until the provider's authoritative ticket update arrives.
      emit();
    }
    return snapshot();
  }

  async function startCycle(cycle) {
    if (cycle !== current) return snapshot();
    if (!enabled) {
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.DISABLED;
      return emit();
    }
    if (!cycle.eligible) {
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.INELIGIBLE;
      return emit();
    }

    cycle.status = POST_MATCH_AUTOQUEUE_STATUS.STARTING;
    cycle.error = null;
    emit();

    try {
      const created = await createTicket({
        resultId: cycle.resultId,
        queueSignature: clone(cycle.queueSignature),
        attempt: cycle.attempt,
      });
      if (cycle !== current) return snapshot();
      const ticketId = created?.ticketId;
      if (!ticketId) throw new Error('create_ticket_missing_ticket_id');
      cycle.ticketId = String(ticketId);
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.SEARCHING;
      emit();
      if (!enabled || cycle.cancelAfterStart) return requestCancel(cycle);
      return snapshot();
    } catch (error) {
      if (cycle !== current) return snapshot();
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.FAILED;
      cycle.error = defaultError(error);
      return emit();
    }
  }

  async function onResult({ resultId, eligible = true, queueSignature = null } = {}) {
    if (resultId == null || resultId === '') throw new TypeError('resultId required');
    if (sameResult(resultId)) return snapshot();
    const cycle = makeCycle({ resultId, eligible, queueSignature, attempt: 1 });
    return startCycle(cycle);
  }

  async function setEnabled(nextEnabled) {
    enabled = nextEnabled !== false;
    const cycle = current;
    if (!cycle) return emit();

    if (!enabled) {
      if (cycle.status === POST_MATCH_AUTOQUEUE_STATUS.STARTING) {
        cycle.cancelAfterStart = true;
        cycle.status = POST_MATCH_AUTOQUEUE_STATUS.CANCEL_REQUESTED;
        return emit();
      }
      if (cycle.status === POST_MATCH_AUTOQUEUE_STATUS.SEARCHING) {
        return requestCancel(cycle);
      }
      // Once a provider says MATCHED/CONNECTING, OFF only changes the future preference.
      if (cycle.status === POST_MATCH_AUTOQUEUE_STATUS.MATCHED ||
          cycle.status === POST_MATCH_AUTOQUEUE_STATUS.CONNECTING) {
        cycle.cancelTooLate = true;
        return emit();
      }
      if (cycle.status === POST_MATCH_AUTOQUEUE_STATUS.IDLE ||
          cycle.status === POST_MATCH_AUTOQUEUE_STATUS.CANCELLED ||
          cycle.status === POST_MATCH_AUTOQUEUE_STATUS.FAILED) {
        cycle.status = POST_MATCH_AUTOQUEUE_STATUS.DISABLED;
      }
      return emit();
    }

    if (cycle.status === POST_MATCH_AUTOQUEUE_STATUS.DISABLED ||
        cycle.status === POST_MATCH_AUTOQUEUE_STATUS.CANCELLED ||
        cycle.status === POST_MATCH_AUTOQUEUE_STATUS.FAILED) {
      const replacement = makeCycle({
        resultId: cycle.resultId,
        eligible: cycle.eligible,
        queueSignature: cycle.queueSignature,
        attempt: cycle.attempt + 1,
      });
      return startCycle(replacement);
    }
    return emit();
  }

  function handleTicketUpdate(update = {}) {
    const cycle = current;
    if (!cycle?.ticketId || String(update.ticketId ?? '') !== cycle.ticketId) return snapshot();
    const status = String(update.status ?? '').toLowerCase();

    if (status === 'waiting' || status === 'matching' || status === 'searching') {
      if (cycle.status !== POST_MATCH_AUTOQUEUE_STATUS.CANCEL_REQUESTED) {
        cycle.status = POST_MATCH_AUTOQUEUE_STATUS.SEARCHING;
      }
    } else if (status === 'cancelled' || status === 'canceled') {
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.CANCELLED;
      cycle.cancelTooLate = false;
      cycle.error = null;
    } else if (status === 'matched') {
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.MATCHED;
      cycle.matchId = update.matchId == null ? null : String(update.matchId);
      cycle.cancelTooLate = !enabled || cycle.cancelAfterStart || cycle.status === POST_MATCH_AUTOQUEUE_STATUS.CANCEL_REQUESTED;
      // Any explicit OFF before this authoritative update means cancellation lost the race.
      if (!enabled || cycle.cancelAfterStart) cycle.cancelTooLate = true;
      cycle.error = null;
    } else if (status === 'connecting') {
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.CONNECTING;
      cycle.matchId = update.matchId == null ? cycle.matchId : String(update.matchId);
      if (!enabled || cycle.cancelAfterStart) cycle.cancelTooLate = true;
      cycle.error = null;
    } else if (status === 'failed' || status === 'expired') {
      cycle.status = POST_MATCH_AUTOQUEUE_STATUS.FAILED;
      cycle.error = update.error == null ? status : String(update.error);
    }
    return emit();
  }

  return Object.freeze({
    onResult,
    setEnabled,
    handleTicketUpdate,
    snapshot,
  });
}
