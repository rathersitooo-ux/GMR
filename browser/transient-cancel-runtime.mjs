export const SAFE_TRANSIENT_KIND = Object.freeze({
  CARD_PREVIEW: 'cardPreview',
  GACHA_FOCUS: 'gachaFocus',
  BATTLE_DRAWER: 'battleDrawer',
});

export const SAFE_TRANSIENT_CANCEL_VERSION = 'gameroad.safe-transient-cancel.v1';

const DESCRIPTORS = Object.freeze([
  Object.freeze({
    kind: SAFE_TRANSIENT_KIND.CARD_PREVIEW,
    screen: 'cards',
    surface: '.screen.cards .cardPreview',
    close: '#r4PreviewClose',
    active(root) { return root?.classList?.contains('active') && root?.dataset?.inspector === 'open'; },
    fallbackFocus: '.screen.cards #collectionGrid .slot.pick',
  }),
  Object.freeze({
    kind: SAFE_TRANSIENT_KIND.GACHA_FOCUS,
    screen: 'gacha',
    surface: '.screen.gachaSurface #gachaFocus',
    close: '#gachaFocusBack',
    active(root, surface) { return root?.classList?.contains('active') && !surface?.classList?.contains('hidden'); },
    fallbackFocus: '.screen.gachaSurface #packResults button',
  }),
  Object.freeze({
    kind: SAFE_TRANSIENT_KIND.BATTLE_DRAWER,
    screen: 'battle',
    surface: '.screen.battle #battleDrawer',
    close: '#detailsClose',
    active(root, surface) {
      return root?.classList?.contains('active') && surface?.classList?.contains('on') && surface?.getAttribute?.('aria-hidden') === 'false';
    },
    fallbackFocus: '#detailsBtn',
  }),
]);

const BLOCKING_SURFACES = Object.freeze([
  Object.freeze({selector: '#abilityVeil', active(node) { return node?.getAttribute?.('aria-hidden') === 'false'; }}),
  Object.freeze({selector: '#battlePhaseSurface', active(node) { return node && !node.hasAttribute?.('hidden'); }}),
]);

function query(documentSource, selector) {
  return documentSource?.querySelector?.(selector) || null;
}

function screenRoot(documentSource, screen) {
  return query(documentSource, `.screen[data-screen="${screen}"]`);
}

function blockerActive(documentSource) {
  return BLOCKING_SURFACES.some((entry) => entry.active(query(documentSource, entry.selector)));
}

export function resolveSafeTransientState({
  blocker = false,
  cardPreview = false,
  gachaFocus = false,
  battleDrawer = false,
} = {}) {
  if (blocker) return Object.freeze({kind: null, dismissible: false, reason: 'blocking-surface'});
  const active = [
    cardPreview && SAFE_TRANSIENT_KIND.CARD_PREVIEW,
    gachaFocus && SAFE_TRANSIENT_KIND.GACHA_FOCUS,
    battleDrawer && SAFE_TRANSIENT_KIND.BATTLE_DRAWER,
  ].filter(Boolean);
  if (active.length === 0) return Object.freeze({kind: null, dismissible: false, reason: 'none'});
  if (active.length > 1) return Object.freeze({kind: null, dismissible: false, reason: 'ambiguous-frontmost'});
  return Object.freeze({kind: active[0], dismissible: true, reason: 'safe-transient'});
}

export function readSafeTransientState(documentSource = globalThis.document) {
  const activeByKind = new Map();
  for (const descriptor of DESCRIPTORS) {
    const root = screenRoot(documentSource, descriptor.screen);
    const surface = query(documentSource, descriptor.surface);
    activeByKind.set(descriptor.kind, Boolean(surface && descriptor.active(root, surface)));
  }
  return resolveSafeTransientState({
    blocker: blockerActive(documentSource),
    cardPreview: activeByKind.get(SAFE_TRANSIENT_KIND.CARD_PREVIEW),
    gachaFocus: activeByKind.get(SAFE_TRANSIENT_KIND.GACHA_FOCUS),
    battleDrawer: activeByKind.get(SAFE_TRANSIENT_KIND.BATTLE_DRAWER),
  });
}

