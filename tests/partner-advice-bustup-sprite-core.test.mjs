import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADVICE_BUSTUP_SPRITE_GRID,
  applyAdviceBustupMotion,
  createAdviceBustupFrameMap,
  renderAdviceBustupSprite,
  syncAdviceBustupSpriteFrame,
  transitionAdviceBustupSpriteFrame,
} from '../browser/partner-advice-bustup-sprite-core.mjs';

class FakeNode {
  constructor() { this.dataset = {}; this.style = {}; this.animations = []; this.hidden = false; }
  animate(keyframes, timing) {
    const animation = { keyframes, timing, cancel() {}, finished: Promise.resolve() };
    this.animations.push(animation);
    return animation;
  }
}

test('3×3 advice sprite frames map each named expression to one unique cell', () => {
  const frames = createAdviceBustupFrameMap(['GENTLE', 'IDOL', 'CURIOUS', 'WINK', 'FOCUSED', 'SURPRISED', 'TEARY', 'LAUGH', 'DOWNCAST']);
  assert.deepEqual(ADVICE_BUSTUP_SPRITE_GRID, { columns: 3, rows: 3, count: 9 });
  assert.equal(Object.keys(frames).length, 9);
  assert.deepEqual([frames.GENTLE.column, frames.GENTLE.row], [0, 0]);
  assert.deepEqual([frames.WINK.column, frames.WINK.row], [0, 1]);
  assert.deepEqual([frames.DOWNCAST.column, frames.DOWNCAST.row], [2, 2]);
  assert.equal(new Set(Object.values(frames).map(({ index }) => index)).size, 9);
  assert.throws(() => createAdviceBustupFrameMap(['ONLY_ONE']), /exactly 9/);
});

test('sprite sync uses bounded one-cell crop geometry and updates the accessible frame description', () => {
  const image = new FakeNode();
  const frame = { key: 'WINK_PEACE', column: 0, row: 1 };
  const entry = { fileName: 'candidate.png', src: 'file:///candidate.png' };
  assert.equal(syncAdviceBustupSpriteFrame({ image, entry, frame, alt: 'ナキ（ウィンク）' }), true);
  assert.equal(image.src, entry.src);
  assert.equal(image.style.width, '300%');
  assert.equal(image.style.height, '300%');
  assert.equal(image.style.left, '0%');
  assert.equal(image.style.top, '-100%');
  assert.equal(image.dataset.frameState, 'WINK_PEACE');
  assert.equal(image.alt, 'ナキ（ウィンク）');
  assert.equal(syncAdviceBustupSpriteFrame({ image, entry, frame: null }), false);
});

