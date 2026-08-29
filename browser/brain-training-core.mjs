export const COGNITIVE_CATEGORIES = Object.freeze({
  IDENTIFY: 'identify',
  MEMORIZE: 'memorize',
  ANALYZE: 'analyze',
  COMPUTE: 'compute',
  VISUALIZE: 'visualize',
});

export const LEARNING_OUTCOME = Object.freeze({
  UNMEASURED: 'UNMEASURED',
});

const ANSWER_TYPES = new Set(['exact', 'one_of', 'numeric_range']);
const CATEGORY_VALUES = new Set(Object.values(COGNITIVE_CATEGORIES));

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function cloneOpaque(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') throw new TypeError('source is required');
  return Object.freeze({
    id: assertNonEmptyString(source.id, 'source.id'),
    version: assertNonEmptyString(source.version, 'source.version'),
    provenance: assertNonEmptyString(source.provenance, 'source.provenance'),
  });
}

function normalizeAnswerSpec(answer) {
  if (!answer || typeof answer !== 'object' || !ANSWER_TYPES.has(answer.type)) {
    throw new TypeError('answer.type must be exact, one_of, or numeric_range');
  }
  if (answer.type === 'exact') {
    if (!Object.hasOwn(answer, 'value')) throw new TypeError('exact answer requires value');
    return Object.freeze({ type: 'exact', value: cloneOpaque(answer.value) });
  }
  if (answer.type === 'one_of') {
    if (!Array.isArray(answer.values) || answer.values.length === 0) {
      throw new TypeError('one_of answer requires non-empty values');
    }
    return Object.freeze({ type: 'one_of', values: Object.freeze(cloneOpaque(answer.values)) });
  }
  if (!Number.isFinite(answer.min) || !Number.isFinite(answer.max) || answer.min > answer.max) {
    throw new TypeError('numeric_range answer requires finite min <= max');
  }
  return Object.freeze({ type: 'numeric_range', min: answer.min, max: answer.max });
}

export function normalizeBrainTrainingItem(raw = {}) {
  const category = assertNonEmptyString(raw.category, 'category');
  if (!CATEGORY_VALUES.has(category)) throw new TypeError(`unsupported cognitive category: ${category}`);

  const difficulty = raw.difficulty === undefined ? 1 : Number(raw.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
    throw new TypeError('difficulty must be an integer from 1 to 10');
  }

  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()))]
    : [];

  return Object.freeze({
    schemaVersion: 'brain-training-item-v1',
    id: assertNonEmptyString(raw.id, 'id'),
    version: assertNonEmptyString(raw.version, 'version'),
    category,
    difficulty,
    source: normalizeSource(raw.source),
    prompt: cloneOpaque(raw.prompt),
    answer: normalizeAnswerSpec(raw.answer),
    tags: Object.freeze(tags),
  });
}

function sameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function isCorrect(answer, submittedAnswer) {
  if (answer.type === 'exact') return sameValue(answer.value, submittedAnswer);
  if (answer.type === 'one_of') return answer.values.some((value) => sameValue(value, submittedAnswer));
  return typeof submittedAnswer === 'number'
    && Number.isFinite(submittedAnswer)
    && submittedAnswer >= answer.min
    && submittedAnswer <= answer.max;
}

export function evaluateBrainTrainingAttempt(itemInput, submittedAnswer, { responseMs } = {}) {
  const item = itemInput?.schemaVersion === 'brain-training-item-v1'
    ? itemInput
    : normalizeBrainTrainingItem(itemInput);
  const normalizedResponseMs = responseMs === undefined ? null : Number(responseMs);
  if (normalizedResponseMs !== null && (!Number.isFinite(normalizedResponseMs) || normalizedResponseMs < 0)) {
    throw new TypeError('responseMs must be a finite non-negative number');
  }

  return Object.freeze({
    schemaVersion: 'brain-training-attempt-v1',
    itemId: item.id,
    itemVersion: item.version,
    category: item.category,
    difficulty: item.difficulty,
    correct: isCorrect(item.answer, submittedAnswer),
    responseMs: normalizedResponseMs,
    source: item.source,
    practicePerformanceOnly: true,
    learningOutcome: LEARNING_OUTCOME.UNMEASURED,
  });
}

function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createBrainTrainingSession({
  sessionKey,
  items = [],
  categories,
  limit = 5,
  selectionKey = 'default',
} = {}) {
  assertNonEmptyString(sessionKey, 'sessionKey');
  assertNonEmptyString(selectionKey, 'selectionKey');
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be a positive integer');

  const categoryFilter = categories === undefined
    ? null
    : new Set((Array.isArray(categories) ? categories : []).map((category) => {
      const normalized = assertNonEmptyString(category, 'categories[]');
      if (!CATEGORY_VALUES.has(normalized)) throw new TypeError(`unsupported cognitive category: ${normalized}`);
      return normalized;
    }));

  const byId = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = raw?.schemaVersion === 'brain-training-item-v1' ? raw : normalizeBrainTrainingItem(raw);
    if (categoryFilter && !categoryFilter.has(item.category)) continue;
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const selected = [...byId.values()]
    .map((item) => ({ item, rank: stableHash(`${selectionKey}\u0000${item.id}\u0000${item.version}`) }))
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map(({ item }) => item);

  return Object.freeze({
    schemaVersion: 'brain-training-session-v1',
    sessionKey,
    selectionKey,
    items: Object.freeze(selected),
    learningOutcome: LEARNING_OUTCOME.UNMEASURED,
  });
}

export function summarizeBrainTrainingAttempts(attempts = []) {
  const valid = (Array.isArray(attempts) ? attempts : []).filter(
    (attempt) => attempt?.schemaVersion === 'brain-training-attempt-v1',
  );
  const correctCount = valid.filter((attempt) => attempt.correct).length;
  const byCategory = {};
  for (const category of CATEGORY_VALUES) {
    const rows = valid.filter((attempt) => attempt.category === category);
    if (rows.length === 0) continue;
    byCategory[category] = Object.freeze({
      attempts: rows.length,
      correct: rows.filter((attempt) => attempt.correct).length,
    });
  }

  return Object.freeze({
    schemaVersion: 'brain-training-practice-summary-v1',
    attemptCount: valid.length,
    correctCount,
    practiceAccuracy: valid.length === 0 ? null : correctCount / valid.length,
    byCategory: Object.freeze(byCategory),
    practicePerformanceOnly: true,
    learningOutcome: LEARNING_OUTCOME.UNMEASURED,
  });
}
