import {
  getSaasunaConversationSource,
  selectSaasunaFallback,
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
} from './partner-saasuna-conversation-source.mjs';

const CORE_ID = 'gameroad.partner-conversation-core.v1';
const COLLECTIVE_CONTEXT_SCHEMA = 'gameroad.partner-conversation-collective-context.v1';
const KNOWLEDGE_CONTEXT_SCHEMA = 'gameroad.partner-knowledge-context.v1';
const SESSION_CONTEXT_MAX_TURNS = 4;
const SOURCE_USE_SITE = 'partner-conversation';
const ENTRY_SCREEN_ID = 'partner-conversation';
const KNOWLEDGE_TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'partnerId', 'useSite', 'safeForPrompt', 'containsPrivate', 'containsRawUserText', 'items', 'lineage',
]);
const KNOWLEDGE_ITEM_KEYS = new Set(['evidenceId', 'summary', 'confidence']);
const KNOWLEDGE_LINEAGE_KEYS = new Set([
  'evidenceId', 'sourceId', 'sourceVersion', 'provenance', 'authorityRef', 'observedAt', 'freshness',
]);
const KNOWLEDGE_PROVENANCE = new Set(['internal_authority', 'external_primary']);
const KNOWLEDGE_FRESHNESS = new Set(['current', 'stable_verified']);

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

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validCollectiveContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== COLLECTIVE_CONTEXT_SCHEMA) return null;
  if (value.partnerId !== SAASUNA_PARTNER_ID || value.useSite !== SOURCE_USE_SITE) return null;
  if (value.safeForPrompt !== true || value.containsPrivate === true || value.containsRawUserText === true) return null;
  if (!Array.isArray(value.items) || !Array.isArray(value.lineage)) return null;
  return value;
}

function validKnowledgeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOnlyKeys(value, KNOWLEDGE_TOP_LEVEL_KEYS)) return null;
  if (value.schemaVersion !== KNOWLEDGE_CONTEXT_SCHEMA) return null;
  if (value.partnerId !== SAASUNA_PARTNER_ID || value.useSite !== SOURCE_USE_SITE) return null;
  if (value.safeForPrompt !== true || value.containsPrivate !== false || value.containsRawUserText !== false) return null;
  if (!Array.isArray(value.items) || !Array.isArray(value.lineage) || value.items.length !== value.lineage.length) return null;
  if (value.items.length > 12) return null;

  const lineageById = new Map();
  for (const item of value.lineage) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !hasOnlyKeys(item, KNOWLEDGE_LINEAGE_KEYS)) return null;
    const evidenceId = exactToken(item.evidenceId);
    const sourceId = exactToken(item.sourceId);
    const sourceVersion = exactToken(item.sourceVersion);
    const provenance = exactToken(item.provenance);
    const authorityRef = exactToken(item.authorityRef, 240);
    const observedAt = exactToken(item.observedAt, 80);
    const freshness = exactToken(item.freshness);
    if (!evidenceId || !sourceId || !sourceVersion || !authorityRef || !observedAt) return null;
    if (!KNOWLEDGE_PROVENANCE.has(provenance) || !KNOWLEDGE_FRESHNESS.has(freshness) || lineageById.has(evidenceId)) return null;
    lineageById.set(evidenceId, freezeDeep({ evidenceId, sourceId, sourceVersion, provenance, authorityRef, observedAt, freshness }));
  }

  const items = [];
  const lineage = [];
  for (const item of value.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !hasOnlyKeys(item, KNOWLEDGE_ITEM_KEYS)) return null;
    const evidenceId = exactToken(item.evidenceId);
    const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
    const confidence = item.confidence === undefined ? null : exactToken(item.confidence);
    if (!evidenceId || !summary || summary.length > 600 || (item.confidence !== undefined && !confidence)) return null;
    const source = lineageById.get(evidenceId);
    if (!source) return null;
    items.push(freezeDeep({ evidenceId, summary, ...(confidence ? { confidence } : {}) }));
    lineage.push(source);
    lineageById.delete(evidenceId);
  }
  if (lineageById.size !== 0) return null;

  return freezeDeep({
    schemaVersion: KNOWLEDGE_CONTEXT_SCHEMA,
    partnerId: SAASUNA_PARTNER_ID,
    useSite: SOURCE_USE_SITE,
    safeForPrompt: true,
    containsPrivate: false,
    containsRawUserText: false,
    items,
    lineage,
  });
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
  const knowledgeContext = validKnowledgeContext(input.knowledgeContext);
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
        knowledgeContext: knowledgeContext ? {
          schemaVersion: knowledgeContext.schemaVersion,
          items: knowledgeContext.items,
          lineage: knowledgeContext.lineage,
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

function createDefaultSessionId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return exactToken(uuid) ?? `session-${Date.now().toString(36)}`;
}

function createSessionContext(turns) {
  if (!Array.isArray(turns) || turns.length === 0) return null;
  return freezeDeep({
    turns: turns.slice(-SESSION_CONTEXT_MAX_TURNS).map((turn) => freezeDeep({
      turnId: turn.turnId,
      userMessage: turn.userMessage,
      assistantUtterance: turn.assistantUtterance,
      responseOrigin: turn.responseOrigin,
    })),
  });
}

export function createSaasunaConversationEntry({ provider = null, createSessionId = createDefaultSessionId } = {}) {
  if (provider !== null && typeof provider?.sendMessage !== 'function') throw new TypeError('PROVIDER_INVALID');
  if (typeof createSessionId !== 'function') throw new TypeError('CREATE_SESSION_ID_REQUIRED');
  const sessionId = exactToken(createSessionId());
  if (!sessionId) throw new TypeError('SESSION_ID_INVALID');
  let turnSequence = 0;
  const sessionTurns = [];

  const entryState = () => freezeDeep({
    screenId: ENTRY_SCREEN_ID,
    partnerId: SAASUNA_PARTNER_ID,
    title: 'サースナーと会話',
    pickerRequired: false,
    switchPartnerAllowedHere: false,
    providerReady: provider !== null,
  });

  async function send(message, { knowledgeContext = null } = {}) {
    const turnId = `turn-${++turnSequence}`;
    const text = userMessage(message);
    const sessionContext = createSessionContext(sessionTurns);
    const scopedProvider = provider ? {
      async sendMessage(request) {
        return provider.sendMessage(freezeDeep({ ...request, sessionContext }));
      },
    } : null;
    const turn = await runSaasunaConversationTurn({
      partnerId: SAASUNA_PARTNER_ID,
      sessionId,
      turnId,
      userMessage: message,
      knowledgeContext,
    }, { provider: scopedProvider });
    if (turn.ok && text) {
      sessionTurns.push(freezeDeep({
        turnId,
        userMessage: text,
        assistantUtterance: turn.utterance,
        responseOrigin: turn.responseOrigin,
      }));
      if (sessionTurns.length > SESSION_CONTEXT_MAX_TURNS) {
        sessionTurns.splice(0, sessionTurns.length - SESSION_CONTEXT_MAX_TURNS);
      }
    }
    return freezeDeep({ ...entryState(), turn });
  }

  return freezeDeep({
    open: entryState,
    send,
    status: () => freezeDeep({ ...entryState(), sessionId, turnSequence }),
  });
}

export const PARTNER_CONVERSATION_CORE_ID = CORE_ID;
export const PARTNER_CONVERSATION_USE_SITE = SOURCE_USE_SITE;
export const PARTNER_CONVERSATION_ENTRY_SCREEN_ID = ENTRY_SCREEN_ID;
