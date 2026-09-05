import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectBattleBoardRuntimeAuthority,
  projectBattleBoardRuntimeExplanation,
  BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME,
} from '../browser/battle-board-visual-explanation-runtime-mount.mjs';

function boardNode(positionId, { reachable = false } = {}) {
  return {
    dataset: { pos: positionId },
    classList: { contains: (token) => token === 'reachable' && reachable },
  };
}

function fakeGlobal({ endpoint = '', adviceResult = null, isCurrent = true, resolveTarget = () => null } = {}) {
  const nodes = [
    boardNode('A'),
    boardNode('B', { reachable: true }),
    boardNode('C', { reachable: true }),
  ];
  return {
    document: {
      querySelectorAll(selector) {
        return selector === '#board .node[data-pos]' ? nodes : [];
      },
      getElementById(id) {
        return id === 'endpointText' ? { textContent: endpoint } : null;
      },
    },
    __GAMEROAD_BOARD_PARTNER_ADVICE_AUTHORITY__: adviceResult ? {
      getAdviceResult: () => adviceResult,
      isCurrent: () => isCurrent,
      resolveTarget,
    } : null,
  };
}

test('uses only existing board ids, reachable classes, and the current endpoint selection', () => {
  const authority = collectBattleBoardRuntimeAuthority(fakeGlobal({ endpoint: 'B' }));
  assert.deepEqual(authority.validPositionIds, ['A', 'B', 'C']);
  assert.deepEqual(authority.reachablePositionIds, ['B', 'C']);
  assert.equal(authority.selectedPositionId, 'B');

  const projection = projectBattleBoardRuntimeExplanation(authority);
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.channels.reachable, ['B', 'C']);
  assert.deepEqual(projection.channels.selected, ['B']);
  assert.deepEqual(projection.rolesByPosition.B, ['selected', 'reachable']);
  assert.equal(projection.authorityByRole.reachable, 'rules-derived');
});

test('partner emphasis is accepted only through explicit current public target authority', () => {
  const authority = collectBattleBoardRuntimeAuthority(fakeGlobal({
    endpoint: 'B',
    adviceResult: {
      ok: true,
      containsPrivate: false,
      selected: { candidateId: 'card-a' },
      source: 'shared-legal-action-core',
    },
    resolveTarget: (candidateId) => candidateId === 'card-a' ? { targetId: 'C' } : null,
  }));
  assert.equal(authority.partnerProjection.active, true);
  assert.equal(authority.partnerProjection.targetId, 'C');

  const projection = projectBattleBoardRuntimeExplanation(authority);
  assert.equal(projection.recommendation.active, true);
  assert.equal(projection.recommendation.targetId, 'C');
  assert.deepEqual(projection.rolesByPosition.C, ['reachable', 'partner-recommendation']);
  assert.equal(projection.recommendation.autoExecute, false);
});

test('unknown selection and private advice fail closed instead of inventing board meaning', () => {
  const authority = collectBattleBoardRuntimeAuthority(fakeGlobal({
    endpoint: 'NOT-A-POSITION',
    adviceResult: { ok: true, containsPrivate: true, selected: { candidateId: 'card-a' } },
    resolveTarget: () => ({ targetId: 'C' }),
  }));
  assert.equal(authority.selectedPositionId, null);
  assert.equal(authority.partnerProjection.active, false);
  assert.equal(authority.partnerProjection.reason, 'PUBLIC_SCOPE_UNVERIFIED');

  const projection = projectBattleBoardRuntimeExplanation(authority);
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.channels.selected, []);
  assert.equal(projection.recommendation.active, false);
  assert.equal(projection.rolesByPosition.A, undefined);
});

test('runtime contract is presentation-only with no topology inference or auto execution', () => {
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.presentationOnly, true);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.gameplayAuthority, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.topologyInference, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.automaticExecution, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.actualPositionSelector, '#board .node[data-pos]');
});
