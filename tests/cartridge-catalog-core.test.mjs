import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCartridgeCatalog, serializeCartridgeCatalog } from '../browser/cartridge-catalog-core.mjs';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);
function manifest(id, digest) {
  return { schemaVersion:'gameroad.cartridge-manifest.v1', id, version:'1.0.0', hostApi:'gameroad.cartridge-host.v1', entry:{kind:'recipe',ref:'recipe.json'}, capabilities:['ui.surface'], payloadDigest:digest, display:{name:id} };
}

test('catalog sorts deterministically and serialization is stable', () => {
  const catalog = buildCartridgeCatalog([
    { manifestRef:'data/z/manifest.json', manifest:manifest('golden.zed',digestB) },
    { manifestRef:'data/a/manifest.json', manifest:manifest('golden.alpha',digestA) },
  ]);
  assert.deepEqual(catalog.entries.map((e)=>e.id), ['golden.alpha','golden.zed']);
  assert.equal(serializeCartridgeCatalog(catalog), serializeCartridgeCatalog(buildCartridgeCatalog([
    { manifestRef:'data/a/manifest.json', manifest:manifest('golden.alpha',digestA) },
    { manifestRef:'data/z/manifest.json', manifest:manifest('golden.zed',digestB) },
  ])));
  assert.ok(Object.isFrozen(catalog));
});

test('catalog fails closed on invalid manifests and duplicate exact identity', () => {
  assert.throws(() => buildCartridgeCatalog([{manifestRef:'data/a/manifest.json',manifest:{}}]), /catalog_manifest_invalid/);
  assert.throws(() => buildCartridgeCatalog([
    {manifestRef:'data/a/manifest.json',manifest:manifest('golden.same',digestA)},
    {manifestRef:'data/b/manifest.json',manifest:manifest('golden.same',digestB)},
  ]), /catalog_duplicate_identity:golden.same@1.0.0/);
});
