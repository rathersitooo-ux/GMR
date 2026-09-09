from pathlib import Path

RUNTIME = Path('browser/study-run-runtime-mount.mjs')
TEST = Path('tests/study-run-runtime-mount.test.mjs')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


runtime = RUNTIME.read_text()

runtime = replace_once(
    runtime,
    "const ACTION_KINDS = new Set(['attack', 'counter']);\nconst RESUME_SCHEMA = 'gameroad.study-run-resume.v1';",
    "const ACTION_KINDS = new Set(['attack', 'counter']);\nconst RESUME_SCHEMA = 'gameroad.study-run-resume.v1';\nconst STUDY_CHECKPOINT_STORAGE_KEY = 'study/resume/current';",
    'runtime storage key',
)

runtime = replace_once(
    runtime,
    "function assertActionPolicy(policy) {\n  if (!policy || policy.authority !== 'PROVISIONAL_SMOKE_ONLY') {\n    throw new TypeError('STUDY_RUNTIME_PROVISIONAL_ACTION_POLICY_REQUIRED');\n  }\n  return policy;\n}\n\nexport function createStudyRunConsumerController({",
    "function assertActionPolicy(policy) {\n  if (!policy || policy.authority !== 'PROVISIONAL_SMOKE_ONLY') {\n    throw new TypeError('STUDY_RUNTIME_PROVISIONAL_ACTION_POLICY_REQUIRED');\n  }\n  return policy;\n}\n\nfunction assertCheckpointStore(store) {\n  if (store === null) return null;\n  if (!store || typeof store.load !== 'function' || typeof store.commit !== 'function') {\n    throw new TypeError('STUDY_RUNTIME_CHECKPOINT_STORE_REQUIRED');\n  }\n  return store;\n}\n\nexport function createStudyRunCartridgeCheckpointStore({\n  cartridgeStorage,\n  key = STUDY_CHECKPOINT_STORAGE_KEY,\n} = {}) {\n  if (!cartridgeStorage || typeof cartridgeStorage.get !== 'function' || typeof cartridgeStorage.set !== 'function' || typeof cartridgeStorage.delete !== 'function') {\n    throw new TypeError('STUDY_RUNTIME_CARTRIDGE_STORAGE_REQUIRED');\n  }\n  if (typeof key !== 'string' || key !== key.trim() || !key) {\n    throw new TypeError('STUDY_RUNTIME_CHECKPOINT_STORAGE_KEY_INVALID');\n  }\n\n  function load() {\n    const saved = cartridgeStorage.get(key);\n    return saved === null ? null : cloneJson(saved);\n  }\n\n  function commit(checkpoint) {\n    const candidate = cloneJson(checkpoint);\n    cartridgeStorage.set(key, candidate);\n    const readback = cartridgeStorage.get(key);\n    if (readback === null || JSON.stringify(readback) !== JSON.stringify(candidate)) {\n      throw new Error('STUDY_RUNTIME_CHECKPOINT_COMMIT_READBACK_MISMATCH');\n    }\n    return Object.freeze(cloneJson(readback));\n  }\n\n  function clear() {\n    return cartridgeStorage.delete(key);\n  }\n\n  return Object.freeze({\n    authority: 'CARTRIDGE_STORAGE_CALLER_BACKEND',\n    storageBackendCreated: false,\n    key,\n    load,\n    commit,\n    clear,\n  });\n}\n\nexport function createStudyRunConsumerController({",
    'runtime checkpoint store helper',
)