test('same-partner expression frames crossfade the old crop into the new crop', () => {
  const image = new FakeNode();
  const crossfadeImage = new FakeNode();
  const entry = { fileName: 'candidate.png', src: 'file:///candidate.png' };
  const frames = createAdviceBustupFrameMap(['GENTLE', 'IDOL', 'CURIOUS', 'WINK', 'FOCUSED', 'SURPRISED', 'TEARY', 'LAUGH', 'DOWNCAST']);
  syncAdviceBustupSpriteFrame({ image, entry, frame: frames.WINK, alt: '相棒（ウィンク）' });

  assert.equal(transitionAdviceBustupSpriteFrame({ image, crossfadeImage, entry, frame: frames.LAUGH, alt: '相棒（笑顔）', durationMs: 240 }), true);
  assert.equal(image.dataset.frameState, 'LAUGH');
  assert.equal(crossfadeImage.dataset.frameState, 'WINK');
  assert.equal(crossfadeImage.hidden, false);
  assert.equal(image.style.opacity, '0');
  assert.equal(crossfadeImage.style.opacity, '1');
  assert.deepEqual(image.animations.at(-1).keyframes, [{ opacity: 0 }, { opacity: 1 }]);
  assert.deepEqual(crossfadeImage.animations.at(-1).keyframes, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(image.animations.at(-1).timing.duration, 240);
  assert.equal(crossfadeImage.animations.at(-1).timing.duration, 240);
});

test('a repeated render keeps the current expression crossfade alive', () => {
  const image = new FakeNode();
  const crossfadeImage = new FakeNode();
  const entry = { fileName: 'candidate.png', src: 'file:///candidate.png' };
  const frames = createAdviceBustupFrameMap(['GENTLE', 'IDOL', 'CURIOUS', 'WINK', 'FOCUSED', 'SURPRISED', 'TEARY', 'LAUGH', 'DOWNCAST']);
  syncAdviceBustupSpriteFrame({ image, entry, frame: frames.WINK });
  transitionAdviceBustupSpriteFrame({ image, crossfadeImage, entry, frame: frames.LAUGH });
  const imageAnimationCount = image.animations.length;
  const overlayAnimationCount = crossfadeImage.animations.length;

  assert.equal(transitionAdviceBustupSpriteFrame({ image, crossfadeImage, entry, frame: frames.LAUGH }), true);
  assert.equal(crossfadeImage.hidden, false);
  assert.equal(image.animations.length, imageAnimationCount);
  assert.equal(crossfadeImage.animations.length, overlayAnimationCount);
});

test('the shared Advice renderer crossfades expressions but not a partner identity switch', () => {
  const root = new FakeNode();
  const figure = new FakeNode();
  const image = new FakeNode();
  const crossfadeImage = new FakeNode();
  const bustup = { figure, image, crossfadeImage };
  const entry = { fileName: 'saasuna.png', src: 'file:///saasuna.png' };
  const secondEntry = { fileName: 'naki.png', src: 'file:///naki.png' };
  const frames = createAdviceBustupFrameMap(['GENTLE', 'IDOL', 'CURIOUS', 'WINK', 'FOCUSED', 'SURPRISED', 'TEARY', 'LAUGH', 'DOWNCAST']);
  const render = (partnerId, selectedEntry, frame) => renderAdviceBustupSprite({
    root,
    bustup,
    partnerId,
    partnerName: partnerId,
    entry: selectedEntry,
    frame,
    battleActive: true,
  });

  render('partner.saasuna', entry, frames.GENTLE);
  render('partner.saasuna', entry, frames.LAUGH);
  assert.equal(image.dataset.frameState, 'LAUGH');
  assert.equal(crossfadeImage.dataset.frameState, 'GENTLE');
  assert.equal(crossfadeImage.hidden, false);
  render('partner.saasuna', entry, frames.LAUGH);
  assert.equal(crossfadeImage.hidden, false, 'a repeated Advice render must not end the in-flight fade');

  render('partner.naki', secondEntry, frames.GENTLE);
  assert.equal(image.dataset.assetFile, secondEntry.fileName);
  assert.equal(crossfadeImage.hidden, true);
});

test('reduced motion changes the frame immediately and cancels any stale overlay', () => {
  const image = new FakeNode();
  const crossfadeImage = new FakeNode();
  const entry = { fileName: 'candidate.png', src: 'file:///candidate.png' };
  const frames = createAdviceBustupFrameMap(['GENTLE', 'IDOL', 'CURIOUS', 'WINK', 'FOCUSED', 'SURPRISED', 'TEARY', 'LAUGH', 'DOWNCAST']);
  syncAdviceBustupSpriteFrame({ image, entry, frame: frames.WINK });
  transitionAdviceBustupSpriteFrame({ image, crossfadeImage, entry, frame: frames.LAUGH });

  assert.equal(transitionAdviceBustupSpriteFrame({ image, crossfadeImage, entry, frame: frames.GENTLE, reducedMotion: true }), false);
  assert.equal(image.dataset.frameState, 'GENTLE');
  assert.equal(image.style.opacity, '');
  assert.equal(crossfadeImage.hidden, true);
});

test('the shared renderer honors the browser reduced-motion preference', () => {
  const root = new FakeNode();
  const figure = new FakeNode();
  const image = new FakeNode();
  const crossfadeImage = new FakeNode();
  image.ownerDocument = { defaultView: { matchMedia: () => ({ matches: true }) } };
  const entry = { fileName: 'candidate.png', src: 'file:///candidate.png' };
  const frames = createAdviceBustupFrameMap(['GENTLE', 'IDOL', 'CURIOUS', 'WINK', 'FOCUSED', 'SURPRISED', 'TEARY', 'LAUGH', 'DOWNCAST']);
  const render = (frame) => renderAdviceBustupSprite({
    root,
    bustup: { figure, image, crossfadeImage },
    partnerId: 'partner.saasuna',
    partnerName: 'サースナー',
    entry,
    frame,
    battleActive: true,
  });

  render(frames.GENTLE);
  render(frames.LAUGH);
  assert.equal(image.dataset.frameState, 'LAUGH');
  assert.equal(crossfadeImage.hidden, true);
  assert.equal(image.animations.length, 0);
});

test('advice bust-up motion differentiates expression poses and honors reduced motion', () => {
  const art = new FakeNode();
  const idol = applyAdviceBustupMotion(art, 'IDOL_APPEAL');
  assert.equal(idol.animated, true);
  assert.equal(art.animations.length, 1);
  assert.ok(art.animations[0].timing.duration > 0);
  const dramatic = applyAdviceBustupMotion(art, 'CHUUNIBYOU');
  assert.equal(dramatic.animated, true);
  assert.match(art.animations.at(-1).keyframes[1].transform, /rotate/);
  const before = art.animations.length;
  const staticPose = applyAdviceBustupMotion(art, 'SURPRISED', { reducedMotion: true });
  assert.equal(staticPose.animated, false);
  assert.equal(art.animations.length, before);
  assert.equal(art.dataset.motionState, 'SURPRISED');
});
