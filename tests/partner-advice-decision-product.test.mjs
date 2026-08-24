import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerAdviceDecisionProduct,
  compileRuntimeAdviceManifestFromDecisionProduct,
} from '../tools/partner-advice-decision-product.mjs';

const VERSIONS = {
  releaseVersion: 'release-r2',
  rulesVersion: 'rules-r1',
  contentVersion: 'content-r3',
  cardVersion: 'cards-r1',
  stateVersion: 'state-r1',
};

function evidence(evidenceId, overrides = {}) {
  return {
    evidenceId,
    ownerId: 'owner-advice-eval',
    digest: `sha256-${evidenceId}`,
    acquiredAt: '2026-08-19T14:02:00+09:00',
    authorityLevel: 'L2',
    provenance: 'synthetic',
    cohortId: 'cohort-a',
    versions: { ...VERSIONS },
    summaryRef: `summary-${evidenceId}`,
    ...overrides,
  };
}

function proposal(overrides = {}) {
  return {
    proposalId: 'proposal-partner-r2-001',
    proposalVersion: 'proposal-schema-r1',
    kind: 'CHANGE',
    versions: { ...VERSIONS },
    cohort: { cohortId: 'cohort-a', scopeRef: 'scope-advice-same-version' },
    missingData: { state: 'NONE', refs: [] },
    supportingEvidence: [evidence('support-1')],
    counterEvidence: { state: 'NONE_FOUND', searchRef: 'counter-search-1', items: [] },
    affectedOwnerId: 'owner-advice-runtime',
    affectedUseSiteRef: 'use-site-advice-selection',
    protectedInvariantRef: 'invariant-no-auto-gameplay-change',
    changeRef: 'change-advice-ranking-candidate-1',
    expectedObservation: {
      metricRef: 'metric-advice-quality',
      observationPlanRef: 'plan-isolated-holdout',
    },
    isolation: {
      isolationRef: 'isolation-partner-r2-001',
      scopeRef: 'scope-offline-advice-only',
    },
    rollback: {
      conditionRef: 'rollback-condition-any-regression',
      rollbackRef: 'rollback-partner-r2-001',
    },
    ...overrides,
  };
}

function decisionContext(overrides = {}) {
  return {
    decisionInput: {
      capturedAtDecision: true,
      contextRef: 'decision-context-battle-mid-high',
    },
    exposure: {
      opportunityState: 'KNOWN',
      opportunityRef: 'opportunity-same-candidate-set',
      candidateSetRef: 'candidate-set-rules-r1',
    },
    intervention: {
      reversible: true,
      interventionUnitRef: 'intervention-ranking-only',
      rollbackRef: 'rollback-partner-r2-001',
    },
    proxy: {
      role: 'SUPPORTING_ONLY',
      limitationRef: 'proxy-advice-follow-is-not-trust-truth',
      primaryOutcomeRef: 'outcome-holdout-regret-and-human-gate',
    },
    environment: {
      driftState: 'CURRENT',
      environmentRef: 'environment-rules-r1-cards-r1-state-r1',
      expiryRef: 'expiry-on-version-or-cohort-change',
    },
    transfer: {
      sourceScope: 'POPULATION',
      targetScope: 'POPULATION',
      personalAuthorityRef: null,
    },
    comparison: {
      axes: [
        { axisRef: 'axis-regret', observationRef: 'observe-holdout-regret', predeclared: true },
        { axisRef: 'axis-clarity', observationRef: 'observe-human-clarity', predeclared: true },
      ],
      strongestAlternativeRef: 'alternative-existing-global-baseline',
      noChangeRef: 'control-no-change-current-advice',
    },
    hypothesis: {
      expectedEffectRef: 'effect-lower-regret-without-clarity-loss',
      mechanismRef: 'mechanism-context-matched-approved-evidence',
    },
    confidenceRef: 'confidence-offline-provisional',
    ...overrides,
  };
}