runtime = replace_once(
    runtime,
    "  createSessionId = defaultSessionId,\n  resumeCheckpoint = null,\n} = {}) {\n  assertActionPolicy(actionPolicy);\n  if (typeof now !== 'function' || typeof createSessionId !== 'function') {\n    throw new TypeError('STUDY_RUNTIME_CLOCK_AND_ID_REQUIRED');\n  }",
    "  createSessionId = defaultSessionId,\n  resumeCheckpoint = null,\n  checkpointStore = null,\n} = {}) {\n  assertActionPolicy(actionPolicy);\n  if (typeof now !== 'function' || typeof createSessionId !== 'function') {\n    throw new TypeError('STUDY_RUNTIME_CLOCK_AND_ID_REQUIRED');\n  }\n  const persistence = assertCheckpointStore(checkpointStore);\n  if (resumeCheckpoint !== null && persistence !== null) {\n    throw new Error('STUDY_RUNTIME_MULTIPLE_RESUME_SOURCES_REFUSED');\n  }",
    'runtime controller args',
)

runtime = replace_once(
    runtime,
    "  function exportResumeCheckpoint() {\n    if (!session) throw new Error('STUDY_RUNTIME_SESSION_NOT_STARTED');\n    if (throws.length !== 0 || resolved !== null) {\n      throw new Error('STUDY_RUNTIME_RESUME_CHECKPOINT_REQUIRES_STABLE_BOUNDARY');\n    }\n    const safeSession = normalizeStudySessionForResume(session, pack);\n    return Object.freeze({\n      schemaVersion: RESUME_SCHEMA,\n      session: cloneJson(safeSession),\n      actionKind,\n      questionStartedAtMs,\n      persistenceAuthority: 'CALLER',\n      storageBackendCreated: false,\n    });\n  }\n\n  function currentQuestion() {",
    "  function exportResumeCheckpoint() {\n    if (!session) throw new Error('STUDY_RUNTIME_SESSION_NOT_STARTED');\n    if (throws.length !== 0 || resolved !== null) {\n      throw new Error('STUDY_RUNTIME_RESUME_CHECKPOINT_REQUIRES_STABLE_BOUNDARY');\n    }\n    const safeSession = normalizeStudySessionForResume(session, pack);\n    return Object.freeze({\n      schemaVersion: RESUME_SCHEMA,\n      session: cloneJson(safeSession),\n      actionKind,\n      questionStartedAtMs,\n      persistenceAuthority: 'CALLER',\n      storageBackendCreated: false,\n    });\n  }\n\n  function persistStableBoundary() {\n    if (!persistence) return null;\n    return persistence.commit(exportResumeCheckpoint());\n  }\n\n  function loadSavedCheckpoint() {\n    if (!persistence) throw new Error('STUDY_RUNTIME_CHECKPOINT_STORE_NOT_CONFIGURED');\n    const saved = persistence.load();\n    if (saved === null) return snapshot();\n    return resumeFromCheckpoint(saved);\n  }\n\n  function currentQuestion() {",
    'runtime persistence methods',
)

runtime = replace_once(
    runtime,
    "    actionKind = 'attack';\n    questionStartedAtMs = startedAtMs;\n    return snapshot();\n  }\n\n  function restart() {",
    "    actionKind = 'attack';\n    questionStartedAtMs = startedAtMs;\n    persistStableBoundary();\n    return snapshot();\n  }\n\n  function restart() {",
    'runtime start persistence',
)

runtime = replace_once(
    runtime,
    "    if (resolved) throw new Error('STUDY_RUNTIME_QUESTION_ALREADY_RESOLVED');\n    actionKind = nextKind;\n    return snapshot();\n  }",
    "    if (resolved) throw new Error('STUDY_RUNTIME_QUESTION_ALREADY_RESOLVED');\n    actionKind = nextKind;\n    if (throws.length === 0) persistStableBoundary();\n    return snapshot();\n  }",
    'runtime action persistence',
)

runtime = replace_once(
    runtime,
    "    hint = null;\n    questionStartedAtMs = Math.max(0, Number(now()) || 0);\n    return snapshot();\n  }\n\n  function snapshot() {",
    "    hint = null;\n    questionStartedAtMs = Math.max(0, Number(now()) || 0);\n    persistStableBoundary();\n    return snapshot();\n  }\n\n  function snapshot() {",
    'runtime advance persistence',
)

