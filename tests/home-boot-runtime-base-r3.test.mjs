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


test('R4 rank match tactile feedback and short-landscape recompose remain presentation-only', () => {
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  for (const selector of [
    '.gameroadRankMatchMode:active',
    '.rankWaitingBack:active,.rankWaitingCancel:active',
    '.rankWaitingPartner:active',
    '.rankWaitingAction:active',
    '.rankPartnerPickerClose:active',
    '.rankPartnerChoice:active',
  ]) assert.ok(base.includes(selector), selector);
  assert.ok(base.includes('@media(max-height:430px) and (orientation:landscape)'));
  assert.ok(base.includes('.rankWaitingContent{grid-template-columns:minmax(96px,.55fr) minmax(190px,1.35fr) minmax(132px,.72fr)'));
  assert.ok(base.includes('.rankWaitingAction{min-width:118px;min-height:44px'));
  assert.ok(base.includes('.rankPartnerPickerShell{width:min(92vh,92vw,680px)'));
  assert.ok(base.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(base.includes('.rankPartnerChoice:active{transform:none!important;}'));
  assert.ok(base.includes("style.textContent = style.textContent.replaceAll('gameroadd', 'gameroad');"));
  assert.equal(base.includes('GAMEROAD_RANK_MATCH_SEARCH ='), false);
});


test('R4B rank match observer refresh is idempotent for observed DOM writes', () => {
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(base.includes("attributeFilter: ['class', 'hidden']"));
  assert.ok(base.includes('if (!surface.hidden) surface.hidden = true;'));
  assert.ok(base.includes('if (surface.hidden) surface.hidden = false;'));
  assert.ok(base.includes('if (!runtimeNode.hidden) runtimeNode.hidden = true;'));
  assert.ok(base.includes('if (image.hidden !== nextImageHidden) image.hidden = nextImageHidden;'));
  assert.ok(base.includes('if (icon.hidden !== nextIconHidden) icon.hidden = nextIconHidden;'));
  assert.ok(base.includes('if (icon.textContent !== nextIconText) icon.textContent = nextIconText;'));
  assert.ok(base.includes('if (nameNode && nameNode.textContent !== name) nameNode.textContent = name;'));
  assert.ok(base.includes('if (overlay.hidden) overlay.hidden = false;'));
  assert.ok(base.includes('if (!overlay.hidden) overlay.hidden = true;'));
  assert.equal(base.includes("if (!active) {\n    surface.hidden = true;"), false);
  assert.equal(base.includes("if (runtimeNode) {\n    if (!runtimeNode.dataset.rankPreviousHidden) runtimeNode.dataset.rankPreviousHidden = runtimeNode.hidden ? 'true' : 'false';\n    runtimeNode.hidden = true;"), false);
});


test('R5 rank match refresh observes only screen roots and keeps body bootstrap child-only', () => {
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(base.includes('observerSignature'));
  assert.ok(base.includes('rankMatchBindObserver'));
  assert.ok(base.includes('observer.observe(target, {'));
  assert.ok(base.includes("attributeFilter: ['class', 'hidden']"));
  assert.ok(base.includes('observer.observe(doc.body, { childList: true, subtree: true });'));
  assert.equal(base.includes("observer.observe(doc.body, { childList: true, subtree: true, attributes: true"), false);
});
