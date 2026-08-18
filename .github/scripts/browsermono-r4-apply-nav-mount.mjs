import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const htmlPath = 'browser/GAMEROAD.html';
const expectedBlob = '8ee760535ccf769d7f832d1d70dad4133a7245a4';
const importLine = "import { resolveScreenNavigation } from './screen-navigation-core.mjs';";
const auditPath = 'audit/browsermono-r4-nav-mount.json';

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function fail(reason, details = {}) {
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify({ ok: false, reason, ...details }, null, 2) + '\n');
  console.error(`[browsermono-r4] ${reason}`);
  process.exit(2);
}

const sourceBytes = fs.readFileSync(htmlPath);
const actualBlob = gitBlobSha(sourceBytes);
if (actualBlob !== expectedBlob) {
  fail('EXACT_BASE_BLOB_MISMATCH', { expectedBlob, actualBlob, byteLength: sourceBytes.length });
}

const source = sourceBytes.toString('utf8');
if (source.includes(importLine)) {
  fail('NAVIGATION_CORE_ALREADY_IMPORTED', { expectedBlob, actualBlob });
}

const legacyPattern = /function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)\s*return\s*;\s*gameroadNav\.stack\.push\s*\(\s*navEntry\s*\(\s*state\.screen\s*\)\s*\)\s*;\s*show\s*\(\s*target\s*\)\s*;\s*\}/g;
const matches = [...source.matchAll(legacyPattern)];
if (matches.length !== 1) {
  fail('LEGACY_NAVIGATE_DETAIL_MATCH_COUNT', { expected: 1, actual: matches.length, expectedBlob, actualBlob });
}

const match = matches[0];
const matchIndex = match.index;
const prefix = source.slice(0, matchIndex);
const scriptOpen = prefix.lastIndexOf('<script');
const scriptClose = prefix.lastIndexOf('</script>');
if (scriptOpen < 0 || scriptOpen <= scriptClose) {
  fail('NAVIGATE_DETAIL_NOT_INSIDE_OPEN_SCRIPT', { scriptOpen, scriptClose });
}
const scriptTagEnd = source.indexOf('>', scriptOpen);
if (scriptTagEnd < 0 || scriptTagEnd > matchIndex) {
  fail('SCRIPT_TAG_BOUNDARY_INVALID', { scriptOpen, scriptTagEnd, matchIndex });
}
const scriptTag = source.slice(scriptOpen, scriptTagEnd + 1);
if (!/type\s*=\s*["']module["']/i.test(scriptTag)) {
  fail('NAVIGATE_DETAIL_SCRIPT_NOT_MODULE', { scriptTag });
}

const replacement = `${importLine}\n\nfunction navigateDetail(target){\n  const decision=resolveScreenNavigation(state.screen,target);\n  if(!decision.ok) return;\n  gameroadNav.stack.push(navEntry(decision.from));\n  show(decision.to);\n}`;
const patched = source.replace(legacyPattern, replacement);

if (patched === source) {
  fail('PATCH_PRODUCED_NO_CHANGE');
}
if (!patched.includes(importLine)) {
  fail('IMPORT_NOT_PRESENT_AFTER_PATCH');
}
if (/function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)/.test(patched)) {
  fail('LEGACY_INLINE_PREDICATE_REMAINS');
}
const mountedPattern = /function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*const\s+decision\s*=\s*resolveScreenNavigation\s*\(\s*state\.screen\s*,\s*target\s*\)\s*;\s*if\s*\(\s*!decision\.ok\s*\)\s*return\s*;\s*gameroadNav\.stack\.push\s*\(\s*navEntry\s*\(\s*decision\.from\s*\)\s*\)\s*;\s*show\s*\(\s*decision\.to\s*\)\s*;\s*\}/g;
const mountedMatches = [...patched.matchAll(mountedPattern)];
if (mountedMatches.length !== 1) {
  fail('MOUNTED_NAVIGATE_DETAIL_MATCH_COUNT', { expected: 1, actual: mountedMatches.length });
}

fs.writeFileSync(htmlPath, patched, 'utf8');
const patchedBytes = fs.readFileSync(htmlPath);
const patchedBlob = gitBlobSha(patchedBytes);
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(auditPath, JSON.stringify({
  ok: true,
  expectedBlob,
  actualBlob,
  patchedBlob,
  beforeBytes: sourceBytes.length,
  afterBytes: patchedBytes.length,
  legacyPredicateMatchesAfter: 0,
  mountedNavigateDetailMatchesAfter: mountedMatches.length,
  importCountAfter: patched.split(importLine).length - 1
}, null, 2) + '\n');
console.log(fs.readFileSync(auditPath, 'utf8'));
