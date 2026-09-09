import {
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  projectBattleCardReleaseFlightMotion,
  toBattleCardReleaseFlightKeyframes,
} from './battle-card-release-flight-motion-core.mjs';

export const BATTLE_CARD_RELEASE_FLIGHT_EASING = 'cubic-bezier(.16,.74,.18,1)';
export const BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS = 160;

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
  }
  return cue;
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
  if (!keyframes.length || typeof clone.animate !== 'function' || !styleFlightClone(clone, flight.sourceRect)) {
    removeNode(clone);
    return false;
  }

  let cue = null;
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
    }
    const cleanup = () => {
      removeNode(clone);
      removeNode(cue);
    };
    cleanupWhenFinished(animation, cleanup);
    return true;
  } catch {
    removeNode(clone);
    removeNode(cue);
    return false;
  }
}
