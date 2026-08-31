import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectRoadCardSoftFocus,
  ROAD_CARD_SOFT_FOCUS_PROJECTION_SCHEMA,
} from '../browser/road-card-soft-focus-projection.mjs';

const cases = [
  {
    name: 'zero compatible cards has no soft focus',
    compatibleRoadCardIds: [],
    focusedRoadCardId: null,
    soleCompatibleRoadCardId: null,
    softFocusRoadCardId: null,
  },
  {
    name: 'one compatible card gets soft focus without explicit focus',
    compatibleRoadCardIds: ['ROAD_5'],
    focusedRoadCardId: null,
    soleCompatibleRoadCardId: 'ROAD_5',
    softFocusRoadCardId: 'ROAD_5',
  },
  {
    name: 'multiple compatible cards stay equally unresolved',
    compatibleRoadCardIds: ['ROAD_3', 'ROAD_5', 'ROAD_6'],
    focusedRoadCardId: null,
    soleCompatibleRoadCardId: null,
    softFocusRoadCardId: null,
  },
  {
    name: 'explicit compatible focus remains stronger than sole-candidate soft focus',
    compatibleRoadCardIds: ['ROAD_5'],
    focusedRoadCardId: 'ROAD_5',
    soleCompatibleRoadCardId: 'ROAD_5',
    softFocusRoadCardId: null,
  },
  {
    name: 'invalid prior focus is preserved while the sole compatible replacement is soft-focused',
    compatibleRoadCardIds: ['ROAD_5'],
    focusedRoadCardId: 'ROAD_3',
    soleCompatibleRoadCardId: 'ROAD_5',
    softFocusRoadCardId: 'ROAD_5',
  },
];

for (const scenario of cases) {
  test(scenario.name, () => {
    const input = {
      compatibleRoadCardIds: [...scenario.compatibleRoadCardIds],
      focusedRoadCardId: scenario.focusedRoadCardId,
    };
    const before = structuredClone(input);
    const projected = projectRoadCardSoftFocus(input);

    assert.equal(projected.schema, ROAD_CARD_SOFT_FOCUS_PROJECTION_SCHEMA);
    assert.deepEqual(projected.compatibleRoadCardIds, scenario.compatibleRoadCardIds);
    assert.equal(projected.focusedRoadCardId, scenario.focusedRoadCardId);
    assert.equal(projected.soleCompatibleRoadCardId, scenario.soleCompatibleRoadCardId);
    assert.equal(projected.softFocusRoadCardId, scenario.softFocusRoadCardId);
    assert.equal(projected.selectionEffect, 'NONE');
    assert.equal(projected.submitEffect, 'NONE');
    assert.deepEqual(input, before, 'projection must not mutate DraftMove/card inputs');

    if (scenario.softFocusRoadCardId === null) {
      assert.equal(projected.presentation, null);
    } else {
      assert.deepEqual(projected.presentation, {
        roadCardId: scenario.softFocusRoadCardId,
        state: 'SOLE_COMPATIBLE_SOFT_FOCUS',
        strongerCandidateEmphasis: true,
        commitsSelection: false,
      });
    }
  });
}

test('duplicate compatible identities fail closed instead of creating ambiguous soft focus', () => {
  assert.throws(
    () => projectRoadCardSoftFocus({ compatibleRoadCardIds: ['ROAD_5', 'ROAD_5'] }),
    /COMPATIBLE_ROAD_CARD_IDS_DUPLICATE/,
  );
});

test('invalid identities fail closed', () => {
  assert.throws(
    () => projectRoadCardSoftFocus({ compatibleRoadCardIds: [''] }),
    /COMPATIBLE_ROAD_CARD_ID_0_REQUIRED/,
  );
  assert.throws(
    () => projectRoadCardSoftFocus({ compatibleRoadCardIds: ['ROAD_5'], focusedRoadCardId: '' }),
    /FOCUSED_ROAD_CARD_ID_REQUIRED/,
  );
});

test('projection surface contains no Battle-card reservation or submission field', () => {
  const projected = projectRoadCardSoftFocus({ compatibleRoadCardIds: ['ROAD_5'] });
  const serialized = JSON.stringify(projected).toLowerCase();
  assert.equal(serialized.includes('battlecard'), false);
  assert.equal(serialized.includes('reservation'), false);
  assert.equal(serialized.includes('submitbattle'), false);
});
