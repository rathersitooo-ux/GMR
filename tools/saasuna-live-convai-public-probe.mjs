const DEFAULT_ENDPOINT = 'https://gameroad-browser-r5.pages.dev/ws?partnerOp=conversation';

function boundedToken(value, max = 120) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

export async function probeSaasunaLiveConvaiPublic(options = {}) {
  const endpoint = boundedToken(options.endpoint, 300) || DEFAULT_ENDPOINT;
  const userMessage = boundedToken(options.userMessage, 400) || '疎通確認です。短く返答してください。';
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, Math.min(30000, options.timeoutMs)) : 15000;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return Object.freeze({
      liveProviderObserved: false,
      state: 'fetch_unavailable',
      httpStatus: null,
      responseOk: false,
      responseTextLength: 0,
      providerSessionIdPresent: false,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage, providerSessionId: null }),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const responseTextLength = typeof payload?.text === 'string' ? payload.text.trim().length : 0;
    const providerSessionIdPresent = typeof payload?.providerSessionId === 'string' && payload.providerSessionId.trim().length > 0;
    const liveProviderObserved = response.ok && payload?.ok === true && responseTextLength > 0 && providerSessionIdPresent;
    const state = liveProviderObserved
      ? 'provider_candidate_observed'
      : boundedToken(payload?.state) || (response.ok ? 'unexpected_success_shape' : `http_${response.status}`);

    return Object.freeze({
      liveProviderObserved,
      state,
      httpStatus: response.status,
      responseOk: response.ok,
      responseTextLength,
      providerSessionIdPresent,
    });
  } catch (error) {
    return Object.freeze({
      liveProviderObserved: false,
      state: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      httpStatus: null,
      responseOk: false,
      responseTextLength: 0,
      providerSessionIdPresent: false,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const SAASUNA_LIVE_CONVAI_PUBLIC_PROBE_ENDPOINT = DEFAULT_ENDPOINT;