function product(overrides = {}) {
  return {
    decisionProductId: 'partner-advice-dp-r2-001',
    decisionProductVersion: 'partner-advice-dp-schema-v1',
    consumerTaskId: 'PARTNER-COLLECTIVE-ADVICE-OFFLINE-EVAL-001',
    consumerUseSiteRef: 'use-site-advice-selection',
    proposal: proposal(),
    decisionContext: decisionContext(),
    ...overrides,
  };
}

test('valid population decision product is a frozen reference-only offline projection', () => {
  const input = product();
  const before = structuredClone(input);
  const result = buildPartnerAdviceDecisionProduct(input);

  assert.deepEqual(input, before);
  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.abstain, false);
  assert.equal(result.projection.schema, 'gameroad.partner-advice-decision-product.v1');
  assert.equal(result.projection.offlineEvaluationReady, true);
  assert.equal(result.projection.formalPromotionEligible, false);
  assert.equal(result.projection.authoritativeReuseEligible, false);
  assert.equal(result.projection.automaticMutationAllowed, false);
  assert.equal(result.projection.personaMutationAllowed, false);
  assert.equal(result.projection.relationshipMutationAllowed, false);
  assert.equal(result.projection.containsRawEvents, false);
  assert.equal(result.projection.containsPrivate, false);
  assert.deepEqual(result.projection.sourceProposal.evidenceRefs, ['support-1']);
  assert.equal(result.projection.decisionContext.comparison.axes.length, 2);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.projection), true);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('sha256-support-1'), false);
  assert.equal(serialized.includes('summary-support-1'), false);
});

test('R15 gates abstain on missing decision context, exposure, reversibility, proxy limits, or current environment', () => {
  const cases = [
    [
      'decision-input-not-captured',
      decisionContext({ decisionInput: { capturedAtDecision: false, contextRef: 'decision-context-battle-mid-high' } }),
    ],
    [
      'exposure-opportunity-unknown',
      decisionContext({
        exposure: {
          opportunityState: 'UNKNOWN',
          opportunityRef: 'opportunity-unknown',
          candidateSetRef: 'candidate-set-rules-r1',
        },
      }),
    ],
    [
      'intervention-not-reversible',
      decisionContext({
        intervention: {
          reversible: false,
          interventionUnitRef: 'intervention-ranking-only',
          rollbackRef: 'rollback-partner-r2-001',
        },
      }),
    ],
    [
      'proxy-role-invalid',
      decisionContext({
        proxy: {
          role: 'TARGET_TRUTH',
          limitationRef: 'proxy-limit-ref',
          primaryOutcomeRef: 'outcome-ref',
        },
      }),
    ],
    [
      'environment-stale',
      decisionContext({
        environment: {
          driftState: 'STALE',
          environmentRef: 'environment-old',
          expiryRef: 'expiry-version-change',
        },
      }),
    ],
  ];

  for (const [reason, context] of cases) {
    const result = buildPartnerAdviceDecisionProduct(product({ decisionContext: context }));
    assert.equal(result.ok, false, reason);
    assert.equal(result.ready, false, reason);
    assert.equal(result.abstain, true, reason);
    assert.equal(result.projection, null, reason);
    assert.ok(result.reasons.includes(reason), `${reason}: ${result.reasons.join(',')}`);
  }
});

