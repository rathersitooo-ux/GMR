import {
  BATTLE_HIDDEN_HAND_ROAD_SOURCE,
  projectBattleHiddenHandView,
  resolveBattleHiddenHandRoadChoice,
} from './battle-hidden-hand-core.mjs';

export const BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA =
  'gameroad.battle-hidden-hand-add-button-runtime.v1';

export const BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON = Object.freeze({
  READY: 'READY',
  NOT_OWNER: 'NOT_OWNER',
  NO_RESERVED_PRIVILEGE: 'NO_RESERVED_PRIVILEGE',
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

function countIdentity(cards, identity, identityOf) {
  let count = 0;
  for (const card of cards) {
    if (canonicalIdentity(identityOf(card), 'ROAD_JANKEN_CARD_IDENTITY') === identity) count += 1;
  }
  return count;
}

/**
 * Pure projection from caller-authoritative Hidden Hand state and the current
 * Road-janken membership. It does not choose cards, infer legality, or mutate
 * either authority.
 *
 * Exact visual color values are intentionally absent: CURRENT fixes the visual
 * intent as deep-lemon / gummy-gold but leaves the exact value unspecified.
 */
export function projectBattleHiddenHandAddButton({
  hiddenHandState,
  viewerPlayerId,
  roadJankenCards,
  identityOf,
  isRoadCard,
} = {}) {
  canonicalIdentity(viewerPlayerId, 'VIEWER_PLAYER_ID');
  if (!Array.isArray(roadJankenCards)) throw new TypeError('ROAD_JANKEN_CARDS_ARRAY_REQUIRED');
  requiredFunction(identityOf, 'IDENTITY_OF');
  requiredFunction(isRoadCard, 'IS_ROAD_CARD');

  const view = projectBattleHiddenHandView(hiddenHandState, { viewerPlayerId });
  if (!view.owner) {
    return Object.freeze({
      schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
      visible: false,
      enabled: false,
      reason: BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NOT_OWNER,
      reservedCard: null,
      reservedCardIdentity: null,
      roadAlreadyPresent: false,
      visualIntent: VISUAL_INTENT,
      exactColorAuthority: 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY',
      gameplayAuthority: false,
      membershipAuthority: false,
    });
  }

  if (view.hasReservedCard !== true || view.privilegeAvailable !== true || !view.reservedCard) {
    return Object.freeze({
      schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
      visible: false,
      enabled: false,
      reason: BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.NO_RESERVED_PRIVILEGE,
      reservedCard: null,
      reservedCardIdentity: null,
      roadAlreadyPresent: roadJankenCards.some((card) => isRoadCard(card) === true),
      visualIntent: VISUAL_INTENT,
      exactColorAuthority: 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY',
      gameplayAuthority: false,
      membershipAuthority: false,
    });
  }

  const reservedIdentity = canonicalIdentity(
    view.reservedCardIdentity,
    'RESERVED_CARD_IDENTITY',
  );
  const reservedMembershipCount = countIdentity(roadJankenCards, reservedIdentity, identityOf);
  const roadAlreadyPresent = roadJankenCards.some((card) => isRoadCard(card) === true);
  const duplicatePresent = reservedMembershipCount > 0;
  const reason = duplicatePresent
    ? BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.RESERVED_CARD_ALREADY_PRESENT
    : roadAlreadyPresent
      ? BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.ROAD_ALREADY_PRESENT
      : BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.READY;

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
    visible: true,
    enabled: reason === BATTLE_HIDDEN_HAND_ADD_BUTTON_REASON.READY,
    reason,
    reservedCard: view.reservedCard,
    reservedCardIdentity: reservedIdentity,
    roadAlreadyPresent,
    visualIntent: VISUAL_INTENT,
    exactColorAuthority: 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY',
    gameplayAuthority: false,
    membershipAuthority: false,
  });
}

/**
 * Controller that delegates the actual membership write to the existing caller
 * authority. Every press re-reads both authorities to avoid stale enablement.
 */
