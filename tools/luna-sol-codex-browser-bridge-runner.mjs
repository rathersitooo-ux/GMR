#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import {
  prepareLunaSolCodexDispatch,
  resumeLunaSolCodexDispatch,
} from './luna-sol-codex-browser-bridge.mjs';

function usage() {
  return [
    'Usage:',
    '  node tools/luna-sol-codex-browser-bridge-runner.mjs prepare --input <json> [--output <json>]',
    '  node tools/luna-sol-codex-browser-bridge-runner.mjs resume --bundle <json> --evidence <json> [--output <json>]',
    '',
    'The runner never controls the browser itself and never mutates product files.',
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !['prepare', 'resume'].includes(command)) throw new Error('command_must_be_prepare_or_resume');
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`unexpected_argument:${token}`);
    const name = token.slice(2);
    if (!name) throw new Error('empty_flag');
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`flag_value_required:${name}`);
    if (Object.hasOwn(flags, name)) throw new Error(`duplicate_flag:${name}`);
    flags[name] = value;
    index += 1;
  }
  return { command, flags };
}

async function readJson(path, label) {
  if (!path) throw new Error(`${label}_path_required`);
  const text = await readFile(path, 'utf8');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root_must_be_object');
    return value;
  } catch (error) {
    throw new Error(`${label}_invalid_json:${error.message}`);
  }
}

async function emit(result, outputPath) {
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, text, 'utf8');
  } else {
    process.stdout.write(text);
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  let result;
  if (command === 'prepare') {
    const input = await readJson(flags.input, 'input');
    result = prepareLunaSolCodexDispatch(input);
  } else {
    const bundle = await readJson(flags.bundle, 'bundle');
    const evidence = await readJson(flags.evidence, 'evidence');
    result = resumeLunaSolCodexDispatch(bundle, evidence);
  }
  await emit(result, flags.output);
  process.exitCode = result.ok === false ? 2 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error.message ?? String(error)}\n${usage()}\n`);
  process.exitCode = 2;
});