runtime = replace_once(
    runtime,
    "  if (resumeCheckpoint !== null) resumeFromCheckpoint(resumeCheckpoint);\n\n  return Object.freeze({",
    "  if (resumeCheckpoint !== null) resumeFromCheckpoint(resumeCheckpoint);\n  else if (persistence) {\n    const saved = persistence.load();\n    if (saved !== null) resumeFromCheckpoint(saved);\n  }\n\n  return Object.freeze({",
    'runtime load persisted checkpoint',
)

runtime = replace_once(
    runtime,
    "    advance,\n    exportResumeCheckpoint,\n    resumeFromCheckpoint,\n    getSnapshot: snapshot,",
    "    advance,\n    exportResumeCheckpoint,\n    resumeFromCheckpoint,\n    saveStableCheckpoint: persistStableBoundary,\n    loadSavedCheckpoint,\n    getSnapshot: snapshot,",
    'runtime controller API',
)

runtime = replace_once(
    runtime,
    "export function mountStudyRunRuntime({ document: documentSource = globalThis.document } = {}) {",
    "export function mountStudyRunRuntime({ document: documentSource = globalThis.document, checkpointStore = null } = {}) {",
    'runtime mount args',
)

runtime = replace_once(
    runtime,
    "  installStyle(documentSource);\n  const controller = createStudyRunConsumerController();",
    "  installStyle(documentSource);\n  const controller = createStudyRunConsumerController({ checkpointStore });",
    'runtime mount controller wiring',
)

runtime = replace_once(
    runtime,
    "export function mountStudyRunFromCurrentBrowser() {\n  if (typeof document === 'undefined') return null;\n  try {\n    return mountStudyRunRuntime({ document });",
    "export function mountStudyRunFromCurrentBrowser({ checkpointStore = null } = {}) {\n  if (typeof document === 'undefined') return null;\n  try {\n    return mountStudyRunRuntime({ document, checkpointStore });",
    'runtime browser mount injection',
)

RUNTIME.write_text(runtime)


test_text = TEST.read_text()

test_text = replace_once(
    test_text,
    "  STUDY_MANUAL_SMOKE_ACTION_POLICY,\n  createStudyPanelOutsideDismissHandler,\n  createStudyRunConsumerController,\n} from '../browser/study-run-runtime-mount.mjs';\nimport { STUDY_MANUAL_PROBLEM_PACK } from '../browser/study-manual-problem-pack.mjs';",
    "  STUDY_MANUAL_SMOKE_ACTION_POLICY,\n  createStudyPanelOutsideDismissHandler,\n  createStudyRunCartridgeCheckpointStore,\n  createStudyRunConsumerController,\n} from '../browser/study-run-runtime-mount.mjs';\nimport { STUDY_MANUAL_PROBLEM_PACK } from '../browser/study-manual-problem-pack.mjs';\nimport { createCartridgeStorage, createMemoryCartridgeStorageBackend } from '../browser/cartridge-storage-core.mjs';",
    'test imports',
)

test_text = replace_once(
    test_text,
    "const singleQuestionPack = (index) => ({\n  ...STUDY_MANUAL_PROBLEM_PACK,\n  packId: `study.runtime.test.${index}`,\n  questions: [STUDY_MANUAL_PROBLEM_PACK.questions[index]],\n});",
    "const singleQuestionPack = (index) => ({\n  ...STUDY_MANUAL_PROBLEM_PACK,\n  packId: `study.runtime.test.${index}`,\n  questions: [STUDY_MANUAL_PROBLEM_PACK.questions[index]],\n});\n\nconst studyStorageManifest = Object.freeze({\n  schemaVersion: 'gameroad.cartridge-manifest.v1',\n  id: 'study.runtime.progress',\n  version: '1.0.0',\n  hostApi: 'gameroad.cartridge-host.v1',\n  entry: Object.freeze({ kind: 'module', ref: 'study-run-runtime-mount.mjs' }),\n  capabilities: Object.freeze(['storage.local']),\n  payloadDigest: 'd'.repeat(64),\n});\nconst studyStorageBroker = Object.freeze({ decide: () => Object.freeze({ allowed: true, reason: 'study-test' }) });\n\nfunction createFormalStudyCheckpointStore() {\n  const backend = createMemoryCartridgeStorageBackend();\n  const cartridgeStorage = createCartridgeStorage({\n    manifest: studyStorageManifest,\n    capabilityBroker: studyStorageBroker,\n    backend,\n  });\n  return {\n    cartridgeStorage,\n    checkpointStore: createStudyRunCartridgeCheckpointStore({ cartridgeStorage }),\n  };\n}",
    'test formal cartridge setup',
)

