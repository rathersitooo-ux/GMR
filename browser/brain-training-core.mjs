export const BRAIN_TRAINING_SCHEMA_VERSION = 'gameroad.brain-training-session.v1';
export const BRAIN_TRAINING_LEARNING_EVENT_SCHEMA_VERSION = 'gameroad.learning-event.v1';

export const BRAIN_TRAINING_SUBJECTS = Object.freeze([
  'programming',
  'programming_english',
  'japanese_literature',
  'arithmetic',
  'logical_thinking',
  'bug_reporting',
]);

export const BRAIN_TRAINING_COGNITIVE_AXES = Object.freeze([
  'identify',
  'memorize',
  'analyze',
  'compute',
  'visualize',
]);

export const DEFAULT_BRAIN_TRAINING_SUBJECT_ORDER = Object.freeze([
  'programming',
  'programming_english',
  'japanese_literature',
  'arithmetic',
  'logical_thinking',
  'bug_reporting',
]);

const SUBJECT_SET = new Set(BRAIN_TRAINING_SUBJECTS);
const AXIS_SET = new Set(BRAIN_TRAINING_COGNITIVE_AXES);
const ITEM_STATUS = Object.freeze({ PENDING: 'pending', ANSWERED: 'answered', SKIPPED: 'skipped' });
const OUTCOMES = new Set(['correct', 'incorrect', 'skipped']);
const EXERCISE_KEYS = new Set(['id', 'subject', 'cognitiveAxis', 'prompt', 'options', 'correctOptionId', 'source']);
const OPTION_KEYS = new Set(['id', 'label']);
const SOURCE_KEYS = new Set(['sourceId', 'sourceVersion']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function exactToken(value, name, max = 180) {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max || value.includes('\u0000')) {
    throw new TypeError(`${name} must be a bounded exact string`);
  }
  return value;
}

function boundedText(value, name, max) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  const text = value.trim();
  if (!text || text.length > max) throw new TypeError(`${name} must be bounded non-empty text`);
  return text;
}

function normalizeSource(value, exerciseId) {
  if (!plainObject(value) || !hasOnlyKeys(value, SOURCE_KEYS)) throw new TypeError(`${exerciseId}.source invalid`);
  return deepFreeze({
    sourceId: exactToken(value.sourceId, `${exerciseId}.source.sourceId`, 240),
    sourceVersion: exactToken(value.sourceVersion, `${exerciseId}.source.sourceVersion`, 180),
  });
}

function normalizeOptions(values, exerciseId) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 12) {
    throw new TypeError(`${exerciseId}.options must contain 2-12 options`);
  }
  const seen = new Set();
  return values.map((raw, index) => {
    if (!plainObject(raw) || !hasOnlyKeys(raw, OPTION_KEYS)) throw new TypeError(`${exerciseId}.options[${index}] invalid`);
    const id = exactToken(raw.id, `${exerciseId}.options[${index}].id`, 120);
    if (seen.has(id)) throw new TypeError(`${exerciseId}.options duplicate id`);
    seen.add(id);
    return deepFreeze({ id, label: boundedText(raw.label, `${exerciseId}.options[${index}].label`, 500) });
  });
}

function normalizeExercise(raw, index) {
  if (!plainObject(raw) || !hasOnlyKeys(raw, EXERCISE_KEYS)) throw new TypeError(`exercises[${index}] invalid`);
  const id = exactToken(raw.id, `exercises[${index}].id`, 160);
  const subject = exactToken(raw.subject, `${id}.subject`, 80);
  const cognitiveAxis = exactToken(raw.cognitiveAxis, `${id}.cognitiveAxis`, 80);
  if (!SUBJECT_SET.has(subject)) throw new TypeError(`${id}.subject unsupported`);
  if (!AXIS_SET.has(cognitiveAxis)) throw new TypeError(`${id}.cognitiveAxis unsupported`);
  const options = normalizeOptions(raw.options, id);
  const correctOptionId = exactToken(raw.correctOptionId, `${id}.correctOptionId`, 120);
  if (!options.some((option) => option.id === correctOptionId)) throw new TypeError(`${id}.correctOptionId missing from options`);
  return deepFreeze({
    id,
    subject,
    cognitiveAxis,
    prompt: boundedText(raw.prompt, `${id}.prompt`, 2000),
    options,
    correctOptionId,
    source: normalizeSource(raw.source, id),
  });
}

