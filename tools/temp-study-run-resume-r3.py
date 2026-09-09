from pathlib import Path
import subprocess

EXPECTED = {
    'browser/study-problem-pack-core.mjs': 'a6915fd6d119c141447ed99a5354a61420894847',
    'tests/study-problem-pack-core.test.mjs': '16e8cf1e4a224f48798d73edeed156433cb5a102',
    'browser/study-run-runtime-mount.mjs': '18ebeb1312a39c532c363c20b9b6edb72f8a775c',
    'tests/study-run-runtime-mount.test.mjs': 'ac9be5e1557ad0da9a3520296e31120f0c982a26',
}


def run(*args):
    return subprocess.check_output(args, text=True).strip()

for path, expected in EXPECTED.items():
    actual = run('git', 'hash-object', path)
    if actual != expected:
        raise SystemExit(f'BASE_BLOB_MISMATCH {path} expected={expected} actual={actual}')

core_path = Path('browser/study-problem-pack-core.mjs')
core = core_path.read_text()
core_anchor = """function assertSessionMatchesPack(session, pack) {
  if (!plainObject(session) || session.schemaVersion !== SESSION_SCHEMA) throw new TypeError('session must be a Study session');
  if (session.packId !== pack.packId || session.contentVersion !== pack.contentVersion) {
    throw new TypeError('pack identity/version does not match session');
  }
}
"""
core_insert = r'''

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
'''
if core_anchor not in core:
    raise SystemExit('CORE_ANCHOR_MISSING')
core = core.replace(core_anchor, core_anchor + core_insert, 1)
core_path.write_text(core)

core_test_path = Path('tests/study-problem-pack-core.test.mjs')
core_test = core_test_path.read_text()
import_anchor = """  normalizeStudyProblemPack,\n  resolveCurrentStudyQuestion,\n"""
if import_anchor not in core_test:
    raise SystemExit('CORE_TEST_IMPORT_ANCHOR_MISSING')
core_test = core_test.replace(import_anchor, """  normalizeStudyProblemPack,\n  normalizeStudySessionForResume,\n  resolveCurrentStudyQuestion,\n""", 1)
core_test += r'''

test('persisted Study session resume accepts only a stable ordered question boundary', () => {
  let session = createStudySession({ sessionId: 'study.session.resume.boundary', pack: STUDY_MANUAL_PROBLEM_PACK, startedAtMs: 100 });
  const question = getCurrentStudyQuestion(session, STUDY_MANUAL_PROBLEM_PACK);
  const correct = question.answerHand.find(card => card.candidateId === 'c');
  const resolved = resolveCurrentStudyQuestion(session, STUDY_MANUAL_PROBLEM_PACK, {
    throws: [{ cardId: correct.cardId }],
    elapsedMs: 4200,
    actionKind: 'counter',
    actionPolicy: ACTION_POLICY,
  });
  assert.throws(
    () => normalizeStudySessionForResume(resolved.session, STUDY_MANUAL_PROBLEM_PACK),
    /unanswered question boundary/,
  );
  session = advanceStudySession(resolved.session, STUDY_MANUAL_PROBLEM_PACK);
  const restored = normalizeStudySessionForResume(JSON.parse(JSON.stringify(session)), STUDY_MANUAL_PROBLEM_PACK);
  assert.equal(restored.sessionId, 'study.session.resume.boundary');
  assert.equal(restored.questionIndex, 1);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.history[0].questionId, 'study.manual.q01');
  assert.equal(restored.history[0].action.actionKind, 'counter');
  assert.equal(JSON.stringify(restored).includes('acceptedAnswers'), false);
});

test('persisted Study session resume rejects forged progress and pack drift', () => {
  const session = createStudySession({ sessionId: 'study.session.resume.reject', pack: STUDY_MANUAL_PROBLEM_PACK });
  assert.throws(
    () => normalizeStudySessionForResume({ ...session, questionIndex: 2 }, STUDY_MANUAL_PROBLEM_PACK),
    /unanswered question boundary/,
  );
  const drifted = { ...STUDY_MANUAL_PROBLEM_PACK, contentVersion: 'v2.unknown' };
  assert.throws(
    () => normalizeStudySessionForResume(session, drifted),
    /does not match session/,
  );
});
'''
core_test_path.write_text(core_test)

