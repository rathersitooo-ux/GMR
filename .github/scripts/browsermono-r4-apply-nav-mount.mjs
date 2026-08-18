// Exact-base second-stage executor: replace the temporary external adapter mount with inline module glue, keeping only existing navigation core + production HTML in the final design.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const htmlPath = 'browser/GAMEROAD.html';
const auditPath = 'audit/browsermono-r4-nav-mount.json';
const expectedHtmlBlob = '6eadf2f25bc14eee7541f2e4f92d34a078dece27';
const externalAdapterTag = '<script type="module" src="./screen-navigation-live-adapter.mjs"></script>';
const bridgeKey = 'GAMEROAD_SCREEN_NAVIGATION';
const inlineBridge = `<script type="module">
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
const externalCount = source.split(externalAdapterTag).length - 1;
if (externalCount !== 1) {
  fail('EXTERNAL_ADAPTER_TAG_MATCH_COUNT', { expected: 1, actual: externalCount });
}
if (/function\s+navigateDetail\s*\(\s*target\s*\)\s*\{\s*if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)/.test(source)) {
  fail('LEGACY_INLINE_PREDICATE_UNEXPECTEDLY_PRESENT');
}
if ((source.split('const decision=bridge.resolve(state.screen,target);').length - 1) !== 1) {
  fail('CURRENT_MOUNTED_RESOLVER_CALL_COUNT', { actual: source.split('const decision=bridge.resolve(state.screen,target);').length - 1 });
}

const patched = source.replace(externalAdapterTag, inlineBridge);
if (patched.includes(externalAdapterTag)) {
  fail('EXTERNAL_ADAPTER_TAG_REMAINS');
}
if ((patched.split('import { resolveScreenNavigation } from "./screen-navigation-core.mjs";').length - 1) !== 1) {
  fail('CORE_IMPORT_COUNT_AFTER_PATCH', { actual: patched.split('import { resolveScreenNavigation } from "./screen-navigation-core.mjs";').length - 1 });
}
if ((patched.split(`globalThis.${bridgeKey}`).length - 1) < 2) {
  fail('INLINE_BRIDGE_MOUNT_MISSING_AFTER_PATCH');
}
if ((patched.split('const decision=bridge.resolve(state.screen,target);').length - 1) !== 1) {
  fail('MOUNTED_RESOLVER_CALL_COUNT_AFTER_PATCH', { actual: patched.split('const decision=bridge.resolve(state.screen,target);').length - 1 });
}
if (!patched.includes('gameroadNav.stack.push(navEntry(decision.from));') || !patched.includes('show(decision.to);')) {
  fail('HOST_SIDE_EFFECT_BOUNDARY_MISSING');
}
if (!patched.includes('navigateDetail(b.dataset.go)') || !patched.includes('GAMEROAD_NAV_QA')) {
  fail('NAVIGATION_CALLER_OR_QA_SURFACE_MISSING');
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
  externalAdapterTagCountAfter: 0,
  coreImportCountAfter: patched.split('import { resolveScreenNavigation } from "./screen-navigation-core.mjs";').length - 1,
  mountedResolverCallCountAfter: patched.split('const decision=bridge.resolve(state.screen,target);').length - 1,
  bridgeMount: 'INLINE_MODULE_GLUE_ONLY',
  hostShowAndStackOwnershipPreserved: true
}, null, 2) + '\n');
console.log(fs.readFileSync(auditPath, 'utf8'));
