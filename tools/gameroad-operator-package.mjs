import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUALITY_GATE_SCHEMA_VERSION = 'gameroad-operator-quality-v1';
export const REUSE_DISPOSITIONS = new Set(['REUSE_AS_IS', 'ADAPT', 'COMPOSE', 'BUILD', 'DEFER', 'NOT_APPLICABLE']);
const EXTERNAL_CANDIDATE_CLASSES = new Set(['OSS_PUBLIC', 'EXTERNAL_SERVICE', 'OFFICIAL_REFERENCE', 'ASSET_MODEL_DATA']);
const ASSET_OPERATIONS = new Set(['ADD', 'MODIFY', 'DELETE', 'REPLACE', 'NONE']);
const ASSET_ORIGINS = new Set(['EXTERNAL_REUSE', 'USER_FORMAL', 'GAMEROAD_EXISTING', 'GENERATED_ORIGINAL']);
const CONTENT_CREDENTIAL_STATUSES = new Set(['PRESERVED', 'NOT_PRESENT', 'NOT_APPLICABLE']);
const SHA256_RE = /^[0-9a-f]{64}$/i;

function pass(reason = 'quality_gate_pass') { return { ok: true, reason }; }
function fail(reason) { return { ok: false, reason }; }
function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function requireString(value, reason) { return isNonEmptyString(value) ? null : fail(reason); }
function requireList(value, reason) { return Array.isArray(value) && value.length > 0 ? null : fail(reason); }

function validateExplicitApplicability(packet) {
  const flags = [
    'researchRequired',
    'reuseDiscoveryRequired',
    'assetProvenanceRequired',
    'deletionGuardRequired',
    'visualEvidenceRequired',
    'completionClaim',
  ];
  for (const key of flags) {
    if (typeof packet[key] !== 'boolean') return fail('applicability_flag_missing:' + key);
  }
  const falseFlags = flags.slice(0, 5).filter((key) => packet[key] === false);
  if (falseFlags.length) {
    if (!packet.notRequiredReasons || typeof packet.notRequiredReasons !== 'object' || Array.isArray(packet.notRequiredReasons)) {
      return fail('not_required_reasons_missing');
    }
    for (const key of falseFlags) {
      if (!isNonEmptyString(packet.notRequiredReasons[key])) return fail('not_required_reason_missing:' + key);
    }
  }
  return pass('applicability_declared');
}

function validateResearchApplication(packet) {
  if (!packet.researchRequired) return pass('research_not_required_with_reason');
  const listCheck = requireList(packet.researchApplications, 'research_applications_missing');
  if (listCheck) return listCheck;
  for (let i = 0; i < packet.researchApplications.length; i += 1) {
    const item = packet.researchApplications[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail('research_application_invalid:' + i);
    for (const [key, label] of [
      ['evidencePointer', 'evidence_pointer'],
      ['finding', 'finding'],
      ['effect', 'effect'],
      ['artifactOrDecisionTarget', 'artifact_or_decision_target'],
    ]) {
      if (!isNonEmptyString(item[key])) return fail('research_application_missing_' + label + ':' + i);
    }
  }
  return pass('research_application_bound');
}

function validateSolutionSignature(signature) {
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) return fail('solution_signature_missing');
  for (const key of ['userEndState', 'requiredBehaviorOrIO', 'consumerOrUseSite', 'environmentOrPlatform', 'acceptanceEvidence']) {
    if (!isNonEmptyString(signature[key])) return fail('solution_signature_missing:' + key);
  }
  return pass('solution_signature_valid');
}

