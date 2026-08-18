import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPartnerAdviceReplayBridge,
  createPartnerAdviceRuntimeControl,
} from '../browser/partner-advice-runtime-mount.mjs';

const V = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });
const RUNTIME_STATE = Object.freeze({ phase: 'plan', turnBand: 'early', pressureBand: 'low', manaBand: 'mid', handBand: 'three' });
const FINGERPRINT = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=plan|turnBand=early|pressureBand=low|manaBand=mid|handBand=three';

function candidate(candidateId, positionOrder, comparisonValue, payload = { label: candidateId }) {
  return { candidateId, kind: 'card', positionOrder, comparisonValue, legal: true, publicScope: true, assetAction: 'NONE', payload };
}

function legacyReplay({ rule, candidates }) {
  const legal = candidates.filter((x) => x.legal !== false);
  const ordered = [...legal].sort((a, b) => {
    if (rule === 'left') return a.positionOrder - b.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'right') return b.positionOrder - a.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'max') return b.comparisonValue - a.comparisonValue || a.candidateId.localeCompare(b.candidateId);
    return a.comparisonValue - b.comparisonValue || a.candidateId.localeCompare(b.candidateId);
  });
  return { ok: true, selected: ordered[0] ?? null, ordered: ordered.map((x) => x.candidateId), source: 'legacy' };
}

test('missing formal version tuple keeps the exact legacy production path', () => {
  const rows = [candidate('b', 1, 5), candidate('a', 0, 3)];
  let calls = 0;
  const bridge = createPartnerAdviceReplayBridge({ legacyReplay: (input) => { calls++; return legacyReplay(input); } });
  const result = bridge(rows, 'left');
  assert.equal(calls, 1);
  assert.equal(result.source, 'legacy');
  assert.equal(result.selected.candidateId, 'a');
});

test('formal versions activate shared legal-action core without changing deterministic rule choice', () => {
  const rows = [candidate('b', 1, 5), candidate('a', 0, 3, { label: 'public-a' })];
  const bridge = createPartnerAdviceReplayBridge({ legacyReplay, getVersions: () => V });
  const result = bridge(rows, 'left');
  assert.equal(result.source, 'shared-legal-action-core');
  assert.equal(result.selected.candidateId, 'a');
  assert.deepEqual(result.selected.payload, { label: 'public-a' });
  assert.deepEqual(result.ordered, ['a', 'b']);
});

test('approved manifest can override the rule only inside current legal public candidates', () => {
  const rows = [candidate('heuristic', 0, 3), candidate('learned', 1, 5)];
  const manifest = {
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...V },
    approval: { gateId: 'HUMAN-HOLDOUT-ACCEPTANCE', approvalId: 'approval-r4', humanGate: 'approved', privacyScope: 'shared' },
    promotionSafe: true,
    defaultActionId: 'heuristic',
    minContextSupport: 8,
    contexts: [{ fingerprint: FINGERPRINT, actionId: 'learned', support: 12 }],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    livePlayerPerformanceProven: false,
  };
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getManifest: () => manifest,
    getRuntimeState: () => RUNTIME_STATE,
  });
  const result = bridge(rows, 'left');
  assert.equal(result.source, 'approved-runtime-manifest');
  assert.equal(result.manifestUsed, true);
  assert.equal(result.selected.candidateId, 'learned');
});

test('runtime control rejects invented/partial versions and exposes activation status', () => {
  const control = createPartnerAdviceRuntimeControl();
  assert.deepEqual(control.status(), { versionReady: false, manifestReady: false, runtimeStateReady: false, mode: 'legacy-fallback' });
  assert.equal(control.setVersions({ rulesVersion: 'rules-r1' }), false);
  assert.equal(control.setVersions(V), true);
  assert.equal(control.status().mode, 'shared-rule');
  assert.equal(control.setManifest({ schema: 'x' }), true);
  assert.equal(control.status().mode, 'manifest-or-rule');
  control.clearManifest();
  assert.equal(control.status().mode, 'shared-rule');
});
