#!/usr/bin/env node

export const JIT_EVIDENCE_SCHEMA_VERSION = 'gameroad-jit-evidence-v1';
export const JIT_EVIDENCE_CONTEXT_ENVELOPE_VERSION = 'gameroad-evidence-context-v1';
export const JIT_EVIDENCE_CONTEXT_MARKER = '[[GAMEROAD_EVIDENCE_CONTEXT_V1]]';
export const JIT_EVIDENCE_CONTEXT_END_MARKER = '[[/GAMEROAD_EVIDENCE_CONTEXT_V1]]';

export const EVIDENCE_TIERS = Object.freeze(['HOT', 'WARM', 'COLD', 'QUARANTINE']);
export const EVIDENCE_STATES = Object.freeze([
  'CURRENT_AUTHORITY',
  'CURRENT_ARTIFACT',
  'CURRENT_EXECUTION_EVIDENCE',
  'CANDIDATE',
  'DRAFT',
  'HISTORICAL',
  'ARCHIVED',
  'RETIRED',
  'INPUT_PROHIBITED',
  'UNKNOWN',
]);

const CURRENT_STATES = new Set([
  'CURRENT_AUTHORITY',
  'CURRENT_ARTIFACT',
  'CURRENT_EXECUTION_EVIDENCE',
]);
const HARD_QUARANTINE_STATES = new Set(['RETIRED', 'INPUT_PROHIBITED']);
const COLD_ONLY_STATES = new Set(['HISTORICAL', 'ARCHIVED']);
const TIER_RANK = new Map(EVIDENCE_TIERS.map((tier, index) => [tier, index]));
const MAX_ITEMS = 512;
const MAX_ISSUES = 512;
const MAX_RELATIONS = 4096;
const MAX_TEXT = 20_000;

function fail(reason, extras = {}) {
  return { ok: false, reason, ...extras };
}

