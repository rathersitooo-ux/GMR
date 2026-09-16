import {
  projectNewBaseHiddenHandAddContext,
} from './new-base-hidden-hand-runtime-core.mjs';

export const BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA =
  'gameroad.battle-hidden-hand-add-button-runtime.v2';

export const BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON = Object.freeze({
  READY: 'READY',
  NOT_OWNER: 'NOT_OWNER',
  NO_RESERVED_PRIVILEGE: 'NO_RESERVED_PRIVILEGE',
  RESERVED_CARD_NOT_ROAD: 'RESERVED_CARD_NOT_ROAD',
  ROAD_ALREADY_PRESENT: 'ROAD_ALREADY_PRESENT',
  RESERVED_CARD_ALREADY_PRESENT: 'RESERVED_CARD_ALREADY_PRESENT',
});

const VISUAL_INTENT = 'DEEP_LEMON_GUMMY_GOLD';

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name}_FUNCTION_REQUIRED`);
  return value;
}

function canonicalIdentity(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name}_CANONICAL_IDENTITY_REQUIRED`);
  }
  return value;
}

function validateMembership(cardIds) {
  if (!Array.isArray(cardIds)) throw new TypeError('ROAD_JANKEN_CARD_IDS_ARRAY_REQUIRED');
  return cardIds.map((cardId) => canonicalIdentity(cardId, 'ROAD_JANKEN_CARD_ID'));
}

function countIdentity(cardIds, identity) {
  return cardIds.reduce((count, cardId) => count + (cardId === identity ? 1 : 0), 0);
}

function projectionBase(reason) {
  return {
    schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
    reason,
    visualIntent: VISUAL_INTENT,
    exactColorAuthority: 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY',
    privilegeAuthority: 'EXISTING_NEW_BASE_HIDDEN_HAND_RUNTIME_ONLY',
    gameplayAuthority: false,
    membershipAuthority: false,
  };
}

/**
 * Join the already-current Hidden Hand privilege projection with caller-owned
 * Road-janken membership. This adapter owns neither source. It never consumes
 * the privilege, selects a card, computes Road legality, or creates a hand.
 */
export function projectBattleHiddenHandAddButton({
  hiddenHandRuntime,
  viewerOwnsHiddenHand,
  roadJankenCardIds,
  isRoadCardId,
} = {}) {
  if (typeof viewerOwnsHiddenHand !== 'boolean') {
    throw new TypeError('VIEWER_OWNS_HIDDEN_HAND_BOOLEAN_REQUIRED');
  }
  const membership = validateMembership(roadJankenCardIds);
  const roadPredicate = requiredFunction(isRoadCardId, 'IS_ROAD_CARD_ID');
  const context = projectNewBaseHiddenHandAddContext(hiddenHandRuntime);

  if (!viewerOwnsHiddenHand) {
    return Object.freeze({
      ...projectionBase(BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NOT_OWNER),
      visible: false,
      enabled: false,
      reservedCardId: null,
      roadAlreadyPresent: false,
    });
  }

  if (context.hiddenPrivilegeAvailable !== true) {
    return Object.freeze({
      ...projectionBase(BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NO_RESERVED_PRIVILEGE),
      visible: false,
      enabled: false,
      reservedCardId: null,
      roadAlreadyPresent: membership.some((cardId) => roadPredicate(cardId) === true),
    });
  }

  const reservedCardId = canonicalIdentity(context.reservedCardId, 'RESERVED_CARD_ID');
  if (roadPredicate(reservedCardId) !== true) {
    return Object.freeze({
      ...projectionBase(BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_NOT_ROAD),
      visible: false,
      enabled: false,
      reservedCardId: null,
      roadAlreadyPresent: membership.some((cardId) => roadPredicate(cardId) === true),
    });
  }

  const reservedMembershipCount = countIdentity(membership, reservedCardId);
  const roadAlreadyPresent = membership.some((cardId) => roadPredicate(cardId) === true);
  const reason = reservedMembershipCount > 0
    ? BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_ALREADY_PRESENT
    : roadAlreadyPresent
      ? BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.ROAD_ALREADY_PRESENT
      : BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.READY;

  return Object.freeze({
    ...projectionBase(reason),
    visible: true,
    enabled: reason === BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.READY,
    reservedCardId,
    roadAlreadyPresent,
  });
}

