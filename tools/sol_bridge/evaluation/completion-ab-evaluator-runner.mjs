#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { evaluateCompletionExperiment } from './completion-ab-evaluator.mjs';

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

export function extractRecords(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.records)) return input.records;
  throw new Error('input_must_be_array_or_object_with_records');
}

export async function runCli() {
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: 'EMPTY_STDIN' })}\n`);
    return 2;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: 'INVALID_JSON', error: error.message })}\n`);
    return 2;
  }

  try {
    const report = evaluateCompletionExperiment(extractRecords(input));
    process.stdout.write(`${JSON.stringify({ ok: true, report })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: 'INVALID_INPUT', error: error.message })}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
