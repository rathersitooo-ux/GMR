import {
  createNakiBattleMagicLiveAdapter,
  NAKI_BATTLE_MAGIC_LIVE_ADAPTER_RUNTIME,
} from './naki-battle-magic-live-adapter.mjs';
import {
  createSaasunaBattleMotionController,
  SAASUNA_BATTLE_MOTION_RUNTIME,
} from './saasuna-battle-motion-core.mjs';

const CAUSAL_PHASES = Object.freeze([
  'stance',
  'anticipation',
  'release',
  'impact',
  'reaction',
  'return',
]);

function exactNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeCausalPhase(value) {
  if (typeof value !== 'string') return null;
  const phase = value.trim().toLowerCase();
  return CAUSAL_PHASES.includes(phase) ? phase : null;
}

function normalizeRole(value) {
  return value === 'target' ? 'target' : 'source';
}

function normalizeActionPhase(value) {
  return value === 'ability' ? 'ability' : 'attack';
}

export function resolveSaasunaBattleCausalMotionState({
  causalPhase = 'stance',
  role = 'source',
  actionPhase = 'attack',
} = {}) {
  const phase = normalizeCausalPhase(causalPhase);
  if (!phase) return null;
  const resolvedRole = normalizeRole(role);
  const resolvedAction = normalizeActionPhase(actionPhase);

  if (resolvedRole === 'target') {
    if (phase === 'reaction' || phase === 'impact') return 'HIT_RECOIL';
    return 'IDLE_GENTLE';
  }

  if (phase === 'anticipation') {
    return resolvedAction === 'ability' ? 'STAFF_FREEZE' : 'IDLE_GENTLE';
  }
  if (phase === 'release') {
    return resolvedAction === 'ability' ? 'ICE_SLIDE_LOW' : 'MAGIC_RELEASE';
  }
  if (phase === 'impact') return 'WIND_CUT';
  return 'IDLE_GENTLE';
}

function clearRouterDataset(host) {
  if (!host?.dataset) return;
  delete host.dataset.battleCinematicMotionRouter;
  delete host.dataset.battleCinematicMotionRoute;
  delete host.dataset.battleCinematicMotionCharacterId;
  delete host.dataset.battleCinematicMotionAuthority;
}

function setRouterDataset(host, route, characterId) {
  if (!host?.dataset) return;
  host.dataset.battleCinematicMotionRouter = 'true';
  host.dataset.battleCinematicMotionRoute = route;
  host.dataset.battleCinematicMotionCharacterId = characterId;
  host.dataset.battleCinematicMotionAuthority = 'presentation-only';
}

export function createBattleCinematicCharacterMotionRouter({
  doc,
  host,
  characterHost = null,
  characterId = null,
  nakiCharacterId = null,
  role = 'source',
  motion = 'normal',
  phase = 'idle',
  transition = 'CONTINUE',
  motionState = null,
  setTimeoutFn = null,
  clearTimeoutFn = null,
  createNakiAdapter = createNakiBattleMagicLiveAdapter,
  createSaasunaController = createSaasunaBattleMotionController,
} = {}) {
  const exactCharacterId = exactNonEmptyString(characterId);
  if (!doc || !host || !exactCharacterId) return null;

  let controller = null;
  let route = null;

  if (typeof createNakiAdapter === 'function') {
    controller = createNakiAdapter({
      doc,
      host,
      characterHost,
      characterId: exactCharacterId,
      nakiCharacterId,
      role,
      motion,
      phase,
      transition,
      motionState,
      setTimeoutFn,
      clearTimeoutFn,
    });
    if (controller) route = 'naki';
  }

  if (!controller && typeof createSaasunaController === 'function') {
    controller = createSaasunaController({
      doc,
      host,
      characterHost,
      characterId: exactCharacterId,
      role,
      motion,
      phase,
      transition,
      motionState,
    });
    if (controller) route = 'saasuna';
  }

  if (!controller || !route) return null;
  setRouterDataset(host, route, exactCharacterId);

  let active = true;

  const applyCausalPhase = (input = {}) => {
    if (!active) return null;
    if (route === 'naki' && typeof controller.applyCausalPhase === 'function') {
      return controller.applyCausalPhase(input);
    }
    if (route !== 'saasuna' || typeof controller.setState !== 'function') return null;

    const causalPhase = normalizeCausalPhase(input.causalPhase);
    if (!causalPhase) return null;
    const causalRole = input.role ?? role;
    const actionPhase = input.actionPhase ?? phase;
    const resolvedState = resolveSaasunaBattleCausalMotionState({
      causalPhase,
      role: causalRole,
      actionPhase,
    });
    if (!resolvedState) return null;
    return controller.setState({
      role: normalizeRole(causalRole),
      phase: normalizeActionPhase(actionPhase),
      transition: input.transition ?? transition,
      motionState: resolvedState,
    });
  };

  const receipt = () => Object.freeze({
    route,
    characterId: exactCharacterId,
    identityVerified: true,
    identitySource: route === 'naki'
      ? 'caller-explicit-exact-naki-id-match'
      : 'saasuna-controller-exact-character-rejection',
    presentationOnly: true,
    gameplayAuthority: false,
    boardAuthority: false,
    saveAuthority: false,
    networkAuthority: false,
  });

  const snapshot = () => {
    const inner = typeof controller.snapshot === 'function'
      ? controller.snapshot()
      : null;
    return Object.freeze({
      ...(inner && typeof inner === 'object' ? inner : {}),
      ...receipt(),
    });
  };

  const finish = (preferred) => {
    if (!active) return;
    active = false;
    try {
      if (preferred === 'destroy' && typeof controller.destroy === 'function') {
        controller.destroy();
      } else if (preferred === 'clear' && typeof controller.clear === 'function') {
        controller.clear();
      } else if (typeof controller.destroy === 'function') {
        controller.destroy();
      } else if (typeof controller.clear === 'function') {
        controller.clear();
      }
    } finally {
      clearRouterDataset(host);
    }
  };

  return Object.freeze({
    route,
    setState: typeof controller.setState === 'function'
      ? (input = {}, options = undefined) => {
          if (!active) return null;
          return controller.setState(input, options);
        }
      : undefined,
    playSequence: typeof controller.playSequence === 'function'
      ? (input = {}) => {
          if (!active) return null;
          return controller.playSequence(input);
        }
      : undefined,
    applyCausalPhase,
    receipt,
    snapshot,
    clear: () => finish('clear'),
    destroy: () => finish('destroy'),
  });
}

export const BATTLE_CINEMATIC_CHARACTER_MOTION_ROUTER_RUNTIME = Object.freeze({
  schema: 'gameroad.battle-cinematic-character-motion-router.v1',
  routing: 'NAKI_EXACT_ID_FIRST_THEN_SAASUNA_EXACT_CONTROLLER',
  identityInference: false,
  trimsOrNormalizesCharacterIdentity: false,
  presentationOnly: true,
  gameplayAuthority: false,
  boardAuthority: false,
  saveAuthority: false,
  networkAuthority: false,
  nakiRuntime: NAKI_BATTLE_MAGIC_LIVE_ADAPTER_RUNTIME.schema,
  saasunaRuntime: SAASUNA_BATTLE_MOTION_RUNTIME.schema,
  causalTimelineCompatible: true,
  causalPhaseOrder: CAUSAL_PHASES,
  unknownCharacterFallback: 'null_no_motion_controller',
});