export function normalizeBrainTrainingExerciseBank(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) throw new TypeError('exercises must be a non-empty array');
  const seen = new Set();
  const normalized = exercises.map((raw, index) => {
    const exercise = normalizeExercise(raw, index);
    if (seen.has(exercise.id)) throw new TypeError(`duplicate exercise id: ${exercise.id}`);
    seen.add(exercise.id);
    return exercise;
  });
  return deepFreeze(normalized);
}

function normalizeSubjectOrder(values) {
  const requested = Array.isArray(values) ? values : DEFAULT_BRAIN_TRAINING_SUBJECT_ORDER;
  const out = [];
  const seen = new Set();
  for (const raw of requested) {
    if (typeof raw !== 'string' || !SUBJECT_SET.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  for (const subject of DEFAULT_BRAIN_TRAINING_SUBJECT_ORDER) if (!seen.has(subject)) out.push(subject);
  return out;
}

function roundRobinBySubject(exercises, subjectOrder) {
  const queues = new Map(subjectOrder.map((subject) => [subject, []]));
  for (const exercise of exercises) queues.get(exercise.subject)?.push(exercise);
  const out = [];
  let emitted = true;
  while (emitted) {
    emitted = false;
    for (const subject of subjectOrder) {
      const queue = queues.get(subject);
      if (queue?.length) {
        out.push(queue.shift());
        emitted = true;
      }
    }
  }
  return out;
}

function publicItem(exercise) {
  return deepFreeze({
    exerciseId: exercise.id,
    subject: exercise.subject,
    cognitiveAxis: exercise.cognitiveAxis,
    prompt: exercise.prompt,
    options: exercise.options.map((option) => ({ ...option })),
    source: { ...exercise.source },
    status: ITEM_STATUS.PENDING,
    outcome: null,
  });
}

function freezeSession(session) {
  return deepFreeze({
    ...session,
    subjectOrder: [...session.subjectOrder],
    items: session.items.map((item) => ({ ...item, options: item.options.map((option) => ({ ...option })), source: { ...item.source } })),
  });
}

export function createBrainTrainingSession({ dayKey, exercises, subjectOrder = DEFAULT_BRAIN_TRAINING_SUBJECT_ORDER, itemLimit = null } = {}) {
  exactToken(dayKey, 'dayKey', 120);
  const bank = normalizeBrainTrainingExerciseBank(exercises);
  const normalizedOrder = normalizeSubjectOrder(subjectOrder);
  if (itemLimit !== null && (!Number.isInteger(itemLimit) || itemLimit < 1)) throw new TypeError('itemLimit must be null or a positive integer');
  const ordered = roundRobinBySubject([...bank], normalizedOrder);
  const selected = itemLimit === null ? ordered : ordered.slice(0, itemLimit);
  return freezeSession({ schemaVersion: BRAIN_TRAINING_SCHEMA_VERSION, dayKey, subjectOrder: normalizedOrder, items: selected.map(publicItem) });
}

function assertSession(session) {
  if (!plainObject(session) || session.schemaVersion !== BRAIN_TRAINING_SCHEMA_VERSION || !Array.isArray(session.items)) {
    throw new TypeError('session must be a brain-training session');
  }
}

function bankById(exercises) {
  return new Map(normalizeBrainTrainingExerciseBank(exercises).map((exercise) => [exercise.id, exercise]));
}

function updateItem(session, itemId, updater) {
  let changed = false;
  const items = session.items.map((item) => {
    if (item.exerciseId !== itemId || item.status !== ITEM_STATUS.PENDING) return item;
    changed = true;
    return updater(item);
  });
  return changed ? freezeSession({ ...session, items }) : session;
}

export function answerBrainTrainingItem(session, exercises, { itemId, optionId } = {}) {
  assertSession(session);
  const targetId = exactToken(itemId, 'itemId', 160);
  const selectedOptionId = exactToken(optionId, 'optionId', 120);
  const bank = bankById(exercises);
  const exercise = bank.get(targetId);
  if (!exercise) throw new TypeError('itemId missing from exercise bank');
  const sessionItem = session.items.find((item) => item.exerciseId === targetId);
  if (!sessionItem) throw new TypeError('itemId missing from session');
  if (sessionItem.subject !== exercise.subject || sessionItem.cognitiveAxis !== exercise.cognitiveAxis ||
      sessionItem.source.sourceId !== exercise.source.sourceId || sessionItem.source.sourceVersion !== exercise.source.sourceVersion) {
    throw new TypeError('exercise bank does not match session identity');
  }
  if (!exercise.options.some((option) => option.id === selectedOptionId)) throw new TypeError('optionId missing from exercise');
  const outcome = selectedOptionId === exercise.correctOptionId ? 'correct' : 'incorrect';
  return updateItem(session, targetId, (item) => ({ ...item, status: ITEM_STATUS.ANSWERED, outcome }));
}

export function skipBrainTrainingItem(session, { itemId } = {}) {
  assertSession(session);
  const targetId = exactToken(itemId, 'itemId', 160);
  if (!session.items.some((item) => item.exerciseId === targetId)) throw new TypeError('itemId missing from session');
  return updateItem(session, targetId, (item) => ({ ...item, status: ITEM_STATUS.SKIPPED, outcome: 'skipped' }));
}

export function getNextBrainTrainingItem(session) {
  assertSession(session);
  return session.items.find((candidate) => candidate.status === ITEM_STATUS.PENDING) ?? null;
}

function emptyCountMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, { attempted: 0, correct: 0, incorrect: 0, skipped: 0 }]));
}

