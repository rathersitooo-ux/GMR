import {
  classifyBattleCinematicWipe,
  createBattleCinematicSkipIntent,
  createBattleCinematicSkipIntentFromWipe,
  routeBattleCinematicSkipIntent
} from './battle-cinematic-skip-intent-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-cinematic-skip-runtime-control.v1';
const ROOT_ATTR = 'data-battle-cinematic-skip-runtime';
const BUTTON_ATTR = 'data-battle-cinematic-skip-button';

function callable(value, code) {
  if (typeof value !== 'function') throw new TypeError(code);
  return value;
}

function eventTarget(value, code) {
  if (
    !value ||
    typeof value.addEventListener !== 'function' ||
    typeof value.removeEventListener !== 'function'
  ) {
    throw new TypeError(code);
  }
  return value;
}

function allowedInputs(context) {
  return Array.isArray(context?.allowedInputs) ? context.allowedInputs : [];
}

function skipAllowed(context) {
  return allowedInputs(context).some(value => String(value).trim().toLowerCase() === 'skip');
}

function eventIdOf(context) {
  const id = typeof context?.eventId === 'string' ? context.eventId.trim() : '';
  return id || null;
}

function phaseOf(context) {
  if (context?.phase == null) return null;
  const phase = String(context.phase).trim();
  return phase || null;
}

function createButton(document) {
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('BATTLE_CINEMATIC_SKIP_DOCUMENT_REQUIRED');
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'スキップ';
  button.setAttribute?.(BUTTON_ATTR, '1');
  button.setAttribute?.('aria-label', '戦闘演出をスキップ');
  return button;
}

function runtimeResult({
  consumed,
  reason,
  source,
  eventId,
  phase,
  presentationCommand = null,
  authoritativeState,
  authoritativeStatePreservedByReference = true
}) {
  return Object.freeze({
    schema: RUNTIME_SCHEMA,
    consumed,
    reason,
    source,
    eventId,
    phase,
    presentationCommand,
    authoritativeState,
    authoritativeStatePreservedByReference,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    resultMutation: false
  });
}