test('population evidence cannot silently become personal truth', () => {
  const blocked = buildPartnerAdviceDecisionProduct(product({
    decisionContext: decisionContext({
      transfer: { sourceScope: 'POPULATION', targetScope: 'PERSONAL', personalAuthorityRef: null },
    }),
  }));
  assert.equal(blocked.abstain, true);
  assert.ok(blocked.reasons.includes('population-to-personal-transfer-unapproved'));

  const allowed = buildPartnerAdviceDecisionProduct(product({
    decisionProductId: 'partner-advice-dp-personal-authorized',
    decisionContext: decisionContext({
      transfer: {
        sourceScope: 'POPULATION',
        targetScope: 'PERSONAL',
        personalAuthorityRef: 'explicit-user-preference-version-7',
      },
    }),
  }));
  assert.equal(allowed.ok, true);
  assert.equal(allowed.projection.decisionContext.transfer.personalAuthorityRef, 'explicit-user-preference-version-7');

  const reverse = buildPartnerAdviceDecisionProduct(product({
    decisionProductId: 'partner-advice-dp-personal-to-population',
    decisionContext: decisionContext({
      transfer: { sourceScope: 'PERSONAL', targetScope: 'POPULATION', personalAuthorityRef: 'personal-memory-1' },
    }),
  }));
  assert.equal(reverse.abstain, true);
  assert.ok(reverse.reasons.includes('personal-to-population-transfer-forbidden'));
});

test('comparison axes must be predeclared and preserve strongest alternative plus NO_CHANGE control', () => {
  const blocked = buildPartnerAdviceDecisionProduct(product({
    decisionContext: decisionContext({
      comparison: {
        axes: [{ axisRef: 'axis-posthoc', observationRef: 'observe-posthoc', predeclared: false }],
        strongestAlternativeRef: 'alternative-baseline',
        noChangeRef: 'control-no-change',
      },
    }),
  }));
  assert.equal(blocked.abstain, true);
  assert.ok(blocked.reasons.includes('comparison-axis-0-not-predeclared'));

  const valid = buildPartnerAdviceDecisionProduct(product());
  assert.equal(valid.projection.decisionContext.comparison.strongestAlternativeRef, 'alternative-existing-global-baseline');
  assert.equal(valid.projection.decisionContext.comparison.noChangeRef, 'control-no-change-current-advice');
});

test('proposal UNKNOWN/missing evidence remains abstention instead of being treated as zero', () => {
  const unknown = product({
    proposal: proposal({ missingData: { state: 'UNKNOWN', refs: ['missing-exposure-window'] } }),
  });
  const result = buildPartnerAdviceDecisionProduct(unknown);
  assert.equal(result.abstain, true);
  assert.ok(result.reasons.includes('proposal-missing-data'));

  const counterUnknown = product({
    decisionProductId: 'partner-advice-dp-counter-unknown',
    proposal: proposal({ counterEvidence: { state: 'UNKNOWN', searchRef: 'counter-search-pending', items: [] } }),
  });
  const counter = buildPartnerAdviceDecisionProduct(counterUnknown);
  assert.equal(counter.abstain, true);
  assert.ok(counter.reasons.includes('counter-evidence-unknown'));
});

test('rollback must be the same reversible unit already declared by the source proposal', () => {
  const result = buildPartnerAdviceDecisionProduct(product({
    decisionContext: decisionContext({
      intervention: {
        reversible: true,
        interventionUnitRef: 'intervention-ranking-only',
        rollbackRef: 'rollback-other-system',
      },
    }),
  }));
  assert.equal(result.abstain, true);
  assert.ok(result.reasons.includes('rollback-ref-mismatch'));
});

test('NO_CHANGE is a valid decision product and never invents a changeRef', () => {
  const noChange = buildPartnerAdviceDecisionProduct(product({
    decisionProductId: 'partner-advice-dp-no-change',
    proposal: proposal({
      proposalId: 'proposal-partner-r2-no-change',
      kind: 'NO_CHANGE',
      changeRef: null,
    }),
  }));
  assert.equal(noChange.ok, true);
  assert.equal(noChange.projection.sourceProposal.kind, 'NO_CHANGE');
  assert.equal(noChange.projection.sourceProposal.changeRef, null);
  assert.equal(noChange.projection.automaticMutationAllowed, false);
});

test('strict allowlists reject raw/private/free-text additions without echoing payload', () => {
  const secret = 'do-not-echo-private-transcript-991';
  const result = buildPartnerAdviceDecisionProduct({
    ...product(),
    rawTranscript: secret,
  });
  assert.equal(result.ok, false);
  assert.equal(result.projection, null);
  assert.ok(result.reasons.includes('top-unexpected-field:rawTranscript'));
  assert.equal(JSON.stringify(result).includes(secret), false);
});