function validateReuseDiscovery(packet) {
  if (!packet.reuseDiscoveryRequired) return pass('reuse_discovery_not_required_with_reason');
  const signatureCheck = validateSolutionSignature(packet.solutionSignature);
  if (!signatureCheck.ok) return signatureCheck;
  if (!REUSE_DISPOSITIONS.has(packet.reuseDisposition)) return fail('reuse_disposition_invalid');
  if (packet.reuseDisposition === 'DEFER') return fail('reuse_defer_cannot_authorize_mutation');
  if (packet.reuseDisposition === 'NOT_APPLICABLE') return fail('reuse_not_applicable_conflicts_with_required_gate');
  const listCheck = requireList(packet.reuseCandidates, 'reuse_candidates_missing');
  if (listCheck) return listCheck;
  for (let i = 0; i < packet.reuseCandidates.length; i += 1) {
    const candidate = packet.reuseCandidates[i];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return fail('reuse_candidate_invalid:' + i);
    for (const key of ['candidateClass', 'decision', 'sourcePointer', 'remainingPathToAcceptance']) {
      if (!isNonEmptyString(candidate[key])) return fail('reuse_candidate_missing_' + key + ':' + i);
    }
    if (EXTERNAL_CANDIDATE_CLASSES.has(candidate.candidateClass)) {
      for (const key of ['versionOrDate', 'rightsOrLicense', 'maintenanceOrSecurity']) {
        if (!isNonEmptyString(candidate[key])) return fail('reuse_candidate_missing_' + key + ':' + i);
      }
    }
  }
  if (packet.reuseDisposition === 'BUILD') {
    if (packet.materialCandidateFrontierOpen !== false) return fail('build_blocked_material_candidate_frontier_open');
    if (!isNonEmptyString(packet.buildResidualJustification)) return fail('build_residual_justification_required');
  }
  return pass('reuse_discovery_' + packet.reuseDisposition.toLowerCase());
}