export function mountBattleCinematicSkipRuntime({
  phaseSurface,
  pointerTarget = phaseSurface,
  button = null,
  document = phaseSurface?.ownerDocument ?? null,
  getContext,
  getAuthoritativeState,
  onPresentationCommand = () => {},
  minDistancePx,
  maxCrossAxisRatio
} = {}) {
  const surface = eventTarget(phaseSurface, 'BATTLE_CINEMATIC_SKIP_PHASE_SURFACE_REQUIRED');
  const pointerHost = eventTarget(pointerTarget, 'BATTLE_CINEMATIC_SKIP_POINTER_TARGET_REQUIRED');
  const readContext = callable(getContext, 'BATTLE_CINEMATIC_SKIP_CONTEXT_READER_REQUIRED');
  const readAuthoritativeState = callable(
    getAuthoritativeState,
    'BATTLE_CINEMATIC_SKIP_AUTHORITATIVE_STATE_READER_REQUIRED'
  );
  const emitPresentationCommand = callable(
    onPresentationCommand,
    'BATTLE_CINEMATIC_SKIP_PRESENTATION_COMMAND_HANDLER_REQUIRED'
  );

  const createdButton = button == null;
  const skipButton = button ?? createButton(document);
  eventTarget(skipButton, 'BATTLE_CINEMATIC_SKIP_BUTTON_EVENT_TARGET_REQUIRED');
  skipButton.setAttribute?.(BUTTON_ATTR, '1');

  if (createdButton) {
    if (typeof surface.appendChild !== 'function') {
      throw new TypeError('BATTLE_CINEMATIC_SKIP_PHASE_SURFACE_APPEND_REQUIRED');
    }
    surface.appendChild(skipButton);
  }
  surface.setAttribute?.(ROOT_ATTR, '1');

  let pointer = null;
  let detached = false;
  const consumedEventIds = new Set();

  function refresh() {
    if (detached) return Object.freeze({ mounted: false, skipAllowed: false });
    const context = readContext() ?? {};
    const visible = skipAllowed(context) && eventIdOf(context) !== null;
    skipButton.hidden = !visible;
    skipButton.disabled = !visible;
    return Object.freeze({
      mounted: true,
      skipAllowed: visible,
      eventId: eventIdOf(context),
      phase: phaseOf(context)
    });
  }

  function reject(reason, source, context, authoritativeState) {
    return runtimeResult({
      consumed: false,
      reason,
      source,
      eventId: eventIdOf(context),
      phase: phaseOf(context),
      authoritativeState
    });
  }

  function consume(source, gesture = null) {
    const context = readContext() ?? {};
    const authoritativeState = readAuthoritativeState();
    const eventId = eventIdOf(context);

    if (!eventId) {
      return reject('EVENT_ID_UNAVAILABLE', source, context, authoritativeState);
    }
    if (consumedEventIds.has(eventId)) {
      return reject('EVENT_ALREADY_SKIPPED', source, context, authoritativeState);
    }

    let intent;
    try {
      intent = source === 'wipe'
        ? createBattleCinematicSkipIntentFromWipe({
            gesture,
            eventId,
            phase: phaseOf(context),
            allowedInputs: allowedInputs(context)
          })
        : createBattleCinematicSkipIntent({
            source: 'button',
            eventId,
            phase: phaseOf(context),
            allowedInputs: allowedInputs(context)
          });
    } catch {
      return reject('SKIP_INTENT_INVALID', source, context, authoritativeState);
    }

    const routed = routeBattleCinematicSkipIntent({ intent, authoritativeState });
    if (!routed.consumed) {
      return runtimeResult({
        consumed: false,
        reason: intent.reason || 'SKIP_REJECTED',
        source,
        eventId,
        phase: phaseOf(context),
        presentationCommand: routed.presentationCommand,
        authoritativeState: routed.authoritativeState,
        authoritativeStatePreservedByReference:
          routed.authoritativeStatePreservedByReference === true
      });
    }

    consumedEventIds.add(eventId);
    emitPresentationCommand(Object.freeze({
      schema: RUNTIME_SCHEMA,
      presentationCommand: routed.presentationCommand,
      eventId,
      phase: phaseOf(context),
      source,
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false
    }));

    return runtimeResult({
      consumed: true,
      reason: 'SKIP_CONSUMED',
      source,
      eventId,
      phase: phaseOf(context),
      presentationCommand: routed.presentationCommand,
      authoritativeState: routed.authoritativeState,
      authoritativeStatePreservedByReference:
        routed.authoritativeStatePreservedByReference === true
    });
  }

  function onButtonClick(event) {
    if (event?.defaultPrevented) return;
    consume('button');
  }

  function onPointerDown(event) {
    if (event?.isPrimary === false) return;
    if (Number.isFinite(event?.button) && event.button !== 0) return;
    const pointerId = Number.isFinite(event?.pointerId) ? Number(event.pointerId) : 0;
    if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;
    pointer = {
      pointerId,
      startX: Number(event.clientX),
      startY: Number(event.clientY)
    };
  }

  function onPointerCancel(event) {
    if (!pointer) return;
    const pointerId = Number.isFinite(event?.pointerId) ? Number(event.pointerId) : 0;
    if (pointer.pointerId === pointerId) pointer = null;
  }

  function onPointerUp(event) {
    if (!pointer) return;
    const pointerId = Number.isFinite(event?.pointerId) ? Number(event.pointerId) : 0;
    if (pointer.pointerId !== pointerId) return;

    const start = pointer;
    pointer = null;
    if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;

    let gesture;
    try {
      gesture = classifyBattleCinematicWipe({
        startX: start.startX,
        startY: start.startY,
        endX: Number(event.clientX),
        endY: Number(event.clientY),
        ...(minDistancePx == null ? {} : { minDistancePx }),
        ...(maxCrossAxisRatio == null ? {} : { maxCrossAxisRatio })
      });
    } catch {
      return;
    }

    if (!gesture.accepted) return;
    const result = consume('wipe', gesture);
    if (result.consumed && typeof event.preventDefault === 'function') event.preventDefault();
  }

  skipButton.addEventListener('click', onButtonClick);
  pointerHost.addEventListener('pointerdown', onPointerDown);
  pointerHost.addEventListener('pointerup', onPointerUp);
  pointerHost.addEventListener('pointercancel', onPointerCancel);
  refresh();

  return Object.freeze({
    schema: RUNTIME_SCHEMA,
    root: surface,
    button: skipButton,
    refresh,
    skipByButton: () => consume('button'),
    skipByWipe: gesture => consume('wipe', gesture),
    detach() {
      if (detached) return false;
      detached = true;
      skipButton.removeEventListener('click', onButtonClick);
      pointerHost.removeEventListener('pointerdown', onPointerDown);
      pointerHost.removeEventListener('pointerup', onPointerUp);
      pointerHost.removeEventListener('pointercancel', onPointerCancel);
      surface.removeAttribute?.(ROOT_ATTR);
      if (
        createdButton &&
        skipButton.parentNode === surface &&
        typeof surface.removeChild === 'function'
      ) {
        surface.removeChild(skipButton);
      }
      pointer = null;
      return true;
    }
  });
}

export const BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL = Object.freeze({
  schema: RUNTIME_SCHEMA,
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  resultMutation: false,
  sourceCore: 'gameroad.battle-cinematic-skip-intent.v1',
  inputs: Object.freeze(['button', 'horizontal_wipe']),
  authoritativeStatePolicy: 'READ_AND_PASS_THROUGH_SAME_REFERENCE_NO_MUTATION',
  duplicateEventPolicy: 'ONE_SKIP_COMMAND_PER_EVENT_ID',
  liveScreenMountOwnedHere: false
});