function runtimeReadyProduct({ contextOverrides = {}, proposalOverrides = {}, productOverrides = {} } = {}) {
  const releaseProposal = proposal({
    supportingEvidence: [evidence('server-support-runtime', { provenance: 'server_verified', authorityLevel: 'L4' })],
    decision: { state: 'APPROVED', authority: 'human', evidenceRef: 'human-decision-runtime-1' },
    releaseLink: { releaseId: 'release-runtime-1', resultRecordId: 'result-runtime-1' },
    ...proposalOverrides,
  });
  return buildPartnerAdviceDecisionProduct(product({
    proposal: releaseProposal,
    decisionContext: decisionContext(contextOverrides),
    ...productOverrides,
  }));
}

function runtimeMemory(overrides = {}) {
  const runtimeVersions = { rulesVersion: VERSIONS.rulesVersion, cardVersion: VERSIONS.cardVersion, stateVersion: VERSIONS.stateVersion };
  const fingerprint = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=battle|turnBand=mid|pressureBand=high|manaBand=two-plus|handBand=three';
  return {
    targetVersions: runtimeVersions,
    contexts: new Map([[fingerprint, new Map([['guard', { count: 12, rewardSum: 11, regretSum: 0 }]])]]),
    global: new Map([['guard', { count: 12, rewardSum: 11, regretSum: 0 }]]),
    regretPenalty: 0.35,
    ...overrides,
  };
}

function runtimePromotionDecision() {
  return { promotion: true, formalPromotionRequiresHumanGate: true };
}

function runtimeApproval(overrides = {}) {
  return {
    gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
    approvalId: 'runtime-human-approval-1',
    humanGate: 'approved',
    privacyScope: 'shared',
    containsPrivate: false,
    rulesVersion: VERSIONS.rulesVersion,
    cardVersion: VERSIONS.cardVersion,
    stateVersion: VERSIONS.stateVersion,
    ...overrides,
  };
}

test('formal collective Decision Product compiles a privacy-minimized runtime manifest with safe lineage', () => {
  const decisionProductResult = runtimeReadyProduct();
  assert.equal(decisionProductResult.formalPromotionEligible, true);
  const compiled = compileRuntimeAdviceManifestFromDecisionProduct({
    decisionProductResult,
    memory: runtimeMemory(),
    promotionDecision: runtimePromotionDecision(),
    approval: runtimeApproval(),
    runtimeUseSiteRef: 'use-site-advice-selection',
  });

  assert.equal(compiled.ok, true);
  assert.equal(compiled.manifest.schema, 'gameroad.partner-advice-runtime-manifest.v1');
  const lineage = compiled.manifest.collectiveDecisionLineage;
  assert.equal(lineage.schema, 'gameroad.partner-advice-runtime-lineage.v1');
  assert.equal(lineage.decisionProductId, 'partner-advice-dp-r2-001');
  assert.equal(lineage.proposalId, 'proposal-partner-r2-001');
  assert.equal(lineage.cohortId, 'cohort-a');
  assert.equal(lineage.consumerUseSiteRef, 'use-site-advice-selection');
  assert.deepEqual(lineage.transfer, { sourceScope: 'POPULATION', targetScope: 'POPULATION', personalAuthorityRef: null });
  assert.deepEqual(lineage.comparison.axisRefs, ['axis-regret', 'axis-clarity']);
  assert.equal(lineage.comparison.noChangeRef, 'control-no-change-current-advice');
  assert.equal(lineage.automaticMutationAllowed, false);
  assert.equal(lineage.personaMutationAllowed, false);
  assert.equal(lineage.relationshipMutationAllowed, false);
  assert.equal(lineage.containsRawEvents, false);
  assert.equal(lineage.containsPrivate, false);
  assert.equal(Object.isFrozen(compiled), true);
  assert.equal(Object.isFrozen(compiled.manifest), true);

  const serialized = JSON.stringify(compiled.manifest);
  assert.equal(serialized.includes('sha256-server-support-runtime'), false);
  assert.equal(serialized.includes('summary-server-support-runtime'), false);
  assert.equal(serialized.includes('rawTranscript'), false);
});

