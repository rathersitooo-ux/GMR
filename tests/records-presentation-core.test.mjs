import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordsPresentation, projectRecordsPresentation, RECORDS_PRESENTATION_CORE } from '../browser/records-presentation-core.mjs';

const wide = { width: 1280, height: 720 };
const record = (overrides = {}) => ({
  recordId: 'r1',
  sourceId: 'history',
  title: '二人 / 1位',
  subtitle: '8巡',
  details: { rank: 1, deck: null },
  ...overrides
});

test('ready zero-record source is an explicit empty state', () => {
  const state = createRecordsPresentation({ viewport: wide, sourceState: 'ready', records: [] });
  assert.equal(state.mode, 'empty');
  assert.deepEqual(state.source.records, []);
});

test('unavailable is distinct from an empty history', () => {
  const state = createRecordsPresentation({ viewport: wide, sourceState: 'unavailable', sourceMessage: 'unavailable' });
  assert.equal(state.mode, 'unavailable');
  assert.equal(state.source.message, 'unavailable');
});

test('source order and authority supplied strings are preserved', () => {
  const state = createRecordsPresentation({
    viewport: wide,
    records: [record({ recordId: 'r2', title: 'newer' }), record({ recordId: 'r1', title: 'older' })]
  });
  assert.equal(state.mode, 'list');
  assert.deepEqual(state.source.records.map((x) => x.title), ['newer', 'older']);
});

test('detail appears only for an explicitly selected existing record', () => {
  const state = createRecordsPresentation({ viewport: wide, records: [record()], selectedRecordId: 'r1' });
  assert.equal(state.mode, 'detail');
  assert.equal(state.selectedRecord.recordId, 'r1');
  assert.throws(() => createRecordsPresentation({ viewport: wide, records: [record()], selectedRecordId: 'missing' }), /SELECTED_RECORD_NOT_FOUND/);
});

test('duplicate record ids fail closed', () => {
  assert.throws(() => createRecordsPresentation({ viewport: wide, records: [record(), record()] }), /DUPLICATE_RECORD_ID/);
});

test('actions are never invented and caller actions are normalized', () => {
  const none = createRecordsPresentation({ viewport: wide, records: [record()] });
  assert.deepEqual(none.source.records[0].actions, []);
  const supplied = createRecordsPresentation({ viewport: wide, records: [record({ actions: [{ actionId: 'open', enabled: true, label: '詳細', routeId: 'records.detail' }] })] });
  assert.deepEqual(supplied.source.records[0].actions, [{ actionId: 'open', enabled: true, label: '詳細', routeId: 'records.detail' }]);
});

test('layout stays usable in phone landscape, wide landscape, and portrait', () => {
  assert.equal(createRecordsPresentation({ viewport: { width: 844, height: 390 }, records: [] }).layout.mode, 'short-landscape');
  assert.equal(createRecordsPresentation({ viewport: wide, records: [] }).layout.mode, 'landscape');
  assert.equal(createRecordsPresentation({ viewport: { width: 390, height: 844 }, records: [] }).layout.mode, 'portrait-stacked');
});

test('Reduced Motion and LowPerf change effects without changing record semantics', () => {
  const normal = createRecordsPresentation({ viewport: wide, records: [record()] });
  const reduced = createRecordsPresentation({ viewport: wide, records: [record()], reducedMotion: true, lowPerf: true });
  assert.deepEqual(reduced.source, normal.source);
  assert.equal(reduced.effects.motion, 'instant');
  assert.equal(reduced.effects.optionalDecoration, 'minimal');
});

test('projection fails closed for unrelated state and preserves valid state', () => {
  assert.deepEqual(projectRecordsPresentation({}), { ok: false, reason: 'STATE_INVALID' });
  const state = createRecordsPresentation({ viewport: wide, records: [record()] });
  assert.equal(projectRecordsPresentation(state).ok, true);
  assert.equal(RECORDS_PRESENTATION_CORE.schema, 'GAMEROAD_RECORDS_PRESENTATION_V1');
});
