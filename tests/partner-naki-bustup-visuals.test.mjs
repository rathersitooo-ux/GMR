import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  NAKI_ADVICE_BUSTUP_FRAMES,
  NAKI_ADVICE_BUSTUP_SPRITE,
  resolveNakiAdviceBustupState,
  renderNakiAdviceBustup,
} from '../browser/partner-naki-bustup-visuals.mjs';

function fakeBustup() {
  const heading = { textContent: '' };
  const figure = {
    dataset: {}, hidden: false, attributes: new Map(),
    querySelector: (selector) => selector === '.partnerAdviceBustupHeader strong' ? heading : null,
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const image = { dataset: {}, style: {}, setAttribute(name, value) { this[name] = value; } };
  return { root: { dataset: {} }, bustup: { figure, image }, figure, image, heading };
}

test('Naki Advice resolves distinct exaggerated expressions for the active conversation context', () => {
  const base = { partnerId: 'partner.naki' };
  assert.equal(resolveNakiAdviceBustupState(base), 'GREET');
  assert.equal(resolveNakiAdviceBustupState({ ...base, quickRouteId: 'casual' }), 'IDOL_APPEAL');
  assert.equal(resolveNakiAdviceBustupState({ ...base, quickRouteId: 'situation' }), 'SHY');
  assert.equal(resolveNakiAdviceBustupState({ ...base, quickRouteId: 'idea' }), 'CHUUNIBYOU');
  assert.equal(resolveNakiAdviceBustupState({ ...base, tutorialActive: true }), 'WINK_PEACE');
  assert.equal(resolveNakiAdviceBustupState({ ...base, reactionActive: true }), 'SURPRISED');
  assert.equal(resolveNakiAdviceBustupState({ ...base, adviceActive: true }), 'LAUGH');
  assert.equal(resolveNakiAdviceBustupState({ partnerId: 'partner.other' }), null);
  assert.deepEqual(Object.keys(NAKI_ADVICE_BUSTUP_FRAMES), [
    'GREET', 'IDOL_APPEAL', 'SHY', 'WINK_PEACE', 'CHUUNIBYOU',
    'SURPRISED', 'POUT', 'LAUGH', 'MOVED',
  ]);
  assert.equal(NAKI_ADVICE_BUSTUP_SPRITE.fileName, 'naki-advice-bustup-candidate-r1.png');
});

test('Naki Advice renderer updates the shared bust-up slot and exposes text alternatives', () => {
  const nodes = fakeBustup();
  const result = renderNakiAdviceBustup({
    ...nodes,
    partnerId: 'partner.naki', partnerName: '緋累ナキ', battleActive: true,
    tutorialActive: true,
  });
  assert.equal(result.visible, true);
  assert.equal(result.state, 'WINK_PEACE');
  assert.equal(nodes.figure.hidden, false);
  assert.equal(nodes.heading.textContent, '緋累ナキ');
  assert.equal(nodes.image.alt, '緋累ナキ（ウィンク・ピース）');
  assert.equal(nodes.image.dataset.frameState, 'WINK_PEACE');
  assert.equal(nodes.root.dataset.partnerBustup, 'true');
  const hidden = renderNakiAdviceBustup({ ...nodes, partnerId: 'partner.saasuna', battleActive: true });
  assert.equal(hidden.visible, false);
  assert.equal(nodes.figure.hidden, true);
});

test('Naki candidate is a transparent 3×3 sheet and Board rendering is not modified here', () => {
  const bytes = readFileSync(new URL('../browser/assets/partners/naki-advice/naki-advice-bustup-candidate-r1.png', import.meta.url));
  assert.ok(bytes.readUInt32BE(16) >= 3);
  assert.ok(bytes.readUInt32BE(20) >= 3);
  assert.equal(bytes[25], 6, 'PNG color type must include alpha');
  const source = readFileSync(new URL('../browser/partner-naki-bustup-visuals.mjs', import.meta.url), 'utf8');
  assert.match(source, /partner\.naki/);
  assert.doesNotMatch(source, /battle-board-naki|board-visual|sprite-sheet/);
});
