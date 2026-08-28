import assert from 'node:assert/strict';
import test from 'node:test';

import { ROUTES, normalizeRouterInput, routeLunaSol } from '../tools/luna-sol-router-core.mjs';
import { routeExecutorQueue } from '../tools/luna-sol-router-runner.mjs';
import { SCHEMA_VERSION } from '../tools/executor-bus-packet.mjs';

const SAFE = Object.freeze({
  scopeBreadth: 'LOCAL',
  specConflict: false,
  materialUnknowns: false,
  requiresDesignDecision: false,
  implementationRisk: 'LOW',
  reversibility: 'EASY',
  acceptanceKnown: true,
  failureCount: 0,
  rootCauseKnown: true,
  transportAvailable: true,
  packetReady: true,
});

function queuePacket() {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'queue',
    taskId: 'OPS-AI-EXECUTION-CAPABILITY-DISCOVERY-001',
    workUnitKey: 'LUNA_SOL_ROUTER_R1',
    acquireKey: 'ACQUIRE-TEST',
    baseRef: 'main',
    exactMutableResources: ['tools/luna-sol-router-core.mjs'],
    doNotChange: ['.github/workflows/**'],
    userEndState: 'Choose local execution or Sol escalation deterministically.',
    realOutputTarget: 'A routing decision.',
    acceptance: ['Decision is deterministic and fail-closed.'],
    resumeCondition: 'Re-run after route prerequisites are restored.',
    executorCapabilityHint: 'local code executor',
  };
}

test('safe bounded work stays locally eligible but router grants no mutation authority', () => {
  const out = routeLunaSol(SAFE);
  assert.equal(out.route, ROUTES.LOCAL_EXECUTE);
  assert.equal(out.mayMutate, false);
  assert.equal(out.needsSol, false);
});

test('spec conflict routes to Sol precheck', () => {
  const out = routeLunaSol({ ...SAFE, specConflict: true });
  assert.equal(out.route, ROUTES.SOL_PRECHECK);
  assert.ok(out.reasonCodes.includes('SPEC_CONFLICT'));
  assert.equal(out.mayMutate, false);
});

test('cross-cutting unresolved work routes to Sol precheck', () => {
  const out = routeLunaSol({ ...SAFE, scopeBreadth: 'CROSS_CUTTING', rootCauseKnown: false });
  assert.equal(out.route, ROUTES.SOL_PRECHECK);
  assert.ok(out.reasonCodes.includes('CROSS_CUTTING_UNRESOLVED'));
});

test('irreversible unresolved work routes to Sol precheck', () => {
  const out = routeLunaSol({ ...SAFE, reversibility: 'IRREVERSIBLE', acceptanceKnown: false });
  assert.equal(out.route, ROUTES.SOL_PRECHECK);
  assert.ok(out.reasonCodes.includes('HIGH_CONSEQUENCE_UNRESOLVED'));
});

test('first uncertain failure routes to Sol failure requery', () => {
  const out = routeLunaSol({ ...SAFE, failureCount: 1, rootCauseKnown: false });
  assert.equal(out.route, ROUTES.SOL_FAILURE_REQUERY);
});

test('first known low-risk local repair is only eligible until evidence gate passes', () => {
  const out = routeLunaSol({ ...SAFE, failureCount: 1, rootCauseKnown: true });
  assert.equal(out.route, ROUTES.LOCAL_EXECUTE);
  assert.equal(out.mayMutate, false);
  assert.deepEqual(out.reasonCodes, ['KNOWN_LOCAL_REPAIR']);
});

test('low-risk unknown-cause work cannot gain mutation authority from routing alone', () => {
  const out = routeLunaSol({ ...SAFE, rootCauseKnown: false });
  assert.equal(out.route, ROUTES.LOCAL_EXECUTE);
  assert.equal(out.mayMutate, false);
  assert.deepEqual(out.reasonCodes, ['LOCAL_DECISION_SUFFICIENT']);
});

test('repeated same-class failures escalate to Sol', () => {
  const out = routeLunaSol({ ...SAFE, failureCount: 2 });
  assert.equal(out.route, ROUTES.SOL_ESCALATE);
});

test('explicit Sol override forces precheck', () => {
  const out = routeLunaSol({ ...SAFE, forceSol: true });
  assert.equal(out.route, ROUTES.SOL_PRECHECK);
  assert.ok(out.reasonCodes.includes('EXPLICIT_SOL_ESCALATION'));
});

test('capability block holds instead of pretending Sol can execute', () => {
  const out = routeLunaSol({ ...SAFE, capabilityBlocked: true });
  assert.equal(out.route, ROUTES.HOLD);
  assert.equal(out.needsSol, false);
  assert.deepEqual(out.reasonCodes, ['CAPABILITY_BLOCKED']);
});

test('human-only action holds', () => {
  const out = routeLunaSol({ ...SAFE, humanOnly: true });
  assert.equal(out.route, ROUTES.HOLD);
  assert.deepEqual(out.reasonCodes, ['HUMAN_ONLY_ACTION']);
});

test('Sol-required decision holds when transport is unavailable', () => {
  const out = routeLunaSol({ ...SAFE, specConflict: true, transportAvailable: false });
  assert.equal(out.route, ROUTES.HOLD);
  assert.equal(out.needsSol, true);
  assert.equal(out.intendedRoute, ROUTES.SOL_PRECHECK);
  assert.deepEqual(out.reasonCodes, ['SOL_REQUIRED_TRANSPORT_UNAVAILABLE']);
});

test('Sol-required decision holds when packet is not ready', () => {
  const out = routeLunaSol({ ...SAFE, forceSol: true, packetReady: false });
  assert.equal(out.route, ROUTES.HOLD);
  assert.equal(out.intendedRoute, ROUTES.SOL_PRECHECK);
  assert.deepEqual(out.reasonCodes, ['SOL_REQUIRED_PACKET_NOT_READY']);
});

test('transport unavailable does not block pure local eligibility', () => {
  const out = routeLunaSol({ ...SAFE, transportAvailable: false });
  assert.equal(out.route, ROUTES.LOCAL_EXECUTE);
  assert.equal(out.mayMutate, false);
});

test('normalization rejects invalid enums and failure counts', () => {
  assert.throws(() => normalizeRouterInput({ scopeBreadth: 'EVERYWHERE' }), /scopeBreadth_invalid/);
  assert.throws(() => normalizeRouterInput({ failureCount: -1 }), /failureCount_must_be_nonnegative_integer/);
});

test('executor-bus seam preserves queue identity but does not mint mutation authority', () => {
  const out = routeExecutorQueue({ action: 'luna-sol-route', queuePacket: queuePacket(), signals: SAFE });
  assert.equal(out.ok, true);
  assert.equal(out.taskId, queuePacket().taskId);
  assert.equal(out.workUnitKey, queuePacket().workUnitKey);
  assert.equal(out.acquireKey, queuePacket().acquireKey);
  assert.equal(out.decision.route, ROUTES.LOCAL_EXECUTE);
  assert.equal(out.decision.mayMutate, false);
});

test('executor-bus seam rejects unsupported action', () => {
  const out = routeExecutorQueue({ action: 'do-everything', queuePacket: queuePacket(), signals: SAFE });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'UNSUPPORTED_ACTION');
});
