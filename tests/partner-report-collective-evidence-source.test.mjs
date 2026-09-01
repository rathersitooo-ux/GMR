import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE_CONTRACT,
  createPartnerReportCollectiveEvidenceSource,
  projectPartnerReportCollectiveEvidence,
} from '../browser/partner-report-collective-evidence-source.mjs';

const versions = Object.freeze({ rules: 'rules-r1', content: 'content-r1', state: 'state-r1' });

function report(overrides = {}) {
  return {
    ok: true,
    status: 'ready',
    reportId: 'r-001',
    reportType: 'defect',
    disposition: 'accepted_unique',
    partnerId: 'partner.saasuna',
    sourceUseSite: 'battle-result',
    sourceStateIdentity: 'result:match-001',
    versions,
    authority: { verified: true, authorityId: 'gameroad.partner-report.authority.v1' },
    ...overrides,
  };
}

test('projects one current authoritative unique report into the existing collective-context schema', () => {
  const context = projectPartnerReportCollectiveEvidence(report(), {
    currentVersions: versions,
    observedAt: '2026-09-01T12:35:00.000Z',
  });

  assert.equal(context?.schemaVersion, 'gameroad.partner-conversation-collective-context.v1');
  assert.equal(context?.partnerId, 'partner.saasuna');
  assert.equal(context?.acceptedCount, 1);
  assert.equal(context?.containsRawUserText, false);
  assert.equal(context?.automaticCanonMutationAllowed, false);
  assert.equal(context?.automaticRelationshipMutationAllowed, false);
  assert.equal(context?.automaticGameMutationAllowed, false);
  assert.deepEqual(context?.items, [{
    evidenceId: 'partner-report:r-001',
    summary: 'battle-resultで欠陥報告が1件、現行版に対するサーバー確認済みの重複なし報告として受理されています。参考情報であり、人物設定・関係値・ゲーム仕様を変更しません。',
    confidence: 'bounded',
    counterevidenceState: 'PRESENT',
  }]);
  assert.deepEqual(context?.lineage, [{
    evidenceId: 'partner-report:r-001',
    sourceId: 'gameroad.partner-report.authority.v1',
    sourceVersion: 'rules-r1/content-r1/state-r1',
    provenance: 'server_verified',
    authorityRef: 'gameroad.partner-report.authority.v1',
    observedAt: '2026-09-01T12:35:00.000Z',
    freshness: 'current_bounded',
    counterevidenceState: 'PRESENT',
  }]);
});

test('fails closed for stale versions, duplicate reports, wrong partner, or unverified authority', () => {
  const base = { currentVersions: versions, observedAt: '2026-09-01T12:35:00.000Z' };
  assert.equal(projectPartnerReportCollectiveEvidence(report(), {
    ...base,
    currentVersions: { ...versions, state: 'state-r2' },
  }), null);
  assert.equal(projectPartnerReportCollectiveEvidence(report({ disposition: 'duplicate' }), base), null);
  assert.equal(projectPartnerReportCollectiveEvidence(report({ partnerId: 'partner.other' }), base), null);
  assert.equal(projectPartnerReportCollectiveEvidence(report({
    authority: { verified: false, authorityId: 'gameroad.partner-report.authority.v1' },
  }), base), null);
});

test('rejects unexpected raw/private-style fields instead of carrying them into the prompt projection', () => {
  const withRawText = report();
  withRawText.rawText = 'do not retain me';
  assert.equal(projectPartnerReportCollectiveEvidence(withRawText, {
    currentVersions: versions,
    observedAt: '2026-09-01T12:35:00.000Z',
  }), null);
});

test('source composes existing authoritative read and current-version providers without storing data', async () => {
  let reads = 0;
  const source = createPartnerReportCollectiveEvidenceSource({
    async readAdjudicatedReport() {
      reads += 1;
      return report({ reportType: 'request', sourceUseSite: 'home' });
    },
    getCurrentVersions() {
      return versions;
    },
    now() {
      return '2026-09-01T12:36:00.000Z';
    },
  });

  const context = await source({ partnerId: 'partner.saasuna', useSite: 'partner-conversation' });
  assert.equal(reads, 1);
  assert.equal(context?.acceptedCount, 1);
  assert.match(context?.items?.[0]?.summary ?? '', /homeで要望が1件/);
  assert.equal(PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE_CONTRACT.secondStoreCreated, false);
  assert.equal(PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE_CONTRACT.rawReportTextUsed, false);
});

test('source does not call upstream providers for a non-Saasuna/non-conversation request', async () => {
  let reads = 0;
  const source = createPartnerReportCollectiveEvidenceSource({
    readAdjudicatedReport() {
      reads += 1;
      return report();
    },
    getCurrentVersions() {
      return versions;
    },
  });

  assert.equal(await source({ partnerId: 'partner.other', useSite: 'partner-conversation' }), null);
  assert.equal(await source({ partnerId: 'partner.saasuna', useSite: 'other' }), null);
  assert.equal(reads, 0);
});