runtime_path = Path('browser/study-run-runtime-mount.mjs')
runtime = runtime_path.read_text()
import_anchor = """  getStudyHint,\n  resolveCurrentStudyQuestion,\n"""
if import_anchor not in runtime:
    raise SystemExit('RUNTIME_IMPORT_ANCHOR_MISSING')
runtime = runtime.replace(import_anchor, """  getStudyHint,\n  normalizeStudySessionForResume,\n  resolveCurrentStudyQuestion,\n""", 1)
const_anchor = """const ACTION_KINDS = new Set(['attack', 'counter']);\n"""
if const_anchor not in runtime:
    raise SystemExit('RUNTIME_CONST_ANCHOR_MISSING')
runtime = runtime.replace(const_anchor, const_anchor + "const RESUME_SCHEMA = 'gameroad.study-run-resume.v1';\n", 1)
controller_sig = """export function createStudyRunConsumerController({
  pack = STUDY_MANUAL_PROBLEM_PACK,
  actionPolicy = STUDY_MANUAL_SMOKE_ACTION_POLICY,
  now = () => Date.now(),
  createSessionId = defaultSessionId,
} = {}) {
"""
controller_new = """export function createStudyRunConsumerController({
  pack = STUDY_MANUAL_PROBLEM_PACK,
  actionPolicy = STUDY_MANUAL_SMOKE_ACTION_POLICY,
  now = () => Date.now(),
  createSessionId = defaultSessionId,
  resumeCheckpoint = null,
} = {}) {
"""
if controller_sig not in runtime:
    raise SystemExit('RUNTIME_CONTROLLER_SIGNATURE_MISSING')
runtime = runtime.replace(controller_sig, controller_new, 1)
state_anchor = """  let hint = null;\n\n  function currentQuestion() {\n"""
resume_logic = r'''  let hint = null;

  function normalizeResumeCheckpoint(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== RESUME_SCHEMA) {
      throw new TypeError('STUDY_RUNTIME_RESUME_CHECKPOINT_INVALID');
    }
    const restoredSession = normalizeStudySessionForResume(raw.session, pack);
    if (!ACTION_KINDS.has(raw.actionKind)) throw new TypeError('STUDY_RUNTIME_RESUME_ACTION_KIND_INVALID');
    const started = Number(raw.questionStartedAtMs);
    if (!Number.isFinite(started) || started < 0) throw new TypeError('STUDY_RUNTIME_RESUME_QUESTION_TIME_INVALID');
    return Object.freeze({
      schemaVersion: RESUME_SCHEMA,
      session: restoredSession,
      actionKind: raw.actionKind,
      questionStartedAtMs: started,
    });
  }

  function resumeFromCheckpoint(raw) {
    const restored = normalizeResumeCheckpoint(raw);
    if (session?.status === 'active' && session.sessionId !== restored.session.sessionId) {
      throw new Error('STUDY_RUNTIME_ACTIVE_SESSION_REPLACEMENT_REFUSED');
    }
    session = restored.session;
    throws = [];
    resolved = null;
    hint = null;
    actionKind = restored.actionKind;
    questionStartedAtMs = restored.questionStartedAtMs;
    return snapshot();
  }

  function exportResumeCheckpoint() {
    if (!session) throw new Error('STUDY_RUNTIME_SESSION_NOT_STARTED');
    if (throws.length !== 0 || resolved !== null) {
      throw new Error('STUDY_RUNTIME_RESUME_CHECKPOINT_REQUIRES_STABLE_BOUNDARY');
    }
    const safeSession = normalizeStudySessionForResume(session, pack);
    return Object.freeze({
      schemaVersion: RESUME_SCHEMA,
      session: cloneJson(safeSession),
      actionKind,
      questionStartedAtMs,
      persistenceAuthority: 'CALLER',
      storageBackendCreated: false,
    });
  }

  function currentQuestion() {
'''
if state_anchor not in runtime:
    raise SystemExit('RUNTIME_STATE_ANCHOR_MISSING')
