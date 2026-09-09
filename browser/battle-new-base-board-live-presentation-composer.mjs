import {
  createNewBaseGoalPathLayout,
  projectNewBaseGoalPathConnections,
} from './new-base-goal-path-core.mjs';
import {
  projectNewBaseGoalPathPresentation,
} from './new-base-goal-path-presentation-core.mjs';
import {
  mountFlanoraBoardSurface,
} from './new-base-flanora-board-surface-runtime.mjs';
import {
  mountNewBaseGoalEntryGateCue,
} from './new-base-goal-entry-gate-cue-runtime.mjs';

const SCHEMA = 'gameroad.battle-new-base-board-live-presentation-composer.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function fail(reason, extra = {}) {
  return deepFreeze({
    schema: SCHEMA,
    mounted: false,
    ok: false,
    reason,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    ...extra,
  });
}

function projectGoalPath(goalPathLayout, straightCardIdsByColumn) {
  const projection = projectNewBaseGoalPathConnections(goalPathLayout, { straightCardIdsByColumn });
  if (!projection?.ok) {
    return { ok: false, reason: projection?.reason ?? 'GOAL_PATH_PROJECTION_FAILED' };
  }
  const presentation = projectNewBaseGoalPathPresentation(projection);
  if (!presentation?.ok) {
    return { ok: false, reason: presentation?.reason ?? 'GOAL_PATH_PRESENTATION_FAILED' };
  }
  return { ok: true, projection, presentation };
}

function copyStraightSnapshot(value) {
  if (!Array.isArray(value)) return value;
  return value.map((column) => (Array.isArray(column) ? [...column] : column));
}

