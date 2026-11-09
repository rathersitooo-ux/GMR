import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// BROWSER-GACHA-ARCADE-RITUAL-PLAYTEST-001 — embedded movie source-byte retirement.
// Proof that the old MP4 bytes are gone from the shipped HTML while the
// already-accepted native reveal player path still exists. This test reads
// source only; it does not play a video and does not grant any reward.
const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const navigationCore = readFileSync(
  new URL('../browser/screen-navigation-core.mjs', import.meta.url),
  'utf8',
);

test('gacha movie source bytes are retired from GAMEROAD.html', () => {
  assert.equal(html.includes('GACHA_VIDEO_A01'), false);
  assert.equal(html.includes('GACHA_VIDEO_B01'), false);
  assert.equal(html.includes('data:video/mp4;base64'), false);
  assert.equal(html.includes('playStage('), false);
});

test('gacha player path still exists without the movie', () => {
  // The native reveal mount still needs the video node to exist.
  assert.equal(html.includes('<video id="gachaVideo"'), true);
  // Opening a pack still builds the 7-card preview and still reveals it.
  assert.equal(html.includes("$('#openPack').onclick"), true);
  assert.equal(html.includes('buildPackPreview()'), true);
  assert.equal(html.includes('function revealPack()'), true);
  assert.equal(html.includes('function buildPackPreview(){'), true);
  assert.equal(html.includes('for(let i=0;i<7;i++)'), true);
  // The guarded fallback still opens the pack when the mount is absent.
  assert.equal(html.includes('gachaRevealFallbackMs'), true);
  assert.equal(html.includes('if(state.gachaBusy)revealPack()'), true);
  // Skip still reveals directly.
  assert.equal(html.includes("$('#skipPack').onclick=()=>{revealPack()}"), true);
});

test('native reveal consumer is still wired', () => {
  assert.equal(navigationCore.includes('export function ensureGachaNativeRevealRuntime'), true);
  assert.equal(
    navigationCore.includes("if (decision.to === 'gacha')"),
    true,
  );
  assert.equal(
    navigationCore.includes('ensureGachaNativeRevealRuntime(globalThis.document)'),
    true,
  );
  assert.equal(
    html.includes('createScreenTransitionRuntimeAdapter'),
    true,
  );
});
