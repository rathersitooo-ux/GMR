const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_PROMPT_CHARS = 32_000;

export const TRANSPORT_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  WRONG_CONVERSATION: 'WRONG_CONVERSATION',
  COMPOSER_UNAVAILABLE: 'COMPOSER_UNAVAILABLE',
  PAGE_NOT_READY: 'PAGE_NOT_READY',
  APP_ERROR: 'APP_ERROR',
  TIMED_OUT: 'TIMED_OUT',
  STALE_RESPONSE: 'STALE_RESPONSE',
  DUPLICATE_SEND: 'DUPLICATE_SEND',
  CORRELATION_MISMATCH: 'CORRELATION_MISMATCH',
  TRUNCATED: 'TRUNCATED',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  DRIVER_ERROR: 'DRIVER_ERROR',
});

function cleanString(value, name, { optional = false, max = 1024 } = {}) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new TypeError(`${name}_must_be_string`);
  const out = value.trim();
  if (!out && !optional) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function cleanPositiveInteger(value, name, fallback) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name}_must_be_positive_integer`);
  return value;
}

function markerFor(packetId, correlationId) {
  return `[GAMEROAD_SOL_RESPONSE packetId="${packetId}" correlationId="${correlationId}"]`;
}

export function normalizeTransportRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('request_must_be_object');
  }

  const packetId = cleanString(input.packetId, 'packetId', { max: 240 });
  const correlationId = cleanString(input.correlationId, 'correlationId', { max: 240 });
  const request = {
    taskId: cleanString(input.taskId, 'taskId', { max: 240 }),
    workUnitKey: cleanString(input.workUnitKey, 'workUnitKey', { max: 240 }),
    acquireKey: cleanString(input.acquireKey, 'acquireKey', { max: 300 }),
    packetId,
    correlationId,
    prompt: cleanString(input.prompt, 'prompt', { max: MAX_PROMPT_CHARS }),
    expectedConversationId: cleanString(input.expectedConversationId ?? '', 'expectedConversationId', { optional: true, max: 300 }),
    timeoutMs: cleanPositiveInteger(input.timeoutMs, 'timeoutMs', DEFAULT_TIMEOUT_MS),
  };
  request.idempotencyKey = cleanString(
    input.idempotencyKey ?? `${request.acquireKey}:${packetId}:${correlationId}`,
    'idempotencyKey',
    { max: 900 },
  );
  request.responseMarker = markerFor(packetId, correlationId);
  return request;
}

export function buildTransportMessage(input) {
  const request = normalizeTransportRequest(input);
  return [
    '[GAMEROAD_SOL_PACKET]',
    `taskId=${request.taskId}`,
    `workUnitKey=${request.workUnitKey}`,
    `acquireKey=${request.acquireKey}`,
    `packetId=${request.packetId}`,
    `correlationId=${request.correlationId}`,
    '',
    request.prompt,
    '',
    'Transport requirement: include the following exact marker somewhere in the completed assistant response:',
    request.responseMarker,
  ].join('\n');
}

function result(request, status, extras = {}) {
  return {
    ok: status === TRANSPORT_STATUS.COMPLETED,
    status,
    taskId: request.taskId,
    workUnitKey: request.workUnitKey,
    acquireKey: request.acquireKey,
    packetId: request.packetId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    retryable: false,
    evidence: [],
    ...extras,
  };
}

function assertDriver(driver) {
  if (!driver || typeof driver !== 'object') throw new Error('driver_required');
  for (const method of ['inspectContext', 'submitMessage', 'waitForAssistantTurn']) {
    if (typeof driver[method] !== 'function') throw new Error(`driver_${method}_required`);
  }
}

function safeError(error) {
  if (!error) return 'unknown_driver_error';
  return typeof error.message === 'string' ? error.message : String(error);
}

export class ChatGptBrowserTransport {
  constructor({ driver, now = () => Date.now() } = {}) {
    assertDriver(driver);
    this.driver = driver;
    this.now = now;
    this.attempts = new Map();
  }

  async run(input) {
    const request = normalizeTransportRequest(input);
    const existing = this.attempts.get(request.idempotencyKey);
    if (existing) {
      if (existing.identity !== `${request.packetId}:${request.correlationId}`) {
        return result(request, TRANSPORT_STATUS.DUPLICATE_SEND, {
          error: 'idempotency_key_reused_for_different_identity',
          evidence: ['existing_idempotency_identity_mismatch'],
        });
      }
      if (existing.completed) return { ...existing.completed, resumed: true, reused: true };
      return this.#awaitCompletion(request, existing, { resumed: true });
    }

    let context;
    try {
      context = await this.driver.inspectContext();
    } catch (error) {
      return result(request, TRANSPORT_STATUS.DRIVER_ERROR, {
        retryable: true,
        error: safeError(error),
        evidence: ['inspect_context_failed'],
      });
    }

    if (!context || context.pageReady === false || context.loading === true) {
      return result(request, TRANSPORT_STATUS.PAGE_NOT_READY, {
        retryable: true,
        evidence: ['page_not_ready'],
      });
    }
    if (context.appError) {
      return result(request, TRANSPORT_STATUS.APP_ERROR, {
        retryable: true,
        error: String(context.appError),
        evidence: ['pre_submit_app_error'],
      });
    }
    if (context.composerReady !== true) {
      return result(request, TRANSPORT_STATUS.COMPOSER_UNAVAILABLE, {
        retryable: true,
        evidence: ['composer_not_ready'],
      });
    }
    if (request.expectedConversationId && context.conversationId !== request.expectedConversationId) {
      return result(request, TRANSPORT_STATUS.WRONG_CONVERSATION, {
        error: `expected=${request.expectedConversationId};actual=${context.conversationId ?? ''}`,
        evidence: ['conversation_identity_mismatch'],
      });
    }

    const attempt = {
      identity: `${request.packetId}:${request.correlationId}`,
      conversationId: context.conversationId ?? '',
      baselineAssistantTurnId: context.lastAssistantTurnId ?? '',
      submittedAtMs: this.now(),
      submitted: false,
    };
    this.attempts.set(request.idempotencyKey, attempt);

    try {
      const submission = await this.driver.submitMessage({
        text: buildTransportMessage(request),
        idempotencyKey: request.idempotencyKey,
        packetId: request.packetId,
        correlationId: request.correlationId,
      });
      if (submission?.accepted === false) {
        this.attempts.delete(request.idempotencyKey);
        return result(request, TRANSPORT_STATUS.DRIVER_ERROR, {
          retryable: true,
          error: submission.error ?? 'submit_rejected',
          evidence: ['submit_rejected'],
        });
      }
      attempt.submitted = true;
      attempt.userTurnId = submission?.userTurnId ?? '';
    } catch (error) {
      this.attempts.delete(request.idempotencyKey);
      return result(request, TRANSPORT_STATUS.DRIVER_ERROR, {
        retryable: true,
        error: safeError(error),
        evidence: ['submit_failed_before_acceptance'],
      });
    }

    return this.#awaitCompletion(request, attempt, { resumed: false });
  }

  async #awaitCompletion(request, attempt, { resumed }) {
    let turn;
    try {
      turn = await this.driver.waitForAssistantTurn({
        afterTurnId: attempt.baselineAssistantTurnId,
        conversationId: attempt.conversationId,
        packetId: request.packetId,
        correlationId: request.correlationId,
        timeoutMs: request.timeoutMs,
      });
    } catch (error) {
      return result(request, TRANSPORT_STATUS.DRIVER_ERROR, {
        retryable: true,
        resumed,
        error: safeError(error),
        evidence: ['assistant_wait_driver_error', 'message_already_submitted_no_resend'],
      });
    }

    if (!turn || turn.state === 'timeout') {
      return result(request, TRANSPORT_STATUS.TIMED_OUT, {
        retryable: true,
        resumed,
        evidence: ['assistant_completion_timeout', 'message_already_submitted_no_resend'],
      });
    }
    if (turn.state === 'error' || turn.appError) {
      return result(request, TRANSPORT_STATUS.APP_ERROR, {
        retryable: true,
        resumed,
        error: String(turn.error ?? turn.appError ?? 'assistant_app_error'),
        evidence: ['assistant_app_error', 'message_already_submitted_no_resend'],
      });
    }
    if (turn.state !== 'completed') {
      return result(request, TRANSPORT_STATUS.TIMED_OUT, {
        retryable: true,
        resumed,
        error: `assistant_state=${String(turn.state ?? 'unknown')}`,
        evidence: ['assistant_not_completed', 'message_already_submitted_no_resend'],
      });
    }
    if (!turn.turnId || turn.turnId === attempt.baselineAssistantTurnId) {
      return result(request, TRANSPORT_STATUS.STALE_RESPONSE, {
        retryable: true,
        resumed,
        assistantTurnId: turn.turnId ?? '',
        evidence: ['assistant_turn_not_new'],
      });
    }
    if (attempt.conversationId && turn.conversationId && turn.conversationId !== attempt.conversationId) {
      return result(request, TRANSPORT_STATUS.WRONG_CONVERSATION, {
        resumed,
        assistantTurnId: turn.turnId,
        error: `submitted=${attempt.conversationId};returned=${turn.conversationId}`,
        evidence: ['response_conversation_mismatch'],
      });
    }
    if (turn.truncated === true || turn.complete === false) {
      return result(request, TRANSPORT_STATUS.TRUNCATED, {
        retryable: true,
        resumed,
        assistantTurnId: turn.turnId,
        evidence: ['assistant_response_truncated'],
      });
    }

    const text = typeof turn.text === 'string' ? turn.text.trim() : '';
    if (!text) {
      return result(request, TRANSPORT_STATUS.EMPTY_RESPONSE, {
        retryable: true,
        resumed,
        assistantTurnId: turn.turnId,
        evidence: ['assistant_response_empty'],
      });
    }
    if (!text.includes(request.responseMarker)) {
      return result(request, TRANSPORT_STATUS.CORRELATION_MISMATCH, {
        resumed,
        assistantTurnId: turn.turnId,
        responseText: text,
        error: 'required_response_marker_missing',
        evidence: ['packet_correlation_marker_missing'],
      });
    }

    const completed = result(request, TRANSPORT_STATUS.COMPLETED, {
      resumed,
      conversationId: turn.conversationId ?? attempt.conversationId,
      userTurnId: attempt.userTurnId,
      assistantTurnId: turn.turnId,
      submittedAtMs: attempt.submittedAtMs,
      completedAtMs: this.now(),
      responseText: text,
      evidence: [
        'composer_ready_before_submit',
        'single_submit_recorded',
        'assistant_turn_is_new',
        'assistant_state_completed',
        'packet_correlation_marker_verified',
      ],
    });
    attempt.completed = completed;
    return completed;
  }
}

export function createChatGptBrowserTransport(options) {
  return new ChatGptBrowserTransport(options);
}