function validateAssetProvenance(packet) {
  if (!packet.assetProvenanceRequired) return pass('asset_provenance_not_required_with_reason');
  const listCheck = requireList(packet.assetChanges, 'asset_changes_missing');
  if (listCheck) return listCheck;
  for (let i = 0; i < packet.assetChanges.length; i += 1) {
    const item = packet.assetChanges[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail('asset_change_invalid:' + i);
    if (!isNonEmptyString(item.path)) return fail('asset_change_path_missing:' + i);
    if (!ASSET_OPERATIONS.has(item.operation)) return fail('asset_change_operation_invalid:' + i);
    if (!ASSET_ORIGINS.has(item.origin)) return fail('asset_change_origin_invalid:' + i);
    if (item.origin === 'EXTERNAL_REUSE') {
      for (const key of ['sourceUrl', 'licenseExpression', 'rightsBasis']) {
        if (!isNonEmptyString(item[key])) return fail('external_asset_missing_' + key + ':' + i);
      }
      if (!SHA256_RE.test(item.sourceSha256 ?? '')) return fail('external_asset_source_sha256_invalid:' + i);
      if (['NOASSERTION', 'NONE', 'UNKNOWN'].includes(String(item.licenseExpression).toUpperCase())) {
        return fail('external_asset_rights_unresolved:' + i);
      }
      if (!Array.isArray(item.transformChain) || item.transformChain.length === 0 || item.transformChain.some((value) => !isNonEmptyString(value))) {
        return fail('external_asset_transform_chain_missing:' + i);
      }
      if (!CONTENT_CREDENTIAL_STATUSES.has(item.contentCredentialsStatus)) {
        return fail('external_asset_content_credentials_status_invalid:' + i);
      }
    }
    if ((item.origin === 'USER_FORMAL' || item.origin === 'GAMEROAD_EXISTING') && ['DELETE', 'REPLACE'].includes(item.operation)) {
      if (!isNonEmptyString(item.authorityEvidence)) return fail('formal_asset_authority_missing:' + i);
      if (item.preserveOriginal !== true) return fail('formal_asset_original_not_preserved:' + i);
    }
  }
  return pass('asset_provenance_valid');
}

function validateDeletionGuard(packet) {
  if (!packet.deletionGuardRequired) return pass('deletion_guard_not_required_with_reason');
  const listCheck = requireList(packet.deletions, 'deletions_missing');
  if (listCheck) return listCheck;
  for (let i = 0; i < packet.deletions.length; i += 1) {
    const item = packet.deletions[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail('deletion_invalid:' + i);
    if (!isNonEmptyString(item.path)) return fail('deletion_path_missing:' + i);
    if (!isNonEmptyString(item.reason)) return fail('deletion_reason_missing:' + i);
    if (item.humanOrFormalAsset === true) {
      if (!isNonEmptyString(item.authorityEvidence)) return fail('formal_deletion_authority_missing:' + i);
      if (item.recoverableCopyConfirmed !== true) return fail('formal_deletion_recoverability_missing:' + i);
    }
  }
  return pass('deletion_guard_valid');
}

function validateVisualEvidence(packet) {
  if (!packet.visualEvidenceRequired) return pass('visual_evidence_not_required_with_reason');
  const visual = packet.visualEvidence;
  if (!visual || typeof visual !== 'object' || Array.isArray(visual)) return fail('visual_evidence_missing');
  if (!isNonEmptyString(visual.currentGameroadActual)) return fail('visual_current_gameroad_actual_missing');
  if (!Array.isArray(visual.externalComparisonActuals) || visual.externalComparisonActuals.length === 0
      || visual.externalComparisonActuals.some((value) => !isNonEmptyString(value))) {
    return fail('visual_external_comparison_actuals_missing');
  }
  if (!Array.isArray(visual.comparisonDimensions) || visual.comparisonDimensions.length === 0
      || visual.comparisonDimensions.some((value) => !isNonEmptyString(value))) {
    return fail('visual_comparison_dimensions_missing');
  }
  if (packet.completionClaim) {
    if (!isNonEmptyString(visual.consumerUseSiteActual)) return fail('visual_consumer_use_site_actual_missing');
    if (!isNonEmptyString(visual.regressionOrComparisonResult)) return fail('visual_regression_or_comparison_result_missing');
  }
  return pass('visual_evidence_valid');
}

export function validateQualityDecision(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return fail('packet_must_be_object');
  if (packet.schemaVersion !== QUALITY_GATE_SCHEMA_VERSION) return fail('schema_version');
  if (packet.materialMutation !== true) return fail('material_mutation_true_required');
  for (const key of ['taskId', 'workUnitKey', 'acquireKey', 'userEndState', 'consumerOrUseSite']) {
    const missing = requireString(packet[key], 'required_string_missing:' + key);
    if (missing) return missing;
  }
  const applicability = validateExplicitApplicability(packet);
  if (!applicability.ok) return applicability;
  for (const validator of [
    validateResearchApplication,
    validateReuseDiscovery,
    validateAssetProvenance,
    validateDeletionGuard,
    validateVisualEvidence,
  ]) {
    const result = validator(packet);
    if (!result.ok) return result;
  }
  return pass('quality_decision_authorized');
}

function parseJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push('JSON parse failed: ' + file + ': ' + error.message);
    return null;
  }
}

function requireFile(file, errors) {
  if (!fs.existsSync(file)) errors.push('Missing: ' + file);
}

