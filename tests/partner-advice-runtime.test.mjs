import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_ADVICE_RUNTIME_SCHEMA,
  recommendApprovedRuntimeAction,
  selectRuntimeOrHeuristicAdvice,
} from '../browser/partner-advice-runtime.mjs';
import { recommendFromRuntimeManifest } from '../tools/advice-collective-eval.mjs';

const versions = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });
const state = Object.freeze({ phase: 'plan', turnBand: 'early', pressureBand: 'low', manaBand: 'mid', handBand: 'three' });
const fingerprint = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=plan|turnBand=early|pressureBand=low|manaBand=mid|handBand=three';

function approvedManifest(overrides = {}) {
  return {
    schema: PARTNER_ADVICE_RUNTIME_SCHEMA,
    targetVersions: { ...versions },
    approval: {
      gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
      approvalId: 'approval-1',
      humanGate: 'approved',
      privacyScope: 'shared',
    },
    promotionSafe: true,
    defaultActionId: 'fallback-action',
    minContextSupport: 8,
    contexts: [{ fingerprint, actionId: 'context-action', support: 12 }],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    livePlayerPerformanceProven: false,
    ...overrides,
  };
}

test('Browser consumer matches the existing approved-manifest recommendation contract', () => {
  const manifest = approvedManifest();
  const browserResult = recommendApprovedRuntimeAction(manifest, state, versions);
  const formalResult = recommendFromRuntimeManifest(manifest, state, versions);
  assert.deepEqual(browserResult, formalResult);
  assert.equal(browserResult.actionId, 'context-action');
  assert.equal(browserResult.source, 'approved-similar-situation');
});

test('approved global fallback is used when no exact context exists', () => {
  const manifest = approvedManifest({ contexts: [] });
  const result = recommendApprovedRuntimeAction(manifest, state, versions);
  assert.equal(result.actionId, 'fallback-action');
  assert.equal(result.source, 'approved-global-fallback');
});

test('version mismatch cannot consume an old approved manifest', () => {
  const result = selectRuntimeOrHeuristicAdvice({
    manifest: approvedManifest(),
    state,
    targetVersions: { ...versions, stateVersion: 'state-r2' },
    legalActionIds: ['context-action', 'heuristic-action'],
    heuristicActionId: 'heuristic-action',
  });
  assert.deepEqual(result, {
    actionId: 'heuristic-action',
    source: 'existing-heuristic-fallback',
    manifestUsed: false,
    fallbackReason: 'version-mismatch',
    fingerprint: null,
    support: 0,
  });
});

test('private or raw-event manifest is rejected and preserves the existing heuristic', () => {
  for (const manifest of [approvedManifest({ containsPrivate: true }), approvedManifest({ containsRawEvents: true })]) {
    const result = selectRuntimeOrHeuristicAdvice({
      manifest,
      state,
      targetVersions: versions,
      legalActionIds: ['heuristic-action'],
      heuristicActionId: 'heuristic-action',
    });
    assert.equal(result.actionId, 'heuristic-action');
    assert.equal(result.source, 'existing-heuristic-fallback');
    assert.equal(result.fallbackReason, 'privacy-not-runtime-safe');
  }
});

test('manifest recommendation cannot escape the current legal action set', () => {
  const result = selectRuntimeOrHeuristicAdvice({
    manifest: approvedManifest(),
    state,
    targetVersions: versions,
    legalActionIds: ['heuristic-action'],
    heuristicActionId: 'heuristic-action',
  });
  assert.equal(result.actionId, 'heuristic-action');
  assert.equal(result.manifestUsed, false);
  assert.equal(result.fallbackReason, 'manifest-action-not-currently-legal');
});

test('approved manifest wins only when its action is currently legal', () => {
  const result = selectRuntimeOrHeuristicAdvice({
    manifest: approvedManifest(),
    state,
    targetVersions: versions,
    legalActionIds: ['context-action', 'heuristic-action'],
    heuristicActionId: 'heuristic-action',
  });
  assert.equal(result.actionId, 'context-action');
  assert.equal(result.manifestUsed, true);
  assert.equal(result.source, 'approved-similar-situation');
  assert.equal(result.support, 12);
});

test('no legal fallback returns no action instead of inventing one', () => {
  const result = selectRuntimeOrHeuristicAdvice({
    manifest: approvedManifest({ containsPrivate: true }),
    state,
    targetVersions: versions,
    legalActionIds: [],
    heuristicActionId: 'heuristic-action',
  });
  assert.equal(result.actionId, null);
  assert.equal(result.source, 'no-safe-runtime-action');
  assert.equal(result.manifestUsed, false);
});
