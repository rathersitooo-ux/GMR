const PACK_SCHEMA = 'gameroad.study-problem-pack.v1';
const SESSION_SCHEMA = 'gameroad.study-session.v1';
const ANSWER_MODES = Object.freeze(['choice', 'input', 'sequence']);
const RESULTS = Object.freeze(['VERIFIED_CORRECT', 'PARTIAL', 'WRONG', 'UNKNOWN']);
const ACTION_KINDS = Object.freeze(['attack', 'counter']);
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function code(value, name) {
  if (typeof value !== 'string' || !CODE_RE.test(value)) {
    throw new TypeError(`${name} must be a bounded code identifier`);
  }
  return value;
}

function text(value, name, max = 4000) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new TypeError(`${name} must be bounded non-empty text`);
  return normalized;
}

function finiteNumber(value, name, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a finite number in range`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(encoded);
}

function normalizeSource(raw, name) {
  if (!plainObject(raw)) throw new TypeError(`${name} must be an object`);
  return deepFreeze({
    sourceId: code(raw.sourceId, `${name}.sourceId`),
    sourceVersion: code(raw.sourceVersion, `${name}.sourceVersion`),
    provenance: code(raw.provenance, `${name}.provenance`),
    rightsScope: code(raw.rightsScope, `${name}.rightsScope`),
  });
}

function normalizeSlot(raw, index, questionId) {
  if (!plainObject(raw)) throw new TypeError(`${questionId}.slots[${index}] must be an object`);
  const acceptedAnswers = Array.isArray(raw.acceptedAnswers)
    ? [...new Set(raw.acceptedAnswers.map((value, answerIndex) => text(String(value), `${questionId}.slots[${index}].acceptedAnswers[${answerIndex}]`, 500)))]
    : [];
  if (acceptedAnswers.length === 0) throw new TypeError(`${questionId}.slots[${index}] requires acceptedAnswers`);
  return deepFreeze({
    slotId: code(raw.slotId, `${questionId}.slots[${index}].slotId`),
    acceptedAnswers,
  });
}

function normalizeCandidate(raw, index, questionId) {
  if (!plainObject(raw)) throw new TypeError(`${questionId}.candidates[${index}] must be an object`);
  return deepFreeze({
    candidateId: code(raw.candidateId, `${questionId}.candidates[${index}].candidateId`),
    label: text(raw.label, `${questionId}.candidates[${index}].label`, 500),
    value: text(String(raw.value), `${questionId}.candidates[${index}].value`, 500),
  });
}

function normalizeQuestion(raw, index) {
  if (!plainObject(raw)) throw new TypeError(`questions[${index}] must be an object`);
  const questionId = code(raw.questionId, `questions[${index}].questionId`);
  const answerMode = code(raw.answerMode, `${questionId}.answerMode`);
  if (!ANSWER_MODES.includes(answerMode)) throw new TypeError(`${questionId}.answerMode unsupported`);

  if (!Array.isArray(raw.slots) || raw.slots.length === 0 || raw.slots.length > 8) {
    throw new TypeError(`${questionId}.slots must contain 1-8 slots`);
  }
  const slots = raw.slots.map((slot, slotIndex) => normalizeSlot(slot, slotIndex, questionId));
  if (new Set(slots.map(slot => slot.slotId)).size !== slots.length) {
    throw new TypeError(`${questionId}.slots duplicate slotId`);
  }

  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((candidate, candidateIndex) => normalizeCandidate(candidate, candidateIndex, questionId))
    : [];
  if (new Set(candidates.map(candidate => candidate.candidateId)).size !== candidates.length) {
    throw new TypeError(`${questionId}.candidates duplicate candidateId`);
  }
  if (answerMode === 'choice' && (slots.length !== 1 || candidates.length < 2)) {
    throw new TypeError(`${questionId}.choice requires one slot and at least two candidates`);
  }
  if (answerMode === 'sequence' && candidates.length < slots.length) {
    throw new TypeError(`${questionId}.sequence requires enough candidates for all slots`);
  }
  if (answerMode === 'input' && candidates.length !== 0) {
    throw new TypeError(`${questionId}.input does not use candidates`);
  }

  const hints = Array.isArray(raw.hints)
    ? raw.hints.map((hint, hintIndex) => text(hint, `${questionId}.hints[${hintIndex}]`, 1000))
    : [];

  return deepFreeze({
    questionId,
    prompt: text(raw.prompt, `${questionId}.prompt`),
    difficulty: code(raw.difficulty, `${questionId}.difficulty`),
    answerMode,
    slots,
    candidates,
    hints,
    source: normalizeSource(raw.source, `${questionId}.source`),
  });
}

export function normalizeStudyProblemPack(raw = {}) {
  if (!plainObject(raw)) throw new TypeError('pack must be an object');
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new TypeError('pack.questions must be a non-empty array');
  }
  const questions = raw.questions.map(normalizeQuestion);
  if (new Set(questions.map(question => question.questionId)).size !== questions.length) {
    throw new TypeError('pack.questions duplicate questionId');
  }

  return deepFreeze({
    schemaVersion: PACK_SCHEMA,
    packId: code(raw.packId, 'packId'),
    contentVersion: code(raw.contentVersion, 'contentVersion'),
    schoolYear: code(raw.schoolYear, 'schoolYear'),
    grade: code(raw.grade, 'grade'),
    subject: code(raw.subject, 'subject'),
    unit: code(raw.unit, 'unit'),
    source: normalizeSource(raw.source, 'pack.source'),
    questions,
  });
}

function questionById(pack, questionId) {
  return pack.questions.find(question => question.questionId === questionId) ?? null;
}

function publicQuestion(question) {
  return deepFreeze({
    questionId: question.questionId,
    prompt: question.prompt,
    difficulty: question.difficulty,
    answerMode: question.answerMode,
    slotCount: question.slots.length,
    slots: question.slots.map((slot, index) => ({ slotId: slot.slotId, position: index + 1 })),
    candidates: question.candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      label: candidate.label,
    })),
    hintCount: question.hints.length,
    source: question.source,
  });
}

export function createAnswerHand(questionInput) {
  const question = normalizeQuestion(questionInput, 0);
  if (question.answerMode === 'input') {
    return deepFreeze(question.slots.map((slot, index) => ({
      cardId: `${question.questionId}.input.${index + 1}`,
      kind: 'input',
      value: null,
    })));
  }
  return deepFreeze(question.candidates.map(candidate => ({
    cardId: `${question.questionId}.candidate.${candidate.candidateId}`,
    kind: 'candidate',
    candidateId: candidate.candidateId,
    label: candidate.label,
  })));
}

function normalizeThrownAnswer(question, hand, rawThrow, index) {
  if (!plainObject(rawThrow)) throw new TypeError(`throws[${index}] must be an object`);
  const cardId = code(rawThrow.cardId, `throws[${index}].cardId`);
  const card = hand.find(candidate => candidate.cardId === cardId);
  if (!card) throw new TypeError(`throws[${index}].cardId is not in the answer hand`);

  if (question.answerMode === 'input') {
    return deepFreeze({ cardId, value: text(String(rawThrow.value ?? ''), `throws[${index}].value`, 500) });
  }
  if (Object.hasOwn(rawThrow, 'value')) throw new TypeError(`throws[${index}].value is not allowed for candidate cards`);
  const candidate = question.candidates.find(item => item.candidateId === card.candidateId);
  return deepFreeze({ cardId, value: candidate.value });
}

function exactAnswerMatch(expectedAnswers, actual) {
  return expectedAnswers.includes(actual.trim());
}

export function gradeStudyAnswer({ pack: packInput, questionId, throws: rawThrows } = {}) {
  const pack = normalizeStudyProblemPack(packInput);
  const id = code(questionId, 'questionId');
  const question = questionById(pack, id);
  if (!question) throw new TypeError('questionId missing from pack');
  if (!Array.isArray(rawThrows)) throw new TypeError('throws must be an array');

  const hand = createAnswerHand(question);
  const used = new Set();
  const thrown = rawThrows.map((rawThrow, index) => {
    const answer = normalizeThrownAnswer(question, hand, rawThrow, index);
    if (used.has(answer.cardId)) throw new TypeError('the same answer card cannot be thrown twice');
    used.add(answer.cardId);
    return answer;
  });

  const slotResults = question.slots.map((slot, index) => {
    const answer = thrown[index] ?? null;
    return deepFreeze({
      slotId: slot.slotId,
      position: index + 1,
      answered: answer !== null,
      correct: answer ? exactAnswerMatch(slot.acceptedAnswers, answer.value) : false,
    });
  });

  const correctCount = slotResults.filter(slot => slot.correct).length;
  const answeredCount = slotResults.filter(slot => slot.answered).length;
  let result = 'WRONG';
  if (correctCount === question.slots.length && thrown.length === question.slots.length) result = 'VERIFIED_CORRECT';
  else if (correctCount > 0 || (answeredCount > 0 && answeredCount < question.slots.length)) result = 'PARTIAL';

  return deepFreeze({
    result,
    questionId: question.questionId,
    slotResults,
    thrownCount: thrown.length,
    expectedSlotCount: question.slots.length,
    extraThrowCount: Math.max(0, thrown.length - question.slots.length),
  });
}

function normalizeActionPolicy(raw, difficulty) {
  if (!plainObject(raw)) throw new TypeError('actionPolicy must be an object');
  if (!plainObject(raw.difficultyPower)) throw new TypeError('actionPolicy.difficultyPower must be an object');
  const basePower = finiteNumber(raw.difficultyPower[difficulty], `actionPolicy.difficultyPower.${difficulty}`, { min: 0 });
  const maxTimeMultiplier = finiteNumber(raw.maxTimeMultiplier, 'actionPolicy.maxTimeMultiplier', { min: 1 });
  if (!Array.isArray(raw.timeBands) || raw.timeBands.length === 0) throw new TypeError('actionPolicy.timeBands must be non-empty');
  let previousMax = -1;
  const timeBands = raw.timeBands.map((band, index) => {
    if (!plainObject(band)) throw new TypeError(`actionPolicy.timeBands[${index}] must be an object`);
    const maxMs = band.maxMs === null
      ? null
      : finiteNumber(band.maxMs, `actionPolicy.timeBands[${index}].maxMs`, { min: 0 });
    if (maxMs !== null && maxMs <= previousMax) throw new TypeError('actionPolicy.timeBands maxMs must ascend');
    if (maxMs !== null) previousMax = maxMs;
    const multiplier = finiteNumber(band.multiplier, `actionPolicy.timeBands[${index}].multiplier`, { min: 1, max: maxTimeMultiplier });
    return { maxMs, multiplier };
  });
  if (timeBands.at(-1).maxMs !== null) throw new TypeError('actionPolicy.timeBands requires a final fallback band');
  return { basePower, maxTimeMultiplier, timeBands };
}

export function deriveVerifiedStudyAction({ grade, difficulty, elapsedMs, actionKind, actionPolicy } = {}) {
  if (!plainObject(grade) || !RESULTS.includes(grade.result)) throw new TypeError('grade must be a Study grade result');
  if (grade.result !== 'VERIFIED_CORRECT') {
    return deepFreeze({ issued: false, reason: 'CORRECT_ACTION_NOT_ISSUED', result: grade.result });
  }
  const kind = code(actionKind, 'actionKind');
  if (!ACTION_KINDS.includes(kind)) throw new TypeError('actionKind unsupported');
  const elapsed = finiteNumber(elapsedMs, 'elapsedMs', { min: 0 });
  const difficultyCode = code(difficulty, 'difficulty');
  const policy = normalizeActionPolicy(actionPolicy, difficultyCode);
  const band = policy.timeBands.find(candidate => candidate.maxMs === null || elapsed <= candidate.maxMs);
  const multiplier = band.multiplier;
  return deepFreeze({
    issued: true,
    actionKind: kind,
    difficulty: difficultyCode,
    basePower: policy.basePower,
    timeMultiplier: multiplier,
    power: policy.basePower * multiplier,
    boundedTimeBonus: multiplier <= policy.maxTimeMultiplier,
  });
}

export function createStudySession({ sessionId, pack: packInput, startedAtMs = 0 } = {}) {
  const pack = normalizeStudyProblemPack(packInput);
  const start = finiteNumber(startedAtMs, 'startedAtMs', { min: 0 });
  return deepFreeze({
    schemaVersion: SESSION_SCHEMA,
    sessionId: code(sessionId, 'sessionId'),
    packId: pack.packId,
    contentVersion: pack.contentVersion,
    questionIndex: 0,
    status: 'active',
    startedAtMs: start,
    history: [],
  });
}

function assertSessionMatchesPack(session, pack) {
  if (!plainObject(session) || session.schemaVersion !== SESSION_SCHEMA) throw new TypeError('session must be a Study session');
  if (session.packId !== pack.packId || session.contentVersion !== pack.contentVersion) {
    throw new TypeError('pack identity/version does not match session');
  }
}


function normalizeResumeHistoryAction(raw, question, result, index) {
  if (!plainObject(raw)) throw new TypeError(`session.history[${index}].action must be an object`);
  if (result === 'VERIFIED_CORRECT') {
    if (raw.issued !== true) throw new TypeError(`session.history[${index}].action must be issued for verified correct`);
    const actionKind = code(raw.actionKind, `session.history[${index}].action.actionKind`);
    if (!ACTION_KINDS.includes(actionKind)) throw new TypeError(`session.history[${index}].action.actionKind unsupported`);
    const difficulty = code(raw.difficulty, `session.history[${index}].action.difficulty`);
    if (difficulty !== question.difficulty) throw new TypeError(`session.history[${index}].action difficulty mismatch`);
    const basePower = finiteNumber(raw.basePower, `session.history[${index}].action.basePower`, { min: 0 });
    const timeMultiplier = finiteNumber(raw.timeMultiplier, `session.history[${index}].action.timeMultiplier`, { min: 1 });
    const power = finiteNumber(raw.power, `session.history[${index}].action.power`, { min: 0 });
    if (typeof raw.boundedTimeBonus !== 'boolean') {
      throw new TypeError(`session.history[${index}].action.boundedTimeBonus must be boolean`);
    }
    return deepFreeze({
      issued: true,
      actionKind,
      difficulty,
      basePower,
      timeMultiplier,
      power,
      boundedTimeBonus: raw.boundedTimeBonus,
    });
  }
  if (raw.issued !== false || raw.reason !== 'CORRECT_ACTION_NOT_ISSUED' || raw.result !== result) {
    throw new TypeError(`session.history[${index}].action does not match non-correct result`);
  }
  return deepFreeze({ issued: false, reason: 'CORRECT_ACTION_NOT_ISSUED', result });
}

function normalizeResumeHistoryEntry(raw, index, question) {
  if (!plainObject(raw)) throw new TypeError(`session.history[${index}] must be an object`);
  const questionId = code(raw.questionId, `session.history[${index}].questionId`);
  if (questionId !== question.questionId) throw new TypeError('session history question order mismatch');
  const result = code(raw.result, `session.history[${index}].result`);
  if (!RESULTS.includes(result) || result === 'UNKNOWN') {
    throw new TypeError(`session.history[${index}].result is not a resolved Study result`);
  }
  const elapsedMs = finiteNumber(raw.elapsedMs, `session.history[${index}].elapsedMs`, { min: 0 });
  const action = normalizeResumeHistoryAction(raw.action, question, result, index);
  return deepFreeze({ questionId, result, elapsedMs, action });
}

/**
 * Strictly validate a Study session that crossed a persistence/transport boundary.
 * This is a data-integrity gate only: it owns no storage, entitlement, economy,
 * curriculum, Battle, or timing policy. Resume is intentionally accepted only at
 * a stable question boundary (no half-thrown or resolved-but-not-advanced state).
 */
export function normalizeStudySessionForResume(sessionInput, packInput) {
  const pack = normalizeStudyProblemPack(packInput);
  if (!plainObject(sessionInput) || sessionInput.schemaVersion !== SESSION_SCHEMA) {
    throw new TypeError('resume session must use the Study session schema');
  }
  const sessionId = code(sessionInput.sessionId, 'session.sessionId');
  const packId = code(sessionInput.packId, 'session.packId');
  const contentVersion = code(sessionInput.contentVersion, 'session.contentVersion');
  if (packId !== pack.packId || contentVersion !== pack.contentVersion) {
    throw new TypeError('pack identity/version does not match session');
  }
  if (!Number.isInteger(sessionInput.questionIndex) || sessionInput.questionIndex < 0 || sessionInput.questionIndex > pack.questions.length) {
    throw new TypeError('session.questionIndex out of range');
  }
  const status = code(sessionInput.status, 'session.status');
  if (status !== 'active' && status !== 'complete') throw new TypeError('session.status unsupported');
  const startedAtMs = finiteNumber(sessionInput.startedAtMs, 'session.startedAtMs', { min: 0 });
  if (!Array.isArray(sessionInput.history) || sessionInput.history.length > pack.questions.length) {
    throw new TypeError('session.history must be a bounded array');
  }
  if (status === 'active') {
    if (sessionInput.questionIndex >= pack.questions.length) throw new TypeError('active session must point at a current question');
    if (sessionInput.history.length !== sessionInput.questionIndex) {
      throw new TypeError('resume session must be saved at an unanswered question boundary');
    }
  } else {
    if (sessionInput.questionIndex !== pack.questions.length || sessionInput.history.length !== pack.questions.length) {
      throw new TypeError('complete session must contain the complete ordered history');
    }
  }
  const history = sessionInput.history.map((entry, index) => normalizeResumeHistoryEntry(entry, index, pack.questions[index]));
  return deepFreeze({
    schemaVersion: SESSION_SCHEMA,
    sessionId,
    packId,
    contentVersion,
    questionIndex: sessionInput.questionIndex,
    status,
    startedAtMs,
    history,
  });
}

export function getCurrentStudyQuestion(session, packInput) {
  const pack = normalizeStudyProblemPack(packInput);
  assertSessionMatchesPack(session, pack);
  if (session.status !== 'active') return null;
  const question = pack.questions[session.questionIndex] ?? null;
  if (!question) return null;
  return deepFreeze({
    ...publicQuestion(question),
    answerHand: createAnswerHand(question),
  });
}

export function resolveCurrentStudyQuestion(session, packInput, { throws, elapsedMs, actionKind, actionPolicy } = {}) {
  const pack = normalizeStudyProblemPack(packInput);
  assertSessionMatchesPack(session, pack);
  if (session.status !== 'active') throw new TypeError('session is not active');
  const question = pack.questions[session.questionIndex];
  if (!question) throw new TypeError('current question missing from pack');
  if (session.history.some(item => item.questionId === question.questionId)) {
    throw new TypeError('current question already resolved');
  }
  const grade = gradeStudyAnswer({ pack, questionId: question.questionId, throws });
  const action = deriveVerifiedStudyAction({
    grade,
    difficulty: question.difficulty,
    elapsedMs,
    actionKind,
    actionPolicy,
  });
  const next = deepFreeze({
    ...cloneJson(session),
    history: [...session.history, deepFreeze({
      questionId: question.questionId,
      result: grade.result,
      elapsedMs,
      action,
    })],
  });
  return deepFreeze({ session: next, grade, action });
}

export function advanceStudySession(session, packInput) {
  const pack = normalizeStudyProblemPack(packInput);
  assertSessionMatchesPack(session, pack);
  if (session.status !== 'active') return session;
  const question = pack.questions[session.questionIndex];
  if (!question) throw new TypeError('current question missing from pack');
  if (!session.history.some(item => item.questionId === question.questionId)) {
    throw new TypeError('current question must be resolved before advancing');
  }
  const nextIndex = session.questionIndex + 1;
  return deepFreeze({
    ...cloneJson(session),
    questionIndex: Math.min(nextIndex, pack.questions.length),
    status: nextIndex >= pack.questions.length ? 'complete' : 'active',
  });
}

export function getStudyHint(packInput, { questionId, hintIndex } = {}) {
  const pack = normalizeStudyProblemPack(packInput);
  const id = code(questionId, 'questionId');
  const question = questionById(pack, id);
  if (!question) throw new TypeError('questionId missing from pack');
  if (!Number.isInteger(hintIndex) || hintIndex < 0 || hintIndex >= question.hints.length) {
    throw new TypeError('hintIndex out of range');
  }
  return deepFreeze({
    questionId: id,
    hintIndex,
    hint: question.hints[hintIndex],
    economyApplied: false,
    truthAuthority: 'problem_pack',
  });
}

export const STUDY_PROBLEM_PACK_CORE = Object.freeze({
  packSchema: PACK_SCHEMA,
  sessionSchema: SESSION_SCHEMA,
  answerModes: ANSWER_MODES,
  results: RESULTS,
  actionKinds: ACTION_KINDS,
});