export function mountBattleNewBaseBoardLivePresentation({
  host,
  documentLike = globalThis?.document,
  layoutInput,
  straightCardIdsByColumn,
  participantColors = {},
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  if (!host || typeof host.appendChild !== 'function') return fail('DOM_HOST_REQUIRED');
  if (!documentLike || typeof documentLike.createElement !== 'function') return fail('DOM_DOCUMENT_REQUIRED');

  let goalPathLayout;
  try {
    goalPathLayout = createNewBaseGoalPathLayout(layoutInput);
  } catch (error) {
    return fail(error?.message || 'GOAL_PATH_LAYOUT_INVALID');
  }

  const initialGoal = projectGoalPath(goalPathLayout, straightCardIdsByColumn);
  if (!initialGoal.ok) return fail(initialGoal.reason);

  let boardSurfaceRuntime;
  try {
    boardSurfaceRuntime = mountFlanoraBoardSurface({
      host,
      documentLike,
      layoutInput,
      reducedMotion,
      lowPerf,
    });
  } catch (error) {
    return fail(error?.message || 'FLANORA_BOARD_SURFACE_MOUNT_FAILED');
  }
  if (!boardSurfaceRuntime?.mounted) {
    return fail(boardSurfaceRuntime?.reason ?? 'FLANORA_BOARD_SURFACE_MOUNT_FAILED');
  }

  const gateCueRuntime = mountNewBaseGoalEntryGateCue({
    boardSurfaceRuntime,
    goalPathPresentation: initialGoal.presentation,
    participantColors,
    documentLike,
    reducedMotion,
    lowPerf,
  });
  if (!gateCueRuntime?.mounted) {
    boardSurfaceRuntime.destroy?.();
    return fail(gateCueRuntime?.reason ?? 'GOAL_ENTRY_GATE_CUE_MOUNT_FAILED');
  }

  let destroyed = false;
  let currentStraightCardIdsByColumn = copyStraightSnapshot(straightCardIdsByColumn);
  let currentGoalProjection = initialGoal.projection;
  let currentGoalPresentation = initialGoal.presentation;

  function snapshotState() {
    const connectedLaneKeys = currentGoalPresentation.lanePresentations
      .filter((lane) => lane.connectedToGoal === true)
      .map((lane) => lane.key);
    return deepFreeze({
      schema: SCHEMA,
      mounted: !destroyed,
      ok: !destroyed,
      reason: destroyed ? 'RUNTIME_DESTROYED' : 'LIVE_PRESENTATION_READY',
      openGoalPathCount: currentGoalPresentation.openGoalPathCount,
      connectedLaneKeys,
      boardSurface: boardSurfaceRuntime.snapshot(),
      gateCue: gateCueRuntime.snapshot(),
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      movementAuthority: false,
      legalityAuthority: false,
      resultAuthority: false,
    });
  }

  function syncAuthoritativeSnapshot({
    straightCardIdsByColumn: nextStraightCardIdsByColumn = currentStraightCardIdsByColumn,
    participantColors: nextParticipantColors,
  } = {}) {
    if (destroyed) return fail('RUNTIME_DESTROYED');

    const nextGoal = projectGoalPath(goalPathLayout, nextStraightCardIdsByColumn);
    if (!nextGoal.ok) {
      return deepFreeze({
        ...fail(nextGoal.reason),
        mounted: true,
        priorStatePreserved: true,
      });
    }

    const cueResult = gateCueRuntime.syncGoalPathPresentation(
      nextGoal.presentation,
      nextParticipantColors === undefined ? {} : { participantColors: nextParticipantColors },
    );
    if (cueResult?.ok !== true) {
      return deepFreeze({
        ...fail(cueResult?.reason ?? 'GOAL_ENTRY_GATE_CUE_SYNC_FAILED'),
        mounted: true,
        priorStatePreserved: true,
      });
    }

    currentStraightCardIdsByColumn = copyStraightSnapshot(nextStraightCardIdsByColumn);
    currentGoalProjection = nextGoal.projection;
    currentGoalPresentation = nextGoal.presentation;
    return deepFreeze({
      ok: true,
      reason: 'AUTHORITATIVE_PRESENTATION_SYNCED',
      ...snapshotState(),
    });
  }

  const runtime = {
    schema: SCHEMA,
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    boardSurfaceRuntime,
    gateCueRuntime,
    syncAuthoritativeSnapshot,
    resolveGateCueLane(participantId, laneIndex) {
      return gateCueRuntime.resolveLane(participantId, laneIndex);
    },
    resolveClearingCell(cellId) {
      return boardSurfaceRuntime.resolveClearingCell(cellId);
    },
    goalPathProjection() {
      return currentGoalProjection;
    },
    goalPathPresentation() {
      return currentGoalPresentation;
    },
    snapshot() {
      return snapshotState();
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      gateCueRuntime.destroy?.();
      boardSurfaceRuntime.destroy?.();
      return true;
    },
  };

  return Object.freeze(runtime);
}

export const BATTLE_NEW_BASE_BOARD_LIVE_PRESENTATION_COMPOSER_CONTRACT = deepFreeze({
  schema: SCHEMA,
  layoutAuthority: 'CALLER_INPUT_VALIDATED_BY_EXISTING_FLANORA_AND_GOAL_PATH_CORES',
  straightCardSnapshotAuthority: 'CALLER',
  goalPathProjectionAuthority: 'EXISTING_NEW_BASE_GOAL_PATH_CORE',
  goalPathPresentationAuthority: 'EXISTING_NEW_BASE_GOAL_PATH_PRESENTATION_CORE',
  boardSurfaceAuthority: 'EXISTING_FLANORA_PRESENTATION_RUNTIME',
  goalEntryCueAuthority: 'EXISTING_STATEFUL_GOAL_ENTRY_GATE_CUE_RUNTIME',
  participantColorAuthority: 'CALLER',
  ownsSevenCardRule: false,
  ownsBoardGeometryRule: false,
  computesMovementLegality: false,
  computesTargetLegality: false,
  computesResult: false,
  writesGameState: false,
  secondBoardEngine: false,
  secondMovementEngine: false,
  liveHtmlMountOwnedHere: false,
});
