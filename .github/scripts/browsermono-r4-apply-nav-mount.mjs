// Exact-base HTML-only executor. Keeps the ESM decision core pure and mounts it through minimal inline module glue.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const htmlPath = 'browser/GAMEROAD.html';
const auditPath = 'audit/browsermono-r4-nav-mount.json';
const expectedHtmlBlob = '8ee760535ccf769d7f832d1d70dad4133a7245a4';
const bridgeKey = 'GAMEROAD_SCREEN_NAVIGATION';
const moduleBridge = `<script type="module">
import { resolveScreenNavigation } from "./screen-navigation-core.mjs";
const existingScreenNavigationBridge=globalThis.${bridgeKey};
if(existingScreenNavigationBridge && existingScreenNavigationBridge.resolve!==resolveScreenNavigation){
  throw new Error("${bridgeKey} is already occupied by an incompatible bridge");
}
if(!existingScreenNavigationBridge){
  Object.defineProperty(globalThis,"${bridgeKey}",{
    value:Object.freeze({resolve:resolveScreenNavigation}),
    enumerable:false,
    configurable:false,
    writable:false
  });
}
</script>`;

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
const actualHtmlBlob = gitBlobSha(sourceBytes);
if (actualHtmlBlob !== expectedHtmlBlob) {
  fail('EXACT_BASE_BLOB_MISMATCH', { expectedHtmlBlob, actualHtmlBlob, byteLength: sourceBytes.length });
}
const source = sourceBytes.toString('utf8');
if (source.includes(bridgeKey)) {
  fail('NAVIGATION_BRIDGE_KEY_ALREADY_PRESENT');
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

const replacement = `function navigateDetail(target){\n  const bridge=globalThis.${bridgeKey};\n  if(!bridge || typeof bridge.resolve!=="function") throw new Error("GAMEROAD screen navigation bridge is not ready");\n  const decision=bridge.resolve(state.screen,target);\n  if(!decision.ok) return;\n  gameroadNav.stack.push(navEntry(decision.from));\n  show(decision.to);\n}`;
let patched = source.replace(legacyPattern, replacement);
patched = patched.slice(0, scriptOpen) + moduleBridge + '\n' + patched.slice(scriptOpen);

if (/function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)/.test(patched)) {
  fail('LEGACY_INLINE_PREDICATE_REMAINS');
}
if ((patched.split(`globalThis.${bridgeKey}`).length - 1) < 2) {
  fail('BRIDGE_MOUNT_MISSING_AFTER_PATCH');
}
if ((patched.split('const decision=bridge.resolve(state.screen,target);').length - 1) !== 1) {
  fail('MOUNTED_RESOLVER_CALL_COUNT', { actual: patched.split('const decision=bridge.resolve(state.screen,target);').length - 1 });
}
if (!patched.includes('gameroadNav.stack.push(navEntry(decision.from));') || !patched.includes('show(decision.to);')) {
  fail('HOST_SIDE_EFFECT_BOUNDARY_MISSING');
}
if (!patched.includes('navigateDetail(b.dataset.go)')) {
  fail('DATA_GO_NAVIGATION_WIRING_MISSING');
}
if (!patched.includes('GAMEROAD_NAV_QA')) {
  fail('NAVIGATION_QA_SURFACE_MISSING');
}
if ((patched.split('import { resolveScreenNavigation } from "./screen-navigation-core.mjs";').length - 1) !== 1) {
  fail('CORE_IMPORT_COUNT_AFTER_PATCH', { actual: patched.split('import { resolveScreenNavigation } from "./screen-navigation-core.mjs";').length - 1 });
}

fs.writeFileSync(htmlPath, patched, 'utf8');
const patchedBytes = fs.readFileSync(htmlPath);
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(auditPath, JSON.stringify({
  ok: true,
  expectedHtmlBlob,
  actualHtmlBlob,
  patchedHtmlBlob: gitBlobSha(patchedBytes),
  htmlBytesBefore: sourceBytes.length,
  htmlBytesAfter: patchedBytes.length,
  legacyPredicateMatchesAfter: 0,
  mountedResolverCallCountAfter: patched.split('const decision=bridge.resolve(state.screen,target);').length - 1,
  coreImportCountAfter: patched.split('import { resolveScreenNavigation } from "./screen-navigation-core.mjs";').length - 1,
  bridgeMount: 'INLINE_MODULE_GLUE_ONLY',
  hostShowAndStackOwnershipPreserved: true
}, null, 2) + '\n');
console.log(fs.readFileSync(auditPath, 'utf8'));
