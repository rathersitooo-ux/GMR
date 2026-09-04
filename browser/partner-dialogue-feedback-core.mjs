export const PARTNER_DIALOGUE_FEEDBACK_USE_SITE = 'partner_post_battle_dialogue_editor';
export const PARTNER_DIALOGUE_FEEDBACK_KIND = 'dialogue_edit';
export const PARTNER_DIALOGUE_FEEDBACK_MAX_TEXT = 600;

function exactToken(value, max = 192) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function dialogueText(value, max = PARTNER_DIALOGUE_FEEDBACK_MAX_TEXT) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

function versions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of ['rules', 'content', 'state']) {
    const token = exactToken(value[key], 96);
    if (!token) return null;
    out[key] = token;
  }
  return Object.freeze(out);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildPartnerDialogueFeedbackIdempotencyKey({
  partnerId,
  sourceLineId,
  sourceStateIdentity,
  proposedText,
  voiceTuning,
} = {}) {
  const tuning = normalizePartnerVoiceTuning(voiceTuning);
  const identity = [partnerId, sourceLineId, sourceStateIdentity, proposedText, tuning.rate, tuning.pitch, tuning.volume, tuning.pauseMs, tuning.voiceURI].join('\u001f');
  return `dialogue-feedback-${fnv1a(identity)}`;
}

export function normalizePartnerVoiceTuning(input = {}) {
  const num = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const voiceURI = typeof input.voiceURI === 'string' && input.voiceURI.trim() === input.voiceURI && input.voiceURI.length <= 240
    ? input.voiceURI
    : '';
  return Object.freeze({
    rate: num(input.rate, 1, 0.5, 2),
    pitch: num(input.pitch, 1, 0, 2),
    volume: num(input.volume, 1, 0, 1),
    pauseMs: Math.round(num(input.pauseMs, 120, 0, 1000)),
    voiceURI,
  });
}

export function buildPartnerDialogueFeedbackSubmission(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const partnerId = exactToken(input.partnerId, 160);
  const sourceLineId = exactToken(input.sourceLineId, 160);
  const sourceStateIdentity = exactToken(input.sourceStateIdentity, 256);
  const originalText = dialogueText(input.originalText);
  const proposedText = dialogueText(input.proposedText);
  const safeVersions = versions(input.versions);
  if (!partnerId || !sourceLineId || !sourceStateIdentity || !originalText || !proposedText || !safeVersions) return null;
  if (proposedText === originalText) return null;
  const voiceTuning = normalizePartnerVoiceTuning(input.voiceTuning);
  const idempotencyKey = exactToken(input.idempotencyKey, 160) || buildPartnerDialogueFeedbackIdempotencyKey({
    partnerId,
    sourceLineId,
    sourceStateIdentity,
    proposedText,
    voiceTuning,
  });

  return Object.freeze({
    idempotencyKey,
    partnerId,
    reportType: 'request',
    sourceUseSite: PARTNER_DIALOGUE_FEEDBACK_USE_SITE,
    sourceStateIdentity,
    versions: safeVersions,
    feedback: Object.freeze({
      kind: PARTNER_DIALOGUE_FEEDBACK_KIND,
      sourceLineId,
      proposedText,
      voiceTuning,
      candidateOnly: true,
      canonicalWrite: false,
      chatgptOpinionInput: true,
    }),
  });
}

export async function submitPartnerDialogueFeedback(input, {
  fetchImpl = globalThis.fetch,
  endpoint = '/report?reportOp=submit',
} = {}) {
  const submission = buildPartnerDialogueFeedbackSubmission(input);
  if (!submission) return Object.freeze({ ok: false, reason: 'dialogue_feedback_invalid' });
  if (typeof fetchImpl !== 'function') return Object.freeze({ ok: false, reason: 'dialogue_feedback_transport_unavailable' });

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
    });
  } catch {
    return Object.freeze({ ok: false, reason: 'dialogue_feedback_transport_failed' });
  }

  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body?.ok) {
    return Object.freeze({ ok: false, reason: body?.reason || `dialogue_feedback_http_${response.status}` });
  }
  return Object.freeze({
    ok: true,
    reportId: body.reportId ?? null,
    disposition: body.disposition ?? null,
    candidateOnly: body.feedback?.candidateOnly === true,
    canonicalWrite: false,
  });
}
