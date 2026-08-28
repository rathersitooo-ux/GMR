import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODEX_BROWSER_BRIDGE_STATUS,
  prepareLunaSolCodexDispatch,
} from '../tools/luna-sol-codex-browser-bridge.mjs';

function queue(overrides = {}) {
  return {
    schemaVersion: 'gameroad-executor-bus-v1',
    kind: 'queue',
    taskId: 'task-codex-local-gate',
    workUnitKey: 'unit-codex-local-gate',
    acquireKey: 'acquire-codex-local-gate',
    baseRef: 'main@abc',
    exactMutableResources: ['tools/example.mjs'],
    doNotChange: ['protected/**'],
    userEndState: 'Resolve the bounded local task safely.',
    realOutputTarget: 'One bounded local implementation attempt.',
    acceptance: ['scope remains exact', 'local mutation authority is explicit'],
    resumeCondition: 'Resume only under the same acquire identity.',
    executorCapabilityHint: 'local bounded execution',
    ...overrides,
  };
}

const localRouterInput = {
  acceptanceKnown: true,
  rootCauseKnown: true,
  implementationRisk: 'LOW',
  reversibility: 'EASY',
};

test('valid local route returns canonical bounded queue before mutation permission', () => {
  const source = queue();
  const result = prepareLunaSolCodexDispatch({
    queuePacket: source,
    routerInput: localRouterInput,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.LOCAL_EXECUTE);
  assert.equal(result.mayMutate, true);
  assert.equal(result.queuePacket.acquireKey, source.acquireKey);
  assert.deepEqual(result.queuePacket.exactMutableResources, source.exactMutableResources);
});

test('local route without queue fails closed and cannot grant mutation permission', () => {
  const result = prepareLunaSolCodexDispatch({
    routerInput: localRouterInput,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.PACKET_REJECTED);
  assert.equal(result.reason, 'local_mutation_queue_required');
  assert.equal(result.mayMutate, false);
});

test('malformed local queue fails closed before mutation permission', () => {
  const result = prepareLunaSolCodexDispatch({
    queuePacket: queue({ exactMutableResources: [] }),
    routerInput: localRouterInput,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.PACKET_REJECTED);
  assert.match(result.reason, /^queue_/);
  assert.equal(result.mayMutate, false);
});
