import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOL_DECISION_PACKET,
  buildSolDecisionPacket,
} from '../../../tools/sol_bridge/packet/sol-decision-packet.mjs';

function baseInput() {
  return {
    goal: 'Fix the real root cause without changing game rules.',
    current: 'The failure is reproducible and the current branch is isolated.',
    question: 'Which exact change set should Luna implement and test?',
    changeBudget: 'Only tools/sol_bridge/packet/** and tests/sol_bridge/packet/** may change.',
    constraints: ['Do not edit CI.', 'Do not edit game rules.'],
    observed: [
      { statement: 'The failing test exits with code 1.', classification: 'observed_fact', basis: 'node --test', priority: 90 },
      { statement: 'The parser is likely rejecting the stale shape.', classification: 'inference', basis: 'stack trace', priority: 60 },
    ],
    files: [
      { path: 'tools/example.mjs', relevance: 'failure source', excerpt: 'export const value = 1;', priority: 80 },
    ],
    failedAttempts: ['Retried without changing input; failure remained.'],
    dependencies: ['Node 22 runtime'],
    evidence: [{ kind: 'test', ref: 'tests/example.test.mjs', summary: '1 failing assertion', result: 'FAIL', priority: 95 }],
  };
}

test('exports a deterministic v1 packet with stable section order and metadata', () => {
  const first = buildSolDecisionPacket(baseInput());
  const second = buildSolDecisionPacket(baseInput());
  assert.equal(SOL_DECISION_PACKET.schema, 'gameroad.sol-decision-packet.v1');
  assert.deepEqual(first, second);
  assert.equal(first.version, SOL_DECISION_PACKET.schema);
  assert.equal(first.charCount, first.text.length);
  assert.equal(first.approxTokens, Math.ceil(first.charCount / first.charsPerToken));

  let cursor = -1;
  for (const section of SOL_DECISION_PACKET.sectionOrder) {
    const index = first.text.indexOf(`\n${section}\n`);
    assert.ok(index > cursor, `${section} should appear in stable order`);
    cursor = index;
  }
});

test('fails closed when goal, current, or question is missing', () => {
  for (const field of ['goal', 'current', 'question']) {
    const input = baseInput();
    input[field] = '   ';
    assert.throws(() => buildSolDecisionPacket(input), new RegExp(`SOL_PACKET_${field.toUpperCase()}_REQUIRED`));
  }
  assert.throws(() => buildSolDecisionPacket([]), /SOL_PACKET_INPUT_OBJECT_REQUIRED/);
});

test('labels observed facts and inferences explicitly and preserves their basis', () => {
  const packet = buildSolDecisionPacket(baseInput());
  assert.match(packet.text, /\[FACT P90\] The failing test exits with code 1\. \| basis=node --test/);
  assert.match(packet.text, /\[INFERENCE P60\] The parser is likely rejecting the stale shape\. \| basis=stack trace/);
  assert.throws(
    () => buildSolDecisionPacket({ ...baseInput(), observed: [{ statement: 'x', classification: 'guess' }] }),
    /SOL_PACKET_OBSERVED_CLASSIFICATION_INVALID/,
  );
});

test('omits stale entries by default and may include them explicitly', () => {
  const input = baseInput();
  input.observed.push({ statement: 'Old branch had a different failure.', stale: true, priority: 100 });
  input.files.push({ path: 'old/file.mjs', excerpt: 'old', stale: true });

  const fresh = buildSolDecisionPacket(input);
  assert.doesNotMatch(fresh.text, /Old branch/);
  assert.doesNotMatch(fresh.text, /old\/file\.mjs/);
  assert.equal(fresh.omitted.stale.OBSERVED, 1);
  assert.equal(fresh.omitted.stale.FILES, 1);
  assert.ok(fresh.warnings.includes('STALE_ITEMS_OMITTED'));

  const withStale = buildSolDecisionPacket(input, { includeStale: true });
  assert.match(withStale.text, /Old branch/);
  assert.match(withStale.text, /old\/file\.mjs/);
  assert.equal(withStale.omitted.stale.OBSERVED, 0);
});

test('deduplicates normalized exact-content entries without scrambling original order', () => {
  const input = baseInput();
  input.constraints = [
    'Do not edit CI.',
    'Do not edit game rules.',
    '  Do not edit CI.  ',
  ];
  input.evidence.push({ kind: 'test', ref: 'tests/example.test.mjs', summary: '1 failing assertion', result: 'FAIL', priority: 95 });
  const packet = buildSolDecisionPacket(input);
  assert.equal(packet.omitted.duplicates.CONSTRAINTS, 1);
  assert.equal(packet.omitted.duplicates.EVIDENCE, 1);
  assert.ok(packet.warnings.includes('DUPLICATE_ITEMS_OMITTED'));
  assert.ok(packet.text.indexOf('Do not edit CI.') < packet.text.indexOf('Do not edit game rules.'));
});

test('enforces the hard character budget and drops lower-retention optional items first', () => {
  const input = baseInput();
  input.dependencies = Array.from({ length: 12 }, (_, index) => ({ text: `dependency-${index} ${'d'.repeat(120)}`, priority: 5 }));
  input.failedAttempts = Array.from({ length: 8 }, (_, index) => ({ text: `attempt-${index} ${'f'.repeat(120)}`, priority: 10 }));
  input.constraints.push({ text: `critical-constraint ${'c'.repeat(200)}`, priority: 100 });
  input.observed.push({ statement: `critical-observation ${'o'.repeat(200)}`, classification: 'observed_fact', priority: 100 });

  const packet = buildSolDecisionPacket(input, { maxChars: 1800, targetMinTokens: 0 });
  assert.ok(packet.charCount <= 1800);
  assert.match(packet.text, /critical-constraint/);
  assert.match(packet.text, /critical-observation/);
  assert.ok(packet.omitted.budget.DEPENDENCIES > 0);
  assert.ok(packet.warnings.includes('OPTIONAL_ITEMS_DROPPED_FOR_BUDGET'));
});

test('preserves file path when a long excerpt is truncated', () => {
  const input = baseInput();
  input.files = [{
    path: 'src/very-important-parser.mjs',
    relevance: 'exact failing parser',
    excerpt: 'x'.repeat(5000),
    priority: 99,
  }];
  const packet = buildSolDecisionPacket(input, { maxSnippetChars: 220, targetMinTokens: 0 });
  assert.match(packet.text, /src\/very-important-parser\.mjs/);
  assert.match(packet.text, /\[TRUNCATED\]/);
  assert.ok(packet.truncated.optional > 0);
});

test('stable JSON conversion makes object-valued scalar input deterministic', () => {
  const a = baseInput();
  a.current = { z: 3, a: { y: 2, x: 1 } };
  const b = baseInput();
  b.current = { a: { x: 1, y: 2 }, z: 3 };
  assert.equal(buildSolDecisionPacket(a).text, buildSolDecisionPacket(b).text);
});

test('reports below-target packets without padding them with invented context', () => {
  const packet = buildSolDecisionPacket({
    goal: 'g',
    current: 'c',
    question: 'q',
  });
  assert.ok(packet.approxTokens < SOL_DECISION_PACKET.defaultTargetMinTokens);
  assert.ok(packet.warnings.includes('BELOW_TARGET_TOKEN_RANGE'));
  assert.doesNotMatch(packet.text, /padding/i);
});
