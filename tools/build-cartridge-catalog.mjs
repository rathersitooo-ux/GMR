#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildCartridgeCatalog, serializeCartridgeCatalog } from '../browser/cartridge-catalog-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const goldenRoot = path.join(repoRoot, 'data', 'cartridges', 'golden');
const outputPath = path.join(repoRoot, 'data', 'cartridges', 'catalog.generated.json');

async function loadInputs() {
  const dirs = (await fs.readdir(goldenRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const inputs = [];
  for (const dir of dirs) {
    const manifestPath = path.join(goldenRoot, dir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    inputs.push({ manifestRef: path.posix.join('data/cartridges/golden', dir, 'manifest.json'), manifest });
  }
  return inputs;
}

const serialized = serializeCartridgeCatalog(buildCartridgeCatalog(await loadInputs()));
if (process.argv.includes('--check')) {
  let current = null;
  try { current = await fs.readFile(outputPath, 'utf8'); } catch {}
  if (current !== serialized) {
    console.error('cartridge_catalog_out_of_date');
    process.exitCode = 1;
  } else {
    console.log('cartridge_catalog_current');
  }
} else {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized);
  console.log(path.relative(repoRoot, outputPath));
}
