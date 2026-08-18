import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LEGACY_DECLARATION_TOKEN = 'const GAMEROAD_NAV_FALLBACK_PARENT=';

const LEGACY_BACK_TARGET_PATTERN = /entry\?\.\s*screen\s*\|\|\s*GAMEROAD_NAV_FALLBACK_PARENT\s*\[\s*state\.screen\s*\]\s*\|\|\s*(['"])home\1/g;

const LEGACY_MOUNT_PATTERN = /<script type="module">\s*import\s*\{\s*resolveScreenNavigation\s*\}\s*from\s*(["'])\.\/screen-navigation-core\.mjs\1\s*;\s*const existingScreenNavigationBridge\s*=\s*globalThis\.GAMEROAD_SCREEN_NAVIGATION\s*;\s*if\s*\(\s*existingScreenNavigationBridge\s*&&\s*existingScreenNavigationBridge\.resolve\s*!==\s*resolveScreenNavigation\s*\)\s*\{\s*throw new Error\s*\(\s*(["'])GAMEROAD_SCREEN_NAVIGATION is already occupied by an incompatible bridge\2\s*\)\s*;\s*\}\s*if\s*\(\s*!existingScreenNavigationBridge\s*\)\s*\{\s*Object\.defineProperty\s*\(\s*globalThis\s*,\s*(["'])GAMEROAD_SCREEN_NAVIGATION\3\s*,\s*\{\s*value\s*:\s*Object\.freeze\s*\(\s*\{\s*resolve\s*:\s*resolveScreenNavigation\s*\}\s*\)\s*,\s*enumerable\s*:\s*false\s*,\s*configurable\s*:\s*false\s*,\s*writable\s*:\s*false\s*\}\s*\)\s*;\s*\}\s*<\/script>/g;

const RUNTIME_MOUNT = `<script type="module">
import { resolveScreenNavigation } from "./screen-navigation-core.mjs";
import { createScreenNavigationRuntimeBridge } from "./screen-navigation-core.mjs";
const runtimeScreenNavigationBridge=createScreenNavigationRuntimeBridge();
const existingScreenNavigationBridge=globalThis.GAMEROAD_SCREEN_NAVIGATION;
if(existingScreenNavigationBridge && (
  existingScreenNavigationBridge.resolve!==resolveScreenNavigation ||
  existingScreenNavigationBridge.resolveBackTarget!==runtimeScreenNavigationBridge.resolveBackTarget
)){
  throw new Error("GAMEROAD_SCREEN_NAVIGATION is already occupied by an incompatible bridge");
}
if(!existingScreenNavigationBridge){
  Object.defineProperty(globalThis,"GAMEROAD_SCREEN_NAVIGATION",{
    value:runtimeScreenNavigationBridge,
    enumerable:false,
    configurable:false,
    writable:false
  });
}
</script>`;

function countPattern(input, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return [...input.matchAll(matcher)].length;
}

function countToken(input, token) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = input.indexOf(token, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + token.length;
  }
}

function findLegacyDeclarationRange(input) {
  const count = countToken(input, LEGACY_DECLARATION_TOKEN);
  if (count !== 1) {
    throw new Error(`expected exactly one legacy fallback declaration, found ${count}`);
  }

  const tokenIndex = input.indexOf(LEGACY_DECLARATION_TOKEN);
  let start = input.lastIndexOf('\n', tokenIndex - 1) + 1;
  const prefix = input.slice(start, tokenIndex);
  if (prefix.trim() !== '') start = tokenIndex;

  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote = null;
  let escaped = false;

  for (let i = tokenIndex + LEGACY_DECLARATION_TOKEN.length; i < input.length; i += 1) {
    const ch = input[i];

    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    else if (ch === ';' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      let end = i + 1;
      if (input[end] === '\r' && input[end + 1] === '\n') end += 2;
      else if (input[end] === '\n') end += 1;
      return { start, end };
    }

    if (depthParen < 0 || depthBracket < 0 || depthBrace < 0) {
      throw new Error('legacy fallback declaration contains unbalanced delimiters');
    }
  }

  throw new Error('legacy fallback declaration terminator was not found');
}

function assertLegacyCounts(input) {
  const mountCount = countPattern(input, LEGACY_MOUNT_PATTERN);
  const backTargetCount = countPattern(input, LEGACY_BACK_TARGET_PATTERN);
  const declarationCount = countToken(input, LEGACY_DECLARATION_TOKEN);

  if (mountCount !== 1) throw new Error(`expected exactly one legacy navigation mount, found ${mountCount}`);
  if (declarationCount !== 1) throw new Error(`expected exactly one legacy fallback declaration, found ${declarationCount}`);
  if (backTargetCount !== 1) throw new Error(`expected exactly one legacy back-target expression, found ${backTargetCount}`);

  return { mountCount, declarationCount, backTargetCount };
}

export function verifyBrowserMonoBackTargetDeletion(output) {
  const failures = [];
  if (output.includes('GAMEROAD_NAV_FALLBACK_PARENT')) failures.push('legacy fallback symbol remains');
  if (countPattern(output, LEGACY_BACK_TARGET_PATTERN) !== 0) failures.push('legacy back-target expression remains');
  if (countToken(output, 'createScreenNavigationRuntimeBridge') !== 2) {
    failures.push('runtime bridge factory import/invocation count is not exactly two');
  }
  if (countToken(output, 'runtimeScreenNavigationBridge.resolveBackTarget') !== 1) {
    failures.push('runtime bridge compatibility guard does not contain exactly one back-target resolver');
  }
  if (countToken(output, 'GAMEROAD_SCREEN_NAVIGATION.resolveBackTarget(state.screen,entry)') !== 1) {
    failures.push('production back-target delegation count is not exactly one');
  }
  if (failures.length) throw new Error(`postcondition failed: ${failures.join('; ')}`);
  return true;
}

export function transformBrowserMonoScreenNavigationBackTarget(input) {
  const counts = assertLegacyCounts(input);

  let output = input.replace(LEGACY_MOUNT_PATTERN, RUNTIME_MOUNT);
  const declaration = findLegacyDeclarationRange(output);
  output = output.slice(0, declaration.start) + output.slice(declaration.end);
  output = output.replace(
    LEGACY_BACK_TARGET_PATTERN,
    'globalThis.GAMEROAD_SCREEN_NAVIGATION.resolveBackTarget(state.screen,entry)'
  );

  verifyBrowserMonoBackTargetDeletion(output);
  return { output, counts };
}

function parseArgs(argv) {
  const options = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--input') options.input = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.input) throw new Error('--input is required');
  if (!options.check && !options.output) throw new Error('--output is required unless --check is used');
  return options;
}

export async function runCli(argv) {
  const options = parseArgs(argv);
  const input = await readFile(options.input, 'utf8');
  const result = transformBrowserMonoScreenNavigationBackTarget(input);

  if (!options.check) await writeFile(options.output, result.output, 'utf8');

  const summary = {
    mode: options.check ? 'check' : 'write',
    input: options.input,
    output: options.check ? null : options.output,
    changed: result.output !== input,
    ...result.counts
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