export function summarizeBrainTrainingSession(session) {
  assertSession(session);
  const bySubject = emptyCountMap(BRAIN_TRAINING_SUBJECTS);
  const byCognitiveAxis = emptyCountMap(BRAIN_TRAINING_COGNITIVE_AXES);
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let pending = 0;
  for (const item of session.items) {
    if (item.status === ITEM_STATUS.PENDING) { pending += 1; continue; }
    const subject = bySubject[item.subject];
    const axis = byCognitiveAxis[item.cognitiveAxis];
    if (item.outcome === 'skipped') {
      skipped += 1;
      subject.skipped += 1;
      axis.skipped += 1;
      continue;
    }
    subject.attempted += 1;
    axis.attempted += 1;
    if (item.outcome === 'correct') {
      correct += 1;
      subject.correct += 1;
      axis.correct += 1;
    } else if (item.outcome === 'incorrect') {
      incorrect += 1;
      subject.incorrect += 1;
      axis.incorrect += 1;
    }
  }
  const attempted = correct + incorrect;
  return deepFreeze({
    dayKey: session.dayKey,
    itemCount: session.items.length,
    attempted,
    correct,
    incorrect,
    skipped,
    pending,
    meaningfulParticipation: attempted > 0,
    settled: pending === 0,
    bySubject,
    byCognitiveAxis,
    claims: { iqChange: false, brainAgeChange: false, academicImprovement: false, farTransfer: false },
    authority: { reward: false, relationship: false, battlePower: false, dailyReset: false },
  });
}

export function createBrainTrainingLearningEvent(session, { itemId } = {}) {
  assertSession(session);
  const targetId = exactToken(itemId, 'itemId', 160);
  const item = session.items.find((candidate) => candidate.exerciseId === targetId);
  if (!item) throw new TypeError('itemId missing from session');
  if (item.status === ITEM_STATUS.PENDING || !OUTCOMES.has(item.outcome)) throw new TypeError('learning event requires a settled item');
  return deepFreeze({
    schemaVersion: BRAIN_TRAINING_LEARNING_EVENT_SCHEMA_VERSION,
    eventType: 'brain_training_item_result',
    dayKey: session.dayKey,
    exerciseId: item.exerciseId,
    subject: item.subject,
    cognitiveAxis: item.cognitiveAxis,
    outcome: item.outcome,
    source: { ...item.source },
    privacy: { containsRawUserText: false, containsPrivate: false, answerContentIncluded: false, promptContentIncluded: false },
    authority: { rewardMutationAllowed: false, relationshipMutationAllowed: false, gameRuleMutationAllowed: false },
  });
}