test('runtime lineage bridge rejects offline-only Decision Product instead of treating research volume as promotion', () => {
  const offlineOnly = buildPartnerAdviceDecisionProduct(product());
  const compiled = compileRuntimeAdviceManifestFromDecisionProduct({
    decisionProductResult: offlineOnly,
    memory: runtimeMemory(),
    promotionDecision: runtimePromotionDecision(),
    approval: runtimeApproval(),
    runtimeUseSiteRef: 'use-site-advice-selection',
  });
  assert.equal(compiled.ok, false);
  assert.equal(compiled.reason, 'decision-product-not-formal-promotion-eligible');
});

test('NO_CHANGE Decision Product cannot silently become a runtime behavior change', () => {
  const noChange = runtimeReadyProduct({
    proposalOverrides: {
      proposalId: 'proposal-runtime-no-change',
      kind: 'NO_CHANGE',
      changeRef: null,
    },
    productOverrides: { decisionProductId: 'partner-advice-dp-runtime-no-change' },
  });
  assert.equal(noChange.formalPromotionEligible, true);
  const compiled = compileRuntimeAdviceManifestFromDecisionProduct({
    decisionProductResult: noChange,
    memory: runtimeMemory(),
    promotionDecision: runtimePromotionDecision(),
    approval: runtimeApproval(),
    runtimeUseSiteRef: 'use-site-advice-selection',
  });
  assert.equal(compiled.ok, false);
  assert.equal(compiled.reason, 'decision-product-no-runtime-change');
});

test('population to personal runtime lineage requires and preserves explicit personal authority', () => {
  const authorized = runtimeReadyProduct({
    contextOverrides: {
      transfer: {
        sourceScope: 'POPULATION',
        targetScope: 'PERSONAL',
        personalAuthorityRef: 'explicit-user-preference-version-7',
      },
    },
    productOverrides: { decisionProductId: 'partner-advice-dp-runtime-personal' },
  });
  const compiled = compileRuntimeAdviceManifestFromDecisionProduct({
    decisionProductResult: authorized,
    memory: runtimeMemory(),
    promotionDecision: runtimePromotionDecision(),
    approval: runtimeApproval(),
    runtimeUseSiteRef: 'use-site-advice-selection',
  });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.manifest.collectiveDecisionLineage.transfer.targetScope, 'PERSONAL');
  assert.equal(compiled.manifest.collectiveDecisionLineage.transfer.personalAuthorityRef, 'explicit-user-preference-version-7');
});

test('runtime lineage bridge fails closed on wrong use-site or version drift', () => {
  const ready = runtimeReadyProduct();
  const wrongUseSite = compileRuntimeAdviceManifestFromDecisionProduct({
    decisionProductResult: ready,
    memory: runtimeMemory(),
    promotionDecision: runtimePromotionDecision(),
    approval: runtimeApproval(),
    runtimeUseSiteRef: 'other-use-site',
  });
  assert.equal(wrongUseSite.reason, 'runtime-use-site-mismatch');

  const staleMemory = runtimeMemory({
    targetVersions: { rulesVersion: 'rules-r1', cardVersion: 'cards-r0', stateVersion: 'state-r1' },
  });
  const stale = compileRuntimeAdviceManifestFromDecisionProduct({
    decisionProductResult: ready,
    memory: staleMemory,
    promotionDecision: runtimePromotionDecision(),
    approval: runtimeApproval({ cardVersion: 'cards-r0' }),
    runtimeUseSiteRef: 'use-site-advice-selection',
  });
  assert.equal(stale.reason, 'decision-product-version-mismatch');
});
