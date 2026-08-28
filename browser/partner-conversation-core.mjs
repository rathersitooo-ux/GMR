import {
  getSaasunaConversationSource,
  selectSaasunaFallback,
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
} from './partner-saasuna-conversation-source.mjs';

const CORE_ID = 'gameroad.partner-conversation-core.v1';
const COLLECTIVE_CONTEXT_SCHEMA = 'gameroad.partner-conversation-collective-context.v1';
const SOURCE_USE_SITE = 'partner-conversation';

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function exactToken(value, max = 160) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return value;
}

function userMessage(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 4000) return null;
  return text;
}

function validCollectiveContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== COLLECTIVE_CONTEXT_SCHEMA) return null;
  if (value.partnerId !== SAASUNA_PARTNER_ID || value.useSite !== SOURCE_USE_SITE) return null;
  if (value.safeForPrompt !== true || value.containsPrivate === true || value.containsRawUserText === true) return null;
  if (!Array.isArray(value.items) || !Array.isArray(value.lineage)) return null;
  return value;
}

function safeProviderUtterance(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  if (result.kind !== 'utterance_candidate') return null;
  if (result.partnerId !== SAASUNA_PARTNER_ID) return null;
  if (result.dialogueVersion !== SAASUNA_DIALOGUE_VERSION) return null;
  if (result.sourceId !== SAASUNA_DIALOGUE_SOURCE_ID) return null;
  if (typeof result.text !== 'string') return null;
  const text = result.text.trim();
  if (!text || text.length > 800) return null;
  return text;
}

function evidenceAtom({ sessionId, turnId, responseOrigin, providerAttempted, collectiveContext }) {
  return freezeDeep({
    schemaVersion: 'gameroad.partner-conversation-evidence.v1',
    eventType: 'partner_conversation_turn',
    partnerId: SAASUNA_PARTNER_ID,
    dialogueVersion: SAASUNA_DIALOGUE_VERSION,
    sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
    sourceUseSite: SOURCE_USE_SITE,
    sessionId,
    turnId,
    responseOrigin,
    providerAttempted,
    collectiveEvidenceIds: collectiveContext ? collectiveContext.lineage.map((item) => item.evidenceId) : [],
    rawUserTextStored: false,
    rawProviderPayloadStored: false,
    automaticCanonMutation: false,
    automaticRelationshipMutation: false,
    automaticGameMutation: false,
  });
}

function result({ sessionId, turnId, text, responseOrigin, providerAttempted, collectiveContext }) {
  return freezeDeep({
    ok: true,
    coreId: CORE_ID,
    partnerId: SAASUNA_PARTNER_ID,
    dialogueVersion: SAASUNA_DIALOGUE_VERSION,
    sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
    sourceUseSite: SOURCE_USE_SITE,
    utterance: text,
    responseOrigin,
    canonStatus: responseOrigin === 'provider_candidate' ? 'ephemeral_candidate' : 'approved_source_fallback',
    highIntimacyEnabled: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    evidence: evidenceAtom({ sessionId, turnId, responseOrigin, providerAttempted, collectiveContext }),
  });
}

function fail(reason) {
  return freezeDeep({
    ok: false,
    coreId: CORE_ID,
    reason,
    partnerId: SAASUNA_PARTNER_ID,
    containsCharacterText: false,
    containsPrivate: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
  });
}

export async function runSaasunaConversationTurn(input = {}, deps = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INPUT_REQUIRED');

  const partnerId = exactToken(input.partnerId ?? SAASUNA_PARTNER_ID);
  const sessionId = exactToken(input.sessionId);
  const turnId = exactToken(input.turnId);
  const text = userMessage(input.userMessage);
  if (partnerId !== SAASUNA_PARTNER_ID) return fail('PARTNER_NOT_SAASUNA');
  if (!sessionId || !turnId || !text) return fail('TURN_BOUNDARY_INVALID');

  const source = getSaasunaConversationSource({
    partnerId,
    dialogueVersion: input.dialogueVersion ?? SAASUNA_DIALOGUE_VERSION,
    sourceId: input.sourceId ?? SAASUNA_DIALOGUE_SOURCE_ID,
  });
  if (!source) return fail('SOURCE_NOT_CURRENT');

  const collectiveContext = validCollectiveContext(input.collectiveContext);
  const provider = deps.provider;
  let providerAttempted = false;

  if (provider && typeof provider.sendMessage === 'function') {
    providerAttempted = true;
    try {
      const providerResult = await provider.sendMessage(freezeDeep({
        kind: 'partner_conversation_request',
        partnerId: source.partnerId,
        dialogueVersion: source.dialogueVersion,
        sourceId: source.sourceId,
        sourceUseSite: SOURCE_USE_SITE,
        sessionId,
        turnId,
        userMessage: text,
        personaGuidance: [...source.personaGuidance],
        highIntimacyEnabled: false,
        collectiveContext: collectiveContext ? {
          schemaVersion: collectiveContext.schemaVersion,
          items: collectiveContext.items,
          lineage: collectiveContext.lineage,
        } : null,
      }));
      const candidate = safeProviderUtterance(providerResult);
      if (candidate) {
        return result({
          sessionId,
          turnId,
          text: candidate,
          responseOrigin: 'provider_candidate',
          providerAttempted,
          collectiveContext,
        });
      }
    } catch {
      // Fail soft to a current approved Saasuna fallback. Diagnostic text is never rendered.
    }
  }

  return result({
    sessionId,
    turnId,
    text: selectSaasunaFallback(`${sessionId}|${turnId}`),
    responseOrigin: 'approved_fallback',
    providerAttempted,
    collectiveContext,
  });
}

export const PARTNER_CONVERSATION_CORE_ID = CORE_ID;
export const PARTNER_CONVERSATION_USE_SITE = SOURCE_USE_SITE;
