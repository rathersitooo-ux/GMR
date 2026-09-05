import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_MODE_PICTOGRAMS,
  SETUP_STAGING_PRESENTATION_CSS,
} from '../browser/home-shell-presentation-core.mjs';

test('Setup mode presentation makes participant count and 2v2 team split visually legible', () => {
  assert.equal(Object.isFrozen(SETUP_MODE_PICTOGRAMS), true);
  assert.deepEqual(SETUP_MODE_PICTOGRAMS, {
    '2p': '● ●',
    '4p': '● ● ● ●',
    '2v2': '●● │ ●●',
  });

  assert.match(SETUP_STAGING_PRESENTATION_CSS, /\[data-mode\]::before\{/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /\[data-mode="2p"\]::before\{content:"● ●"\}/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /\[data-mode="4p"\]::before\{content:"● ● ● ●"\}/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /\[data-mode="2v2"\]::before\{content:"●● │ ●●";letter-spacing:\.06em\}/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /\[data-mode\]\.on::before\{/);
});

test('Setup pictograms preserve the existing interaction and mobile presentation guards', () => {
  assert.doesNotMatch(SETUP_STAGING_PRESENTATION_CSS, /pointer-events\s*:/);
  assert.doesNotMatch(SETUP_STAGING_PRESENTATION_CSS, /display\s*:\s*none/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /min-height:44px !important/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /@media \(max-width:540px\)/);
  assert.match(SETUP_STAGING_PRESENTATION_CSS, /@media \(max-height:430px\) and \(orientation:landscape\)/);
});
