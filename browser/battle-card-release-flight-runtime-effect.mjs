import {
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  projectBattleCardReleaseFlightMotion,
  toBattleCardReleaseFlightKeyframes,
} from './battle-card-release-flight-motion-core.mjs';

export const BATTLE_CARD_RELEASE_FLIGHT_EASING = 'cubic-bezier(.16,.74,.18,1)';
export const BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS = 160;

const SVG_NS = 'http://www.w3.org/2000/svg';

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function finiteRect(value) {
  const left = Number(value?.left);
  const top = Number(value?.top);
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function removeNode(node) {
  try {
    node?.remove?.();
  } catch {}
}

function cleanupWhenFinished(animation, cleanup) {
  const finished = animation?.finished;
  if (finished && typeof finished.then === 'function') {
    finished.then(cleanup, cleanup);
    return;
  }
  if (typeof animation?.addEventListener === 'function') {
    animation.addEventListener('finish', cleanup, { once: true });
    animation.addEventListener('cancel', cleanup, { once: true });
  }
}

function canonicalAssetUrl(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalAssets(sourceNode, visualNode, assets) {
  const source = assets && typeof assets === 'object' && !Array.isArray(assets) ? assets : {};
  return Object.freeze({
    heroFrameUrl: canonicalAssetUrl(
      source.heroFrameUrl
      ?? visualNode?.dataset?.releaseVfxHeroFrameSrc
      ?? sourceNode?.dataset?.releaseVfxHeroFrameSrc
    ),
    impactSpriteUrl: canonicalAssetUrl(
      source.impactSpriteUrl
      ?? visualNode?.dataset?.releaseVfxImpactSrc
      ?? sourceNode?.dataset?.releaseVfxImpactSrc
    ),
    receiptGlowUrl: canonicalAssetUrl(
      source.receiptGlowUrl
      ?? visualNode?.dataset?.releaseVfxReceiptSrc
      ?? sourceNode?.dataset?.releaseVfxReceiptSrc
    ),
  });
}

function styleFlightClone(clone, visualRect, start) {
  if (!clone?.style || !visualRect || !finitePoint(start)) return false;
  clone.disabled = false;
  if (clone.dataset) {
    clone.dataset.armed = 'false';
    clone.dataset.jankenFlight = '1';
    clone.dataset.battleCardHeroShot = '1';
  }
  clone.setAttribute?.('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${start.x - (visualRect.width / 2)}px`,
    top: `${start.y - (visualRect.height / 2)}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${visualRect.width}px`,
    height: `${visualRect.height}px`,
    margin: '0',
    opacity: '1',
    pointerEvents: 'none',
    zIndex: '161',
    transition: 'none',
    transformOrigin: '50% 50%',
    willChange: 'transform,opacity,filter',
  });
  return true;
}

function scheduleStaticCueCleanup(cue) {
  if (typeof globalThis?.setTimeout !== 'function') return;
  const timer = globalThis.setTimeout(
    () => removeNode(cue),
    BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS,
  );
  timer?.unref?.();
}

function scheduleSettledCallback(documentRef, durationMs, callback, payload) {
  if (typeof callback !== 'function') return;
  const timerApi = documentRef?.defaultView?.setTimeout ?? globalThis?.setTimeout;
  if (typeof timerApi !== 'function') {
    try { callback(payload); } catch {}
    return;
  }
  const timer = timerApi(() => {
    try { callback(payload); } catch {}
  }, durationMs);
  timer?.unref?.();
}

function createDestinationPulse({ documentRef, host, target }) {
  if (!documentRef?.createElement || !host?.appendChild || !finitePoint(target)) return null;
  const cue = documentRef.createElement('span');
  if (!cue?.style) return null;
  if (cue.dataset) cue.dataset.jankenFlightDestination = '1';
  cue.setAttribute?.('aria-hidden', 'true');
  Object.assign(cue.style, {
    position: 'fixed',
    left: `${target.x}px`,
    top: `${target.y}px`,
    width: '22px',
    height: '22px',
    margin: '0',
    border: '2px solid rgba(255,255,255,.9)',
    borderRadius: '999px',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '159',
    transform: 'translate(-50%,-50%) scale(.94)',
    transformOrigin: '50% 50%',
  });
  host.appendChild(cue);

  if (typeof cue.animate === 'function') {
    try {
      const animation = cue.animate([
        { offset: 0, opacity: 0, transform: 'translate(-50%,-50%) scale(.94)' },
        { offset: 0.35, opacity: 0.78, transform: 'translate(-50%,-50%) scale(1.05)' },
        { offset: 1, opacity: 0, transform: 'translate(-50%,-50%) scale(1.18)' },
      ], {
        duration: BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS,
        easing: 'ease-out',
        fill: 'forwards',
      });
      cleanupWhenFinished(animation, () => removeNode(cue));
    } catch {
      removeNode(cue);
      return null;
    }
  } else {
    cue.style.opacity = '0.72';
    cue.style.transform = 'translate(-50%,-50%) scale(1)';
    if (cue.dataset) cue.dataset.jankenFlightDestinationFallback = 'static';
    scheduleStaticCueCleanup(cue);
  }
  return cue;
}

function cubicPathData(cue) {
  const start = finitePoint(cue?.start);
  const c1 = finitePoint(cue?.control1);
  const c2 = finitePoint(cue?.control2);
  const target = finitePoint(cue?.target);
  if (!start || !c1 || !c2 || !target) return null;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${target.x.toFixed(2)} ${target.y.toFixed(2)}`;
}

function createProceduralTrail({ documentRef, host, projection }) {
  if (projection?.trailCue?.kind !== 'PROCEDURAL_SVG_CUBIC'
    || typeof documentRef?.createElementNS !== 'function'
    || !host?.appendChild) return null;
  const d = cubicPathData(projection.trailCue);
  if (!d) return null;

  const svg = documentRef.createElementNS(SVG_NS, 'svg');
  if (!svg?.style) return null;
  svg.setAttribute?.('aria-hidden', 'true');
  svg.setAttribute?.('data-battle-card-release-trail', '1');
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: '159',
  });

  const configs = [
    { width: '18', opacity: '.26', dash: '.24 1', delay: 20 },
    { width: '4', opacity: '.96', dash: '.12 1', delay: 0 },
  ];
  for (const config of configs) {
    const path = documentRef.createElementNS(SVG_NS, 'path');
    path.setAttribute?.('d', d);
    path.setAttribute?.('pathLength', '1');
    path.setAttribute?.('fill', 'none');
    path.setAttribute?.('stroke', 'rgba(255,255,255,1)');
    path.setAttribute?.('stroke-width', config.width);
    path.setAttribute?.('stroke-linecap', 'round');
    path.setAttribute?.('stroke-dasharray', config.dash);
    path.setAttribute?.('stroke-dashoffset', '.18');
    path.setAttribute?.('opacity', config.opacity);
    svg.appendChild?.(path);

    if (typeof path.animate === 'function') {
      try {
        path.animate([
          { strokeDashoffset: '.18', opacity: 0 },
          { offset: 0.12, strokeDashoffset: '0', opacity: Number(config.opacity) },
          { offset: 0.86, strokeDashoffset: '-.78', opacity: Number(config.opacity) },
          { strokeDashoffset: '-1.02', opacity: 0 },
        ], {
          duration: Math.max(120, projection.durationMs * projection.trailCue.endOffset),
          delay: config.delay,
          easing: 'cubic-bezier(.15,.72,.16,1)',
          fill: 'forwards',
        });
      } catch {}
    }
  }

  host.appendChild(svg);
  return svg;
}

function createHeroLayer({ documentRef, host, projection, flight }) {
  const cue = projection?.heroCue;
  if (cue?.kind !== 'CENTER_HERO' || !documentRef?.createElement || !host?.appendChild) return null;
  const wrapper = documentRef.createElement('span');
  if (!wrapper?.style) return null;
  wrapper.setAttribute?.('aria-hidden', 'true');
  if (wrapper.dataset) wrapper.dataset.battleCardReleaseHero = '1';
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: `${cue.x}px`,
    top: `${cue.y}px`,
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
    zIndex: '160',
  });

  const size = Math.max(128, Math.min(280, Number(flight?.visualRect?.width ?? 72) * 2.5));
  const arrivalDelay = projection.durationMs * cue.arrivalOffset;
  const heroDuration = Math.max(100, projection.durationMs * (cue.holdEndOffset - cue.arrivalOffset));

  const flash = documentRef.createElement('span');
  Object.assign(flash.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: 'radial-gradient(circle,rgba(255,255,255,.86) 0%,rgba(255,255,255,.25) 28%,rgba(255,255,255,0) 68%)',
    transform: 'translate(-50%,-50%) scale(.35)',
    opacity: '0',
  });
  wrapper.appendChild(flash);

  const ring = documentRef.createElement('span');
  Object.assign(ring.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${Math.round(size * 0.72)}px`,
    height: `${Math.round(size * 0.72)}px`,
    border: '2px solid rgba(255,255,255,.78)',
    borderRadius: '50%',
    boxSizing: 'border-box',
    transform: 'translate(-50%,-50%) scale(.72)',
    opacity: '0',
  });
  wrapper.appendChild(ring);

  if (flight?.assets?.heroFrameUrl) {
    const image = documentRef.createElement('img');
    image.src = flight.assets.heroFrameUrl;
    image.alt = '';
    image.setAttribute?.('aria-hidden', 'true');
    Object.assign(image.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${size}px`,
      height: `${size}px`,
      objectFit: 'contain',
      transform: 'translate(-50%,-50%)',
      opacity: '0',
      pointerEvents: 'none',
    });
    wrapper.appendChild(image);
    if (typeof image.animate === 'function') {
      try {
        image.animate([
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' },
          { offset: 0.3, opacity: 1, transform: 'translate(-50%,-50%) scale(1.04)' },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1.08)' },
        ], { duration: heroDuration, delay: arrivalDelay, easing: 'ease-out', fill: 'forwards' });
      } catch {}
    }
  }

  if (flight?.assets?.impactSpriteUrl) {
    const impact = documentRef.createElement('img');
    impact.src = flight.assets.impactSpriteUrl;
    impact.alt = '';
    impact.setAttribute?.('aria-hidden', 'true');
    Object.assign(impact.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${Math.round(size * 0.78)}px`,
      height: `${Math.round(size * 0.78)}px`,
      objectFit: 'contain',
      transform: 'translate(-50%,-50%)',
      opacity: '0',
      pointerEvents: 'none',
    });
    wrapper.appendChild(impact);
    if (typeof impact.animate === 'function') {
      try {
        impact.animate([
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.72)' },
          { offset: 0.22, opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1.16)' },
        ], { duration: Math.min(heroDuration, 210), delay: arrivalDelay, easing: 'ease-out', fill: 'forwards' });
      } catch {}
    }
  }

  host.appendChild(wrapper);
  for (const node of [flash, ring]) {
    if (typeof node.animate !== 'function') continue;
    try {
      node.animate([
        { opacity: 0, transform: node === flash ? 'translate(-50%,-50%) scale(.35)' : 'translate(-50%,-50%) scale(.72)' },
        { offset: 0.22, opacity: node === flash ? 0.86 : 0.82, transform: 'translate(-50%,-50%) scale(1)' },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.32)' },
      ], {
        duration: heroDuration,
        delay: arrivalDelay,
        easing: 'cubic-bezier(.2,.75,.2,1)',
        fill: 'forwards',
      });
    } catch {}
  }
  return wrapper;
}