/**
 * The write callback is the existing caller-owned Road-janken membership
 * authority. A press re-reads all inputs before and after the delegated write,
 * requires one exact reservedCardId in membership, and verifies that the Hidden
 * Hand privilege was not consumed or replaced by the button action.
 */
export function createBattleHiddenHandAddButtonController({
  readHiddenHandRuntime,
  readViewerOwnsHiddenHand,
  readRoadJankenCardIds,
  isRoadCardId,
  addRoadJankenCardId,
} = {}) {
  const readRuntime = requiredFunction(readHiddenHandRuntime, 'READ_HIDDEN_HAND_RUNTIME');
  const readOwner = requiredFunction(readViewerOwnsHiddenHand, 'READ_VIEWER_OWNS_HIDDEN_HAND');
  const readMembership = requiredFunction(readRoadJankenCardIds, 'READ_ROAD_JANKEN_CARD_IDS');
  requiredFunction(isRoadCardId, 'IS_ROAD_CARD_ID');
  const addCard = requiredFunction(addRoadJankenCardId, 'ADD_ROAD_JANKEN_CARD_ID');
  let destroyed = false;

  function readProjection() {
    if (destroyed) throw new Error('HIDDEN_HAND_ADD_BUTTON_CONTROLLER_DESTROYED');
    return projectBattleHiddenHandAddButton({
      hiddenHandRuntime: readRuntime(),
      viewerOwnsHiddenHand: readOwner(),
      roadJankenCardIds: readMembership(),
      isRoadCardId,
    });
  }

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,

    sync() {
      return readProjection();
    },

    async press() {
      const before = readProjection();
      if (!before.enabled) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: before.reason,
          added: false,
          cardId: null,
          privilegeConsumed: false,
          membershipWriteDelegated: false,
          gameplayAuthority: false,
        });
      }

      const currentContext = projectNewBaseHiddenHandAddContext(readRuntime());
      if (currentContext.hiddenPrivilegeAvailable !== true
        || currentContext.reservedCardId !== before.reservedCardId) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: 'HIDDEN_HAND_STATE_CHANGED_BEFORE_ADD',
          added: false,
          cardId: null,
          privilegeConsumed: currentContext.hiddenPrivilegeAvailable !== true,
          membershipWriteDelegated: false,
          gameplayAuthority: false,
        });
      }

      await addCard(Object.freeze({
        source: 'HIDDEN_HAND',
        cardId: before.reservedCardId,
      }));

      const reflectedMembership = validateMembership(readMembership());
      const reflectedCount = countIdentity(reflectedMembership, before.reservedCardId);
      const afterContext = projectNewBaseHiddenHandAddContext(readRuntime());

      if (reflectedCount !== 1) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: reflectedCount > 1
            ? 'DUPLICATE_RESERVED_PHYSICAL_CARD'
            : 'ADD_NOT_REFLECTED_IN_AUTHORITATIVE_MEMBERSHIP',
          added: false,
          cardId: before.reservedCardId,
          privilegeConsumed: afterContext.hiddenPrivilegeAvailable !== true,
          membershipWriteDelegated: true,
          gameplayAuthority: false,
        });
      }

      if (afterContext.hiddenPrivilegeAvailable !== true
        || afterContext.reservedCardId !== before.reservedCardId) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: 'ADD_MUST_NOT_CONSUME_OR_REPLACE_HIDDEN_HAND_PRIVILEGE',
          added: false,
          cardId: before.reservedCardId,
          privilegeConsumed: afterContext.hiddenPrivilegeAvailable !== true,
          membershipWriteDelegated: true,
          gameplayAuthority: false,
        });
      }

      return Object.freeze({
        schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
        ok: true,
        reason: 'ADDED_SAME_RESERVED_PHYSICAL_CARD',
        added: true,
        cardId: before.reservedCardId,
        privilegeConsumed: false,
        membershipWriteDelegated: true,
        gameplayAuthority: false,
      });
    },

    destroy() {
      if (destroyed) return false;
      destroyed = true;
      return true;
    },
  });
}

