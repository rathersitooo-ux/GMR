import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseSource = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
const mountSource = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');

test('loading-state Home auto-mount yields until after DOMContentLoaded dispatch', () => {
  assert.ok(baseSource.includes("document.addEventListener('DOMContentLoaded', () => {\n      setTimeout(() => mountHomeBootPresentation(), 0);\n    }, { once: true });"));
  assert.equal(baseSource.includes("document.addEventListener('DOMContentLoaded', () => mountHomeBootPresentation(), { once: true });"), false);
  assert.ok(baseSource.includes("  } else {\n    mountHomeBootPresentation();\n  }"));
});

test('Study wrapper yields on the same boundary while preserving base-first registration', () => {
  assert.ok(mountSource.includes("export * from './home-boot-runtime-base-r3.mjs';"));
  assert.ok(mountSource.includes("document.addEventListener('DOMContentLoaded', () => {\n      setTimeout(mountStudyAfterHome, 0);\n    }, { once: true });"));
  assert.equal(mountSource.includes("document.addEventListener('DOMContentLoaded', mountStudyAfterHome, { once: true });"), false);
  assert.ok(mountSource.includes("  } else {\n    mountStudyAfterHome();\n  }"));
});
