import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_BATTLE_ROAD_PROGRESSION_PLAN_SCHEMA,
  planNewBaseBattleRoadProgression
} from '../browser/new-base-battle-road-progression-core.mjs';

function roadColumns(depth = 7) {
  return ['shield-a', 'shield-b'].map((shieldId, columnIndex) => ({
    shieldId,
    columnIndex,
    slots: Array.from({ length: depth }, (_, index) => ({
      slotId: `${shieldId}:road:${index + 1}`,
      shieldId,
      columnIndex,
      depth: index + 1
    }))
  }));
}

function resolution(laneGains, extra = {}) {
  return {
    serial: 9,
    round: 4,
    mode: '4p',
    laneGains,
    maxLaneProgress: [{ id: 'p1', before: 6, after: 7 }],
    winnerIds: ['p1'],
    ...extra
  };
}

const resolver = ({ playerId, lane }) => {
  if (playerId === 'p1' && lane === 'LEFT') return 'shield-a';
  if (playerId === 'p2' && lane === 'RIGHT') return 'shield-b';
  return 'missing-shield';
};

test('projects an accepted lane gain onto the exact next ROAD_SLOT', () => {
  const plan = planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p1', lane: 'LEFT', before: 0, after: 1, added: 1 }]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  });

  assert.equal(plan.schema, NEW_BASE_BATTLE_ROAD_PROGRESSION_PLAN_SCHEMA);
  assert.deepEqual(plan.source, { serial: 9, round: 4 });
  assert.deepEqual(plan.steps, [{
    progressionKey: 'NEW_BASE_BATTLE_ROAD:9:4:p1:LEFT:0:1',
    playerId: 'p1',
    lane: 'LEFT',
    shieldId: 'shield-a',
    columnIndex: 0,
    before: 0,
    after: 1,
    added: 1,
    fillSlotIds: ['shield-a:road:1']
  }]);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps[0].fillSlotIds), true);
});

test('uses laneGains afterstate to project multiple exact slot fills', () => {
  const plan = planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p1', lane: 'LEFT', before: 2, after: 4, added: 2 }]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  });
  assert.deepEqual(plan.steps[0].fillSlotIds, [
    'shield-a:road:3',
    'shield-a:road:4'
  ]);
});

test('reaching supplied column capacity does not emit legacy instant-win or GOAL semantics', () => {
  const plan = planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p1', lane: 'LEFT', before: 6, after: 7, added: 1 }]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  });
  assert.deepEqual(plan.steps[0].fillSlotIds, ['shield-a:road:7']);
  for (const forbidden of ['winnerIds', 'winningTeam', 'matchEnd', 'result', 'roadComplete', 'goalOpen']) {
    assert.equal(Object.hasOwn(plan, forbidden), false);
    assert.equal(Object.hasOwn(plan.steps[0], forbidden), false);
  }
});

test('ignores legacy maxLaneProgress/winner fields and drives progression only from laneGains', () => {
  const plan = planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p2', lane: 'RIGHT', before: 1, after: 2, added: 1 }], {
      maxLaneProgress: [{ id: 'p1', before: 99, after: 100 }],
      winnerIds: ['legacy-winner']
    }),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  });
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].playerId, 'p2');
  assert.equal(plan.steps[0].shieldId, 'shield-b');
});

test('zero-added accepted lane rows are no-op and require no ownership inference', () => {
  let resolverCalls = 0;
  const plan = planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p1', lane: 'LEFT', before: 3, after: 3, added: 0 }]),
    roadColumns: roadColumns(),
    resolveShieldId: () => {
      resolverCalls += 1;
      return 'shield-a';
    }
  });
  assert.deepEqual(plan.steps, []);
  assert.equal(resolverCalls, 0);
});

test('fails closed on inconsistent gain arithmetic', () => {
  assert.throws(() => planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p1', lane: 'LEFT', before: 2, after: 4, added: 1 }]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  }), /BATTLE_RESOLUTION_LANE_GAIN_INCONSISTENT/);
});

test('fails closed on unknown caller-supplied Shield mapping', () => {
  assert.throws(() => planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p3', lane: 'MID', before: 0, after: 1, added: 1 }]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  }), /ROAD_PROGRESSION_UNKNOWN_SHIELD/);
});

test('fails closed on duplicate player+lane gain or duplicate resolved target', () => {
  assert.throws(() => planNewBaseBattleRoadProgression({
    resolution: resolution([
      { id: 'p1', lane: 'LEFT', before: 0, after: 1, added: 1 },
      { id: 'p1', lane: 'LEFT', before: 1, after: 2, added: 1 }
    ]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  }), /BATTLE_RESOLUTION_LANE_GAIN_DUPLICATE/);

  assert.throws(() => planNewBaseBattleRoadProgression({
    resolution: resolution([
      { id: 'p1', lane: 'LEFT', before: 0, after: 1, added: 1 },
      { id: 'p2', lane: 'RIGHT', before: 0, after: 1, added: 1 }
    ]),
    roadColumns: roadColumns(),
    resolveShieldId: () => 'shield-a'
  }), /ROAD_PROGRESSION_DUPLICATE_TARGET/);
});

test('fails closed when accepted afterstate exceeds supplied ROAD_SLOT capacity', () => {
  assert.throws(() => planNewBaseBattleRoadProgression({
    resolution: resolution([{ id: 'p1', lane: 'LEFT', before: 6, after: 8, added: 2 }]),
    roadColumns: roadColumns(),
    resolveShieldId: resolver
  }), /ROAD_PROGRESSION_CAPACITY_EXCEEDED/);
});
