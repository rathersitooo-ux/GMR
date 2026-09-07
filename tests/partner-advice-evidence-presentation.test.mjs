import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTNER_ADVICE_EVIDENCE_PRESENTATION,
  projectPartnerAdviceEvidencePresentation,
} from '../browser/partner-advice-evidence-presentation.mjs';
import {
  createPartnerAdviceReplayBridge,
  readLatestPartnerAdviceEvidencePresentation,
} from '../browser/partner-advice-runtime-mount.mjs';

const V = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });
const RUNTIME_STATE = Object.freeze({ phase: 'plan', turnBand: 'early', pressureBand: 'low', manaBand: 'mid', handBand: 'three' });
const FINGERPRINT = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=plan|turnBand=early|pressureBand=low|manaBand=mid|handBand=three';

function candidate(candidateId, positionOrder, comparisonValue, label = candidateId) {
  return {
    candidateId,
    kind: 'card',
    positionOrder,
    comparisonValue,
    legal: true,
    publicScope: true,
    assetAction: 'NONE',
    payload: { label },
  };
}

function legacyReplay({ rule, candidates }) {
  const legal = candidates.filter((row) => row.legal !== false);
  const ordered = [...legal].sort((a, b) => {
    if (rule === 'left') return a.positionOrder - b.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'right') return b.positionOrder - a.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'max') return b.comparisonValue - a.comparisonValue || a.candidateId.localeCompare(b.candidateId);
    return a.comparisonValue - b.comparisonValue || a.candidateId.localeCompare(b.candidateId);
  });
  return Object.freeze({
    ok: true,
    selected: ordered[0] ?? null,
    ordered: Object.freeze(ordered.map((row) => row.candidateId)),
    next: ordered[1]?.candidateId ?? null,
    reason: 'LEGACY',
    source: 'legacy',
    containsPrivate: false,
  });
}

function approvedManifest() {
  return Object.freeze({
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...V },
    approval: {
      gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
      approvalId: 'approval-evidence-r1',
      humanGate: 'approved',
      privacyScope: 'shared',
    },
    promotionSafe: true,
    defaultActionId: 'heuristic',
    minContextSupport: 8,
    contexts: [{ fingerprint: FINGERPRINT, actionId: 'learned', support: 12 }],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    livePlayerPerformanceProven: false,
  });
}

test('approved collective recommendation is readable but never promoted to optimal truth', () => {
  const model = projectPartnerAdviceEvidencePresentation({
    adviceResult: {
      ok: true,
      containsPrivate: false,
      selected: { candidateId: 'card-a', payload: { label: 'カードA' } },
      source: 'approved-runtime-manifest',
      manifestUsed: true,
      manifestSource: 'approved-context-subset',
      manifestSupport: 24,
    },
  });

  assert.equal(model.active, true);
  assert.equal(model.suggestion, '提案：カードA');
  assert.equal(model.badge, '集合知');
  assert.equal(model.sourceKind, 'collective');
  assert.equal(model.why, '似た局面の承認済み対戦記録を参照');
  assert.equal(model.support, 24);
  assert.equal(model.detailLines.includes('参照 24件の局面データ'), true);
  assert.equal(model.detailLines.includes('最適解の断定ではなく、現在の助言候補'), true);
  assert.equal(model.collectiveEvidenceUsed, true);
  assert.equal(model.optimalActionProven, false);
  assert.equal(model.goodMisplaySignal, false);
  assert.equal(model.autoExecute, false);
  assert.equal(model.presentationOnly, true);
});

test('shared legal strategy explains the actual resolved rule reason rather than pretending to use collective evidence', () => {
  for (const [reason, expected] of Object.entries({
    LEFTMOST: '左側を優先する作戦設定から',
    RIGHTMOST: '右側を優先する作戦設定から',
    MAXIMUM: '比較値が高い候補を優先する作戦設定から',
    MINIMUM: '比較値が低い候補を優先する作戦設定から',
  })) {
    const model = projectPartnerAdviceEvidencePresentation({
      adviceResult: {
        ok: true,
        containsPrivate: false,
        selected: { candidateId: 'card-a', payload: { label: 'カードA' } },
        source: 'shared-legal-action-core',
        manifestUsed: false,
        reason,
      },
    });
    assert.equal(model.active, true);
    assert.equal(model.badge, '作戦設定');
    assert.equal(model.why, expected);
    assert.equal(model.collectiveEvidenceUsed, false);
    assert.equal(model.detailLines.includes('この提案は集合知の採用結果ではありません'), true);
  }
});