runtime = runtime.replace(state_anchor, resume_logic, 1)
return_anchor = """  return Object.freeze({
    start,
    restart,
    setActionKind,
    throwAnswer,
    undoLastThrow,
    revealHint,
    resolve,
    advance,
    getSnapshot: snapshot,
  });
}
"""
return_new = """  if (resumeCheckpoint !== null) resumeFromCheckpoint(resumeCheckpoint);

  return Object.freeze({
    start,
    restart,
    setActionKind,
    throwAnswer,
    undoLastThrow,
    revealHint,
    resolve,
    advance,
    exportResumeCheckpoint,
    resumeFromCheckpoint,
    getSnapshot: snapshot,
  });
}
"""
if return_anchor not in runtime:
    raise SystemExit('RUNTIME_RETURN_ANCHOR_MISSING')
runtime = runtime.replace(return_anchor, return_new, 1)
runtime_path.write_text(runtime)

runtime_test_path = Path('tests/study-run-runtime-mount.test.mjs')
runtime_test = runtime_test_path.read_text()
runtime_test += r'''

test('Study resume checkpoint restores the same run without resetting elapsed-time advantage', () => {
  let nowMs = 1000;
  const first = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => 'study.runtime.session.resume',
  });
  let view = first.start();
  first.setActionKind('counter');
  const checkpoint = first.exportResumeCheckpoint();
  assert.equal(checkpoint.persistenceAuthority, 'CALLER');
  assert.equal(checkpoint.storageBackendCreated, false);
  assert.equal(JSON.stringify(checkpoint).includes('acceptedAnswers'), false);

  nowMs = 7000;
  const resumed = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => { throw new Error('new session id must not be requested while resuming'); },
    resumeCheckpoint: checkpoint,
  });
  view = resumed.getSnapshot();
  assert.equal(view.session.sessionId, 'study.runtime.session.resume');
  assert.equal(view.question.questionId, 'study.manual.q01');
  assert.equal(view.actionKind, 'counter');
  const correct = view.question.answerHand.find(card => card.candidateId === 'c');
  resumed.throwAnswer(correct.cardId);
  view = resumed.resolve();
  assert.equal(view.resolution.action.actionKind, 'counter');
  assert.equal(view.resolution.action.timeMultiplier, 1.1);
});

test('Study resume checkpoint is refused mid-answer and rejects pack-version drift', () => {
  const controller = createStudyRunConsumerController({
    now: () => 1000,
    createSessionId: () => 'study.runtime.session.resume.reject',
  });
  const view = controller.start();
  const card = view.question.answerHand[0];
  controller.throwAnswer(card.cardId);
  assert.throws(() => controller.exportResumeCheckpoint(), /REQUIRES_STABLE_BOUNDARY/);

  const clean = createStudyRunConsumerController({
    now: () => 1000,
    createSessionId: () => 'study.runtime.session.resume.clean',
  });
  clean.start();
  const checkpoint = clean.exportResumeCheckpoint();
  const driftedPack = { ...STUDY_MANUAL_PROBLEM_PACK, contentVersion: 'v2.unknown' };
  assert.throws(
    () => createStudyRunConsumerController({ pack: driftedPack, resumeCheckpoint: checkpoint }),
    /does not match session/,
  );
});
'''
runtime_test_path.write_text(runtime_test)

subprocess.check_call(['node', '--test', 'tests/study-problem-pack-core.test.mjs', 'tests/study-run-runtime-mount.test.mjs'])
subprocess.check_call(['git', 'diff', '--check'])
subprocess.check_call(['git', 'add', *EXPECTED.keys()])
if subprocess.call(['git', 'diff', '--cached', '--quiet']) == 0:
    raise SystemExit('NO_PRODUCT_DIFF')
subprocess.check_call(['git', 'config', 'user.name', 'github-actions[bot]'])
subprocess.check_call(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
subprocess.check_call(['git', 'commit', '-m', 'Study: 安全な途中再開契約を追加'])
subprocess.check_call(['git', 'push', 'origin', 'HEAD'])
print('STUDY_RESUME_R3_PRODUCT_COMMITTED')
