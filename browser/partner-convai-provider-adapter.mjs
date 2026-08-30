const DEFAULT_ENDPOINT = '/partner-conversation';
const STORAGE_PREFIX = 'gameroad.partner.convai.session.v1:';
const PARTNER_ID = 'partner.saasuna';
const MAX_SESSION_ID = 160;
const MAX_TURN_ID = 160;
const MAX_MESSAGE = 800;
const MAX_PROVIDER_SESSION_ID = 256;

function asBoundedString(value, max, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > max) throw new RangeError(`${label} is invalid`);
  return text;
}

function assertRelativeSameOriginEndpoint(endpoint) {
  const value = asBoundedString(endpoint, 240, 'endpoint');
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    throw new TypeError('endpoint must be a same-origin relative path');
  }
  return value;
}

function validateCoreProviderRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('provider request must be an object');
  if (input.kind !== 'partner_conversation_request') throw new TypeError('unsupported provider request kind');
  if (input.partnerId !== PARTNER_ID) throw new TypeError('unsupported partner');
  if (input.highIntimacyEnabled !== false) throw new TypeError('high intimacy mode is not allowed');
  return Object.freeze({
    kind: input.kind,
    partnerId: PARTNER_ID,
    dialogueVersion: asBoundedString(input.dialogueVersion, 160, 'dialogueVersion'),
    sourceId: asBoundedString(input.sourceId, 200, 'sourceId'),
    sourceUseSite: asBoundedString(input.sourceUseSite, 200, 'sourceUseSite'),
    sessionId: asBoundedString(input.sessionId, MAX_SESSION_ID, 'sessionId'),
    turnId: asBoundedString(input.turnId, MAX_TURN_ID, 'turnId'),
    userMessage: asBoundedString(input.userMessage, MAX_MESSAGE, 'userMessage'),
  });
}

function normalizeServerPayload(payload, expected) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('provider response is malformed');
  if (payload.ok !== true || payload.kind !== 'utterance_candidate') throw new TypeError('provider response is malformed');
  if (payload.partnerId !== expected.partnerId || payload.dialogueVersion !== expected.dialogueVersion || payload.sourceId !== expected.sourceId) {
    throw new TypeError('provider response identity mismatch');
  }
  const text = asBoundedString(payload.text, MAX_MESSAGE, 'provider text');
  const providerSessionId = asBoundedString(payload.providerSessionId, MAX_PROVIDER_SESSION_ID, 'providerSessionId');
  if (payload.provider !== 'convai') throw new TypeError('unexpected provider');
  return Object.freeze({ text, providerSessionId });
}

function safeStorageGet(storage, key) {
  try {
    const value = storage?.getItem?.(key);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_PROVIDER_SESSION_ID ? trimmed : null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export class PartnerConvaiProviderError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PartnerConvaiProviderError';
    this.code = code;
  }
}

export function createSaasunaConvaiProvider({ endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch, sessionStorage = globalThis.sessionStorage } = {}) {
  const safeEndpoint = assertRelativeSameOriginEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  let state = Object.freeze({ provider: 'convai', state: 'idle', sessionBound: false, lastCode: null });

  function setState(nextState, sessionBound, lastCode = null) {
    state = Object.freeze({ provider: 'convai', state: nextState, sessionBound: Boolean(sessionBound), lastCode });
  }

  return Object.freeze({
    getState() {
      return state;
    },
    async sendMessage(input) {
      const request = validateCoreProviderRequest(input);
      const storageKey = `${STORAGE_PREFIX}${request.sessionId}`;
      const providerSessionId = safeStorageGet(sessionStorage, storageKey);
      const outbound = Object.freeze({
        kind: 'partner_convai_turn_request',
        partnerId: request.partnerId,
        dialogueVersion: request.dialogueVersion,
        sourceId: request.sourceId,
        sourceUseSite: request.sourceUseSite,
        sessionId: request.sessionId,
        turnId: request.turnId,
        userMessage: request.userMessage,
        providerSessionId,
      });

      let response;
      try {
        response = await fetchImpl(safeEndpoint, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(outbound),
        });
      } catch {
        setState('fallback', Boolean(providerSessionId), 'NETWORK_ERROR');
        throw new PartnerConvaiProviderError('NETWORK_ERROR');
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const code = typeof payload?.code === 'string' ? payload.code : `HTTP_${response.status}`;
        if (code === 'PROVIDER_NOT_CONFIGURED') setState('not_configured', Boolean(providerSessionId), code);
        else setState('fallback', Boolean(providerSessionId), code);
        throw new PartnerConvaiProviderError(code);
      }

      let normalized;
      try {
        normalized = normalizeServerPayload(payload, request);
      } catch {
        setState('fallback', Boolean(providerSessionId), 'MALFORMED_PROVIDER_RESPONSE');
        throw new PartnerConvaiProviderError('MALFORMED_PROVIDER_RESPONSE');
      }
      safeStorageSet(sessionStorage, storageKey, normalized.providerSessionId);
      setState('ready', true, null);
      return Object.freeze({
        kind: 'utterance_candidate',
        partnerId: request.partnerId,
        dialogueVersion: request.dialogueVersion,
        sourceId: request.sourceId,
        text: normalized.text,
      });
    },
  });
}

export const PARTNER_CONVAI_PROVIDER = Object.freeze({
  schema: 'gameroad.partner.convai.provider-adapter.v1',
  partnerId: PARTNER_ID,
  endpoint: DEFAULT_ENDPOINT,
  browserSecretRequired: false,
  providerSessionScope: 'browser-conversation-session-only',
});
