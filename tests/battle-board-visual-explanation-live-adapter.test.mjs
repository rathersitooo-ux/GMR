import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleBoardVisualExplanationLiveAdapter,
  BATTLE_BOARD_RULE_ROLE_ATTRIBUTES,
  BATTLE_BOARD_VISUAL_EXPLANATION_LIVE_ADAPTER_SCHEMA,
} from '../browser/battle-board-visual-explanation-live-adapter.mjs';

class FakeElement {
  constructor(seed = {}) {
    this.attrs = new Map(Object.entries(seed));
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
}

const RULE_AUTHORITY = Object.freeze({
  current: 'rules-derived',
  selected: 'rules-derived',
  reachable: 'rules-derived',
  path: 'rules-derived',
  undo: 'rules-derived',
  threat: 'rules-derived',
  forecast: 'rules-derived',
  honey: 'rules-derived',
  'honey-collectable': 'rules-derived',
  target: 'rules-derived',
  'win-frontier': 'rules-derived',
  invalid: 'rules-derived',
  'position-kind': 'rules-derived',
  'invalid-reason': 'rules-derived',
  'partner-recommendation': 'partner-heuristic',
});

function projection(overrides = {}) {
  return {
    schema: 'gameroad.battle-board-visual-explanation.v1',
    ok: true,
    clear: false,
    reason: null,
    rolesByPosition: {
      P1: ['selected', 'target', 'partner-recommendation'],
      P2: ['reachable', 'invalid'],
      P3: ['partner-recommendation'],
    },
    annotations: {
      positionKindByPosition: { P2: 'road' },
      targetKindByPosition: { P1: 'shield' },
      invalidReasonByPosition: { P2: 'TARGET_BLOCKED' },
    },
    recommendation: {
      active: true,
      clear: false,
      targetId: 'P3',
      candidateId: 'card-17',
      presentationRole: 'partner-recommendation',
      authority: 'partner-heuristic',
      autoExecute: false,
    },
    authorityByRole: RULE_AUTHORITY,
    ...overrides,
  };
}

function fixture() {
  const elements = new Map([
    ['P1', new FakeElement()],
    ['P2', new FakeElement()],
    ['P3', new FakeElement({ 'data-gmr-partner-recommendation': 'existing-partner-owner' })],
  ]);
  const adapter = createBattleBoardVisualExplanationLiveAdapter({
    resolveElementByPositionId: (positionId) => elements.get(positionId) ?? null,
  });
  return { elements, adapter };
}

test('projects rules-derived selection/target/reachable/invalid roles and annotations', () => {
  const { elements, adapter } = fixture();
  const out = adapter.apply(projection());

  assert.equal(out.schema, BATTLE_BOARD_VISUAL_EXPLANATION_LIVE_ADAPTER_SCHEMA);
  assert.equal(out.ok, true);
  assert.deepEqual(out.appliedPositionIds, ['P1', 'P2']);
  assert.deepEqual(out.missingPositionIds, []);

  const p1 = elements.get('P1');
  assert.equal(p1.getAttribute('data-gmr-board-roles'), 'selected target');
  assert.equal(p1.getAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.selected), 'true');
  assert.equal(p1.getAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.target), 'true');
  assert.equal(p1.getAttribute('data-gmr-board-target-kind'), 'shield');

  const p2 = elements.get('P2');
  assert.equal(p2.getAttribute('data-gmr-board-roles'), 'reachable invalid');
  assert.equal(p2.getAttribute('data-gmr-board-position-kind'), 'road');
  assert.equal(p2.getAttribute('data-gmr-board-invalid-reason'), 'TARGET_BLOCKED');
});

test('projects Honey presence/collectable separately and clears both without residue', () => {
  const { elements, adapter } = fixture();
  const emptyAnnotations = {
    positionKindByPosition: {},
    targetKindByPosition: {},
    invalidReasonByPosition: {},
  };

  const first = adapter.apply(projection({
    rolesByPosition: {
      P1: ['honey'],
      P2: ['honey', 'honey-collectable'],
    },
    annotations: emptyAnnotations,
    recommendation: { active: false, clear: true },
  }));

  assert.deepEqual(first.appliedPositionIds, ['P1', 'P2']);
  assert.equal(elements.get('P1').getAttribute('data-gmr-board-roles'), 'honey');
  assert.equal(elements.get('P1').getAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.honey), 'true');
  assert.equal(elements.get('P1').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES['honey-collectable']), false);
  assert.equal(elements.get('P2').getAttribute('data-gmr-board-roles'), 'honey honey-collectable');
  assert.equal(elements.get('P2').getAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.honey), 'true');
  assert.equal(elements.get('P2').getAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES['honey-collectable']), 'true');

  const next = adapter.apply(projection({
    rolesByPosition: { P1: ['current'] },
    annotations: emptyAnnotations,
    recommendation: { active: false, clear: true },
  }));

  assert.equal(next.clearedCount, 2);
  assert.equal(elements.get('P1').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.honey), false);
  assert.equal(elements.get('P1').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES['honey-collectable']), false);
  assert.equal(elements.get('P2').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.honey), false);
  assert.equal(elements.get('P2').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES['honey-collectable']), false);

  adapter.apply(projection({
    rolesByPosition: { P2: ['honey', 'honey-collectable'] },
    annotations: emptyAnnotations,
    recommendation: { active: false, clear: true },
  }));
  const stale = adapter.apply(projection({ ok: false, clear: true, reason: 'STALE_BOARD_STATE' }));

  assert.equal(stale.clearedCount, 1);
  assert.equal(elements.get('P2').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.honey), false);
  assert.equal(elements.get('P2').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES['honey-collectable']), false);
});

