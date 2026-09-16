#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFencedJson, normalizeQueuePacket } from './executor-bus-packet.mjs';

const REQUIRED_HINT = 'FREE_LOCAL_CODER';
const MAX_FILES = 8;
const MAX_FILE_CHARS = 12000;
const MAX_CONTEXT_CHARS = 24000;
const FORBIDDEN_EXACT = new Set([
  'config/zero-cash-runtime-policy.json',
  'tools/executor-bus-packet.mjs',
  '.github/workflows/gameroad-executor-bus.yml',
]);
const FORBIDDEN_PREFIXES = [
  '.git/',
  '.github/workflows/',
  'data/preaction-authorizations/',
];

function fail(reason) {
  return { ok: false, reason };
}

function cleanRepoPath(value) {
  if (typeof value !== 'string') throw new Error('resource_path_must_be_string');
  const raw = value.trim().replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || raw.includes('\u0000')) throw new Error(`resource_path_invalid:${raw}`);
  const normalized = path.posix.normalize(raw);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`resource_path_escape:${raw}`);
  }
  if (/[*?{}[\]]/.test(normalized)) throw new Error(`resource_path_glob_forbidden:${normalized}`);
  return normalized;
}

export function validateFreePacket(packet) {
  try {
    if (!packet || packet.kind !== 'queue') throw new Error('queue_packet_required');
    if (!/^[0-9a-f]{40}$/i.test(packet.baseRef)) throw new Error('base_ref_must_be_full_sha');
    if (!String(packet.executorCapabilityHint || '').includes(REQUIRED_HINT)) {
      throw new Error('free_local_coder_opt_in_required');
    }
    if (!Array.isArray(packet.exactMutableResources) || packet.exactMutableResources.length === 0) {
      throw new Error('mutable_resources_required');
    }
    if (packet.exactMutableResources.length > MAX_FILES) throw new Error('mutable_resource_limit');
    const mutablePaths = packet.exactMutableResources.map(cleanRepoPath);
    if (!mutablePaths.some((item) => item.startsWith('tests/') && item.endsWith('.test.mjs'))) {
      throw new Error('focused_test_path_required');
    }
    for (const item of mutablePaths) {
      if (FORBIDDEN_EXACT.has(item) || FORBIDDEN_PREFIXES.some((prefix) => item.startsWith(prefix))) {
        throw new Error(`control_plane_mutation_forbidden:${item}`);
      }
    }
    for (const key of ['exactInputs', 'fixedAssumptions', 'procedure', 'noInferenceBoundary', 'stopConditions', 'returnPayload']) {
      if (!Array.isArray(packet[key]) || packet[key].length === 0) throw new Error(`procedure_first_required:${key}`);
    }
    if (typeof packet.executorClass !== 'string' || !packet.executorClass.trim()) {
      throw new Error('procedure_first_required:executorClass');
    }
    return { ok: true, packet: { ...packet, exactMutableResources: mutablePaths } };
  } catch (error) {
    return fail(error.message);
  }
}

export function packetFromIssueBody(body) {
  const parsed = parseFencedJson(body, 'executor-bus');
  if (!parsed.ok) return parsed;
  const normalized = normalizeQueuePacket(parsed.value);
  if (!normalized.ok) return normalized;
  return validateFreePacket(normalized.packet);
}

function readContextFile(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!(absolute === path.resolve(root) || absolute.startsWith(rootPrefix))) throw new Error(`context_path_escape:${relativePath}`);
  if (!fs.existsSync(absolute)) return `===== ${relativePath} (MISSING / may be created) =====\n`;
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`context_not_file:${relativePath}`);
  const text = fs.readFileSync(absolute, 'utf8');
  const clipped = text.length > MAX_FILE_CHARS ? `${text.slice(0, MAX_FILE_CHARS)}\n...[TRUNCATED]` : text;
  return `===== ${relativePath} =====\n${clipped}\n`;
}

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function bulleted(items) {
  return items.length ? `- ${items.join('\n- ')}` : '(none listed)';
}

