import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
  createBattleCorePresentationMount,
  projectBattleCorePresentationState,
} from '../browser/battle-core-presentation-mount.mjs';

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

const BOARD_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';

function board(overrides = {}) {
  return {
    schema: BOARD_SCHEMA,
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

function fixture(ids = ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0']) {
  const root = new FakeElement();
  root.setAttribute('data-foreign-root', 'keep');
  const nodes = ids.map((id) => {
    const node = new FakeElement(id);
    node.setAttribute('data-foreign-node', `keep:${id}`);
    return node;
  });
  return { root, nodes, mount: createBattleCorePresentationMount({ root, positionElements: () => nodes }) };
}

test('projects overlapping rules roles and Partner recommendation without collapsing authority', () => {
  const out = projectBattleCorePresentationState({
    boardProjection: board(),
    viewState: view(),
    availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0'],
  });
  assert.equal(out.schema, BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA);
  assert.equal(out.ok, true);
  assert.deepEqual(out.positions['L:2:0'].roles, ['selected', 'reachable', 'path', 'threat', 'partner-recommendation']);
  assert.deepEqual(out.positions['L:2:0'].ruleRoles, ['selected', 'reachable', 'path', 'threat']);
  assert.equal(out.positions['L:2:0'].authority, 'mixed');
  assert.equal(out.recommendation.active, true);
  assert.equal(out.recommendation.targetId, 'L:2:0');
});

test('missing rules-derived position fails the whole presentation projection closed', () => {
  const out = projectBattleCorePresentationState({
    boardProjection: board(),
    viewState: view(),
    availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0'],
  });
  assert.equal(out.ok, false);
  assert.equal(out.clear, true);
  assert.equal(out.reason, 'RULE_POSITION_UNMAPPED');
  assert.deepEqual(out.missingRulePositionIds, ['L:3:0']);
  assert.deepEqual(out.positions, {});
});

test('missing Partner recommendation target clears only recommendation while rules stay active', () => {
  const projection = board({
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
    boardProjection: projection,
    viewState: view({ adviceOpen: true }),
    availablePositionIds: ['C:0:0', 'L:1:0'],
  });
  assert.equal(out.ok, true);
  assert.equal(out.recommendation.active, false);
  assert.equal(out.recommendation.clearReason, 'RECOMMENDATION_TARGET_UNMAPPED');
  assert.deepEqual(out.positions['C:0:0'].roles, ['current']);
  assert.deepEqual(out.positions['L:1:0'].roles, ['reachable']);
});

test('stale or failed board projection clears the mount instead of preserving stale roles', () => {
  const { root, nodes, mount } = fixture();
  assert.equal(mount.render({ boardProjection: board(), viewState: view() }).ok, true);
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-recommendation'), 'active');

  const stale = mount.render({
    boardProjection: { ...board(), ok: false, clear: true, reason: 'STALE_BOARD_STATE', rolesByPosition: {} },
    viewState: view(),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'STALE_BOARD_STATE');
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), null);
  for (const node of nodes) assert.equal(node.getAttribute('data-gmr-battle-core-roles'), null);
});

test('DOM mount publishes only owned semantic attributes and preserves foreign attributes', () => {
  const { root, nodes, mount } = fixture();
  const out = mount.render({ boardProjection: board(), viewState: view({ infoOpen: true, rangeOpen: true, adviceOpen: true }) });
  assert.equal(out.ok, true);
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), 'true');
  assert.equal(root.getAttribute('data-gmr-battle-core-phase'), 'planning');
  assert.equal(root.getAttribute('data-gmr-battle-core-info'), 'open');
  assert.equal(root.getAttribute('data-gmr-battle-core-range'), 'open');
  assert.equal(root.getAttribute('data-gmr-battle-core-advice'), 'open');
  assert.equal(root.getAttribute('data-gmr-battle-core-recommendation'), 'active');
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-authority'), 'mixed');
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-rule-roles'), 'selected reachable path threat');
  assert.equal(nodes[2].getAttribute('data-gmr-battle-core-roles'), 'selected reachable path threat partner-recommendation');
  assert.equal(root.getAttribute('data-foreign-root'), 'keep');
  assert.equal(nodes[2].getAttribute('data-foreign-node'), 'keep:L:2:0');
});

test('rerender removes previously-owned stale role attributes', () => {
  const { nodes, mount } = fixture();
  mount.render({ boardProjection: board(), viewState: view() });
  assert.notEqual(nodes[3].getAttribute('data-gmr-battle-core-roles'), null);

  const next = board({
    rolesByPosition: { 'C:0:0': ['current'] },
    recommendation: { active: false, clear: true },
  });
  const out = mount.render({ boardProjection: next, viewState: view({ phase: 'decision' }) });
  assert.equal(out.ok, true);
  assert.equal(nodes[3].getAttribute('data-gmr-battle-core-roles'), null);
  assert.equal(nodes[0].getAttribute('data-gmr-battle-core-roles'), 'current');
});

test('duplicate or invalid DOM position identity fails closed', () => {
  const root = new FakeElement();
  const duplicate = [new FakeElement('C:0:0'), new FakeElement('C:0:0')];
  const mount = createBattleCorePresentationMount({ root, positionElements: duplicate });
  const out = mount.render({ boardProjection: board(), viewState: view() });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'DUPLICATE_POSITION_NODE');
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), null);
});

test('invalid presentation view fails closed and does not guess UI state', () => {
  for (const invalid of [null, {}, { phase: 'Plan ning' }, { phase: 'planning', infoOpen: 'yes' }]) {
    const out = projectBattleCorePresentationState({
      boardProjection: board(),
      viewState: invalid,
      availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0'],
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'INVALID_VIEW_STATE');
  }
});

test('Partner contract mismatch never becomes a rules-derived state', () => {
  const malformed = board({
    recommendation: { ...board().recommendation, autoExecute: true },
  });
  const out = projectBattleCorePresentationState({
    boardProjection: malformed,
    viewState: view(),
    availablePositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0'],
  });
  assert.equal(out.ok, true);
  assert.equal(out.recommendation.active, false);
  assert.equal(out.recommendation.clearReason, 'RECOMMENDATION_CONTRACT_MISMATCH');
  assert.deepEqual(out.positions['L:2:0'].roles, ['selected', 'reachable', 'path', 'threat']);
});

test('destroy is idempotent, clears owned attributes, and preserves unrelated attributes', () => {
  const { root, nodes, mount } = fixture();
  mount.render({ boardProjection: board(), viewState: view() });
  assert.equal(mount.destroy(), true);
  assert.equal(mount.destroy(), false);
  assert.equal(mount.isDestroyed(), true);
  assert.equal(root.getAttribute('data-gmr-battle-core-mounted'), null);
  assert.equal(root.getAttribute('data-foreign-root'), 'keep');
  for (const node of nodes) {
    assert.equal(node.getAttribute('data-gmr-battle-core-roles'), null);
    assert.match(node.getAttribute('data-foreign-node'), /^keep:/);
  }
  assert.equal(mount.render({ boardProjection: board(), viewState: view() }).reason, 'MOUNT_DESTROYED');
});

test('presentation projection does not require a 17x17 logical grid or invent unprojected positions', () => {
  const minimal = board({
    rolesByPosition: { 'only-logical-position': ['current'] },
    recommendation: { active: false, clear: true },
  });
  const out = projectBattleCorePresentationState({
    boardProjection: minimal,
    viewState: view(),
    availablePositionIds: ['only-logical-position'],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(Object.keys(out.positions), ['only-logical-position']);
});