export function captureBattleCardReleaseFlightEffect({
  sourceNode,
  visualNode = sourceNode,
  start,
  target,
  role = 'middle',
  cardId = null,
  assets = null,
  reducedMotion = false,
  lowPerf = false,
  durationMs = BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
} = {}) {
  const sourceRect = finiteRect(sourceNode?.getBoundingClientRect?.());
  const visualRect = finiteRect(visualNode?.getBoundingClientRect?.()) ?? sourceRect;
  const source = finitePoint(start);
  const destination = finitePoint(target);
  if (!sourceRect || !visualRect || !source || !destination || typeof visualNode?.cloneNode !== 'function') return null;
  const clone = visualNode.cloneNode(true);
  if (!clone) return null;
  return {
    clone,
    sourceRect,
    visualRect,
    start: source,
    target: destination,
    role,
    cardId: typeof cardId === 'string' && cardId.trim() ? cardId.trim() : null,
    assets: canonicalAssets(sourceNode, visualNode, assets),
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    durationMs,
  };
}

export function playBattleCardReleaseFlightEffect({
  host,
  flight,
  documentRef = flight?.clone?.ownerDocument ?? globalThis?.document,
  onPresentationSettled = null,
} = {}) {
  if (!host?.appendChild || !flight?.clone) return false;
  const projection = projectBattleCardReleaseFlightMotion({
    start: flight.start,
    target: flight.target,
    role: flight.role,
    reducedMotion: flight.reducedMotion,
    lowPerf: flight.lowPerf,
    durationMs: flight.durationMs,
  });
  if (!projection) return false;

  const keyframes = toBattleCardReleaseFlightKeyframes(projection);
  const clone = flight.clone;
  const settledPayload = Object.freeze({
    cardId: flight.cardId ?? null,
    target: Object.freeze({ ...projection.target }),
    assets: flight.assets,
    reducedMotion: flight.reducedMotion === true,
    lowPerf: flight.lowPerf === true,
  });
  if (!keyframes.length) {
    removeNode(clone);
    return false;
  }

  if (typeof clone.animate !== 'function') {
    removeNode(clone);
    if (projection.mode !== BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED
      || projection.destinationCue?.kind !== 'DESTINATION_PULSE') {
      return false;
    }
    const cue = createDestinationPulse({ documentRef, host, target: projection.destinationCue });
    if (!cue) return false;
    scheduleSettledCallback(documentRef, projection.durationMs, onPresentationSettled, settledPayload);
    return true;
  }

  if (!styleFlightClone(clone, flight.visualRect, flight.start)) {
    removeNode(clone);
    return false;
  }

  let destinationCue = null;
  let trail = null;
  let hero = null;
  try {
    host.appendChild(clone);
    if (!flight.reducedMotion && !flight.lowPerf) {
      trail = createProceduralTrail({ documentRef, host, projection });
      hero = createHeroLayer({ documentRef, host, projection, flight });
    }
    const animation = clone.animate(keyframes, {
      duration: projection.durationMs,
      easing: BATTLE_CARD_RELEASE_FLIGHT_EASING,
      fill: 'forwards',
    });
    if (projection.mode === BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED
      && projection.destinationCue?.kind === 'DESTINATION_PULSE') {
      destinationCue = createDestinationPulse({ documentRef, host, target: projection.destinationCue });
    }

    let terminal = false;
    const cleanup = () => {
      removeNode(clone);
      removeNode(destinationCue);
      removeNode(trail);
      removeNode(hero);
    };
    const settle = () => {
      if (!terminal) {
        terminal = true;
        try { onPresentationSettled?.(settledPayload); } catch {}
      }
      cleanup();
    };
    const cancel = () => {
      terminal = true;
      cleanup();
    };

    if (animation?.finished && typeof animation.finished.then === 'function') {
      animation.finished.then(settle, cancel);
    } else if (typeof animation?.addEventListener === 'function') {
      animation.addEventListener('finish', settle, { once: true });
      animation.addEventListener('cancel', cancel, { once: true });
    }
    return true;
  } catch {
    removeNode(clone);
    removeNode(destinationCue);
    removeNode(trail);
    removeNode(hero);
    return false;
  }
}
