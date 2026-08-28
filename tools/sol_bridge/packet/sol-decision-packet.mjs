const SCHEMA = 'gameroad.sol-decision-packet.v1';
const SECTION_ORDER = Object.freeze([
  'GOAL',
  'CURRENT',
  'QUESTION',
  'CHANGE_BUDGET',
  'CONSTRAINTS',
  'OBSERVED',
  'FILES',
  'FAILED_ATTEMPTS',
  'DEPENDENCIES',
  'EVIDENCE',
]);

export const SOL_DECISION_PACKET = Object.freeze({
  schema: SCHEMA,
  sectionOrder: SECTION_ORDER,
  defaultTargetMinTokens: 1000,
  defaultTargetMaxTokens: 3000,
  defaultCharsPerToken: 4,
  defaultMaxChars: 12000,
  defaultMaxSnippetChars: 1200,
});

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return stableJson(value);
}

function cleanText(value) {
  return toText(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function requiredText(value, field) {
  const text = cleanText(value);
  if (!text) throw new Error(`SOL_PACKET_${field.toUpperCase()}_REQUIRED`);
  return text;
}

function normalizePriority(value, fallback = 50) {
  if (value === undefined || value === null || value === '') return fallback;
  const priority = Number(value);
  if (!Number.isFinite(priority)) return fallback;
  return Math.max(0, Math.min(100, Math.round(priority)));
}

function truncateText(text, maxChars, marker = ' …[TRUNCATED]') {
  if (!text || text.length <= maxChars) return { text, truncated: false };
  if (maxChars <= marker.length) return { text: marker.slice(0, maxChars), truncated: true };
  return { text: `${text.slice(0, maxChars - marker.length).trimEnd()}${marker}`, truncated: true };
}

function dedupeEntries(entries, keyFn) {
  const seen = new Set();
  const kept = [];
  let omitted = 0;
  for (const entry of entries) {
    const key = keyFn(entry);
    if (seen.has(key)) {
      omitted += 1;
      continue;
    }
    seen.add(key);
    kept.push(entry);
  }
  return { kept, omitted };
}

function normalizeSimpleList(values, section, maxSnippetChars, includeStale) {
  const source = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
  let stale = 0;
  let truncated = 0;
  const normalized = [];

  source.forEach((raw, index) => {
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { text: raw };
    if (object.stale === true && !includeStale) {
      stale += 1;
      return;
    }
    const rawText = object.text ?? object.statement ?? object.summary ?? object.value ?? raw;
    const text = cleanText(rawText);
    if (!text) return;
    const clipped = truncateText(text, maxSnippetChars);
    if (clipped.truncated) truncated += 1;
    normalized.push({
      section,
      index,
      priority: normalizePriority(object.priority),
      text: clipped.text,
    });
  });

  const deduped = dedupeEntries(normalized, (entry) => entry.text.toLowerCase());
  return { entries: deduped.kept, stale, duplicates: deduped.omitted, truncated };
}

function normalizeObserved(values, maxSnippetChars, includeStale) {
  const source = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
  let stale = 0;
  let truncated = 0;
  const normalized = [];

  source.forEach((raw, index) => {
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { statement: raw };
    if (object.stale === true && !includeStale) {
      stale += 1;
      return;
    }
    const statement = cleanText(object.statement ?? object.text ?? raw);
    if (!statement) return;
    const classification = cleanText(object.classification || 'observed_fact').toLowerCase();
    if (!['observed_fact', 'inference'].includes(classification)) {
      throw new Error('SOL_PACKET_OBSERVED_CLASSIFICATION_INVALID');
    }
    const basis = cleanText(object.basis);
    const clippedStatement = truncateText(statement, maxSnippetChars);
    const clippedBasis = truncateText(basis, Math.max(120, Math.floor(maxSnippetChars / 2)));
    if (clippedStatement.truncated || clippedBasis.truncated) truncated += 1;
    normalized.push({
      section: 'OBSERVED',
      index,
      priority: normalizePriority(object.priority),
      classification,
      statement: clippedStatement.text,
      basis: clippedBasis.text,
    });
  });

  const deduped = dedupeEntries(
    normalized,
    (entry) => `${entry.classification}|${entry.statement.toLowerCase()}|${entry.basis.toLowerCase()}`,
  );
  return { entries: deduped.kept, stale, duplicates: deduped.omitted, truncated };
}

function normalizeFiles(values, maxSnippetChars, includeStale) {
  const source = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
  let stale = 0;
  let truncated = 0;
  const normalized = [];

  source.forEach((raw, index) => {
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { path: raw };
    if (object.stale === true && !includeStale) {
      stale += 1;
      return;
    }
    const path = cleanText(object.path);
    if (!path) return;
    const relevance = truncateText(cleanText(object.relevance), Math.max(120, Math.floor(maxSnippetChars / 2)));
    const excerpt = truncateText(cleanText(object.excerpt), maxSnippetChars);
    const diff = truncateText(cleanText(object.diff), maxSnippetChars);
    if (relevance.truncated || excerpt.truncated || diff.truncated) truncated += 1;
    normalized.push({
      section: 'FILES',
      index,
      priority: normalizePriority(object.priority),
      path,
      relevance: relevance.text,
      excerpt: excerpt.text,
      diff: diff.text,
    });
  });

  const deduped = dedupeEntries(
    normalized,
    (entry) => [entry.path, entry.relevance, entry.excerpt, entry.diff].map((value) => value.toLowerCase()).join('|'),
  );
  return { entries: deduped.kept, stale, duplicates: deduped.omitted, truncated };
}

function normalizeEvidence(values, maxSnippetChars, includeStale) {
  const source = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
  let stale = 0;
  let truncated = 0;
  const normalized = [];

  source.forEach((raw, index) => {
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { summary: raw };
    if (object.stale === true && !includeStale) {
      stale += 1;
      return;
    }
    const summary = cleanText(object.summary ?? object.text ?? raw);
    if (!summary) return;
    const ref = truncateText(cleanText(object.ref), Math.max(120, Math.floor(maxSnippetChars / 2)));
    const kind = truncateText(cleanText(object.kind), 80);
    const result = truncateText(cleanText(object.result), Math.max(120, Math.floor(maxSnippetChars / 2)));
    const clippedSummary = truncateText(summary, maxSnippetChars);
    if (ref.truncated || kind.truncated || result.truncated || clippedSummary.truncated) truncated += 1;
    normalized.push({
      section: 'EVIDENCE',
      index,
      priority: normalizePriority(object.priority),
      kind: kind.text,
      ref: ref.text,
      summary: clippedSummary.text,
      result: result.text,
    });
  });

  const deduped = dedupeEntries(
    normalized,
    (entry) => [entry.kind, entry.ref, entry.summary, entry.result].map((value) => value.toLowerCase()).join('|'),
  );
  return { entries: deduped.kept, stale, duplicates: deduped.omitted, truncated };
}

function renderObserved(entry) {
  const label = entry.classification === 'inference' ? 'INFERENCE' : 'FACT';
  const basis = entry.basis ? ` | basis=${entry.basis}` : '';
  return `- [${label} P${entry.priority}] ${entry.statement}${basis}`;
}

function renderFile(entry) {
  const chunks = [`- [P${entry.priority}] ${entry.path}`];
  if (entry.relevance) chunks.push(`relevance=${entry.relevance}`);
  if (entry.excerpt) chunks.push(`excerpt=${entry.excerpt}`);
  if (entry.diff) chunks.push(`diff=${entry.diff}`);
  return chunks.join(' | ');
}

function renderEvidence(entry) {
  const meta = [entry.kind && `kind=${entry.kind}`, entry.ref && `ref=${entry.ref}`, entry.result && `result=${entry.result}`]
    .filter(Boolean)
    .join(' | ');
  return `- [P${entry.priority}] ${entry.summary}${meta ? ` | ${meta}` : ''}`;
}

function renderSimple(entry) {
  return `- [P${entry.priority}] ${entry.text}`;
}

function renderPacket(state) {
  const sectionBodies = {
    GOAL: state.scalars.goal,
    CURRENT: state.scalars.current,
    QUESTION: state.scalars.question,
    CHANGE_BUDGET: state.scalars.changeBudget || '(unspecified)',
    CONSTRAINTS: state.entries.CONSTRAINTS.map(renderSimple).join('\n') || '(none)',
    OBSERVED: state.entries.OBSERVED.map(renderObserved).join('\n') || '(none)',
    FILES: state.entries.FILES.map(renderFile).join('\n') || '(none)',
    FAILED_ATTEMPTS: state.entries.FAILED_ATTEMPTS.map(renderSimple).join('\n') || '(none)',
    DEPENDENCIES: state.entries.DEPENDENCIES.map(renderSimple).join('\n') || '(none)',
    EVIDENCE: state.entries.EVIDENCE.map(renderEvidence).join('\n') || '(none)',
  };
  return [`PACKET_VERSION ${SCHEMA}`, ...SECTION_ORDER.flatMap((section) => [`\n${section}`, sectionBodies[section]])].join('\n');
}

const RETENTION_RANK = Object.freeze({
  DEPENDENCIES: 1,
  FAILED_ATTEMPTS: 2,
  FILES: 3,
  EVIDENCE: 4,
  OBSERVED: 5,
  CONSTRAINTS: 6,
});

function chooseBudgetVictim(entries) {
  const candidates = Object.entries(entries).flatMap(([section, sectionEntries]) =>
    sectionEntries.map((entry, position) => ({ section, entry, position })),
  );
  candidates.sort((a, b) => {
    const rank = RETENTION_RANK[a.section] - RETENTION_RANK[b.section];
    if (rank !== 0) return rank;
    if (a.entry.priority !== b.entry.priority) return a.entry.priority - b.entry.priority;
    return b.position - a.position;
  });
  return candidates[0] || null;
}

function shrinkRequiredScalars(state, maxChars) {
  const minimum = { goal: 64, current: 96, question: 64, changeBudget: 0 };
  const order = ['current', 'goal', 'question', 'changeBudget'];
  let text = renderPacket(state);
  let guard = 0;
  while (text.length > maxChars && guard < 100) {
    guard += 1;
    const candidates = order
      .map((field) => ({ field, length: state.scalars[field].length, minimum: minimum[field] }))
      .filter((item) => item.length > item.minimum + 16)
      .sort((a, b) => b.length - a.length);
    const target = candidates[0];
    if (!target) break;
    const overflow = text.length - maxChars;
    const desired = Math.max(target.minimum, target.length - Math.max(32, overflow));
    state.scalars[target.field] = truncateText(state.scalars[target.field], desired).text;
    state.truncated.required += 1;
    text = renderPacket(state);
  }
  return text;
}

function emptyCounters() {
  return {
    stale: { CONSTRAINTS: 0, OBSERVED: 0, FILES: 0, FAILED_ATTEMPTS: 0, DEPENDENCIES: 0, EVIDENCE: 0 },
    duplicates: { CONSTRAINTS: 0, OBSERVED: 0, FILES: 0, FAILED_ATTEMPTS: 0, DEPENDENCIES: 0, EVIDENCE: 0 },
    budget: { CONSTRAINTS: 0, OBSERVED: 0, FILES: 0, FAILED_ATTEMPTS: 0, DEPENDENCIES: 0, EVIDENCE: 0 },
  };
}

export function buildSolDecisionPacket(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('SOL_PACKET_INPUT_OBJECT_REQUIRED');
  }

  const charsPerToken = Number(options.charsPerToken || SOL_DECISION_PACKET.defaultCharsPerToken);
  if (!Number.isFinite(charsPerToken) || charsPerToken <= 0) throw new Error('SOL_PACKET_CHARS_PER_TOKEN_INVALID');

  const targetMaxTokens = Math.max(1, Math.floor(Number(options.targetMaxTokens || SOL_DECISION_PACKET.defaultTargetMaxTokens)));
  const targetMinTokens = Math.max(0, Math.floor(Number(options.targetMinTokens ?? SOL_DECISION_PACKET.defaultTargetMinTokens)));
  const maxCharsFromTokens = Math.floor(targetMaxTokens * charsPerToken);
  const maxChars = Math.max(256, Math.floor(Number(options.maxChars || maxCharsFromTokens || SOL_DECISION_PACKET.defaultMaxChars)));
  const maxSnippetChars = Math.max(120, Math.floor(Number(options.maxSnippetChars || SOL_DECISION_PACKET.defaultMaxSnippetChars)));
  const includeStale = options.includeStale === true;

  const omitted = emptyCounters();
  const truncated = { optional: 0, required: 0 };
  const entries = {};

  const normalized = {
    CONSTRAINTS: normalizeSimpleList(input.constraints, 'CONSTRAINTS', maxSnippetChars, includeStale),
    OBSERVED: normalizeObserved(input.observed, maxSnippetChars, includeStale),
    FILES: normalizeFiles(input.files, maxSnippetChars, includeStale),
    FAILED_ATTEMPTS: normalizeSimpleList(input.failedAttempts, 'FAILED_ATTEMPTS', maxSnippetChars, includeStale),
    DEPENDENCIES: normalizeSimpleList(input.dependencies, 'DEPENDENCIES', maxSnippetChars, includeStale),
    EVIDENCE: normalizeEvidence(input.evidence, maxSnippetChars, includeStale),
  };

  for (const [section, result] of Object.entries(normalized)) {
    entries[section] = result.entries;
    omitted.stale[section] = result.stale;
    omitted.duplicates[section] = result.duplicates;
    truncated.optional += result.truncated;
  }

  const scalarCap = Math.max(160, Math.min(maxChars, Math.floor(maxChars * 0.42)));
  const scalars = {
    goal: truncateText(requiredText(input.goal, 'goal'), scalarCap).text,
    current: truncateText(requiredText(input.current, 'current'), scalarCap).text,
    question: truncateText(requiredText(input.question, 'question'), scalarCap).text,
    changeBudget: truncateText(cleanText(input.changeBudget), Math.max(120, Math.floor(scalarCap * 0.6))).text,
  };
  if (scalars.goal.includes('[TRUNCATED]')) truncated.required += 1;
  if (scalars.current.includes('[TRUNCATED]')) truncated.required += 1;
  if (scalars.question.includes('[TRUNCATED]')) truncated.required += 1;
  if (scalars.changeBudget.includes('[TRUNCATED]')) truncated.required += 1;

  const state = { scalars, entries, truncated };
  let text = renderPacket(state);

  while (text.length > maxChars) {
    const victim = chooseBudgetVictim(entries);
    if (!victim) break;
    entries[victim.section].splice(victim.position, 1);
    omitted.budget[victim.section] += 1;
    text = renderPacket(state);
  }

  if (text.length > maxChars) text = shrinkRequiredScalars(state, maxChars);
  if (text.length > maxChars) throw new Error('SOL_PACKET_BUDGET_TOO_SMALL');

  const charCount = text.length;
  const approxTokens = Math.ceil(charCount / charsPerToken);
  const warnings = [];
  if (approxTokens < targetMinTokens) warnings.push('BELOW_TARGET_TOKEN_RANGE');
  if (truncated.required > 0) warnings.push('REQUIRED_TEXT_TRUNCATED');
  if (truncated.optional > 0) warnings.push('OPTIONAL_TEXT_TRUNCATED');
  if (Object.values(omitted.budget).some((count) => count > 0)) warnings.push('OPTIONAL_ITEMS_DROPPED_FOR_BUDGET');
  if (Object.values(omitted.stale).some((count) => count > 0)) warnings.push('STALE_ITEMS_OMITTED');
  if (Object.values(omitted.duplicates).some((count) => count > 0)) warnings.push('DUPLICATE_ITEMS_OMITTED');

  return Object.freeze({
    version: SCHEMA,
    text,
    charCount,
    approxTokens,
    maxChars,
    charsPerToken,
    omitted: Object.freeze(omitted),
    truncated: Object.freeze({ ...truncated }),
    warnings: Object.freeze(warnings),
  });
}