export function validateGameroadOperatorPackage(repoRoot = process.cwd()) {
  const errors = [];
  const pluginRoot = path.join(repoRoot, 'plugins', 'gameroad-operator');
  const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const mcpPath = path.join(pluginRoot, '.mcp.json');
  const skillPath = path.join(pluginRoot, 'skills', 'gameroad-pc-workloop', 'SKILL.md');
  const marketPath = path.join(repoRoot, '.agents', 'plugins', 'marketplace.json');

  for (const file of [
    manifestPath, mcpPath, skillPath, marketPath,
    path.join(pluginRoot, 'README.md'),
    path.join(pluginRoot, 'THIRD_PARTY.md'),
    path.join(pluginRoot, 'CAPABILITY_MATRIX.md'),
    path.join(pluginRoot, 'install.ps1'),
    path.join(pluginRoot, 'install-from-github.ps1'),
    path.join(pluginRoot, 'doctor.ps1'),
    path.join(pluginRoot, 'uninstall.ps1'),
  ]) requireFile(file, errors);

  if (errors.length) return { ok: false, errors };

  const manifest = parseJson(manifestPath, errors);
  const mcp = parseJson(mcpPath, errors);
  const market = parseJson(marketPath, errors);
  const skill = fs.readFileSync(skillPath, 'utf8');

  if (manifest) {
    if (manifest.name !== 'gameroad-operator') errors.push('manifest name mismatch');
    if (manifest.mcpServers !== './.mcp.json') errors.push('manifest mcpServers mismatch');
    if (manifest.skills !== './skills/') errors.push('manifest skills mismatch');
    if (!manifest.interface?.capabilities?.includes('Read') || !manifest.interface?.capabilities?.includes('Write')) {
      errors.push('manifest must declare Read and Write capabilities');
    }
  }

  if (mcp) {
    const desktop = mcp.mcp_servers?.['gameroad-desktop'];
    const browser = mcp.mcp_servers?.['gameroad-browser'];
    if (desktop?.command !== 'npx' || !desktop?.args?.includes('@wonderwhy-er/desktop-commander@latest')) {
      errors.push('Desktop Commander MCP wiring mismatch');
    }
    if (browser?.command !== 'npx' || !browser?.args?.includes('@playwright/mcp@latest')) {
      errors.push('Playwright MCP wiring mismatch');
    }
    if (!browser?.args?.includes('--caps=network,storage,testing,vision,pdf,devtools')) {
      errors.push('Playwright full capability bundle missing');
    }
  }

  if (market) {
    const entry = market.plugins?.find((item) => item.name === 'gameroad-operator');
    if (entry?.source?.path !== './plugins/gameroad-operator') errors.push('repo marketplace source path mismatch');
    if (entry?.policy?.installation !== 'AVAILABLE') errors.push('repo marketplace installation policy mismatch');
  }

  if (!/GAMEROAD_Drive総合目次・記録ルーティング_CURRENT/.test(skill)) errors.push('skill missing fresh CURRENT route');
  if (!/owner\/lease/i.test(skill)) errors.push('skill missing owner/lease gate');
  if (!/current actual/i.test(skill)) errors.push('skill missing current actual gate');
  if (!/Browser evidence/.test(skill)) errors.push('skill missing browser evidence section');
  if (!/gameroad-operator-package\.mjs --quality-input/.test(skill)) errors.push('skill missing deterministic quality gate invocation');
  if (!/FAIL result means WRITE0/.test(skill)) errors.push('skill missing fail-closed WRITE0 boundary');
  if (!/Human-provided, formal, or existing GAMEROAD assets are preserve-by-default/.test(skill)) {
    errors.push('skill missing Human/formal asset preserve-by-default rule');
  }
  if (!/Model-default knowledge is not evidence/.test(skill)) errors.push('skill missing external-research knowledge boundary');

  return { ok: errors.length === 0, errors };
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function runQualityGateCli(argv) {
  const input = argValue(argv, '--quality-input');
  if (!input) {
    console.error('usage: gameroad-operator-package.mjs --quality-input <packet.json>');
    return 2;
  }
  let packet;
  try {
    packet = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch (error) {
    console.error('GAMEROAD_OPERATOR_QUALITY_GATE FAIL input_read_or_parse:' + error.message);
    return 1;
  }
  const result = validateQualityDecision(packet);
  console.log('GAMEROAD_OPERATOR_QUALITY_GATE ' + (result.ok ? 'PASS' : 'FAIL') + ' ' + result.reason);
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--quality-input')) {
    process.exitCode = runQualityGateCli(process.argv.slice(2));
  } else {
    const result = validateGameroadOperatorPackage(process.cwd());
    if (!result.ok) {
      console.error('GAMEROAD Operator package validation: FAIL');
      for (const error of result.errors) console.error('- ' + error);
      process.exit(1);
    }
    console.log('GAMEROAD Operator package validation: PASS');
  }
}
