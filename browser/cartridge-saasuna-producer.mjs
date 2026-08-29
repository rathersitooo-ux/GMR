import {
  buildCartridgeProducerTransportRequest,
  parseCartridgeProducerTransportResult,
} from './cartridge-chatgpt-producer.mjs';

const CONTEXT_FIELDS = new Set([
  'partnerId',
  'personaVersion',
  'currentActivityRef',
  'responsePlanRef',
  'relationshipReadRef',
]);

function cleanRef(value, name) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new TypeError(`${name}_must_be_string`);
  const ref = value.trim();
  if (!ref || ref.length > 512 || ref.includes('\u0000') || /[\r\n]/.test(ref)) throw new Error(`${name}_invalid`);
  return ref;
}

export function normalizeSaasunaProducerContext(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('saasuna_context_must_be_object');
  const unexpected = Object.keys(input).filter((field) => !CONTEXT_FIELDS.has(field)).sort();
  if (unexpected.length) throw new Error(`SAASUNA_PRODUCER_CONTEXT_UNEXPECTED:${unexpected.join(',')}`);
  const context = {};
  for (const field of CONTEXT_FIELDS) {
    const value = cleanRef(input[field], field);
    if (value) context[field] = value;
  }
  if (!context.partnerId) throw new Error('SAASUNA_PRODUCER_PARTNER_ID_REQUIRED');
  return Object.freeze(context);
}

export function buildSaasunaCartridgeProducerRequest({ userRequest, partnerContext, ...transportIdentity } = {}) {
  const context = normalizeSaasunaProducerContext(partnerContext);
  const boundedContext = [
    'Saasuna is the creation director, not the truth authority or runtime owner.',
    'Use only the following reference identifiers; do not infer or mutate persona, canon, relationship, or private memory.',
    ...Object.entries(context).map(([key, value]) => `${key}=${value}`),
  ].join('\n');
  return buildCartridgeProducerTransportRequest({
    ...transportIdentity,
    producerKind: 'SAASUNA',
    userRequest,
    boundedContext,
  });
}

export function parseSaasunaCartridgeProducerResult(result) {
  return parseCartridgeProducerTransportResult(result, { producerKind: 'SAASUNA' });
}