function installStyle(documentRef) {
  const existing = documentRef?.querySelector?.('[data-gr-hidden-hand-add-style]');
  if (existing) return existing;
  if (!documentRef?.createElement || !documentRef?.head?.appendChild) return null;
  const style = documentRef.createElement('style');
  style.setAttribute('data-gr-hidden-hand-add-style', '');
  style.textContent = `
[data-gr-hidden-hand-add-button]{min-width:44px;min-height:44px;border:2px solid var(--gameroad-hidden-hand-deep-lemon);border-radius:999px;background:var(--gameroad-hidden-hand-gummy-gold);color:var(--gameroad-hidden-hand-ink);font:inherit;font-weight:900;padding:.55em .9em;cursor:pointer;touch-action:manipulation}
[data-gr-hidden-hand-add-button][data-state="disabled-road-present"]{filter:grayscale(1);opacity:.48;cursor:default}
[data-gr-hidden-hand-add-button][hidden]{display:none!important}
`;
  documentRef.head.appendChild(style);
  return style;
}

export function mountBattleHiddenHandAddButton({
  documentRef = globalThis.document,
  container,
  controller,
  label = '隠し手',
} = {}) {
  if (!container?.appendChild) throw new TypeError('HIDDEN_HAND_ADD_BUTTON_CONTAINER_REQUIRED');
  if (!controller || typeof controller.sync !== 'function' || typeof controller.press !== 'function') {
    throw new TypeError('HIDDEN_HAND_ADD_BUTTON_CONTROLLER_REQUIRED');
  }
  if (!documentRef?.createElement) throw new TypeError('HIDDEN_HAND_ADD_BUTTON_DOCUMENT_REQUIRED');
  installStyle(documentRef);

  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('data-gr-hidden-hand-add-button', '');
  button.setAttribute('data-visual-intent', VISUAL_INTENT);
  button.setAttribute('aria-label', '隠し手のRoadカードを追加');
  container.appendChild(button);
  let destroyed = false;

  function render(projection) {
    button.hidden = !projection.visible;
    button.disabled = !projection.enabled;
    button.setAttribute('aria-disabled', projection.enabled ? 'false' : 'true');
    button.setAttribute('data-reason', projection.reason);
    button.setAttribute(
      'data-state',
      projection.enabled ? 'ready' : projection.roadAlreadyPresent ? 'disabled-road-present' : 'unavailable',
    );
    if (projection.reservedCardId) {
      button.setAttribute('data-reserved-physical-card-id', projection.reservedCardId);
    } else {
      button.removeAttribute?.('data-reserved-physical-card-id');
    }
    return projection;
  }

  function sync() {
    if (destroyed) throw new Error('HIDDEN_HAND_ADD_BUTTON_MOUNT_DESTROYED');
    return render(controller.sync());
  }

  async function onClick(event) {
    event?.preventDefault?.();
    if (button.disabled || button.hidden) return;
    await controller.press();
    if (!destroyed) sync();
  }

  button.addEventListener?.('click', onClick);
  sync();

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
    button,
    sync,
    async press() {
      if (destroyed) throw new Error('HIDDEN_HAND_ADD_BUTTON_MOUNT_DESTROYED');
      const result = await controller.press();
      if (!destroyed) sync();
      return result;
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      button.removeEventListener?.('click', onClick);
      button.remove?.();
      controller.destroy?.();
      return true;
    },
  });
}

export const BATTLE_HIDDEN_HAND_ADD_BUTTON_CONTRACT = Object.freeze({
  schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
  hiddenHandAuthority: 'EXISTING_NEW_BASE_HIDDEN_HAND_RUNTIME_ONLY',
  visualIntent: VISUAL_INTENT,
  exactColorValueInvented: false,
  exactColorAuthority: 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY',
  enablePredicate: 'PRIVILEGE_AND_RESERVED_ROAD_ID_AND_NO_ROAD_IN_CALLER_AUTHORITATIVE_MEMBERSHIP',
  alreadyRoadPresent: 'GRAY_SEMANTIC_DISABLED_NO_HIT',
  pressAdds: 'EXACT_EXISTING_RESERVED_CARD_ID',
  duplicateCardAllowed: false,
  pressConsumesPrivilege: false,
  privilegeConsumptionAuthority: 'EXISTING_NEW_BASE_HIDDEN_HAND_RUNTIME_AUTHORITATIVE_LEGAL_ROAD_COMMIT_ONLY',
  membershipAuthority: 'CALLER_SUPPLIED_EXISTING_ROAD_JANKEN_MEMBERSHIP',
  computesRoadLegality: false,
  gameplayAuthority: false,
  ownsSecondHiddenHandRuntime: false,
  ownsSecondHandStore: false,
  ownsSave: false,
  mutatesProductionHtml: false,
});
