export const ADVICE_BUSTUP_SPRITE_GRID = Object.freeze({ columns: 3, rows: 3, count: 9 });

const motionByArt = new WeakMap();
const spriteTransitionByImage = new WeakMap();

export function createAdviceBustupFrameMap(frameKeys) {
  if (!Array.isArray(frameKeys) || frameKeys.length !== ADVICE_BUSTUP_SPRITE_GRID.count) {
    throw new TypeError('Advice bust-up sprite must define exactly 9 frames');
  }
  const seen = new Set();
  const frames = {};
  frameKeys.forEach((value, index) => {
    if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,47}$/.test(value) || seen.has(value)) {
      throw new TypeError('Advice bust-up frame keys must be unique uppercase tokens');
    }
    seen.add(value);
    frames[value] = Object.freeze({
      key: value,
      index,
      column: index % ADVICE_BUSTUP_SPRITE_GRID.columns,
      row: Math.floor(index / ADVICE_BUSTUP_SPRITE_GRID.columns),
    });
  });
  return Object.freeze(frames);
}

export function syncAdviceBustupSpriteFrame({ image, entry, frame, alt } = {}) {
  if (!image || !entry || typeof entry.fileName !== 'string' || typeof entry.src !== 'string' || !frame) return false;
  const column = Number(frame.column);
  const row = Number(frame.row);
  if (!Number.isInteger(column) || !Number.isInteger(row)
    || column < 0 || column >= ADVICE_BUSTUP_SPRITE_GRID.columns
    || row < 0 || row >= ADVICE_BUSTUP_SPRITE_GRID.rows) return false;
  if (image.dataset.assetFile !== entry.fileName) {
    image.src = entry.src;
    image.dataset.assetFile = entry.fileName;
  }
  if (image.style) {
    image.style.position = 'absolute';
    image.style.width = '300%';
    image.style.height = '300%';
    image.style.maxWidth = 'none';
    image.style.objectFit = 'fill';
    image.style.objectPosition = '0 0';
    image.style.left = `${-column * 100}%`;
    image.style.top = `${-row * 100}%`;
  }
  image.dataset.frameState = String(frame.key || frame.index);
  image.dataset.frameColumn = String(column);
  image.dataset.frameRow = String(row);
  if (typeof alt === 'string') image.alt = alt;
  return true;
}

export function cancelAdviceBustupSpriteTransition(image, crossfadeImage) {
  const transition = image && spriteTransitionByImage.get(image);
  transition?.animations.forEach((animation) => animation?.cancel?.());
  if (image) {
    spriteTransitionByImage.delete(image);
    if (image.style) image.style.opacity = '';
  }
  if (crossfadeImage) {
    crossfadeImage.hidden = true;
    if (crossfadeImage.style) crossfadeImage.style.opacity = '';
  }
  return Boolean(transition);
}

export function transitionAdviceBustupSpriteFrame({
  image,
  crossfadeImage,
  entry,
  frame,
  alt,
  durationMs = 180,
  reducedMotion = false,
} = {}) {
  if (!image || !entry || !frame) return false;
  const previousFrame = image.dataset?.frameState
    ? {
      key: image.dataset.frameState,
      column: Number(image.dataset.frameColumn),
      row: Number(image.dataset.frameRow),
    }
    : null;
  const targetFrameKey = String(frame.key || frame.index);
  if (image.dataset.assetFile === entry.fileName && previousFrame?.key === targetFrameKey) {
    const activeTransition = spriteTransitionByImage.get(image);
    if (activeTransition?.targetFrameKey === targetFrameKey && durationMs > 0 && !reducedMotion) return true;
    cancelAdviceBustupSpriteTransition(image, crossfadeImage);
    syncAdviceBustupSpriteFrame({ image, entry, frame, alt });
    return false;
  }
  const canCrossfade = Boolean(
    crossfadeImage &&
    previousFrame &&
    image.dataset.assetFile === entry.fileName &&
    previousFrame.key !== targetFrameKey &&
    Number.isInteger(previousFrame.column) && Number.isInteger(previousFrame.row) &&
    durationMs > 0 && !reducedMotion &&
    typeof image.animate === 'function' && typeof crossfadeImage.animate === 'function',
  );

  cancelAdviceBustupSpriteTransition(image, crossfadeImage);
  if (!canCrossfade) {
    syncAdviceBustupSpriteFrame({ image, entry, frame, alt });
    return false;
  }

  syncAdviceBustupSpriteFrame({
    image: crossfadeImage,
    entry,
    frame: previousFrame,
    alt: image.alt || '',
  });
  crossfadeImage.setAttribute?.('aria-hidden', 'true');
  crossfadeImage.hidden = false;
  crossfadeImage.style.opacity = '1';
  image.style.opacity = '0';
  syncAdviceBustupSpriteFrame({ image, entry, frame, alt });

  let outAnimation = null;
  let inAnimation = null;
  try {
    outAnimation = crossfadeImage.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: durationMs,
      easing: 'ease-out',
      fill: 'both',
    });
    inAnimation = image.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: durationMs,
      easing: 'ease-in',
      fill: 'both',
    });
  } catch {
    cancelAdviceBustupSpriteTransition(image, crossfadeImage);
    syncAdviceBustupSpriteFrame({ image, entry, frame, alt });
    return false;
  }

  const transition = { animations: [outAnimation, inAnimation], targetFrameKey };
  spriteTransitionByImage.set(image, transition);
  const finish = () => {
    if (spriteTransitionByImage.get(image) !== transition) return;
    spriteTransitionByImage.delete(image);
    outAnimation?.cancel?.();
    inAnimation?.cancel?.();
    crossfadeImage.hidden = true;
    crossfadeImage.style.opacity = '';
    image.style.opacity = '';
  };
  const finished = [outAnimation?.finished, inAnimation?.finished].filter((promise) => promise?.then);
  if (finished.length) Promise.allSettled(finished).then(finish);
  else setTimeout(finish, durationMs);
  return true;
}

