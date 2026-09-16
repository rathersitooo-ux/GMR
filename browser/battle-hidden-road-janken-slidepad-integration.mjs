import {
  BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT,
  createBattleHiddenHandAddButtonController,
  mountBattleHiddenHandAddButton,
} from './battle-hidden-hand-add-button-runtime.mjs';

export const BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA =
  'gameroad.battle-hidden-road-janken-slidepad-integration.v2';

function requireExistingSlidePadHost(value) {
  if (!value || typeof value.appendChild !== 'function') {
    throw new TypeError('EXISTING_JANKEN_SLIDEPAD_HOST_REQUIRED');
  }
  return value;
}

/**
 * Thin composition bridge only.
 *
 * The caller owns the existing SlidePad host, Hidden Hand runtime, Road identity,
 * Road-janken membership and membership mutation. This module creates none of
 * those authorities; it only mounts the already-current Hidden Hand add-button
 * runtime into the host supplied by the caller.
 */
export function mountBattleHiddenRoadJankenSlidePadIntegration({
  documentRef = globalThis.document,
  slidePadHost,
  readHiddenHandRuntime,
  readViewerOwnsHiddenHand,
  readRoadJankenCardIds,
  isRoadCardId,
  addRoadJankenCardId,
  label = '隠し手',
} = {}) {
  const host = requireExistingSlidePadHost(slidePadHost);
  const controller = createBattleHiddenHandAddButtonController({
    readHiddenHandRuntime,
    readViewerOwnsHiddenHand,
    readRoadJankenCardIds,
    isRoadCardId,
    addRoadJankenCardId,
  });
  const mountedButton = mountBattleHiddenHandAddButton({
    documentRef,
    container: host,
    controller,
    label,
  });
  let destroyed = false;

  return Object.freeze({
    schema: BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA,
    host,
    button: mountedButton.button,

    sync() {
      if (destroyed) throw new Error('HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_DESTROYED');
      return mountedButton.sync();
    },

    async press() {
      if (destroyed) throw new Error('HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_DESTROYED');
      return mountedButton.press();
    },

    destroy() {
      if (destroyed) return false;
      destroyed = true;
      return mountedButton.destroy();
    },
  });
}

export const BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_CONTRACT = Object.freeze({
  schema: BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA,
  composesAddButtonSchema: BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.schema,
  slidePadAuthority: 'CALLER_SUPPLIED_EXISTING_SLIDEPAD_HOST_ONLY',
  createsSlidePadHost: false,
  hiddenHandAuthority: BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.hiddenHandAuthority,
  membershipAuthority: BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.membershipAuthority,
  pressAdds: BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.pressAdds,
  pressConsumesPrivilege: false,
  privilegeConsumptionAuthority: BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT.privilegeConsumptionAuthority,
  switchAwayRestoresEligibilityWhenMembershipHasNoRoadAndPrivilegeRemains: true,
  computesRoadLegality: false,
  gameplayAuthority: false,
  ownsSecondHiddenHandRuntime: false,
  ownsSecondHandStore: false,
  ownsSave: false,
  mutatesProductionHtml: false,
});
