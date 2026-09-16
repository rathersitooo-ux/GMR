import {
  BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_SCHEMA,
  createBattleHiddenRoadJankenAddController,
  mountBattleHiddenRoadJankenAddControl,
} from './battle-hidden-road-janken-add-control.mjs';
import { projectNewBaseHiddenHandAddContext } from './new-base-hidden-hand-runtime-core.mjs';

export const BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA =
  'gameroad.battle-hidden-road-janken-slidepad-integration.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireFunction(value, code) {
  if (typeof value !== 'function') throw new TypeError(code);
  return value;
}

function readRoadPresence(cards, isRoadCard) {
  if (!Array.isArray(cards)) throw new TypeError('HIDDEN_ROAD_JANKEN_CARDS_REQUIRED');
  return cards.some((card) => isRoadCard(card) === true);
}

/**
 * Project the existing hidden-hand authority into the existing add-control
 * contract. This function deliberately owns no hand/store/staging state.
 */
export function projectBattleHiddenRoadJankenSlidePadContext({
  hiddenRuntime,
  roadJankenCards,
  isRoadCard,
  stageAvailable = true,
} = {}) {
  requireFunction(isRoadCard, 'HIDDEN_ROAD_JANKEN_IS_ROAD_CARD_REQUIRED');
  const hidden = projectNewBaseHiddenHandAddContext(hiddenRuntime);
  return deepFreeze({
    reservedCardId: hidden.reservedCardId,
    hiddenPrivilegeAvailable: hidden.hiddenPrivilegeAvailable,
    roadJankenCardPresent: readRoadPresence(roadJankenCards, isRoadCard),
    stageAvailable: stageAvailable === true,
  });
}

/**
 * Compose the hidden-hand runtime with the existing gold/gray add control.
 *
 * The caller remains authoritative for:
 * - current hiddenRuntime
 * - current Road Janken membership
 * - Road classification
 * - actual existing staging mutation
 *
 * A successful press therefore does not create a local fourth hand, clone a
 * card, or consume hidden privilege. The next projection is derived from the
 * caller's current authoritative state.
 */
export function mountBattleHiddenRoadJankenSlidePadIntegration({
  document: documentRef,
  host,
  readHiddenRuntime,
  readRoadJankenCards,
  isRoadCard,
  stageReservedRoad,
  readStageAvailable = () => true,
} = {}) {
  if (!documentRef?.createElement || !host?.appendChild) {
    throw new TypeError('HIDDEN_ROAD_JANKEN_SLIDEPAD_HOST_REQUIRED');
  }
  requireFunction(readHiddenRuntime, 'HIDDEN_ROAD_JANKEN_READ_RUNTIME_REQUIRED');
  requireFunction(readRoadJankenCards, 'HIDDEN_ROAD_JANKEN_READ_CARDS_REQUIRED');
  requireFunction(isRoadCard, 'HIDDEN_ROAD_JANKEN_IS_ROAD_CARD_REQUIRED');
  requireFunction(stageReservedRoad, 'HIDDEN_ROAD_JANKEN_STAGE_RESERVED_REQUIRED');
  requireFunction(readStageAvailable, 'HIDDEN_ROAD_JANKEN_READ_STAGE_AVAILABLE_REQUIRED');

  const controller = createBattleHiddenRoadJankenAddController({
    readContext() {
      return projectBattleHiddenRoadJankenSlidePadContext({
        hiddenRuntime: readHiddenRuntime(),
        roadJankenCards: readRoadJankenCards(),
        isRoadCard,
        stageAvailable: readStageAvailable() === true,
      });
    },
    stageReservedRoad,
  });

  if (!controller) throw new TypeError('HIDDEN_ROAD_JANKEN_ADD_CONTROLLER_REQUIRED');
  const control = mountBattleHiddenRoadJankenAddControl({
    document: documentRef,
    host,
    controller,
  });
  if (!control) throw new TypeError('HIDDEN_ROAD_JANKEN_ADD_CONTROL_MOUNT_FAILED');

  return Object.freeze({
    schema: BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA,
    controlSchema: BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_SCHEMA,
    controller,
    control,
    sync: () => control.sync(),
    snapshot: () => controller.snapshot(),
    destroy: () => control.destroy(),
  });
}
