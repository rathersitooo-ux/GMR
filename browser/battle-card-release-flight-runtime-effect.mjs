import {
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  projectBattleCardReleaseFlightMotion,
  toBattleCardReleaseFlightKeyframes,
} from './battle-card-release-flight-motion-core.mjs';

export const BATTLE_CARD_RELEASE_FLIGHT_EASING = 'cubic-bezier(.16,.74,.18,1)';
export const BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS = 160;
export const BATTLE_CARD_RELEASE_FLIGHT_TRAIL_DURATION_MS = 180;

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
  if (![left, top, width, height].every(Number.isFinite) || width < 0 || height < 0) return null;
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

function styleFlightClone(clone, sourceRect) {
  if (!clone?.style) return false;
  clone.disabled = false;
  if (clone.dataset) {
    clone.dataset.armed = 'false';
    clone.dataset.jankenFlight = '1';
  }
  clone.setAttribute?.('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
    margin: '0',
    opacity: '1',
    pointerEvents: 'none',
    zIndex: '160',
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
    width: '18px',
    height: '18px',
    margin: '0',
    border: '2px solid currentColor',
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
        { offset: 0.35, opacity: 0.72, transform: 'translate(-50%,-50%) scale(1.04)' },
        { offset: 1, opacity: 0, transform: 'translate(-50%,-50%) scale(1.12)' },
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


function flightTrailKeyframes(projection) {
  if (!projection?.frames || !Array.isArray(projection.frames) || projection.frames.length < 2) {
    return [];
  }
  return projection.frames.map((frame) => ({
    offset: frame.offset,
    opacity: Math.max(0, Math.min(0.94, frame.opacity * (1 - (0.16 * frame.offset)))),
    filter: \`blur(\${Math.max(0.2, frame.blurPx * 0.8).toFixed(2)}px) drop-shadow(0 0 8px rgba(143,225,255,.92))\`,
    transform: \`translate(-50%,-50%) translate3d(\${frame.x.toFixed(2)}px,\${frame.y.toFixed(2)}px,0) rotate(\${frame.rotationDeg.toFixed(2)}deg) scale(\${(0.78 + (frame.scale * 0.42)).toFixed(3)},.72)\`,
  }));
}

function createFlightTrail({ documentRef, host, flight, projection }) {
  if (!documentRef?.createElement || !host?.appendChild ||
      projection?.mode !== BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL ||
      projection.lowPerf === true) {
    return null;
  }
  const trail = documentRef.createElement('span');
  if (!trail?.style) return null;
  trail.dataset.jankenFlightTrail = '1';
  trail.setAttribute?.('aria-hidden', 'true');
  const sourceRect = flight.sourceRect;
  Object.assign(trail.style, {
    position: 'fixed',
    left: \`\${sourceRect.left + (sourceRect.width / 2)}px\`,
    top: \`\${sourceRect.top + (sourceRect.height / 2)}px\`,
    width: \`\${Math.max(48, Math.min(112, sourceRect.width * 1.45))}px\`,
    height: \`\${Math.max(3, Math.min(8, sourceRect.height * 0.08))}px\`,
    margin: '0',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '158',
    borderRadius: '999px',
    background: 'linear-gradient(90deg, transparent, rgba(152,229,255,.20) 16%, rgba(255,255,255,.98) 50%, rgba(155,238,255,.20) 84%, transparent)',
    boxShadow: '0 0 8px rgba(143,225,255,.95), 0 0 22px rgba(80,161,255,.66)',
    mixBlendMode: 'screen',
    transformOrigin: '50% 50%',
    willChange: 'transform,opacity,filter',
  });
  try {
    host.appendChild(trail);
    const animation = typeof trail.animate === 'function'
      ? trail.animate(flightTrailKeyframes(projection), {
        duration: Math.min(projection.durationMs, BATTLE_CARD_RELEASE_FLIGHT_TRAIL_DURATION_MS),
        easing: BATTLE_CARD_RELEASE_FLIGHT_EASING,
        fill: 'forwards',
      })
      : null;
    if (!animation) {
      trail.style.opacity = '0.68';
      trail.dataset.jankenFlightTrailFallback = 'static';
    }
    return { node: trail, animation };
  } catch {
    removeNode(trail);
    return null;
  }
}

function createFlightImpactCue({ documentRef, host, target }) {
  if (!documentRef?.createElement || !host?.appendChild || !finitePoint(target)) return null;
  const cue = documentRef.createElement('span');
  if (!cue?.style) return null;
  cue.dataset.jankenFlightImpact = '1';
  cue.setAttribute?.('aria-hidden', 'true');
  Object.assign(cue.style, {
    position: 'fixed',
    left: \`\${target.x}px\`,
    top: \`\${target.y}px\`,
    width: '30px',
    height: '30px',
    margin: '0',
    border: '2px solid rgba(225,250,255,.96)',
    borderRadius: '999px',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '159',
    transform: 'translate(-50%,-50%) scale(.42)',
    boxShadow: '0 0 10px rgba(194,244,255,.95), 0 0 26px rgba(84,148,255,.72)',
    mixBlendMode: 'screen',
    willChange: 'transform,opacity',
  });
  try {
    host.appendChild(cue);
    const animation = typeof cue.animate === 'function'
      ? cue.animate([
        { offset: 0, opacity: 0, transform: 'translate(-50%,-50%) scale(.42)' },
        { offset: 0.24, opacity: 0.96, transform: 'translate(-50%,-50%) scale(.94)' },
        { offset: 1, opacity: 0, transform: 'translate(-50%,-50%) scale(1.56)' },
      ], {
        duration: 180,
        easing: 'cubic-bezier(.16,.74,.18,1)',
        fill: 'forwards',
      })
      : null;
    if (!animation) {
      cue.style.opacity = '0.72';
      cue.style.transform = 'translate(-50%,-50%) scale(1)';
      cue.dataset.jankenFlightImpactFallback = 'static';
    }
    return { node: cue, animation };
  } catch {
    removeNode(cue);
    return null;
  }
}

export function captureBattleCardReleaseFlightEffect({
  sourceNode,
  start,
  target,
  role = 'middle',
  reducedMotion = false,
  lowPerf = false,
  durationMs = BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
} = {}) {
  const sourceRect = finiteRect(sourceNode?.getBoundingClientRect?.());
  const source = finitePoint(start);
  const destination = finitePoint(target);
  if (!sourceRect || !source || !destination || typeof sourceNode?.cloneNode !== 'function') return null;
  const clone = sourceNode.cloneNode(true);
  if (!clone) return null;
  return {
    clone,
    sourceRect,
    start: source,
    target: destination,
    role,
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    durationMs,
  };
}

export function playBattleCardReleaseFlightEffect({
  host,
  flight,
  documentRef = flight?.clone?.ownerDocument ?? globalThis?.document,
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
    return createDestinationPulse({ documentRef, host, target: projection.destinationCue }) !== null;
  }

  if (!styleFlightClone(clone, flight.sourceRect)) {
    removeNode(clone);
    return false;
  }

  let cue = null;
  let trail = null;
  let impact = null;
  try {
    host.appendChild(clone);
    const animation = clone.animate(keyframes, {
      duration: projection.durationMs,
      easing: BATTLE_CARD_RELEASE_FLIGHT_EASING,
      fill: 'forwards',
    });
    if (projection.mode === BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED
      && projection.destinationCue?.kind === 'DESTINATION_PULSE') {
      cue = createDestinationPulse({ documentRef, host, target: projection.destinationCue });
    } else if (projection.mode === BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL && projection.lowPerf !== true) {
      trail = createFlightTrail({ documentRef, host, flight, projection });
      impact = createFlightImpactCue({ documentRef, host, target: flight.target });
    }
    const cleanup = () => {
      removeNode(clone);
      removeNode(cue);
      removeNode(trail?.node);
      removeNode(impact?.node);
    };
    cleanupWhenFinished(animation, cleanup);
    return true;
  } catch {
    removeNode(clone);
    removeNode(cue);
    removeNode(trail?.node);
    removeNode(impact?.node);
    return false;
  }
}
