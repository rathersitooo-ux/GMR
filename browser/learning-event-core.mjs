export const LEARNING_SUBJECTS = Object.freeze({
  MATH_LOGIC: 'math_logic',
  NATURAL_SCIENCE: 'natural_science',
  LIFE_SCIENCE: 'life_science',
  LANGUAGE_COMMUNICATION: 'language_communication',
  STRATEGY_DECISION: 'strategy_decision',
  CREATIVE: 'creative',
});

export const COGNITIVE_CATEGORY_CODES = Object.freeze([
  'identify', 'memorize', 'analyze', 'compute', 'visualize',
]);

export const LEARNING_EVENT_RESULTS = Object.freeze([
  'correct', 'incorrect', 'partial', 'unscored',
]);

const EVIDENCE_ROLES = new Set(['used', 'missed', 'corrective', 'context']);
const SUBJECTS = new Set(Object.values(LEARNING_SUBJECTS));
const COGNITIVE = new Set(COGNITIVE_CATEGORY_CODES);
const RESULTS = new Set(LEARNING_EVENT_RESULTS);
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

function code(value, name) {
  if (typeof value !== 'string' || !CODE_RE.test(value)) {
    throw new TypeError(`${name} must be a bounded code identifier`);
  }
  return value;
}

function onlyKeys(obj, allowed, name) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not allowed`);
  }
}

function normalizeEvidenceRef(raw, index) {
  const name = `evidenceRefs[${index}]`;
  onlyKeys(raw, new Set(['id', 'version', 'provenance', 'role']), name);
  const role = code(raw.role, `${name}.role`);
  if (!EVIDENCE_ROLES.has(role)) throw new TypeError(`${name}.role is unsupported`);
  return Object.freeze({
    id: code(raw.id, `${name}.id`),
    version: code(raw.version, `${name}.version`),
    provenance: code(raw.provenance, `${name}.provenance`),
    role,
  });
}

export function normalizeLearningEvent(raw = {}) {
  onlyKeys(raw, new Set([
    'eventId', 'sessionKey', 'activityId', 'subject', 'cognitiveCategories',
    'decisionCode', 'outcomeCode', 'result', 'evidenceRefs',
  ]), 'event');

  const subject = code(raw.subject, 'subject');
  if (!SUBJECTS.has(subject)) throw new TypeError(`unsupported learning subject: ${subject}`);

  const result = code(raw.result, 'result');
  if (!RESULTS.has(result)) throw new TypeError(`unsupported learning event result: ${result}`);

  const categories = [...new Set((Array.isArray(raw.cognitiveCategories) ? raw.cognitiveCategories : []).map((value, index) => {
    const category = code(value, `cognitiveCategories[${index}]`);
    if (!COGNITIVE.has(category)) throw new TypeError(`unsupported cognitive category: ${category}`);
    return category;
  }))];
  if (categories.length === 0) throw new TypeError('cognitiveCategories must contain at least one supported category');

  const evidenceRefs = (Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : []).map(normalizeEvidenceRef);
  const evidenceKey = (ref) => `${ref.id}\u0000${ref.version}\u0000${ref.provenance}\u0000${ref.role}`;
  if (new Set(evidenceRefs.map(evidenceKey)).size !== evidenceRefs.length) {
    throw new TypeError('duplicate evidenceRefs are not allowed');
  }

  return Object.freeze({
    schemaVersion: 'learning-event-v1',
    eventId: code(raw.eventId, 'eventId'),
    sessionKey: code(raw.sessionKey, 'sessionKey'),
    activityId: code(raw.activityId, 'activityId'),
    subject,
    cognitiveCategories: Object.freeze(categories),
    decisionCode: code(raw.decisionCode, 'decisionCode'),
    outcomeCode: code(raw.outcomeCode, 'outcomeCode'),
    result,
    evidenceRefs: Object.freeze(evidenceRefs),
    learningOutcome: 'UNMEASURED',
    realSkillOutcome: 'UNMEASURED',
    containsRawUserText: false,
    containsPersonalIdentifiers: false,
  });
}

export function summarizeLearningEvents(events = []) {
  const valid = (Array.isArray(events) ? events : []).filter((event) => event?.schemaVersion === 'learning-event-v1');
  const bySubject = {};
  const byResult = {};
  for (const event of valid) {
    bySubject[event.subject] = (bySubject[event.subject] ?? 0) + 1;
    byResult[event.result] = (byResult[event.result] ?? 0) + 1;
  }
  return Object.freeze({
    schemaVersion: 'learning-event-summary-v1',
    eventCount: valid.length,
    bySubject: Object.freeze(bySubject),
    byResult: Object.freeze(byResult),
    learningOutcome: 'UNMEASURED',
    realSkillOutcome: 'UNMEASURED',
  });
}