export function renderAdviceBustupSprite({
  root,
  bustup,
  partnerId,
  partnerName,
  entry,
  frame,
  battleActive = false,
  alt = '',
  legacyRootFlag = null,
  transitionMs = 180,
  reducedMotion = null,
} = {}) {
  const visible = Boolean(root && bustup?.figure && bustup?.image && battleActive && entry && frame && partnerId);
  if (root) {
    root.dataset.partnerBustup = visible ? 'true' : 'false';
    if (legacyRootFlag) root.dataset[legacyRootFlag] = visible ? 'true' : 'false';
  }
  if (!bustup?.figure || !bustup?.image) return Object.freeze({ visible: false, state: null, frame: null, asset: null });
  const { figure, image } = bustup;
  figure.hidden = !visible;
  const crossfadeImage = bustup.crossfadeImage || figure.querySelector?.('[data-role="saasuna-motion-crossfade"]') || null;
  const shouldReduceMotion = reducedMotion ?? Boolean(
    image.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  );
  if (!visible) {
    cancelAdviceBustupSpriteTransition(image, crossfadeImage);
    delete figure.dataset.state;
    delete figure.dataset.expressionState;
    delete figure.dataset.partnerId;
    return Object.freeze({ visible: false, state: null, frame: null, asset: null });
  }
  const previousPartnerId = figure.dataset.partnerId;
  if (previousPartnerId && previousPartnerId !== partnerId) {
    cancelAdviceBustupSpriteTransition(image, crossfadeImage);
  }
  figure.dataset.partnerId = partnerId;
  figure.dataset.presentationOnly = 'true';
  figure.dataset.state = frame.key;
  figure.dataset.expressionState = frame.key;
  figure.setAttribute?.('aria-label', `${partnerName} アドバイスパートナー`);
  const heading = figure.querySelector?.('.partnerAdviceBustupHeader strong');
  if (heading) heading.textContent = partnerName;
  transitionAdviceBustupSpriteFrame({
    image,
    crossfadeImage: previousPartnerId === partnerId ? crossfadeImage : null,
    entry,
    frame,
    alt,
    durationMs: transitionMs,
    reducedMotion: shouldReduceMotion,
  });
  return Object.freeze({ visible: true, state: frame.key, frame: frame.key, asset: entry.fileName });
}