test('missing support never fabricates a sample count', () => {
  const model = projectPartnerAdviceEvidencePresentation({
    adviceResult: {
      ok: true,
      containsPrivate: false,
      selected: { candidateId: 'card-a' },
      source: 'approved-runtime-manifest',
      manifestUsed: true,
      manifestSource: 'approved-global-fallback',
      manifestSupport: 0,
    },
  });
  assert.equal(model.active, true);
  assert.equal(model.support, null);
  assert.equal(model.detailLines[0], '承認済みの全体傾向を参照');
  assert.equal(model.detailLines.some((line) => /\d+件/.test(line)), false);
});

test('private, spoofed, incomplete, or unselected advice fails closed with no stale claim', () => {
  const cases = [
    null,
    { ok: false, containsPrivate: false, selected: { candidateId: 'a' }, source: 'shared-legal-action-core' },
    { ok: true, containsPrivate: true, selected: { candidateId: 'a' }, source: 'shared-legal-action-core' },
    { ok: true, containsPrivate: false, selected: null, source: 'shared-legal-action-core' },
    { ok: true, containsPrivate: false, selected: { candidateId: 'a' }, source: 'client-forged-best-move' },
    { ok: true, containsPrivate: false, selected: { candidateId: 'a' }, source: 'approved-runtime-manifest', manifestUsed: false },
  ];
  for (const adviceResult of cases) {
    const model = projectPartnerAdviceEvidencePresentation({ adviceResult });
    assert.equal(model.active, false);
    assert.equal(model.collectiveEvidenceUsed, false);
    assert.equal(model.optimalActionProven, false);
    assert.equal(model.goodMisplaySignal, false);
    assert.equal(model.autoExecute, false);
  }
});

test('wrapper preserves shared-rule selection while publishing player-facing strategy evidence', () => {
  const rows = [candidate('left-card', 0, 3, '左カード'), candidate('right-card', 1, 9, '右カード')];
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getPartnerId: () => 'partner.saasuna',
    getStrategyPreference: () => 'right',
  });
  const result = bridge(rows, 'left');
  const evidence = readLatestPartnerAdviceEvidencePresentation();

  assert.equal(result.source, 'shared-legal-action-core');
  assert.equal(result.selected.candidateId, 'right-card');
  assert.equal(evidence.active, true);
  assert.equal(evidence.suggestion, '提案：右カード');
  assert.equal(evidence.badge, '作戦設定');
  assert.equal(evidence.why, '右側を優先する作戦設定から');
  assert.equal(evidence.collectiveEvidenceUsed, false);
});

test('wrapper publishes approved collective evidence only when the existing manifest path actually wins', () => {
  const rows = [candidate('heuristic', 0, 3, '通常候補'), candidate('learned', 1, 9, '集合知候補')];
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getManifest: () => approvedManifest(),
    getRuntimeState: () => RUNTIME_STATE,
  });
  const result = bridge(rows, 'left');
  const evidence = readLatestPartnerAdviceEvidencePresentation();

  assert.equal(result.source, 'approved-runtime-manifest');
  assert.equal(result.manifestUsed, true);
  assert.equal(result.selected.candidateId, 'learned');
  assert.equal(evidence.active, true);
  assert.equal(evidence.suggestion, '提案：集合知候補');
  assert.equal(evidence.badge, '集合知');
  assert.equal(evidence.support, 12);
  assert.equal(evidence.optimalActionProven, false);
  assert.equal(evidence.goodMisplaySignal, false);
});

test('presentation contract is explicit about source separation and non-authority', () => {
  assert.deepEqual(PARTNER_ADVICE_EVIDENCE_PRESENTATION.sourceKinds, ['collective', 'strategy', 'legacy']);
  assert.equal(PARTNER_ADVICE_EVIDENCE_PRESENTATION.collectiveLabel, '集合知');
  assert.equal(PARTNER_ADVICE_EVIDENCE_PRESENTATION.optimalActionProven, false);
  assert.equal(PARTNER_ADVICE_EVIDENCE_PRESENTATION.goodMisplaySignal, false);
  assert.equal(PARTNER_ADVICE_EVIDENCE_PRESENTATION.autoExecute, false);
  assert.equal(PARTNER_ADVICE_EVIDENCE_PRESENTATION.presentationOnly, true);
});
