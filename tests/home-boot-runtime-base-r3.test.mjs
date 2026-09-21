import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('R3 Home composition keeps the previous Home implementation behind a thin stable wrapper', () => {
  const wrapper = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(wrapper.includes("export * from './home-boot-runtime-base-r3.mjs'"));
  assert.ok(wrapper.includes('mountStudyRunFromCurrentBrowser'));
  assert.ok(base.includes('mountRogueRunFromCurrentBrowser'));
  assert.ok(base.includes('mountHomeBootPresentation'));
  assert.equal(wrapper.includes('GAMEROAD.html'), false);
});

test('R1 rank match is a Battle child and uses the generated presentation surface', () => {
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(base.includes("'.codexBattleCrest'"));
  assert.ok(base.includes("'.codexRankLabel'"));
  assert.ok(base.includes('data-rank-match-controls'));
  assert.ok(base.includes('ランクマッチ'));
  assert.ok(base.includes('data-rank-waiting'));
  assert.ok(base.includes('role', 'dialog'));
  assert.ok(base.includes('RANK_MATCH_TEXTURES'));
  assert.ok(base.includes('partner.saasuna'));
  assert.ok(base.includes('setAdvicePartnerId'));
  assert.ok(base.includes('GAMEROAD_RANK_MATCH_SEARCH'));
});


test('R2 rank match externalizes generated textures and square-constrains the partner picker', () => {
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  const expectedAssets = [
    './assets/visual/rank-match/waiting-bg.webp',
    './assets/visual/rank-match/ui-chrome.webp',
    './assets/visual/rank-match/partner-picker.webp',
    './assets/visual/rank-match/picker-modal.webp',
    './assets/visual/rank-match/picker-tile-selected.webp',
    './assets/visual/rank-match/button-primary.webp',
    './assets/visual/rank-match/button-secondary.webp',
    './assets/visual/rank-match/action-ring.webp',
    './assets/visual/rank-match/waiting-vfx.webp',
  ];
  for (const asset of expectedAssets) assert.ok(base.includes(asset), asset);
  assert.equal(base.includes('data:image/webp;base64'), false);
  assert.ok(base.includes('aspect-ratio:1/1'));
  assert.ok(base.includes('background-image:var(--rank-match-picker)'));
  assert.ok(base.includes("if (event.target === overlay || event.target?.closest?.('[data-rank-picker-close]'))"));
  assert.ok(base.includes("if (event.key === 'Escape')"));
  assert.ok(base.includes('rankMatchRuntime.lastFocus?.focus?.()'));
});