append = r'''

test('Study stable checkpoints persist through the existing cartridge storage contract and reload automatically', () => {
  let nowMs = 1000;
  const { cartridgeStorage, checkpointStore } = createFormalStudyCheckpointStore();
  const first = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => 'study.runtime.session.cartridge.persist',
    checkpointStore,
  });
  let view = first.start();
  first.setActionKind('counter');

  const stored = cartridgeStorage.get('study/resume/current');
  assert.equal(stored.session.sessionId, 'study.runtime.session.cartridge.persist');
  assert.equal(stored.actionKind, 'counter');
  assert.equal(stored.persistenceAuthority, 'CALLER');
  assert.equal(stored.storageBackendCreated, false);
  assert.equal(JSON.stringify(stored).includes('acceptedAnswers'), false);
  assert.equal(checkpointStore.authority, 'CARTRIDGE_STORAGE_CALLER_BACKEND');
  assert.equal(checkpointStore.storageBackendCreated, false);

  nowMs = 7000;
  const resumed = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => { throw new Error('new session id must not be requested while cartridge checkpoint exists'); },
    checkpointStore,
  });
  view = resumed.getSnapshot();
  assert.equal(view.session.sessionId, 'study.runtime.session.cartridge.persist');
  assert.equal(view.actionKind, 'counter');
  const correct = view.question.answerHand.find((card) => card.candidateId === 'c');
  resumed.throwAnswer(correct.cardId);
  view = resumed.resolve();
  assert.equal(view.resolution.action.actionKind, 'counter');
  assert.equal(view.resolution.action.timeMultiplier, 1.1);

  resumed.advance();
  const advanced = cartridgeStorage.get('study/resume/current');
  assert.equal(advanced.session.questionIndex, 1);
  assert.equal(advanced.questionStartedAtMs, 7000);
});

test('Study cartridge checkpoint commit fails closed when write readback does not match', () => {
  let stored = null;
  const corruptStorage = {
    get() {
      if (stored === null) return null;
      return { ...stored, actionKind: stored.actionKind === 'attack' ? 'counter' : 'attack' };
    },
    set(_key, value) { stored = JSON.parse(JSON.stringify(value)); },
    delete() { stored = null; return true; },
  };
  const checkpointStore = createStudyRunCartridgeCheckpointStore({ cartridgeStorage: corruptStorage });
  const controller = createStudyRunConsumerController({
    now: () => 1000,
    createSessionId: () => 'study.runtime.session.readback.fail',
    checkpointStore,
  });
  assert.throws(() => controller.start(), /CHECKPOINT_COMMIT_READBACK_MISMATCH/);
});

test('Study persistence bridge creates no browser storage backend and refuses competing resume sources', () => {
  const { checkpointStore } = createFormalStudyCheckpointStore();
  const source = fs.readFileSync(new URL('../browser/study-run-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('localStorage'), false);
  assert.equal(checkpointStore.storageBackendCreated, false);

  const seed = createStudyRunConsumerController({
    now: () => 1000,
    createSessionId: () => 'study.runtime.session.single.authority',
  });
  seed.start();
  const checkpoint = seed.exportResumeCheckpoint();
  assert.throws(
    () => createStudyRunConsumerController({ resumeCheckpoint: checkpoint, checkpointStore }),
    /MULTIPLE_RESUME_SOURCES_REFUSED/,
  );
});
'''

test_text += append
TEST.write_text(test_text)
