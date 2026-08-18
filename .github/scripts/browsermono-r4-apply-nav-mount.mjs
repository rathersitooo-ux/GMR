// Two-phase exact-base executor. This script runs inside GitHub Actions on the acquired work branch.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const htmlPath = 'browser/GAMEROAD.html';
const gatePath = '.github/workflows/gameroad-required-gate.yml';
const auditPath = 'audit/browsermono-r4-nav-mount.json';
const expectedHtmlBlob = '8ee760535ccf769d7f832d1d70dad4133a7245a4';
const expectedGateBlob = 'ce2ab3957fc9ab3beb01ec7f6de9ad652f8ef8ac';
const moduleTag = '<script type="module" src="./screen-navigation-live-adapter.mjs"></script>';

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

function requireExactBlob(filePath, expectedBlob) {
  const bytes = fs.readFileSync(filePath);
  const actualBlob = gitBlobSha(bytes);
  if (actualBlob !== expectedBlob) {
    fail('EXACT_BASE_BLOB_MISMATCH', { filePath, expectedBlob, actualBlob, byteLength: bytes.length });
  }
  return { bytes, actualBlob };
}

const htmlBase = requireExactBlob(htmlPath, expectedHtmlBlob);
const gateBase = requireExactBlob(gatePath, expectedGateBlob);
const source = htmlBase.bytes.toString('utf8');
const gate = gateBase.bytes.toString('utf8');

if (source.includes(moduleTag)) {
  fail('NAVIGATION_LIVE_ADAPTER_ALREADY_MOUNTED');
}

const legacyPattern = /function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)\s*return\s*;\s*gameroadNav\.stack\.push\s*\(\s*navEntry\s*\(\s*state\.screen\s*\)\s*\)\s*;\s*show\s*\(\s*target\s*\)\s*;\s*\}/g;
const matches = [...source.matchAll(legacyPattern)];
if (matches.length !== 1) {
  fail('LEGACY_NAVIGATE_DETAIL_MATCH_COUNT', { expected: 1, actual: matches.length });
}

const matchIndex = matches[0].index;
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
if (/type\s*=\s*["']module["']/i.test(scriptTag)) {
  fail('NAVIGATE_DETAIL_SCRIPT_UNEXPECTEDLY_MODULE', { scriptTag });
}

const replacement = `function navigateDetail(target){\n  const bridge=globalThis.GAMEROAD_SCREEN_NAVIGATION;\n  if(!bridge || typeof bridge.resolve!=="function") throw new Error("GAMEROAD screen navigation bridge is not ready");\n  const decision=bridge.resolve(state.screen,target);\n  if(!decision.ok) return;\n  gameroadNav.stack.push(navEntry(decision.from));\n  show(decision.to);\n}`;
let patchedSource = source.replace(legacyPattern, replacement);
patchedSource = patchedSource.slice(0, scriptOpen) + moduleTag + '\n' + patchedSource.slice(scriptOpen);

if (/function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)/.test(patchedSource)) {
  fail('LEGACY_INLINE_PREDICATE_REMAINS');
}
if ((patchedSource.split(moduleTag).length - 1) !== 1) {
  fail('MODULE_TAG_COUNT_AFTER_PATCH', { actual: patchedSource.split(moduleTag).length - 1 });
}
const mountedNeedle = 'const decision=bridge.resolve(state.screen,target);';
if ((patchedSource.split(mountedNeedle).length - 1) !== 1) {
  fail('MOUNTED_RESOLVER_CALL_COUNT', { actual: patchedSource.split(mountedNeedle).length - 1 });
}
if (!patchedSource.includes('gameroadNav.stack.push(navEntry(decision.from));') || !patchedSource.includes('show(decision.to);')) {
  fail('HOST_SIDE_EFFECT_BOUNDARY_MISSING');
}
if (!patchedSource.includes('navigateDetail(b.dataset.go)')) {
  fail('DATA_GO_NAVIGATION_WIRING_MISSING');
}
if (!patchedSource.includes('GAMEROAD_NAV_QA')) {
  fail('NAVIGATION_QA_SURFACE_MISSING');
}

const oldGatePaths = '              browser/screen-navigation-core.mjs|\\\n              tests/screen-navigation-core.test.mjs|\\\n';
const newGatePaths = '              browser/screen-navigation-core.mjs|\\\n              browser/screen-navigation-live-adapter.mjs|\\\n              tests/screen-navigation-core.test.mjs|\\\n              tests/screen-navigation-live-adapter.test.mjs|\\\n';
const oldGateTest = '          node --test tests/screen-navigation-core.test.mjs\n';
const newGateTest = '          node --test tests/screen-navigation-core.test.mjs tests/screen-navigation-live-adapter.test.mjs\n';

if ((gate.split(oldGatePaths).length - 1) !== 1) {
  fail('REQUIRED_GATE_PATH_MAPPING_MATCH_COUNT', { actual: gate.split(oldGatePaths).length - 1 });
}
if ((gate.split(oldGateTest).length - 1) !== 1) {
  fail('REQUIRED_GATE_TEST_COMMAND_MATCH_COUNT', { actual: gate.split(oldGateTest).length - 1 });
}
const patchedGate = gate.replace(oldGatePaths, newGatePaths).replace(oldGateTest, newGateTest);
if (!patchedGate.includes('browser/screen-navigation-live-adapter.mjs') || !patchedGate.includes('tests/screen-navigation-live-adapter.test.mjs')) {
  fail('REQUIRED_GATE_ADAPTER_MAPPING_MISSING_AFTER_PATCH');
}

fs.writeFileSync(htmlPath, patchedSource, 'utf8');
fs.writeFileSync(gatePath, patchedGate, 'utf8');
const patchedHtmlBytes = fs.readFileSync(htmlPath);
const patchedGateBytes = fs.readFileSync(gatePath);
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(auditPath, JSON.stringify({
  ok: true,
  expectedHtmlBlob,
  actualHtmlBlob: htmlBase.actualBlob,
  patchedHtmlBlob: gitBlobSha(patchedHtmlBytes),
  expectedGateBlob,
  actualGateBlob: gateBase.actualBlob,
  patchedGateBlob: gitBlobSha(patchedGateBytes),
  htmlBytesBefore: htmlBase.bytes.length,
  htmlBytesAfter: patchedHtmlBytes.length,
  legacyPredicateMatchesAfter: 0,
  mountedResolverCallCountAfter: patchedSource.split(mountedNeedle).length - 1,
  moduleTagCountAfter: patchedSource.split(moduleTag).length - 1,
  adapterRequiredGateMapping: true
}, null, 2) + '\n');
console.log(fs.readFileSync(auditPath, 'utf8'));
