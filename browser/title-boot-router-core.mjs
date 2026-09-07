const SCHEMA = 'gameroad.title-boot-router.v1';
const MATCH_AUTHORITY = 'authoritative-match-session';
const SAFE_DIRECT_SCREENS = new Set([
  'home', 'cards', 'characters', 'partner', 'setup', 'shop', 'gacha', 'missions', 'profile', 'records', 'settings',
]);

export const TITLE_BOOT_ROUTE_KINDS = Object.freeze({
  RESUME_CURRENT: 'RESUME_CURRENT',
  REQUIRED_GATE: 'REQUIRED_GATE',
  RECOVER_MATCH: 'RECOVER_MATCH',
  DIRECT_DESTINATION: 'DIRECT_DESTINATION',
  RESTORE_PREVIOUS: 'RESTORE_PREVIOUS',
  SHOW_TITLE: 'SHOW_TITLE',
});

function frozenRoute(kind, fields = {}) {
  return Object.freeze({ schema: SCHEMA, kind, ...fields });
}

function normalizedScreen(candidate) {
  if (!candidate || candidate.validated !== true) return null;
  const screen = String(candidate.screen || '').trim().toLowerCase();
  return SAFE_DIRECT_SCREENS.has(screen) ? screen : null;
}

function authoritativeMatch(activeMatch) {
  if (!activeMatch || activeMatch.resumable !== true || activeMatch.authority !== MATCH_AUTHORITY) return null;
  const matchId = String(activeMatch.matchId || '').trim();
  if (!matchId) return null;
  return Object.freeze({ matchId, resumeContext: activeMatch.resumeContext ?? null });
}

function explicitRequiredGate(requiredGate) {
  if (!requiredGate || requiredGate.required !== true) return null;
  const kind = String(requiredGate.kind || '').trim();
  if (!kind) return null;
  return Object.freeze({ kind, context: requiredGate.context ?? null });
}

export function resolveTitleBootRoute({
  safeCurrentResume = false,
  activeMatch = null,
  requiredGate = null,
  directDestination = null,
  previousDestination = null,
} = {}) {
  if (safeCurrentResume === true) {
    return frozenRoute(TITLE_BOOT_ROUTE_KINDS.RESUME_CURRENT, {
      requiresUserConfirmation: false,
      showTitle: false,
    });
  }

  const match = authoritativeMatch(activeMatch);
  const gate = explicitRequiredGate(requiredGate);
  if (match && gate && requiredGate.blocksMatchRecovery === true) {
    return frozenRoute(TITLE_BOOT_ROUTE_KINDS.REQUIRED_GATE, {
      gate,
      pendingDestination: 'battle',
      pendingMatchId: match.matchId,
      requiresUserConfirmation: false,
      showTitle: false,
    });
  }

  if (match) {
    return frozenRoute(TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH, {
      destination: 'battle',
      match,
      autoStart: true,
      cancelAllowedBeforeCommit: true,
      cancelEffect: 'ABORT_RECOVERY_ATTEMPT_ONLY',
      audioUserActivationBlocksRecovery: false,
      requiresUserConfirmation: false,
      showTitle: false,
    });
  }

  if (gate) {
    return frozenRoute(TITLE_BOOT_ROUTE_KINDS.REQUIRED_GATE, {
      gate,
      pendingDestination: null,
      pendingMatchId: null,
      requiresUserConfirmation: false,
      showTitle: false,
    });
  }

  const direct = normalizedScreen(directDestination);
  if (direct) {
    return frozenRoute(TITLE_BOOT_ROUTE_KINDS.DIRECT_DESTINATION, {
      destination: direct,
      requiresHomeTransit: false,
      requiresUserConfirmation: false,
      showTitle: false,
    });
  }

  const previous = normalizedScreen(previousDestination);
  if (previous) {
    return frozenRoute(TITLE_BOOT_ROUTE_KINDS.RESTORE_PREVIOUS, {
      destination: previous,
      requiresHomeTransit: false,
      requiresUserConfirmation: false,
      showTitle: false,
    });
  }

  return frozenRoute(TITLE_BOOT_ROUTE_KINDS.SHOW_TITLE, {
    destination: null,
    requiresUserConfirmation: false,
    showTitle: true,
  });
}

export function resolveRecoveryCancel({ committed = false } = {}) {
  if (committed === true) {
    return Object.freeze({
      allowed: false,
      owner: 'battle',
      effect: 'USE_BATTLE_EXIT_RULES',
    });
  }
  return Object.freeze({
    allowed: true,
    owner: 'boot-recovery',
    effect: 'ABORT_RECOVERY_ATTEMPT_ONLY',
    matchOutcomeMutated: false,
    matchStateReset: false,
  });
}

export const TITLE_BOOT_ROUTER_SCHEMA = SCHEMA;
export const TITLE_BOOT_MATCH_AUTHORITY = MATCH_AUTHORITY;