const MOTION_POSES = Object.freeze({
  GENTLE: Object.freeze({ duration: 4600, loop: true, easing: 'ease-in-out', frames: [
    { transform: 'translate3d(0,2px,0) scale(.995)' },
    { transform: 'translate3d(0,-1px,0) scale(1.008)' },
    { transform: 'translate3d(0,2px,0) scale(.995)' },
  ] }),
  GREET: Object.freeze({ duration: 3400, loop: true, easing: 'ease-in-out', frames: [
    { transform: 'translate3d(0,2px,0) scale(.995)' },
    { transform: 'translate3d(0,-2px,0) scale(1.012)' },
    { transform: 'translate3d(0,2px,0) scale(.995)' },
  ] }),
  IDOL_APPEAL: Object.freeze({ duration: 1250, loop: false, easing: 'cubic-bezier(.18,.88,.23,1)', frames: [
    { transform: 'translate3d(0,5px,0) scale(.97)' },
    { transform: 'translate3d(-4px,-5px,0) rotate(-1deg) scale(1.035)' },
    { transform: 'translate3d(3px,-2px,0) rotate(1deg) scale(1.015)' },
    { transform: 'translate3d(0,1px,0) scale(1)' },
  ] }),
  WINK_PEACE: Object.freeze({ duration: 1050, loop: false, easing: 'cubic-bezier(.2,.82,.22,1)', frames: [
    { transform: 'translate3d(0,3px,0) scale(.985)' },
    { transform: 'translate3d(2px,-4px,0) rotate(1deg) scale(1.035)' },
    { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
  ] }),
  CHUUNIBYOU: Object.freeze({ duration: 1450, loop: false, easing: 'cubic-bezier(.12,.9,.2,1)', frames: [
    { transform: 'translate3d(0,5px,0) scale(.96)' },
    { transform: 'translate3d(-3px,-6px,0) rotate(-2deg) scale(1.06)' },
    { transform: 'translate3d(2px,-3px,0) rotate(1deg) scale(1.025)' },
    { transform: 'translate3d(0,0,0) scale(1)' },
  ] }),
  SURPRISED: Object.freeze({ duration: 820, loop: false, easing: 'cubic-bezier(.12,.9,.2,1)', frames: [
    { transform: 'translate3d(0,2px,0) scale(.96)' },
    { transform: 'translate3d(0,-7px,0) scale(1.09)' },
    { transform: 'translate3d(0,-2px,0) scale(1.02)' },
    { transform: 'translate3d(0,0,0) scale(1)' },
  ] }),
  LAUGH: Object.freeze({ duration: 1000, loop: false, easing: 'ease-out', frames: [
    { transform: 'translate3d(0,3px,0) scale(.99)' },
    { transform: 'translate3d(0,-5px,0) rotate(1deg) scale(1.04)' },
    { transform: 'translate3d(0,1px,0) rotate(-.5deg) scale(1.01)' },
    { transform: 'translate3d(0,0,0) scale(1)' },
  ] }),
  TEARY: Object.freeze({ duration: 1450, loop: false, easing: 'ease-in-out', frames: [
    { transform: 'translate3d(0,2px,0) scale(.99)' },
    { transform: 'translate3d(0,6px,0) rotate(-.5deg) scale(.98)' },
    { transform: 'translate3d(0,3px,0) scale(.995)' },
  ] }),
  MOVED: Object.freeze({ duration: 1450, loop: false, easing: 'ease-in-out', frames: [
    { transform: 'translate3d(0,3px,0) scale(.99)' },
    { transform: 'translate3d(0,-4px,0) scale(1.025)' },
    { transform: 'translate3d(0,0,0) scale(1)' },
  ] }),
  DOWNCAST: Object.freeze({ duration: 1650, loop: false, easing: 'ease-in-out', frames: [
    { transform: 'translate3d(0,2px,0) scale(.995)' },
    { transform: 'translate3d(0,7px,0) scale(.975)' },
    { transform: 'translate3d(0,3px,0) scale(.99)' },
  ] }),
  SHY: Object.freeze({ duration: 1300, loop: false, easing: 'ease-in-out', frames: [
    { transform: 'translate3d(0,3px,0) scale(.99)' },
    { transform: 'translate3d(-4px,0,0) rotate(-1deg) scale(1.02)' },
    { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
  ] }),
  POUT: Object.freeze({ duration: 900, loop: false, easing: 'ease-out', frames: [
    { transform: 'translate3d(0,2px,0) scale(1)' },
    { transform: 'translate3d(0,-2px,0) scale(1.035)' },
    { transform: 'translate3d(0,1px,0) scale(1)' },
  ] }),
});

export function applyAdviceBustupMotion(art, state, { reducedMotion = false } = {}) {
  if (!art || typeof state !== 'string') return null;
  const pose = MOTION_POSES[state] || MOTION_POSES.GENTLE;
  const current = motionByArt.get(art);
  current?.cancel?.();
  art.dataset.motionState = state;
  const finalTransform = pose.frames.at(-1).transform;
  if (reducedMotion) {
    if (art.style) art.style.transform = finalTransform;
    motionByArt.delete(art);
    return Object.freeze({ state, animated: false, animation: null });
  }
  let animation = null;
  try {
    animation = art.animate?.(pose.frames, {
      duration: pose.duration,
      easing: pose.easing,
      fill: 'both',
      iterations: pose.loop ? Infinity : 1,
    }) || null;
  } catch { animation = null; }
  if (animation) motionByArt.set(art, animation);
  else if (art.style) art.style.transform = finalTransform;
  return Object.freeze({ state, animated: Boolean(animation), animation });
}

export function cancelAdviceBustupMotion(art) {
  const animation = art && motionByArt.get(art);
  animation?.cancel?.();
  if (art) {
    motionByArt.delete(art);
    delete art.dataset.motionState;
  }
  return Boolean(animation);
}

export function ensureAdviceBustupLayoutStyle(doc) {
  const id = 'gameroad-partner-advice-bustup-layout-r1';
  if (!doc?.head || doc.getElementById?.(id)) return false;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = `section[data-screen="battle"] #partnerAdviceChatPresentation[data-partner-bustup="true"]{left:clamp(146px,19vw,214px)}@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] #partnerAdviceChatPresentation[data-partner-bustup="true"]{left:112px}}@media(max-width:540px) and (orientation:portrait){section[data-screen="battle"] #partnerAdviceChatPresentation[data-partner-bustup="true"]{left:max(8px,env(safe-area-inset-left))!important}}`;
  doc.head.append(style);
  return true;
}
