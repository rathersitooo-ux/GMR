const SCHEMA = 'GAMEROAD_RECORDS_PRESENTATION_V1';
const SOURCE_STATES = Object.freeze(['ready', 'loading', 'unavailable', 'error']);

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value) {
  return nonEmptyString(value) ? value : null;
}

function normalizeViewport(viewport) {
  if (!viewport || typeof viewport !== 'object' || Array.isArray(viewport)) {
    throw new TypeError('VIEWPORT_REQUIRED');
  }
  const { width, height } = viewport;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new TypeError('VIEWPORT_INVALID');
  }
  return { width, height };
}

function layoutForViewport(viewport) {
  const { width, height } = normalizeViewport(viewport);
  const landscape = width > height;
  if (landscape && width <= 900 && height <= 420) {
    return {
      mode: 'short-landscape',
      listPercent: 42,
      detailPercent: 58,
      compactRows: true
    };
  }
  if (landscape) {
    return {
      mode: 'landscape',
      listPercent: 36,
      detailPercent: 64,
      compactRows: false
    };
  }
  return {
    mode: 'portrait-stacked',
    listPercent: 100,
    detailPercent: 100,
    compactRows: true
  };
}

function normalizeAction(action, seen) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || !nonEmptyString(action.actionId)) {
    throw new TypeError('RECORD_ACTION_INVALID');
  }
  if (seen.has(action.actionId)) throw new TypeError('DUPLICATE_RECORD_ACTION_ID');
  seen.add(action.actionId);
  return {
    actionId: action.actionId,
    enabled: action.enabled === true,
    label: optionalString(action.label),
    routeId: optionalString(action.routeId)
  };
}

function normalizeRecord(record, seenRecordIds) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !nonEmptyString(record.recordId)) {
    throw new TypeError('RECORD_INVALID');
  }
  if (!nonEmptyString(record.sourceId)) throw new TypeError('RECORD_SOURCE_ID_REQUIRED');
  if (seenRecordIds.has(record.recordId)) throw new TypeError('DUPLICATE_RECORD_ID');
  seenRecordIds.add(record.recordId);

  const actionIds = new Set();
  const actions = record.actions === undefined || record.actions === null
    ? []
    : (() => {
        if (!Array.isArray(record.actions)) throw new TypeError('RECORD_ACTIONS_INVALID');
        return record.actions.map((action) => normalizeAction(action, actionIds));
      })();

  const normalized = {
    recordId: record.recordId,
    sourceId: record.sourceId,
    title: optionalString(record.title),
    subtitle: optionalString(record.subtitle),
    statusLabel: optionalString(record.statusLabel),
    occurredAtLabel: optionalString(record.occurredAtLabel),
    actions
  };
  if (Object.prototype.hasOwnProperty.call(record, 'details')) {
    normalized.details = cloneJson(record.details);
  }
  return normalized;
}

function normalizeSource(input) {
  const sourceState = input.sourceState ?? 'ready';
  if (!SOURCE_STATES.includes(sourceState)) throw new TypeError('SOURCE_STATE_INVALID');
  const recordsInput = input.records ?? [];
  if (!Array.isArray(recordsInput)) throw new TypeError('RECORDS_INVALID');
  if (sourceState !== 'ready' && recordsInput.length > 0) {
    throw new TypeError('NON_READY_SOURCE_CANNOT_HAVE_RECORDS');
  }

  const seenRecordIds = new Set();
  const records = recordsInput.map((record) => normalizeRecord(record, seenRecordIds));
  return {
    state: sourceState,
    sourceId: optionalString(input.sourceId),
    message: optionalString(input.sourceMessage),
    records
  };
}

function resolveSelection(records, selectedRecordId) {
  if (selectedRecordId === undefined || selectedRecordId === null || selectedRecordId === '') {
    return { selectedRecordId: null, selectedRecord: null };
  }
  if (!nonEmptyString(selectedRecordId)) throw new TypeError('SELECTED_RECORD_ID_INVALID');
  const selectedRecord = records.find((record) => record.recordId === selectedRecordId);
  if (!selectedRecord) throw new TypeError('SELECTED_RECORD_NOT_FOUND');
  return { selectedRecordId, selectedRecord };
}

function screenMode(source, selection) {
  if (source.state !== 'ready') return source.state;
  if (source.records.length === 0) return 'empty';
  return selection.selectedRecord ? 'detail' : 'list';
}

function presentationEffects({ reducedMotion, lowPerf }) {
  const staticMotion = reducedMotion === true || lowPerf === true;
  return {
    motion: staticMotion ? 'instant' : 'enabled',
    optionalDecoration: lowPerf === true ? 'minimal' : 'normal'
  };
}

export function createRecordsPresentation(input = {}) {
  const source = normalizeSource(input);
  const selection = resolveSelection(source.records, input.selectedRecordId);
  const state = {
    schema: SCHEMA,
    mode: screenMode(source, selection),
    source,
    selectedRecordId: selection.selectedRecordId,
    selectedRecord: selection.selectedRecord ? cloneJson(selection.selectedRecord) : null,
    accessibility: {
      reducedMotion: input.reducedMotion === true,
      lowPerf: input.lowPerf === true
    },
    effects: presentationEffects(input),
    layout: layoutForViewport(input.viewport)
  };
  return deepFreeze(state);
}

export function projectRecordsPresentation(state) {
  if (!state || state.schema !== SCHEMA) return deepFreeze({ ok: false, reason: 'STATE_INVALID' });
  return deepFreeze({
    ok: true,
    mode: state.mode,
    source: cloneJson(state.source),
    selectedRecordId: state.selectedRecordId,
    selectedRecord: cloneJson(state.selectedRecord),
    accessibility: cloneJson(state.accessibility),
    effects: cloneJson(state.effects),
    layout: cloneJson(state.layout)
  });
}

export const RECORDS_PRESENTATION_CORE = Object.freeze({
  schema: SCHEMA,
  sourceStates: SOURCE_STATES
});