export function createBattleHiddenHandAddButtonController({
  viewerPlayerId,
  readHiddenHandState,
  readRoadJankenCards,
  identityOf,
  isRoadCard,
  addRoadJankenCard,
} = {}) {
  canonicalIdentity(viewerPlayerId, 'VIEWER_PLAYER_ID');
  const readState = requiredFunction(readHiddenHandState, 'READ_HIDDEN_HAND_STATE');
  const readMembership = requiredFunction(readRoadJankenCards, 'READ_ROAD_JANKEN_CARDS');
  requiredFunction(identityOf, 'IDENTITY_OF');
  requiredFunction(isRoadCard, 'IS_ROAD_CARD');
  const addCard = requiredFunction(addRoadJankenCard, 'ADD_ROAD_JANKEN_CARD');

  let destroyed = false;

  function readProjection() {
    if (destroyed) throw new Error('HIDDEN_HAND_ADD_BUTTON_CONTROLLER_DESTROYED');
    return projectBattleHiddenHandAddButton({
      hiddenHandState: readState(),
      viewerPlayerId,
      roadJankenCards: readMembership(),
      identityOf,
      isRoadCard,
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
          card: null,
          physicalCardIdentity: null,
          privilegeConsumed: false,
          membershipWriteDelegated: false,
          gameplayAuthority: false,
        });
      }

      const hiddenHandState = readState();
      const choice = resolveBattleHiddenHandRoadChoice({
        state: hiddenHandState,
        source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.HIDDEN_HAND,
      });
      if (!choice.ok
        || choice.card !== before.reservedCard
        || choice.physicalCardIdentity !== before.reservedCardIdentity) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: 'HIDDEN_HAND_STATE_CHANGED_BEFORE_ADD',
          added: false,
          card: null,
          physicalCardIdentity: null,
          privilegeConsumed: false,
          membershipWriteDelegated: false,
          gameplayAuthority: false,
        });
      }

      await addCard(Object.freeze({
        source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.HIDDEN_HAND,
        card: choice.card,
        physicalCardIdentity: choice.physicalCardIdentity,
      }));

      const afterCards = readMembership();
      if (!Array.isArray(afterCards)) throw new TypeError('ROAD_JANKEN_CARDS_ARRAY_REQUIRED');
      const reflectedCount = countIdentity(afterCards, choice.physicalCardIdentity, identityOf);
      const afterState = readState();
      const afterView = projectBattleHiddenHandView(afterState, { viewerPlayerId });
      if (reflectedCount !== 1) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: reflectedCount > 1
            ? 'DUPLICATE_RESERVED_PHYSICAL_CARD'
            : 'ADD_NOT_REFLECTED_IN_AUTHORITATIVE_MEMBERSHIP',
          added: false,
          card: null,
          physicalCardIdentity: choice.physicalCardIdentity,
          privilegeConsumed: afterView.privilegeAvailable !== true,
          membershipWriteDelegated: true,
          gameplayAuthority: false,
        });
      }
      if (afterView.privilegeAvailable !== true
        || afterView.reservedCard !== choice.card
        || afterView.reservedCardIdentity !== choice.physicalCardIdentity) {
        return Object.freeze({
          schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
          ok: false,
          reason: 'ADD_MUST_NOT_CONSUME_OR_REPLACE_HIDDEN_HAND_PRIVILEGE',
          added: false,
          card: null,
          physicalCardIdentity: choice.physicalCardIdentity,
          privilegeConsumed: afterView.privilegeAvailable !== true,
          membershipWriteDelegated: true,
          gameplayAuthority: false,
        });
      }

      return Object.freeze({
        schema: BATTLE_HIDDEN_HAND_ADD_BUTTON_SCHEMA,
        ok: true,
        reason: 'ADDED_SAME_RESERVED_PHYSICAL_CARD',
        added: true,
        card: choice.card,
        physicalCardIdentity: choice.physicalCardIdentity,
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
    if (projection.reservedCardIdentity) {
      button.setAttribute('data-reserved-physical-card-id', projection.reservedCardIdentity);
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
  visualIntent: VISUAL_INTENT,
  exactColorValueInvented: false,
  exactColorAuthority: 'THEME_OR_EXISTING_FORMAL_TOKEN_ONLY',
  enablePredicate: 'PRIVILEGE_AND_RESERVED_CARD_AND_NO_ROAD_IN_AUTHORITATIVE_ROAD_JANKEN_MEMBERSHIP',
  alreadyRoadPresent: 'GRAY_SEMANTIC_DISABLED_NO_HIT',
  pressAdds: 'EXACT_SAME_RESERVED_PHYSICAL_CARD',
  duplicateCardAllowed: false,
  pressConsumesPrivilege: false,
  privilegeConsumptionAuthority: 'EXISTING_HIDDEN_HAND_AUTHORITATIVE_LEGAL_ROAD_COMMIT_ONLY',
  membershipAuthority: 'CALLER_SUPPLIED_EXISTING_ROAD_JANKEN_MEMBERSHIP',
  gameplayAuthority: false,
  ownsSecondHandStore: false,
  ownsSave: false,
  mutatesProductionHtml: false,
});