function asString(value, name, { optional = false, max = 500 } = {}) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new Error(`${name}_must_be_string`);
  const out = value.trim();
  if (!out && !optional) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function asStringList(value, name, { maxItems = MAX_ITEMS } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${name}_must_be_array`);
  if (value.length > maxItems) throw new Error(`${name}_too_many`);
  const out = value.map((item, index) => asString(item, `${name}_${index}`, { max: 240 }));
  if (new Set(out).size !== out.length) throw new Error(`${name}_duplicate`);
  return out;
}

function asPriority(value, name) {
  if (value == null) return 0;
  if (!Number.isInteger(value) || value < -1000 || value > 1000) {
    throw new Error(`${name}_priority_range`);
  }
  return value;
}

function normalizeIssue(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`issue_${index}_must_be_object`);
  }
  return {
    id: asString(raw.id, `issue_${index}_id`, { max: 240 }),
    material: raw.material !== false,
    resolved: raw.resolved === true,
    note: asString(raw.note ?? '', `issue_${index}_note`, { optional: true, max: 1000 }),
  };
}

function normalizeEvidence(raw, index, requiredIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`evidence_${index}_must_be_object`);
  }
  const id = asString(raw.id, `evidence_${index}_id`, { max: 240 });
  const tier = asString(raw.tier, `evidence_${index}_tier`, { max: 20 });
  const state = asString(raw.state, `evidence_${index}_state`, { max: 40 });
  if (!TIER_RANK.has(tier)) throw new Error(`evidence_${index}_tier_invalid`);
  if (!EVIDENCE_STATES.includes(state)) throw new Error(`evidence_${index}_state_invalid`);
  const required = raw.required === true || requiredIds.has(id);
  if (required && tier !== 'HOT') throw new Error(`required_evidence_not_hot:${id}`);
  if (HARD_QUARANTINE_STATES.has(state) && tier !== 'QUARANTINE') {
    throw new Error(`hard_quarantine_state_must_be_quarantine:${id}`);
  }
  if (COLD_ONLY_STATES.has(state) && !['COLD', 'QUARANTINE'].includes(tier)) {
    throw new Error(`historical_state_not_cold:${id}`);
  }
  const claimMode = asString(raw.claimMode ?? (CURRENT_STATES.has(state) ? 'CURRENT' : 'REFERENCE'), `evidence_${index}_claimMode`, { max: 20 });
  if (!['CURRENT', 'REFERENCE'].includes(claimMode)) throw new Error(`evidence_${index}_claim_mode_invalid`);
  if (required && (claimMode !== 'CURRENT' || !CURRENT_STATES.has(state))) {
    throw new Error(`required_hot_not_current:${id}`);
  }
  if (tier === 'HOT' && (claimMode !== 'CURRENT' || !CURRENT_STATES.has(state))) {
    throw new Error(`hot_not_current:${id}`);
  }
  const available = raw.available !== false;
  const text = available
    ? asString(raw.text, `evidence_${index}_text`, { max: MAX_TEXT })
    : asString(raw.text ?? '', `evidence_${index}_text`, { optional: true, max: MAX_TEXT });
  return {
    id,
    tier,
    state,
    role: asString(raw.role ?? 'REFERENCE', `evidence_${index}_role`, { max: 80 }),
    claimMode,
    text,
    available,
    required,
    priority: asPriority(raw.priority, `evidence_${index}`),
    resolves: asStringList(raw.resolves, `evidence_${index}_resolves`, { maxItems: MAX_ISSUES }),
    emitsIssues: asStringList(raw.emitsIssues, `evidence_${index}_emitsIssues`, { maxItems: MAX_ISSUES }),
    authorityClass: asString(raw.authorityClass ?? '', `evidence_${index}_authorityClass`, { optional: true, max: 120 }),
    version: asString(raw.version ?? '', `evidence_${index}_version`, { optional: true, max: 240 }),
    provenance: asString(raw.provenance ?? '', `evidence_${index}_provenance`, { optional: true, max: 1000 }),
    freshness: asString(raw.freshness ?? '', `evidence_${index}_freshness`, { optional: true, max: 240 }),
    sourceIndex: index,
  };
}

function normalizeRelation(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`relation_${index}_must_be_object`);
  }
  return {
    fromIssue: asString(raw.fromIssue, `relation_${index}_fromIssue`, { max: 240 }),
    toEvidence: asString(raw.toEvidence, `relation_${index}_toEvidence`, { max: 240 }),
    material: raw.material !== false,
    kind: asString(raw.kind ?? 'MATERIAL_RELATION', `relation_${index}_kind`, { max: 120 }),
  };
}

function normalizeInput(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input_must_be_object');
  if (input.schemaVersion !== JIT_EVIDENCE_SCHEMA_VERSION) throw new Error('schema_version');
  const requiredHotIds = asStringList(input.requiredHotIds, 'requiredHotIds');
  const requiredSet = new Set(requiredHotIds);
  if (!Array.isArray(input.evidence)) throw new Error('evidence_must_be_array');
  if (input.evidence.length > MAX_ITEMS) throw new Error('evidence_too_many');
  if (!Array.isArray(input.issues ?? [])) throw new Error('issues_must_be_array');
  if ((input.issues ?? []).length > MAX_ISSUES) throw new Error('issues_too_many');
  if (!Array.isArray(input.relations ?? [])) throw new Error('relations_must_be_array');
  if ((input.relations ?? []).length > MAX_RELATIONS) throw new Error('relations_too_many');

  const evidence = input.evidence.map((item, index) => normalizeEvidence(item, index, requiredSet));
  const issues = (input.issues ?? []).map(normalizeIssue);
  const relations = (input.relations ?? []).map(normalizeRelation);
  const evidenceIds = new Set();
  for (const item of evidence) {
    if (evidenceIds.has(item.id)) throw new Error(`evidence_duplicate_id:${item.id}`);
    evidenceIds.add(item.id);
  }
  const issueIds = new Set();
  for (const issue of issues) {
    if (issueIds.has(issue.id)) throw new Error(`issue_duplicate_id:${issue.id}`);
    issueIds.add(issue.id);
  }
  for (const id of requiredHotIds) {
    if (!evidenceIds.has(id)) throw new Error(`required_hot_missing:${id}`);
  }
  for (const item of evidence) {
    for (const issueId of [...item.resolves, ...item.emitsIssues]) {
      if (!issueIds.has(issueId)) throw new Error(`evidence_issue_unknown:${item.id}:${issueId}`);
    }
  }
  for (const relation of relations) {
    if (!issueIds.has(relation.fromIssue)) throw new Error(`relation_issue_unknown:${relation.fromIssue}`);
    if (!evidenceIds.has(relation.toEvidence)) throw new Error(`relation_evidence_unknown:${relation.toEvidence}`);
  }

  const rawBudget = options.maxContextBytes ?? input.maxContextBytes ?? 3000;
  if (!Number.isInteger(rawBudget) || rawBudget <= 0) throw new Error('maxContextBytes_must_be_positive_integer');
  return {
    decisionQuestion: asString(input.decisionQuestion, 'decisionQuestion', { max: 4000 }),
    requiredHotIds,
    evidence,
    issues,
    relations,
    maxContextBytes: rawBudget,
  };
}

function contextBytes(items) {
  return Buffer.byteLength(JSON.stringify(items), 'utf8');
}

export function encodeEvidenceContextText(item) {
  const metadata = {
    schemaVersion: JIT_EVIDENCE_CONTEXT_ENVELOPE_VERSION,
    id: item.id,
    tier: item.tier,
    state: item.state,
    role: item.role,
    claimMode: item.claimMode,
    authorityClass: item.authorityClass,
    version: item.version,
    provenance: item.provenance,
    freshness: item.freshness,
  };
  if (Array.isArray(item.issueBindings) && item.issueBindings.length > 0) {
    metadata.issueBindings = [...item.issueBindings];
  }
  return `${JIT_EVIDENCE_CONTEXT_MARKER}\n${JSON.stringify(metadata)}\n${JIT_EVIDENCE_CONTEXT_END_MARKER}\n${item.text}`;
}

function contextItem(item) {
  return {
    id: item.id,
    text: encodeEvidenceContextText(item),
    priority: item.priority,
    required: item.required,
  };
}

function evidenceOrder(a, b) {
  if (a.required !== b.required) return a.required ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.sourceIndex - b.sourceIndex || a.id.localeCompare(b.id);
}

function materialUnresolved(issueState) {
  return [...issueState.values()].filter((issue) => issue.material && !issue.resolved);
}

export function compileJitEvidencePacket(input, options = {}) {
  let normalized;
  try {
    normalized = normalizeInput(input, options);
  } catch (error) {
    return fail(error.message);
  }

  const evidenceById = new Map(normalized.evidence.map((item) => [item.id, item]));
  const issueState = new Map(normalized.issues.map((issue) => [issue.id, { ...issue }]));
  const relationsByIssue = new Map();
  for (const relation of normalized.relations) {
    if (!relationsByIssue.has(relation.fromIssue)) relationsByIssue.set(relation.fromIssue, []);
    relationsByIssue.get(relation.fromIssue).push(relation);
  }

  // Purpose is provider-derived from the material issue graph. Evidence cannot self-assert it.
  const issueBindingsByEvidence = new Map();
  for (const relation of normalized.relations) {
    if (!relation.material || !issueState.get(relation.fromIssue)?.material) continue;
    if (!issueBindingsByEvidence.has(relation.toEvidence)) issueBindingsByEvidence.set(relation.toEvidence, new Set());
    issueBindingsByEvidence.get(relation.toEvidence).add(relation.fromIssue);
  }
  for (const item of normalized.evidence) {
    item.issueBindings = [...(issueBindingsByEvidence.get(item.id) ?? [])].sort();
  }

  const selected = [];
  const selectedIds = new Set();
  const unavailable = new Set();
  const budgetBlocked = new Set();
  const quarantined = new Set();
  const reached = new Set();
  let frontierRounds = 0;

  function applyEvidenceEffects(item) {
    for (const issueId of item.resolves) issueState.get(issueId).resolved = true;
    for (const issueId of item.emitsIssues) issueState.get(issueId).resolved = false;
  }

  function trySelect(item, { required = item.required } = {}) {
    if (selectedIds.has(item.id)) return true;
    reached.add(item.id);
    if (item.tier === 'QUARANTINE' || HARD_QUARANTINE_STATES.has(item.state)) {
      quarantined.add(item.id);
      return false;
    }
    if (!item.available) {
      unavailable.add(item.id);
      if (required) throw new Error(`required_hot_unavailable:${item.id}`);
      return false;
    }
    const candidate = [...selected.map(contextItem), contextItem(item)];
    const bytes = contextBytes(candidate);
    if (bytes > normalized.maxContextBytes) {
      budgetBlocked.add(item.id);
      if (required) throw new Error(`required_context_budget_exceeded:${item.id}:${bytes}>${normalized.maxContextBytes}`);
      return false;
    }
    selected.push(item);
    selectedIds.add(item.id);
    applyEvidenceEffects(item);
    return true;
  }

  try {
    const hot = normalized.evidence.filter((item) => item.tier === 'HOT').sort(evidenceOrder);
    for (const item of hot) trySelect(item);
  } catch (error) {
    return fail(error.message, {
      status: 'BLOCKED',
      requiredHotIds: normalized.requiredHotIds,
      maxContextBytes: normalized.maxContextBytes,
    });
  }

  function expandTier(tier) {
    let changed = true;
    while (changed) {
      changed = false;
      frontierRounds += 1;
      const candidates = new Map();
      for (const issue of materialUnresolved(issueState)) {
        for (const relation of relationsByIssue.get(issue.id) ?? []) {
          if (!relation.material) continue;
          const item = evidenceById.get(relation.toEvidence);
          if (!item || item.tier !== tier || selectedIds.has(item.id)) continue;
          reached.add(item.id);
          candidates.set(item.id, item);
        }
      }
      const ordered = [...candidates.values()].sort(evidenceOrder);
      for (const item of ordered) {
        const before = selectedIds.size;
        trySelect(item, { required: false });
        if (selectedIds.size > before) changed = true;
      }
    }
  }

  function pendingReachedTier(tier) {
    const pending = new Map();
    for (const issue of materialUnresolved(issueState)) {
      for (const relation of relationsByIssue.get(issue.id) ?? []) {
        if (!relation.material) continue;
        const item = evidenceById.get(relation.toEvidence);
        if (!item || item.tier !== tier || selectedIds.has(item.id) || quarantined.has(item.id)) continue;
        pending.set(item.id, item);
      }
    }
    return [...pending.values()].sort(evidenceOrder);
  }

  expandTier('WARM');
  const unresolvedAfterWarm = materialUnresolved(issueState);
  const pendingWarm = pendingReachedTier('WARM');
  const coldDeferredForWarm = unresolvedAfterWarm.length > 0 && pendingWarm.length > 0;
  if (unresolvedAfterWarm.length && !coldDeferredForWarm) expandTier('COLD');

  for (const item of normalized.evidence) {
    if (item.tier === 'QUARANTINE' || HARD_QUARANTINE_STATES.has(item.state)) quarantined.add(item.id);
  }

  const unresolvedIssues = materialUnresolved(issueState).map((issue) => issue.id).sort();
  const nextRetrieval = new Map();
  for (const issueId of unresolvedIssues) {
    for (const relation of relationsByIssue.get(issueId) ?? []) {
      if (!relation.material) continue;
      const item = evidenceById.get(relation.toEvidence);
      if (!item || selectedIds.has(item.id) || quarantined.has(item.id) || budgetBlocked.has(item.id)) continue;
      if (!item.available) nextRetrieval.set(item.id, item);
    }
  }
  const nextRetrievalIds = [...nextRetrieval.values()]
    .sort((a, b) => TIER_RANK.get(a.tier) - TIER_RANK.get(b.tier) || evidenceOrder(a, b))
    .map((item) => item.id);

  const includedByTier = Object.fromEntries(EVIDENCE_TIERS.map((tier) => [tier, []]));
  for (const item of selected) includedByTier[item.tier].push(item.id);

  const notReached = normalized.evidence
    .filter((item) => !selectedIds.has(item.id) && !reached.has(item.id) && !quarantined.has(item.id))
    .map((item) => item.id);
  const selectedEvidence = selected.map((item) => ({
    id: item.id,
    tier: item.tier,
    state: item.state,
    role: item.role,
    claimMode: item.claimMode,
    required: item.required,
    priority: item.priority,
    authorityClass: item.authorityClass,
    version: item.version,
    provenance: item.provenance,
    freshness: item.freshness,
  }));
  const contextItems = selected.map(contextItem);
  const contextByteCount = contextBytes(contextItems);
  const status = unresolvedIssues.length
    ? (budgetBlocked.size ? 'BUDGET_BLOCKED' : 'NEEDS_EVIDENCE')
    : 'READY';

  return {
    ok: true,
    schemaVersion: JIT_EVIDENCE_SCHEMA_VERSION,
    decisionQuestion: normalized.decisionQuestion,
    status,
    contextItems,
    selectedEvidence,
    includedByTier,
    unresolvedIssues,
    nextRetrievalIds,
    omitted: {
      unavailable: [...unavailable].sort(),
      budget: [...budgetBlocked].sort(),
      quarantine: [...quarantined].sort(),
      notReached: notReached.sort(),
    },
    materialFixpoint: true,
    coldDeferredForWarm,
    metrics: {
      maxContextBytes: normalized.maxContextBytes,
      contextBytes: contextByteCount,
      selectedCount: selected.length,
      totalEvidenceCount: normalized.evidence.length,
      materialIssueCount: normalized.issues.filter((issue) => issue.material).length,
      unresolvedMaterialIssueCount: unresolvedIssues.length,
      pendingWarmCount: pendingWarm.length,
      frontierRounds,
    },
  };
}