function descriptorFor(kind) {
  return DESCRIPTORS.find((descriptor) => descriptor.kind === kind) || null;
}

function currentTransient(documentSource) {
  const state = readSafeTransientState(documentSource);
  if (!state.dismissible) return null;
  const descriptor = descriptorFor(state.kind);
  const surface = descriptor ? query(documentSource, descriptor.surface) : null;
  return descriptor && surface ? {descriptor, surface} : null;
}

function focusCandidate(node) {
  return Boolean(node && node.isConnected !== false && typeof node.focus === 'function');
}

function firstSurfaceFocus(surface) {
  return surface?.querySelector?.('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || null;
}

export function installSafeTransientCancelRuntime(global = globalThis) {
  const documentSource = global?.document;
  if (!documentSource?.addEventListener || !documentSource?.querySelector) return null;
  const existing = global.GAMEROAD_SAFE_TRANSIENT_CANCEL;
  if (existing?.version === SAFE_TRANSIENT_CANCEL_VERSION) return existing;
  if (existing) throw new Error('GAMEROAD_SAFE_TRANSIENT_CANCEL is already occupied by an incompatible runtime');

  const openerByKind = new Map();

  function rememberAndFocusAfterOpen(eventTarget) {
    const target = eventTarget?.closest?.('button,[href],input,select,textarea,[tabindex]') || eventTarget;
    queueMicrotask(() => {
      const transient = currentTransient(documentSource);
      if (!transient) return;
      if (focusCandidate(target) && !transient.surface.contains?.(target)) openerByKind.set(transient.descriptor.kind, target);
      const active = documentSource.activeElement;
      if (!transient.surface.contains?.(active)) firstSurfaceFocus(transient.surface)?.focus?.();
    });
  }

  function restoreFocus(descriptor) {
    queueMicrotask(() => {
      const opener = openerByKind.get(descriptor.kind);
      openerByKind.delete(descriptor.kind);
      if (focusCandidate(opener)) return opener.focus();
      query(documentSource, descriptor.fallbackFocus)?.focus?.();
    });
  }

  function closeTransient(transient) {
    const close = query(documentSource, transient.descriptor.close);
    if (!close || typeof close.click !== 'function') return false;
    close.click();
    restoreFocus(transient.descriptor);
    return true;
  }

  function onClick(event) {
    const transient = currentTransient(documentSource);
    if (!transient) {
      rememberAndFocusAfterOpen(event.target);
      return;
    }
    const closeControl = event.target?.closest?.(transient.descriptor.close);
    if (closeControl) {
      restoreFocus(transient.descriptor);
      return;
    }
    if (transient.surface.contains?.(event.target)) return;
    if (!closeTransient(transient)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const transient = currentTransient(documentSource);
    if (!transient || !closeTransient(transient)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  function onFocusIn(event) {
    const transient = currentTransient(documentSource);
    if (!transient || transient.surface.contains?.(event.target)) return;
    firstSurfaceFocus(transient.surface)?.focus?.();
  }

  documentSource.addEventListener('click', onClick, true);
  documentSource.addEventListener('keydown', onKeyDown, true);
  documentSource.addEventListener('focusin', onFocusIn, true);

  const runtime = Object.freeze({
    version: SAFE_TRANSIENT_CANCEL_VERSION,
    snapshot: () => readSafeTransientState(documentSource),
    cancel() {
      const transient = currentTransient(documentSource);
      return Boolean(transient && closeTransient(transient));
    },
    destroy() {
      documentSource.removeEventListener?.('click', onClick, true);
      documentSource.removeEventListener?.('keydown', onKeyDown, true);
      documentSource.removeEventListener?.('focusin', onFocusIn, true);
    },
  });
  Object.defineProperty(global, 'GAMEROAD_SAFE_TRANSIENT_CANCEL', {value: runtime, configurable: true});
  return runtime;
}
