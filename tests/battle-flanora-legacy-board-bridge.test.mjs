import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFlanoraBoardSurface } from '../browser/new-base-flanora-board-surface-runtime.mjs';
import {
  FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT,
  createFlanoraLegacyBoardBridge,
} from '../browser/battle-flanora-legacy-board-bridge.mjs';

const INPUT = Object.freeze({
  participantIds: ['P1', 'P2', 'P3', 'P4'],
  horizontalCellCount: 12,
  shieldLinkedLaneColumnsByParticipant: {
    P1: [0, 1, 2], P2: [3, 4, 5], P3: [6, 7, 8], P4: [9, 10, 11],
  },
});

function makeFakeDom() {
  const byId = new Map();
  const documentLike = {
    createElement(tagName) {
      const attrs = new Map();
      const node = {
        tagName, parentNode: null, children: [], dataset: {}, style: {}, className: '', textContent: '',
        appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) byId.set(child.id, child); return child; },
        removeChild(child) { this.children = this.children.filter((x) => x !== child); child.parentNode = null; return child; },
        remove() { if (this.parentNode) this.parentNode.removeChild(this); },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.get(name) ?? null; },
        removeAttribute(name) { attrs.delete(name); },
      };
      Object.defineProperty(node, 'id', {
        get() { return this._id ?? ''; },
        set(value) { this._id = value; if (value) byId.set(value, this); },
      });
      return node;
    },
    getElementById(id) { return byId.get(id) ?? null; },
  };
  documentLike.head = documentLike.createElement('head');
  return documentLike;
}

function makeRuntime() {
  const documentLike = makeFakeDom();
  const host = documentLike.createElement('div');
  return mountFlanoraBoardSurface({ host, documentLike, layoutInput: INPUT });
}

const BINDINGS = Object.freeze([
  { authorityPositionId: 'legacy-clearing-a', surfaceRef: { kind: 'clearing', cellId: 'clearing:top:1' } },
  { authorityPositionId: 'legacy-shield-a', surfaceRef: { kind: 'shield', participantId: 'P1', laneIndex: 1 } },
  { authorityPositionId: 'legacy-road-a', surfaceRef: { kind: 'road', participantId: 'P1', laneIndex: 1, roadIndex: 3 } },
  { authorityPositionId: 'legacy-goal-a', surfaceRef: { kind: 'goal', participantId: 'P1', laneIndex: 1 } },
]);

test('resolves caller-owned authority identities onto existing Flanora surface hooks without becoming movement authority', () => {
  const runtime = makeRuntime();
  const bridge = createFlanoraLegacyBoardBridge({ surfaceRuntime: runtime, bindings: BINDINGS });
  assert.equal(bridge.bindingCount, 4);
  assert.equal(bridge.resolvePosition('legacy-clearing-a'), runtime.resolveClearingCell('clearing:top:1'));
  assert.equal(bridge.resolvePosition('legacy-shield-a'), runtime.resolveShield('P1', 1));
  assert.equal(bridge.resolvePosition('legacy-road-a'), runtime.resolveRoadStep('P1', 1, 3));
  assert.equal(bridge.resolvePosition('legacy-goal-a'), runtime.resolveGoal('P1', 1));
  assert.equal(bridge.resolvePosition('unknown'), null);
  assert.equal(bridge.gameplayAuthority, false);
  assert.equal(bridge.gameStateWrite, false);
  assert.equal(bridge.movementAuthority, false);
  assert.equal(bridge.legalityAuthority, false);
  assert.equal(bridge.targetCalculation, false);
});