test('keeps Partner recommendation separate from rules DOM ownership', () => {
  const { elements, adapter } = fixture();
  const out = adapter.apply(projection());

  assert.deepEqual(out.partnerRecommendation, {
    targetId: 'P3',
    candidateId: 'card-17',
    presentationRole: 'partner-recommendation',
    authority: 'partner-heuristic',
    autoExecute: false,
  });
  assert.equal(elements.get('P1').hasAttribute('data-gmr-board-partner-recommendation'), false);
  assert.equal(elements.get('P3').getAttribute('data-gmr-partner-recommendation'), 'existing-partner-owner');
  assert.equal(elements.get('P3').hasAttribute('data-gmr-board-roles'), false);
});

test('next projection removes stale rule attributes before applying new state', () => {
  const { elements, adapter } = fixture();
  adapter.apply(projection());

  const out = adapter.apply(projection({
    rolesByPosition: { P2: ['current'] },
    annotations: {
      positionKindByPosition: {},
      targetKindByPosition: {},
      invalidReasonByPosition: {},
    },
    recommendation: { active: false, clear: true },
  }));

  assert.equal(out.clearedCount, 2);
  assert.equal(elements.get('P1').hasAttribute('data-gmr-board-roles'), false);
  assert.equal(elements.get('P1').hasAttribute('data-gmr-board-target-kind'), false);
  assert.equal(elements.get('P2').getAttribute('data-gmr-board-roles'), 'current');
  assert.equal(elements.get('P2').hasAttribute('data-gmr-board-invalid-reason'), false);
});

test('cleared/stale projection fail-closes previously applied rule presentation', () => {
  const { elements, adapter } = fixture();
  adapter.apply(projection());
  const out = adapter.apply(projection({ ok: false, clear: true, reason: 'STALE_BOARD_STATE' }));

  assert.equal(out.ok, false);
  assert.equal(out.clear, true);
  assert.equal(out.reason, 'STALE_BOARD_STATE');
  assert.equal(out.clearedCount, 2);
  assert.equal(elements.get('P1').hasAttribute('data-gmr-board-roles'), false);
  assert.equal(elements.get('P2').hasAttribute('data-gmr-board-roles'), false);
  assert.equal(elements.get('P3').getAttribute('data-gmr-partner-recommendation'), 'existing-partner-owner');
});

test('missing DOM position is reported without inventing or remapping a target', () => {
  const { adapter } = fixture();
  const out = adapter.apply(projection({
    rolesByPosition: { P4: ['target'] },
    annotations: {
      positionKindByPosition: {},
      targetKindByPosition: { P4: 'attack' },
      invalidReasonByPosition: {},
    },
    recommendation: { active: false, clear: true },
  }));

  assert.deepEqual(out.appliedPositionIds, []);
  assert.deepEqual(out.missingPositionIds, ['P4']);
});

test('authority separation filters a role that is not rules-derived', () => {
  const { elements, adapter } = fixture();
  const out = adapter.apply(projection({
    rolesByPosition: { P1: ['selected', 'target'] },
    annotations: {
      positionKindByPosition: {},
      targetKindByPosition: {},
      invalidReasonByPosition: {},
    },
    authorityByRole: { ...RULE_AUTHORITY, selected: 'partner-heuristic' },
    recommendation: { active: false, clear: true },
  }));

  assert.equal(out.ok, true);
  assert.equal(elements.get('P1').getAttribute('data-gmr-board-roles'), 'target');
  assert.equal(elements.get('P1').hasAttribute(BATTLE_BOARD_RULE_ROLE_ATTRIBUTES.selected), false);
});

test('destroy clears only adapter-owned rules attributes', () => {
  const { elements, adapter } = fixture();
  adapter.apply(projection());
  const out = adapter.destroy();

  assert.equal(out.clear, true);
  assert.equal(out.reason, 'destroyed');
  assert.equal(elements.get('P1').hasAttribute('data-gmr-board-roles'), false);
  assert.equal(elements.get('P2').hasAttribute('data-gmr-board-roles'), false);
  assert.equal(elements.get('P3').getAttribute('data-gmr-partner-recommendation'), 'existing-partner-owner');
});

test('rejects unsupported projections and invalid resolved elements', () => {
  const { adapter } = fixture();
  assert.throws(() => adapter.apply({ schema: 'wrong' }), /unsupported board projection schema/);

  const broken = createBattleBoardVisualExplanationLiveAdapter({
    resolveElementByPositionId: () => ({}),
  });
  assert.throws(
    () => broken.apply(projection({ rolesByPosition: { P1: ['selected'] }, annotations: {} })),
    /must support setAttribute\/removeAttribute/,
  );
});
