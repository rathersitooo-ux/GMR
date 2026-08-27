import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/battle-board-visual-explanation-core.mjs');
const {
  BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
  createBattleCorePresentationMount,
  projectBattleBoardVisualExplanation,
  projectBattleCorePresentationState,
} = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

const valid = ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0', 'R:1:0'];

function base(overrides = {}) {
  return {
    validPositionIds: valid,
    currentPositionId: 'C:0:0',
    selectedPositionId: 'L:2:0',
    reachablePositionIds: ['L:1:0', 'L:2:0', 'R:1:0'],
    pathPositionIds: ['C:0:0', 'L:1:0', 'L:2:0'],
    threatPositionIds: ['L:2:0', 'L:3:0'],
    forecastPositionIds: ['L:3:0'],
    revisionToken: 'state-17',
    currentRevisionToken: 'state-17',
    partnerProjection: {
      schema: 'gameroad.partner-advice-board-projection.v1',
      active: true,
      clear: false,
      targetId: 'L:2:0',
      candidateId: 'card-17',
      presentationRole: 'partner-recommendation',
      autoExecute: false,
    },
    ...overrides,
  };
}

test('projects only canonical ids and keeps semantic channels distinct', () => {
  const out = projectBattleBoardVisualExplanation(base());
  assert.equal(out.ok, true);
  assert.deepEqual(out.channels.current, ['C:0:0']);
  assert.deepEqual(out.channels.selected, ['L:2:0']);
  assert.deepEqual(out.channels.reachable, ['L:1:0', 'L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
  assert.deepEqual(out.channels.threat, ['L:2:0', 'L:3:0']);
  assert.deepEqual(out.channels.forecast, ['L:3:0']);
  assert.equal(out.recommendation.targetId, 'L:2:0');
  for (const ids of Object.values(out.channels)) {
    for (const id of ids) assert.ok(valid.includes(id));
  }
  assert.ok(valid.includes(out.recommendation.targetId));
});

test('preserves overlap instead of destructive precedence', () => {
  const out = projectBattleBoardVisualExplanation(base());
  assert.deepEqual(out.rolesByPosition['L:2:0'], [
    'selected',
    'reachable',
    'path',
    'threat',
    'partner-recommendation',
  ]);
});

test('partner recommendation never becomes selected state or path', () => {
  const out = projectBattleBoardVisualExplanation(base({
    selectedPositionId: 'L:1:0',
    pathPositionIds: ['C:0:0', 'L:1:0'],
    partnerProjection: {
      ...base().partnerProjection,
      targetId: 'R:1:0',
    },
  }));
  assert.deepEqual(out.channels.selected, ['L:1:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0']);
  assert.equal(out.recommendation.targetId, 'R:1:0');
  assert.equal(out.authorityByRole.selected, 'rules-derived');
  assert.equal(out.authorityByRole['partner-recommendation'], 'partner-heuristic');
});

test('invalid rules-derived id fails the whole rules projection closed', () => {
  const out = projectBattleBoardVisualExplanation(base({
    reachablePositionIds: ['L:1:0', 'NOT:A:POSITION'],
  }));
  assert.equal(out.ok, false);
  assert.equal(out.clear, true);
  assert.equal(out.reason, 'UNKNOWN_POSITION_ID');
  assert.deepEqual(out.channels.reachable, []);
  assert.equal(out.recommendation.active, false);
});

test('unknown partner target clears only recommendation', () => {
  const out = projectBattleBoardVisualExplanation(base({
    partnerProjection: {
      ...base().partnerProjection,
      targetId: 'NOT:A:POSITION',
    },
  }));
  assert.equal(out.ok, true);
  assert.deepEqual(out.channels.selected, ['L:2:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
  assert.equal(out.recommendation.active, false);
  assert.equal(out.recommendation.clearReason, 'RECOMMENDATION_TARGET_UNMAPPED');
});

test('inactive or malformed advice clears recommendation only', () => {
  for (const partnerProjection of [
    null,
    { schema: 'wrong', active: true, clear: false, targetId: 'L:2:0', presentationRole: 'partner-recommendation', autoExecute: false },
    { ...base().partnerProjection, active: false, clear: true },
    { ...base().partnerProjection, autoExecute: true },
    { ...base().partnerProjection, presentationRole: 'selected' },
  ]) {
    const out = projectBattleBoardVisualExplanation(base({ partnerProjection }));
    assert.equal(out.ok, true);
    assert.deepEqual(out.channels.current, ['C:0:0']);
    assert.equal(out.recommendation.active, false);
  }
});

test('stale board revision clears all presentation state', () => {
  const out = projectBattleBoardVisualExplanation(base({ currentRevisionToken: 'state-18' }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'STALE_BOARD_STATE');
  assert.deepEqual(out.channels.current, []);
  assert.deepEqual(out.channels.path, []);
  assert.equal(out.recommendation.active, false);
});

test('dedupes set-like channels deterministically while preserving path order', () => {
  const out = projectBattleBoardVisualExplanation(base({
    reachablePositionIds: ['R:1:0', 'L:1:0', 'R:1:0', 'L:2:0'],
    threatPositionIds: ['L:3:0', 'L:2:0', 'L:3:0'],
    pathPositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:2:0'],
  }));
  assert.deepEqual(out.channels.reachable, ['L:1:0', 'L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels.threat, ['L:2:0', 'L:3:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
});

test('does not bake visual skin tokens into semantic output', () => {
  const out = projectBattleBoardVisualExplanation(base());
  const text = JSON.stringify(out);
  for (const forbidden of ['className', 'style', 'background', 'borderColor', 'fontFamily', 'px', '#fff', '#000']) {
    assert.equal(text.includes(forbidden), false, `forbidden presentation skin token: ${forbidden}`);
  }
});

test('empty canonical position set fails closed', () => {
  const out = projectBattleBoardVisualExplanation(base({ validPositionIds: [] }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'NO_VALID_POSITIONS');
});

class FakeElement {
  constructor(positionId = null) {
    this.attributes = new Map();
    this.dataset = {};
    if (positionId != null) this.setAttribute('data-position-id', positionId);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'data-position-id') this.dataset.positionId = String(value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'data-position-id') delete this.dataset.positionId;
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
}

function projectedBoard(overrides = {}) {
  return {
    schema: 'gameroad.battle-board-visual-explanation.v1',
    ok: true,
    clear: false,
    reason: null,
    rolesByPosition: {
      'C:0:0': ['current', 'path'],
      'L:1:0': ['reachable', 'path'],
      'L:2:0': ['selected', 'reachable', 'path', 'threat', 'partner-recommendation'],
      'L:3:0': ['threat', 'forecast'],
    },
    recommendation: {
      active: true,
      clear: false,
      targetId: 'L:2:0',
      presentationRole: 'partner-recommendation',
      autoExecute: false,
    },
    ...overrides,
  };
}

function view(overrides = {}) {
  return { phase: 'planning', infoOpen: false, rangeOpen: false, adviceOpen: false, ...overrides };
}

function mountFixture(ids = ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0']) {
  const root = new FakeElement();
  root.setAttribute('data-foreign-root', 'keep');
  const nodes = ids.map((id) => {
    const node = new FakeElement(id);
    node.setAttribute('data-foreign-node', `keep:${id}`);
    return node;
  });
  return { root, nodes, mount: createBattleCorePresentationMount({ root, positionElements: () => nodes }) };
}

test('DOM projection preserves overlapping rules roles and Partner recommendation authority', () => {
  const out = projectBattleCorePresentationState({
    boardProjection: projectedBoard(),
    viewState: view(),
    availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0'],
  });
  assert.equal(out.schema, BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA);
  assert.equal(out.ok, true);
  assert.deepEqual(out.positions['L:2:0'].roles, ['selected', 'reachable', 'path', 'threat', 'partner-recommendation']);
  assert.deepEqual(out.positions['L:2:0'].ruleRoles, ['selected', 'reachable', 'path', 'threat']);
  assert.equal(out.positions['L:2:0'].authority, 'mixed');
  assert.equal(out.recommendation.targetId, 'L:2:0');
});

test('DOM projection fails closed when a rules-derived position is not mounted', () => {
  const out = projectBattleCorePresentationState({
    boardProjection: projectedBoard(),
    viewState: view(),
    availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0'],
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'RULE_POSITION_UNMAPPED');
  assert.deepEqual(out.missingRulePositionIds, ['L:3:0']);
  assert.deepEqual(out.positions, {});
});

test('unmapped Partner target clears only recommendation and preserves rules roles', () => {
  const board = projectedBoard({
    rolesByPosition: {
      'C:0:0': ['current'],
      'L:1:0': ['reachable'],
      'R:9:9': ['partner-recommendation'],
    },
    recommendation: {
      active: true,
      clear: false,
      targetId: 'R:9:9',
      presentationRole: 'partner-recommendation',
      autoExecute: false,
    },
  });
  const out = projectBattleCorePresentationState({
    boardProjection: board,
    viewState: view({ adviceOpen: true }),
    availablePositionIds: ['C:0:0', 'L:1:0'],
  });
  assert.equal(out.ok, true);
  assert.equal(out.recommendation.active, false);
  assert.equal(out.recommendation.clearReason, 'RECOMMENDATION_TARGET_UNMAPPED');
  assert.deepEqual(out.positions['C:0:0'].roles, ['current']);
  assert.deepEqual(out.positions['L:1:0'].roles, ['reachable']);
});

test('stale board clears previously mounted semantic attributes', () => {
  const { root, nodes, mount } = mountFixture();
  assert.equal(mount.render({ boardProjection: projectedBoard(), viewState: view() }).ok, true);
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-recommendation'), 'active');
  const stale = mount.render({
    boardProjection: { ...projectedBoard(), ok: false, clear: true, reason: 'STALE_BOARD_STATE', rolesByPosition: {} },
    viewState: view(),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'STALE_BOARD_STATE');
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), null);
  for (const node of nodes) assert.equal(node.getAttribute('data-gmr-battle-core-roles'), null);
});

test('mount exposes Planning/Info/Range/Advice state without touching foreign attributes', () => {
  const { root, nodes, mount } = mountFixture();
  const out = mount.render({ boardProjection: projectedBoard(), viewState: view({ infoOpen: true, rangeOpen: true, adviceOpen: true }) });
  assert.equal(out.ok, true);
  assert.equal(root.getAttribute('data-gmr-battle-core-phase'), 'planning');
  assert.equal(root.getAttribute('data-gmr-battle-core-info'), 'open');
  assert.equal(root.getAttribute('data-gmr-battle-core-range'), 'open');
  assert.equal(root.getAttribute('data-gmr-battle-core-advice'), 'open');
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-authority'), 'mixed');
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-rule-roles'), 'selected reachable path threat');
  assert.equal(root.getAttribute('data-foreign-root'), 'keep');
  assert.equal(nodes[2].getAttribute('data-foreign-node'), 'keep:L:2:0');
});

test('rerender removes stale owned roles while preserving new state', () => {
  const { nodes, mount } = mountFixture();
  mount.render({ boardProjection: projectedBoard(), viewState: view() });
  assert.notEqual(nodes[3].getAttribute('data-gmr-battle-core-roles'), null);
  const next = projectedBoard({
    rolesByPosition: { 'C:0:0': ['current'] },
    recommendation: { active: false, clear: true },
  });
  const out = mount.render({ boardProjection: next, viewState: view({ phase: 'decision' }) });
  assert.equal(out.ok, true);
  assert.equal(nodes[3].getAttribute('data-gmr-battle-core-roles'), null);
  assert.equal(nodes[0].getAttribute('data-gmr-battle-core-roles'), 'current');
});

test('duplicate DOM position identity fails closed', () => {
  const root = new FakeElement();
  const duplicate = [new FakeElement('C:0:0'), new FakeElement('C:0:0')];
  const mount = createBattleCorePresentationMount({ root, positionElements: duplicate });
  const out = mount.render({ boardProjection: projectedBoard(), viewState: view() });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'DUPLICATE_POSITION_NODE');
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), null);
});

test('invalid view state fails closed instead of guessing UI state', () => {
  for (const invalid of [null, {}, { phase: 'Plan ning' }, { phase: 'planning', infoOpen: 'yes' }]) {
    const out = projectBattleCorePresentationState({
      boardProjection: projectedBoard(),
      viewState: invalid,
      availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0'],
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'INVALID_VIEW_STATE');
  }
});

test('Partner contract mismatch cannot become rules-derived or auto-execute', () => {
  const out = projectBattleCorePresentationState({
    boardProjection: projectedBoard({
      recommendation: { ...projectedBoard().recommendation, autoExecute: true },
    }),
    viewState: view(),
    availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0'],
  });
  assert.equal(out.ok, true);
  assert.equal(out.recommendation.active, false);
  assert.equal(out.recommendation.clearReason, 'RECOMMENDATION_CONTRACT_MISMATCH');
  assert.deepEqual(out.positions['L:2:0'].roles, ['selected', 'reachable', 'path', 'threat']);
});

test('destroy is idempotent and future render fails closed', () => {
  const { root, nodes, mount } = mountFixture();
  assert.equal(mount.render({ boardProjection: projectedBoard(), viewState: view() }).ok, true);
  assert.equal(mount.destroy(), true);
  assert.equal(mount.destroy(), false);
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), null);
  for (const node of nodes) assert.equal(node.getAttribute('data-gmr-battle-core-roles'), null);
  const out = mount.render({ boardProjection: projectedBoard(), viewState: view() });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'MOUNT_DESTROYED');
});