test('projects reachable, selected and Advice recommendation roles only after complete caller-owned binding coverage', () => {
  const runtime = makeRuntime();
  const bridge = createFlanoraLegacyBoardBridge({ surfaceRuntime: runtime, bindings: BINDINGS });
  const projection = bridge.applyAuthoritySnapshot({
    validPositionIds: BINDINGS.map((row) => row.authorityPositionId),
    reachablePositionIds: ['legacy-clearing-a', 'legacy-shield-a'],
    selectedPositionId: 'legacy-shield-a',
    partnerRecommendationPositionId: 'legacy-road-a',
  });
  assert.equal(projection.ok, true);
  assert.equal(bridge.resolvePosition('legacy-clearing-a').getAttribute('data-flanora-authority-roles'), 'reachable');
  assert.equal(bridge.resolvePosition('legacy-shield-a').getAttribute('data-flanora-authority-roles'), 'reachable selected');
  assert.equal(bridge.resolvePosition('legacy-road-a').getAttribute('data-flanora-authority-roles'), 'partner-recommendation');
  assert.equal(bridge.resolvePosition('legacy-goal-a').getAttribute('data-flanora-authority-roles'), null);
});

test('fails closed and clears stale presentation roles when the authoritative position set is not fully mapped', () => {
  const runtime = makeRuntime();
  const bridge = createFlanoraLegacyBoardBridge({ surfaceRuntime: runtime, bindings: BINDINGS });
  bridge.applyAuthoritySnapshot({
    validPositionIds: BINDINGS.map((row) => row.authorityPositionId),
    reachablePositionIds: ['legacy-clearing-a'],
  });
  assert.equal(bridge.resolvePosition('legacy-clearing-a').getAttribute('data-flanora-authority-roles'), 'reachable');

  const result = bridge.applyAuthoritySnapshot({
    validPositionIds: [...BINDINGS.map((row) => row.authorityPositionId), 'legacy-unmapped'],
    reachablePositionIds: ['legacy-unmapped'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FLANORA_POSITION_BINDING_INCOMPLETE');
  assert.deepEqual(result.unmappedPositionIds, ['legacy-unmapped']);
  assert.equal(bridge.resolvePosition('legacy-clearing-a').getAttribute('data-flanora-authority-roles'), null);
});

test('rejects malformed or non-authoritative snapshots rather than inventing target or movement semantics', () => {
  const runtime = makeRuntime();
  const bridge = createFlanoraLegacyBoardBridge({ surfaceRuntime: runtime, bindings: BINDINGS });
  assert.equal(bridge.projectAuthoritySnapshot({
    validPositionIds: ['legacy-clearing-a'],
    reachablePositionIds: ['legacy-road-a'],
  }).reason, 'FLANORA_REACHABLE_NOT_VALID');
  assert.equal(bridge.projectAuthoritySnapshot({
    validPositionIds: ['legacy-clearing-a'],
    selectedPositionId: 'legacy-road-a',
  }).reason, 'FLANORA_SELECTED_NOT_VALID');
  assert.equal(bridge.projectAuthoritySnapshot({
    validPositionIds: ['legacy-clearing-a'],
    partnerRecommendationPositionId: 'legacy-road-a',
  }).reason, 'FLANORA_PARTNER_NOT_VALID');
});

test('requires resolvable explicit surface refs and never folds controlled character or Advice Partner ownership into the bridge', () => {
  const runtime = makeRuntime();
  assert.throws(() => createFlanoraLegacyBoardBridge({
    surfaceRuntime: runtime,
    bindings: [{ authorityPositionId: 'bad', surfaceRef: { kind: 'clearing', cellId: 'missing' } }],
  }), /SURFACE_TARGET_UNRESOLVED/);
  assert.throws(() => createFlanoraLegacyBoardBridge({ surfaceRuntime: runtime, bindings: [] }), /POSITION_BINDINGS_REQUIRED/);
  assert.equal(FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT.requiresCallerOwnedPositionBindings, true);
  assert.equal(FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT.unknownPositionPolicy, 'FAIL_CLOSED');
  assert.equal(FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT.replacesLegacyBoardAuthority, false);
  assert.equal(FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT.controlledCharacterOwnedElsewhere, true);
  assert.equal(FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT.advicePartnerOwnedElsewhere, true);
  assert.equal(FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT.optionalDiceOrRouletteIncluded, false);
});
