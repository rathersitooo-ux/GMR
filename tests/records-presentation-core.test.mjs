import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecordsPresentation,
  projectRecordsPresentation,
  RECORDS_PRESENTATION_CORE
} from '../browser/records-presentation-core.mjs';

const wide = { width: 1280, height: 720 };

function record(overrides = {}) {
  return {
    recordId: 'r1',
    sourceId: 'match-result-authority',
    title: 'Authority supplied title',
    subtitle: 'Authority supplied subtitle',
    occurredAtLabel: 'Authority supplied time label',
    details: { resultCode: 0 },
    ...overrides
  };
}

test('ready source with zero records is a first-class empty state', () => {
  const state = createRecordsPresentation({ viewport: wide, sourceState: 'ready', records: [] });
  assert.equal(state.mode, 'empty');
  assert.deepEqual(state.source.records, []);
  assert.equal(state.selectedRecordId, null);
  assert.equal(state.selectedRecord, null);
});

test('source unavailable is not fabricated as an empty history', () => {
  const state = createRecordsPresentation({
    viewport: wide,
    sourceState: 'unavailable',
    sourceMessage: 'authority unavailable'
  });
  assert.equal(state.mode, 'unavailable');
  assert.equal(state.source.message, 'authority unavailable');
  assert.deepEqual(state.source.records, []);
});

test('records preserve caller order and caller-supplied display strings', () => {
  const state = createRecordsPresentation({
    viewport: wide,
    records: [record({ recordId: 'r2', title: 'second' }), record({ recordId: 'r1', title: 'first' })]
  });
  assert.equal(state.mode, 'list');
  assert.deepEqual(state.source.records.map((item) => item.recordId), ['r2', 'r1']);
  assert.deepEqual(state.source.records.map((item) => item.title), ['second', 'first']);
});

test('detail appears only for an explicitly selected existing record', () => {
  const state = createRecordsPresentation({
    viewport: wide,
    records: [record()],
    selectedRecordId: 'r1'
  });
  assert.equal(state.mode, 'detail');
  assert.equal(state.selectedRecordId, 'r1');
  assert.equal(state.selectedRecord.recordId, 'r1');
});

test('stale or foreign selected record ids fail closed', () => {
  assert.throws(() => createRecordsPresentation({
    viewport: wide,
    records: [record()],
    selectedRecordId: 'missing'
  }), /SELECTED_RECORD_NOT_FOUND/);
});

test('duplicate record ids fail closed', () => {
  assert.throws(() => createRecordsPresentation({
    viewport: wide,
    records: [record(), record()]
  }), /DUPLICATE_RECORD_ID/);
});

test('actions are caller supplied only and no replay/reflection action is invented', () => {
  const withoutActions = createRecordsPresentation({ viewport: wide, records: [record()] });
  assert.deepEqual(withoutActions.source.records[0].actions, []);

  const withAction = createRecordsPresentation({
    viewport: wide,
    records: [record({ actions: [{ actionId: 'open', routeId: 'records.detail', label: 'Open', enabled: true }] })]
  });
  assert.deepEqual(withAction.source.records[0].actions, [
    { actionId: 'open', enabled: true, label: 'Open', routeId: 'records.detail' }
  ]);
});

test('unowned aggregate-like input fields are dropped rather than exposed', () => {
  const state = createRecordsPresentation({
    viewport: wide,
    records: [record({ winRate: 99, kd: 12, totalMatches: 999 })]
  });
  const item = state.source.records[0];
  assert.equal('winRate' in item, false);
  assert.equal('kd' in item, false);
  assert.equal('totalMatches' in item, false);
});

test('opaque authority details preserve zero and are deep-cloned/frozen', () => {
  const details = { resultCode: 0, nested: { value: 0 } };
  const state = createRecordsPresentation({ viewport: wide, records: [record({ details })] });
  details.resultCode = 7;
  details.nested.value = 9;
  assert.deepEqual(state.source.records[0].details, { resultCode: 0, nested: { value: 0 } });
  assert.equal(Object.isFrozen(state.source.records[0].details), true);
});

test('short-landscape and wide landscape preserve the branch8 list/detail hierarchy', () => {
  const short = createRecordsPresentation({ viewport: { width: 844, height: 390 }, records: [] });
  assert.deepEqual(short.layout, {
    mode: 'short-landscape',
    listPercent: 42,
    detailPercent: 58,
    compactRows: true
  });
  const large = createRecordsPresentation({ viewport: wide, records: [] });
  assert.deepEqual(large.layout, {
    mode: 'landscape',
    listPercent: 36,
    detailPercent: 64,
    compactRows: false
  });
});

test('Reduced Motion and LowPerf alter effects without changing record semantics', () => {
  const baseInput = { viewport: wide, records: [record()], selectedRecordId: 'r1' };
  const normal = createRecordsPresentation(baseInput);
  const reduced = createRecordsPresentation({ ...baseInput, reducedMotion: true, lowPerf: true });
  assert.deepEqual(reduced.source, normal.source);
  assert.deepEqual(reduced.selectedRecord, normal.selectedRecord);
  assert.equal(normal.effects.motion, 'enabled');
  assert.equal(reduced.effects.motion, 'instant');
  assert.equal(reduced.effects.optionalDecoration, 'minimal');
});

test('non-ready states cannot smuggle authoritative records', () => {
  assert.throws(() => createRecordsPresentation({
    viewport: wide,
    sourceState: 'error',
    records: [record()]
  }), /NON_READY_SOURCE_CANNOT_HAVE_RECORDS/);
});

test('projection rejects unrelated state and preserves valid state', () => {
  assert.deepEqual(projectRecordsPresentation({}), { ok: false, reason: 'STATE_INVALID' });
  const state = createRecordsPresentation({ viewport: wide, records: [record()] });
  const projected = projectRecordsPresentation(state);
  assert.equal(projected.ok, true);
  assert.equal(projected.mode, 'list');
  assert.equal(projected.source.records[0].recordId, 'r1');
  assert.equal(RECORDS_PRESENTATION_CORE.schema, 'GAMEROAD_RECORDS_PRESENTATION_V1');
});
