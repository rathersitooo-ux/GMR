import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_STAGING_CSS,
  SETUP_STAGING_STYLE_ID,
  mountSetupStagingPresentation,
} from '../browser/setup-staging-presentation-runtime.mjs';

test('Setup staging CSS keeps existing controls and promotes only the existing start action', () => {
  assert.match(SETUP_STAGING_CSS, /section\[data-screen="setup"\] \[data-content\]/);
  assert.match(SETUP_STAGING_CSS, /section\[data-screen="setup"\] \[data-mode\]/);
  assert.match(SETUP_STAGING_CSS, /#startMatch/);
  assert.match(SETUP_STAGING_CSS, /min-height:44px/);
  assert.match(SETUP_STAGING_CSS, /position:sticky/);
  assert.match(SETUP_STAGING_CSS, /safe-area-inset-bottom/);
  assert.doesNotMatch(SETUP_STAGING_CSS, /data-home-target|data-screen="battle"|data-screen="settings"/);
});

test('Setup staging mount is idempotent and does not create a second state or route system', () => {
  const nodes = new Map();
  const head = { append(node) { nodes.set(node.id, node); } };
  const root = {
    head,
    getElementById(id) { return nodes.get(id) || null; },
    createElement(tag) { return { tagName: tag.toUpperCase(), id: '', textContent: '' }; },
  };
  assert.equal(mountSetupStagingPresentation(root), true);
  assert.equal(nodes.get(SETUP_STAGING_STYLE_ID)?.textContent, SETUP_STAGING_CSS);
  assert.equal(mountSetupStagingPresentation(root), false);
  assert.equal(nodes.size, 1);
});

test('Setup staging mount fail-closes when a document head is unavailable', () => {
  const root = {
    getElementById() { return null; },
    createElement() { return {}; },
    querySelector() { return null; },
  };
  assert.equal(mountSetupStagingPresentation(root), false);
});