export function buildPrompt(packet, root = process.cwd()) {
  const checked = validateFreePacket(packet);
  if (!checked.ok) throw new Error(checked.reason);
  const safePacket = checked.packet;
  let context = '';
  for (const relativePath of safePacket.exactMutableResources) {
    const part = readContextFile(root, relativePath);
    if (context.length + part.length > MAX_CONTEXT_CHARS) {
      const remaining = Math.max(0, MAX_CONTEXT_CHARS - context.length);
      if (remaining > 0) context += part.slice(0, remaining);
      context += '\n[CONTEXT_LIMIT_REACHED]\n';
      break;
    }
    context += part;
  }
  const immutable = [...safePacket.readOnlyResources, ...safePacket.doNotChange];
  return `<|im_start|>system\nYou are GAMEROAD Free Local Coder. You are an executor, not a planner. Sol has already made the design and routing decisions. Follow the supplied ordered procedure exactly. Do not infer missing product rules, priorities, owners, targets, or acceptance criteria. Produce a minimal code patch only. Never add paid APIs, credentials, telemetry, network exfiltration, new task systems, or hidden fallback behavior. You have no authority to merge. Output exactly one unified git diff and no prose. Touch only the explicitly mutable paths. If any stop condition, ambiguity, stale input, missing required context, or no-inference boundary is reached, output FREE_AUTOPILOT_BLOCKED and a short reason instead of a patch.<|im_end|>\n<|im_start|>user\nTASK_ID: ${safePacket.taskId}\nWORK_UNIT: ${safePacket.workUnitKey}\nBASE_SHA: ${safePacket.baseRef}\nEXECUTOR_CLASS: ${safePacket.executorClass}\n\nEXACT_INPUTS:\n${bulleted(safePacket.exactInputs)}\n\nFIXED_ASSUMPTIONS:\n${numbered(safePacket.fixedAssumptions)}\n\nORDERED_PROCEDURE:\n${numbered(safePacket.procedure)}\n\nNO_INFERENCE_BOUNDARY:\n${bulleted(safePacket.noInferenceBoundary)}\n\nUSER_END_STATE:\n${safePacket.userEndState}\n\nREAL_OUTPUT_TARGET:\n${safePacket.realOutputTarget}\n\nACCEPTANCE:\n${numbered(safePacket.acceptance)}\n\nSTOP_FAIL_CLOSE:\n${bulleted(safePacket.stopConditions)}\n\nRETURN_PAYLOAD_REQUIREMENTS:\n${bulleted(safePacket.returnPayload)}\n\nMUTABLE_PATHS:\n${bulleted(safePacket.exactMutableResources)}\n\nREAD_ONLY_AND_DO_NOT_CHANGE:\n${bulleted(immutable)}\n\nCURRENT_FILE_CONTEXT:\n${context}\n\nReturn only a unified git diff beginning with diff --git. Do not use markdown fences.<|im_end|>\n<|im_start|>assistant\n`;
}

export function extractUnifiedDiff(text) {
  if (typeof text !== 'string') return fail('model_output_must_be_string');
  if (text.includes('FREE_AUTOPILOT_BLOCKED')) return fail('model_reported_blocked');
  const fenced = text.match(/```diff\s*\n([\s\S]*?)\n```/m);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf('diff --git ');
  if (start < 0) return fail('unified_diff_missing');
  const diff = source.slice(start).trimEnd() + '\n';
  if (diff.includes('GIT binary patch') || diff.includes('Binary files ')) return fail('binary_patch_forbidden');
  if (/^rename (?:from|to) /m.test(diff)) return fail('rename_forbidden');
  if (/^new file mode 120000$/m.test(diff)) return fail('symlink_forbidden');
  return { ok: true, diff };
}

export function diffChangedPaths(diff) {
  const paths = [];
  for (const line of diff.split('\n')) {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!match) continue;
    if (match[1] !== match[2]) throw new Error(`path_pair_mismatch:${match[1]}:${match[2]}`);
    paths.push(cleanRepoPath(match[2]));
  }
  return [...new Set(paths)];
}

export function validateModelPatch(packet, modelOutput) {
  const checked = validateFreePacket(packet);
  if (!checked.ok) return checked;
  const extracted = extractUnifiedDiff(modelOutput);
  if (!extracted.ok) return extracted;
  try {
    const changed = diffChangedPaths(extracted.diff);
    if (changed.length === 0) throw new Error('diff_has_no_changed_paths');
    const allowed = new Set(checked.packet.exactMutableResources);
    for (const item of changed) {
      if (!allowed.has(item)) throw new Error(`out_of_scope_patch:${item}`);
    }
    return { ok: true, diff: extracted.diff, changedPaths: changed };
  } catch (error) {
    return fail(error.message);
  }
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function runCli(argv) {
  const mode = argv[0];
  if (mode === 'prepare') {
    const bodyFile = argValue(argv, '--body-file');
    const packetOut = argValue(argv, '--packet-out');
    const promptOut = argValue(argv, '--prompt-out');
    const body = fs.readFileSync(bodyFile, 'utf8');
    const result = packetFromIssueBody(body);
    if (!result.ok) {
      console.error(`FREE_AUTOPILOT_REJECTED ${result.reason}`);
      return 1;
    }
    writeJson(packetOut, result.packet);
    fs.writeFileSync(promptOut, buildPrompt(result.packet), 'utf8');
    console.log(`FREE_AUTOPILOT_ACCEPTED ${result.packet.acquireKey}`);
    return 0;
  }
  if (mode === 'validate') {
    const packetFile = argValue(argv, '--packet-file');
    const outputFile = argValue(argv, '--model-output-file');
    const diffOut = argValue(argv, '--diff-out');
    const packet = JSON.parse(fs.readFileSync(packetFile, 'utf8'));
    const output = fs.readFileSync(outputFile, 'utf8');
    const result = validateModelPatch(packet, output);
    if (!result.ok) {
      console.error(`FREE_AUTOPILOT_PATCH_REJECTED ${result.reason}`);
      return 1;
    }
    fs.writeFileSync(diffOut, result.diff, 'utf8');
    console.log(`FREE_AUTOPILOT_PATCH_ACCEPTED ${result.changedPaths.join(',')}`);
    return 0;
  }
  console.error('FREE_AUTOPILOT_REJECTED mode_must_be_prepare_or_validate');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
