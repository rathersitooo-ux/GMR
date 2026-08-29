import {
  TRANSPORT_STATUS,
  normalizeTransportRequest,
} from '../tools/chatgpt-browser-transport-core.mjs';
import { createCartridgeProducerCandidate } from './cartridge-producer-core.mjs';

const OUTPUT_SHAPE = '{"sourceId":"...","manifest":{...},"provenance":{"declaredOrigin":"AI_GENERATED|AI_ASSISTED|HUMAN|UNKNOWN","useScope":"LOCAL_PRIVATE|FORMAL_REVIEW_CANDIDATE","rightsStatus":"SELF_CREATED|LICENSED|PUBLIC_DOMAIN|UNKNOWN","sourceRef":null,"sourceDigest":null,"containsPrivate":false,"containsCredentials":false}}';

function cleanText(value, name, max = 16_000) {
  if (typeof value !== 'string') throw new TypeError(`${name}_must_be_string`);
  const text = value.trim();
  if (!text) throw new Error(`${name}_required`);
  if (text.length > max) throw new Error(`${name}_too_long`);
  if (text.includes('\u0000')) throw new Error(`${name}_nul`);
  return text;
}

function responseMarker(packetId, correlationId) {
  return `[GAMEROAD_SOL_RESPONSE packetId="${packetId}" correlationId="${correlationId}"]`;
}

export function buildCartridgeProducerTransportRequest({
  producerKind = 'CHATGPT',
  userRequest,
  boundedContext = '',
  taskId,
  workUnitKey,
  acquireKey,
  packetId,
  correlationId,
  expectedConversationId = '',
  timeoutMs,
  idempotencyKey,
} = {}) {
  const request = cleanText(userRequest, 'userRequest', 12_000);
  const context = boundedContext ? cleanText(boundedContext, 'boundedContext', 12_000) : '';
  const prompt = [
    'Create one GAMEROAD cartridge CANDIDATE only. Do not install, publish, grant capabilities, mutate canon/relationship, award rewards, or claim ranked legality.',
    `Producer kind: ${producerKind}`,
    `User request: ${request}`,
    context ? `Bounded context:\n${context}` : '',
    'Return exactly one JSON object and no markdown. Use this exact top-level shape:',
    OUTPUT_SHAPE,
    'The manifest must follow gameroad.cartridge-manifest.v1. Capabilities are requests only. Do not include private text, credentials, secrets, or undeclared side effects.',
  ].filter(Boolean).join('\n\n');

  return normalizeTransportRequest({
    taskId,
    workUnitKey,
    acquireKey,
    packetId,
    correlationId,
    prompt,
    expectedConversationId,
    timeoutMs,
    idempotencyKey,
  });
}

export function buildChatGptCartridgeProducerRequest(input = {}) {
  return buildCartridgeProducerTransportRequest({ ...input, producerKind: 'CHATGPT' });
}

export function parseCartridgeProducerTransportResult(result, { producerKind = 'CHATGPT' } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('transport_result_required');
  if (result.ok !== true || result.status !== TRANSPORT_STATUS.COMPLETED) {
    throw new Error(`CARTRIDGE_PRODUCER_TRANSPORT_NOT_COMPLETED:${String(result.status ?? 'UNKNOWN')}`);
  }
  const marker = responseMarker(result.packetId, result.correlationId);
  const text = cleanText(result.responseText, 'responseText', 40_000);
  if (!text.includes(marker)) throw new Error('CARTRIDGE_PRODUCER_CORRELATION_MARKER_MISSING');
  const jsonText = text.replace(marker, '').trim();
  if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) throw new Error('CARTRIDGE_PRODUCER_RESPONSE_NOT_EXACT_JSON');

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('CARTRIDGE_PRODUCER_RESPONSE_JSON_INVALID');
  }
  const keys = Object.keys(parsed).sort();
  const allowed = ['manifest', 'provenance', 'sourceId'];
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    throw new Error('CARTRIDGE_PRODUCER_RESPONSE_FIELDS_INVALID');
  }
  return createCartridgeProducerCandidate({
    producerKind,
    requestId: result.packetId,
    sourceId: parsed.sourceId,
    manifest: parsed.manifest,
    provenance: parsed.provenance,
  });
}

export function parseChatGptCartridgeProducerResult(result) {
  return parseCartridgeProducerTransportResult(result, { producerKind: 'CHATGPT' });
}
