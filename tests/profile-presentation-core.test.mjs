import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_PRESENTATION_CORE,
  createProfilePresentation,
  projectProfilePresentation
} from '../browser/profile-presentation-core.mjs';

const baseInput = Object.freeze({
  profileId: 'PLAYER-SELF',
  viewerScope: 'self',
  identity: Object.freeze({
    identityId: 'CHAR-NAKI',
    displayName: 'Naki',
    formalAssetAvailable: true
  }),
  sources: Object.freeze({
    records: Object.freeze({ status: 'known', sourceId: 'RESULT-OWNER', value: { wins: 0 } }),
    partner: Object.freeze({ status: 'known', sourceId: 'PARTNER-OWNER', value: { partnerId: 'CHAR-NAKI' } })
  }),
  routes: Object.freeze([
    Object.freeze({ routeId: 'records', enabled: true, label: 'Records' }),
    Object.freeze({ routeId: 'settings', enabled: true, label: 'Settings' })
  ]),
  viewport: Object.freeze({ width: 1920, height: 1080 })
});

function make(overrides = {}) {
  return createProfilePresentation({ ...baseInput, ...overrides });
}

test('schema is stable and output is deeply frozen', () => {
  const state = make();
  assert.equal(PROFILE_PRESENTATION_CORE.schema, 'GAMEROAD_PROFILE_PRESENTATION_V1');
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.sources), true);
  assert.equal(Object.isFrozen(state.routes), true);
});

test('missing or unauthoritative profile sources stay unknown instead of becoming fabricated zero values', () => {
  const state = make({
    sources: {
      records: { status: 'unknown', sourceId: 'SHOULD-NOT-MATTER', value: 0 },
      title: null,
      partner: { status: 'known', sourceId: '', value: { partnerId: 'X' } },
      appearance: { status: 'known', sourceId: 'APPEARANCE-OWNER' }
    }
  });
  for (const key of ['records', 'title', 'partner', 'appearance', 'collection']) {
    assert.deepEqual(state.sources[key], {
      status: 'unknown',
      visible: false,
      valuePresent: false,
      sourceId: null,
      reason: 'SOURCE_UNAVAILABLE'
    });
    assert.equal('value' in state.sources[key], false);
  }
});

test('known source with undefined payload fails closed instead of claiming valuePresent', () => {
  const state = make({
    sources: {
      records: { status: 'known', sourceId: 'RESULT-OWNER', value: undefined }
    }
  });
  assert.deepEqual(state.sources.records, {
    status: 'unknown',
    visible: false,
    valuePresent: false,
    sourceId: null,
    reason: 'SOURCE_UNAVAILABLE'
  });
  assert.equal('value' in state.sources.records, false);
  assert.deepEqual(projectProfilePresentation(state).sources.records, state.sources.records);
});

test('an authoritative numeric zero is preserved as real upstream data', () => {
  const state = make();
  assert.equal(state.sources.records.status, 'known');
  assert.equal(state.sources.records.visible, true);
  assert.equal(state.sources.records.valuePresent, true);
  assert.equal(state.sources.records.sourceId, 'RESULT-OWNER');
  assert.deepEqual(state.sources.records.value, { wins: 0 });
});

test('public view fails closed unless the source explicitly authorizes public presentation', () => {
  const state = make({
    viewerScope: 'public',
    sources: {
      records: { status: 'known', sourceId: 'RESULT-OWNER', value: { wins: 12 } },
      title: { status: 'known', sourceId: 'TITLE-OWNER', value: 'Example', publicAllowed: true }
    }
  });
  assert.deepEqual(state.sources.records, {
    status: 'known',
    visible: false,
    valuePresent: false,
    sourceId: 'RESULT-OWNER',
    reason: 'PRIVACY_NOT_AUTHORIZED'
  });
  assert.equal('value' in state.sources.records, false);
  assert.equal(state.sources.title.visible, true);
  assert.equal(state.sources.title.value, 'Example');
});

test('route projection never invents a default destination and preserves caller availability', () => {
  assert.deepEqual(make({ routes: [] }).routes, []);
  const routes = make({
    routes: [
      { routeId: 'records', enabled: true },
      { routeId: 'future-route-from-current-registry', enabled: false }
    ]
  }).routes;
  assert.deepEqual(routes, [
    { routeId: 'records', enabled: true, label: null },
    { routeId: 'future-route-from-current-registry', enabled: false, label: null }
  ]);
});

test('formal asset failure keeps the same identity and never substitutes another character', () => {
  const state = make({
    identity: { identityId: 'CHAR-NAKI', displayName: 'Naki', formalAssetAvailable: false }
  });
  assert.deepEqual(state.identity, {
    identityId: 'CHAR-NAKI',
    displayName: 'Naki',
    formalAssetState: 'fallback'
  });
});

test('reduced motion and low-performance modes change only presentation effects, not profile semantics', () => {
  const normal = projectProfilePresentation(make());
  const reduced = projectProfilePresentation(make({ reducedMotion: true }));
  const lowPerf = projectProfilePresentation(make({ lowPerf: true }));

  for (const candidate of [reduced, lowPerf]) {
    assert.deepEqual(candidate.identity, normal.identity);
    assert.deepEqual(candidate.sources, normal.sources);
    assert.deepEqual(candidate.routes, normal.routes);
    assert.deepEqual(candidate.layout, normal.layout);
  }
  assert.deepEqual(normal.effects, { motion: 'enabled', optionalDecoration: 'normal' });
  assert.deepEqual(reduced.effects, { motion: 'instant', optionalDecoration: 'normal' });
  assert.deepEqual(lowPerf.effects, { motion: 'instant', optionalDecoration: 'minimal' });
});

test('844x390 short landscape keeps the branch8 36/64 hierarchy while wide landscape uses 42/58', () => {
  const short = make({ viewport: { width: 844, height: 390 } });
  assert.deepEqual(short.layout, {
    mode: 'short-landscape', identityPercent: 36, contentPercent: 64, routeColumns: 2
  });
  const wide = make({ viewport: { width: 1920, height: 1080 } });
  assert.deepEqual(wide.layout, {
    mode: 'landscape', identityPercent: 42, contentPercent: 58, routeColumns: 4
  });
});

test('upstream values remain opaque JSON payloads and input objects are not mutated', () => {
  const weird = {
    status: 'known',
    sourceId: 'FUTURE-OWNER',
    value: { future: [0, false, null, { nested: 'preserved' }] }
  };
  const before = JSON.stringify(weird);
  const state = make({ sources: { collection: weird } });
  assert.equal(JSON.stringify(weird), before);
  assert.deepEqual(state.sources.collection.value, weird.value);
  assert.notEqual(state.sources.collection.value, weird.value);
});

test('invalid identity, viewport, viewer scope, and duplicate routes fail closed', () => {
  assert.throws(() => make({ identity: null }), /IDENTITY_REQUIRED/);
  assert.throws(() => make({ viewport: { width: 0, height: 390 } }), /VIEWPORT_INVALID/);
  assert.throws(() => make({ viewerScope: 'friends' }), /VIEWER_SCOPE_INVALID/);
  assert.throws(() => make({ routes: [{ routeId: 'records' }, { routeId: 'records' }] }), /DUPLICATE_ROUTE_ID/);
});
