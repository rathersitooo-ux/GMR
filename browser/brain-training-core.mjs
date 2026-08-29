export const BRAIN_TRAINING_SCHEMA_VERSION = 'gameroad.brain-training-session.v2';

export const BRAIN_TRAINING_COGNITIVE_AXES = Object.freeze([
  'identify',
  'memorize',
  'analyze',
  'compute',
  'visualize',
]);

const AXIS_SET = new Set(BRAIN_TRAINING_COGNITIVE_AXES);
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const EXERCISE_KEYS = new Set([
  'id', 'subject', 'cognitiveAxis', 'prompt', 'options', 'correctOptionId', 'source',
]);
const OPTION_KEYS = new Set(['id', 'label']);
const SOURCE_KEYS = new Set(['sourceId', 'sourceVersion', 'provenance']);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value, allowed, name) {
  if (!plainObject(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not allowed`);
  }
}

function code(value, name) {
  if (typeof value !== 'string' || !CODE_RE.test(value)) {
    throw new TypeError(`${name} must be a bounded code identifier`);
  }
  return value;
}

function text(value, name, max) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new TypeError(`${name} must be bounded non-empty text`);
  return normalized;
}

function normalizeSource(raw, name) {
  onlyKeys(raw, SOURCE_KEYS, name);
  return Object.freeze({
    sourceId: code(raw.sourceId, `${name}.sourceId`),
    sourceVersion: code(raw.sourceVersion, `${name}.sourceVersion`),
    provenance: code(raw.provenance, `${name}.provenance`),
  });
}

function normalizeOptions(rawOptions, exerciseId) {
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 12) {
    throw new TypeError(`${exerciseId}.options must contain 2-12 options`);
  }
  const seen = new Set();
  return Object.freeze(rawOptions.map((raw, index) => {
    const name = `${exerciseId}.options[${index}]`;
    onlyKeys(raw, OPTION_KEYS, name);
    const id = code(raw.id, `${name}.id`);
    if (seen.has(id)) throw new TypeError(`${exerciseId}.options duplicate id`);
    seen.add(id);
    return Object.freeze({ id, label: text(raw.label, `${name}.label`, 500) });
  }));
}

function normalizeExercise(raw, index) {
  onlyKeys(raw, EXERCISE_KEYS, `exercises[${index}]`);
  const id = code(raw.id, `exercises[${index}].id`);
  const cognitiveAxis = code(raw.cognitiveAxis, `${id}.cognitiveAxis`);
  if (!AXIS_SET.has(cognitiveAxis)) throw new TypeError(`${id}.cognitiveAxis unsupported`);
  const options = normalizeOptions(raw.options, id);
  const correctOptionId = code(raw.correctOptionId, `${id}.correctOptionId`);
  if (!options.some((option) => option.id === correctOptionId)) {
    throw new TypeError(`${id}.correctOptionId missing from options`);
  }
  return Object.freeze({
    id,
    subject: code(raw.subject, `${id}.subject`),
    cognitiveAxis,
    prompt: text(raw.prompt, `${id}.prompt`, 2000),
    options,
    correctOptionId,
    source: normalizeSource(raw.source, `${id}.source`),
  });
}

export function normalizeBrainTrainingExerciseBank(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new TypeError('exercises must be a non-empty array');
  }
  const seen = new Set();
  const bank = exercises.map((raw, index) => {
    const exercise = normalizeExercise(raw, index);
    if (seen.has(exercise.id)) throw new TypeError(`duplicate exercise id: ${exercise.id}`);
    seen.add(exercise.id);
    return exercise;
  });
  return Object.freeze(bank);
}

function publicItem(exercise) {
  return Object.freeze({
    exerciseId: exercise.id,
    subject: exercise.subject,
    cognitiveAxis: exercise.cognitiveAxis,
    prompt: exercise.prompt,
    options: exercise.options,
    source: exercise.source,
    status: 'pending',
    outcome: null,
    selectedOptionId: null,
  });
}

function makeSession(sessionKey, items) {
  return Object.freeze({
    schemaVersion: BRAIN_TRAINING_SCHEMA_VERSION,
    sessionKey,
    items: Object.freeze(items),
  });
}

export function createBrainTrainingSession({ sessionKey, exercises, itemLimit = null } = {}) {
  const key = code(sessionKey, 'sessionKey');
  const bank = normalizeBrainTrainingExerciseBank(exercises);
  if (itemLimit !== null && (!Number.isInteger(itemLimit) || itemLimit < 1)) {
    throw new TypeError('itemLimit must be null or a positive integer');
  }
  const selected = itemLimit === null ? bank : bank.slice(0, itemLimit);
  return makeSession(key, selected.map(publicItem));
}

function assertSession(session) {
  if (!plainObject(session) || session.schemaVersion !== BRAIN_TRAINING_SCHEMA_VERSION || !Array.isArray(session.items)) {
    throw new TypeError('session must be a brain-training session');
  }
}

function replacePendingItem(session, itemId, update) {
  let changed = false;
  const items = session.items.map((item) => {
    if (item.exerciseId !== itemId || item.status !== 'pending') return item;
    changed = true;
    return Object.freeze(update(item));
  });
  return changed ? makeSession(session.sessionKey, items) : session;
}

export function answerBrainTrainingItem(session, exercises, { itemId, optionId } = {}) {
  assertSession(session);
  const targetId = code(itemId, 'itemId');
  const selectedOptionId = code(optionId, 'optionId');
  const bank = new Map(normalizeBrainTrainingExerciseBank(exercises).map((exercise) => [exercise.id, exercise]));
  const exercise = bank.get(targetId);
  if (!exercise) throw new TypeError('itemId missing from exercise bank');
  const item = session.items.find((candidate) => candidate.exerciseId === targetId);
  if (!item) throw new TypeError('itemId missing from session');
  if (
    item.subject !== exercise.subject
    || item.cognitiveAxis !== exercise.cognitiveAxis
    || item.source.sourceId !== exercise.source.sourceId
    || item.source.sourceVersion !== exercise.source.sourceVersion
    || item.source.provenance !== exercise.source.provenance
  ) {
    throw new TypeError('exercise bank does not match session identity');
  }
  if (!exercise.options.some((option) => option.id === selectedOptionId)) {
    throw new TypeError('optionId missing from exercise');
  }
  const outcome = selectedOptionId === exercise.correctOptionId ? 'correct' : 'incorrect';
  return replacePendingItem(session, targetId, (current) => ({
    ...current,
    status: 'answered',
    outcome,
    selectedOptionId,
  }));
}

export function skipBrainTrainingItem(session, { itemId } = {}) {
  assertSession(session);
  const targetId = code(itemId, 'itemId');
  if (!session.items.some((item) => item.exerciseId === targetId)) {
    throw new TypeError('itemId missing from session');
  }
  return replacePendingItem(session, targetId, (current) => ({
    ...current,
    status: 'skipped',
    outcome: 'skipped',
    selectedOptionId: null,
  }));
}

export function getNextBrainTrainingItem(session) {
  assertSession(session);
  return session.items.find((item) => item.status === 'pending') ?? null;
}

export function summarizeBrainTrainingSession(session) {
  assertSession(session);
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let pending = 0;
  for (const item of session.items) {
    if (item.outcome === 'correct') correct += 1;
    else if (item.outcome === 'incorrect') incorrect += 1;
    else if (item.outcome === 'skipped') skipped += 1;
    else pending += 1;
  }
  const attempted = correct + incorrect;
  return Object.freeze({
    itemCount: session.items.length,
    attempted,
    correct,
    incorrect,
    skipped,
    pending,
    meaningfulParticipation: attempted > 0,
    settled: pending === 0,
  });
}
