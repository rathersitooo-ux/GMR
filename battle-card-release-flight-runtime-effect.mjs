import {
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  projectBattleCardReleaseFlightMotion,
  toBattleCardReleaseFlightKeyframes,
} from './battle-card-release-flight-motion-core.mjs';

export const BATTLE_CARD_RELEASE_FLIGHT_EASING = 'cubic-bezier(.16,.74,.18,1)';
export const BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS = 160;
export const BATTLE_CARD_RELEASE_FLIGHT_TRAIL_DURATION_MS = 180;
const ACTIVE_FLIGHTS = new WeakMap();

export function cancelBattleCardReleaseFlightEffect(host) {
  const cancel = ACTIVE_FLIGHTS.get(host);
  if (!cancel) return false;
  cancel();
  return true;
}

const THROW_TEXTURE = new URL('./assets/visual/battle-vfx/throw-thin.png', import.meta.url).href;
const IMPACT_TEXTURE = new URL('./assets/visual/battle-vfx/impact-cyan.png', import.meta.url).href;

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
  return projection.frames.map((frame, index, frames) => {
    const before = frames[Math.max(0, index - 1)];
    const after = frames[Math.min(frames.length - 1, index + 1)];
    const directionDeg = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    return {
      offset: frame.offset,
      opacity: Math.max(0, Math.min(0.94, frame.opacity * (1 - (0.16 * frame.offset)))),
      filter: `blur(${Math.max(0.2, frame.blurPx * 0.8).toFixed(2)}px) drop-shadow(0 0 8px rgba(143,225,255,.92))`,
      transform: `translate(-50%,-50%) translate3d(${frame.x.toFixed(2)}px,${frame.y.toFixed(2)}px,0) rotate(${directionDeg.toFixed(2)}deg) scale(${(0.78 + (frame.scale * 0.42)).toFixed(3)},.72)`,
    };
  });
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
    left: `${sourceRect.left + (sourceRect.width / 2)}px`,
    top: `${sourceRect.top + (sourceRect.height / 2)}px`,
    width: `${Math.max(48, Math.min(112, sourceRect.width * 1.45))}px`,
    height: `${Math.max(8, Math.min(20, sourceRect.height * 0.16))}px`,
    margin: '0',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '158',
    borderRadius: '999px',
    backgroundImage: `url("${THROW_TEXTURE}")`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    mixBlendMode: 'screen',
    transformOrigin: '50% 50%',
    willChange: 'transform,opacity,filter',
  });
  try {
    host.appendChild(trail);
    const animation = typeof trail.animate === 'function'
      ? trail.animate(flightTrailKeyframes(projection), {
        duration: projection.durationMs,
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
    left: `${target.x}px`,
    top: `${target.y}px`,
    width: '72px',
    height: '72px',
    margin: '0',
    backgroundImage: `url("${IMPACT_TEXTURE}")`,
    backgroundSize: '800% 100%',
    backgroundRepeat: 'no-repeat',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '159',
    transform: 'translate(-50%,-50%)',
    mixBlendMode: 'screen',
    willChange: 'transform,opacity',
  });
  try {
    host.appendChild(cue);
    const animation = typeof cue.animate === 'function'
      ? cue.animate(Array.from({ length: 9 }, (_, index) => ({
        offset: index / 8,
        opacity: 1,
        easing: 'steps(1, end)',
        backgroundPosition: `${Math.min(index, 7) * 100 / 7}% 0%`,
      })), {
        duration: 240,
        easing: 'linear',
        fill: 'none',
      })
      : null;
    if (!animation) {
      cue.style.opacity = '0.72';
      cue.style.transform = 'translate(-50%,-50%) scale(1)';
      cue.dataset.jankenFlightImpactFallback = 'static';
      scheduleStaticCueCleanup(cue);
    }
    if (animation) cleanupWhenFinished(animation, () => removeNode(cue));
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

  cancelBattleCardReleaseFlightEffect(host);
  const onLauncherSettled = host.__gameroadLauncherFlightSettled;
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
    const cueCreated = createDestinationPulse({ documentRef, host, target: projection.destinationCue }) !== null;
    onLauncherSettled?.();
    return cueCreated;
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

    }
    let settled = false;
    const cancel = () => { try { animation.cancel?.(); } finally { cleanup(); } };
    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (ACTIVE_FLIGHTS.get(host) === cancel) ACTIVE_FLIGHTS.delete(host);
      removeNode(clone);
      removeNode(cue);
      removeNode(trail?.node);
      removeNode(impact?.node);
      onLauncherSettled?.();
    };
    ACTIVE_FLIGHTS.set(host, cancel);
    const arrived = () => {
      if (settled) return;
      cleanup();
      if (projection.mode === BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL && projection.lowPerf !== true) {
        impact = createFlightImpactCue({ documentRef, host, target: flight.target });
      }
    };
    if (animation?.finished?.then) animation.finished.then(arrived, cleanup);
    else if (typeof animation?.addEventListener === 'function') {
      animation.addEventListener('finish', arrived, { once: true });
      animation.addEventListener('cancel', cleanup, { once: true });
    }
    return true;
  } catch {
    removeNode(clone);
    removeNode(cue);
    removeNode(trail?.node);
    removeNode(impact?.node);
    return false;
  }
}
