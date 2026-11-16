/**
 * The persistent small band for F1-115: draw the already-projected played-card
 * order (the bridge's screenModel) in a small rail that stays visible on the
 * normal battle screen. It is NOT the fullscreen cinematic order band
 * (grBattleCinematicOrder, only shown during FULLSCREEN_ANIMATION) and it
 * does NOT call the battle screen mount (mountBattleScreenExternalSurface),
 * which builds the whole cinematic shell and is the wrong granularity for a
 * small persistent display.
 *
 * Authority: the rail renders only the snapshot it receives. It never sorts,
 * reorders, resolves, picks a winner/target, or writes game state. A snapshot
 * whose slots are not exactly four, whose played card lacks a janken hand, or
 * whose round does not match the caller's current round is hidden, never
 * guessed, because presenting an order the live match did not produce would
 * be inventing gameplay.
 *
 * Placement (interim, before the battle screen rebuild): the rail is mounted
 * INSIDE #publicTurnHud, below the player strip, so it follows the top band
 * row on every screen size. No absolute coordinates of its own. The rebuild
 * will place it properly inside the top band row.
 */
const SCHEMA = 'gameroad.battle-action-order-persistent-rail.v1';

const VISUAL_STATES = new Set(['resolved-win', 'invalidated', 'unresolved-final']);

const JANKEN_LABELS = Object.freeze({
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
  'グー': 'グー',
  'チョキ': 'チョキ',
  'パー': 'パー',
});

function fail(code) {
  throw new TypeError(code);
}

function createNode(document, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function setData(element, name, value) {
  if (!element) return;
  if (element.dataset) {
    element.dataset[name] = value == null ? '' : String(value);
    return;
  }
  element.setAttribute?.(`data-${name}`, value == null ? '' : String(value));
}

function clearChildren(element) {
  if (!element) return;
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren();
    return;
  }
  while (Array.isArray(element.children) && element.children.length > 0) {
    element.children[0]?.remove?.();
    if (element.children.length > 0 && element.children[0]?.parentNode === element) break;
  }
  if (typeof element.innerHTML === 'string') element.innerHTML = '';
}

/**
 * Same art lookup as the mount's order band (resolveViewerLocalPlayedCardArt):
 * the viewer's local skin overlay for the card, taken from the collection
 * grid. Kept local so this rail does not import the whole battle screen
 * runtime mount. Returns null when there is no local art; the caller draws
 * the fallback shape instead.
 */
export function resolvePersistentRailCardArt(document, cardId) {
  if (!document || typeof document.querySelectorAll !== 'function'
    || typeof cardId !== 'string' || !cardId) return null;
  const nodes = document.querySelectorAll('#collectionGrid [data-id]') ?? [];
  let sourceCard = null;
  for (const node of nodes) {
    if (String(node?.dataset?.id ?? '') === cardId) {
      sourceCard = node;
      break;
    }
  }
  const localArt = sourceCard?.querySelector?.('[data-role="fanart-local-skin-overlay"]');
  const src = typeof localArt?.src === 'string' ? localArt.src.trim() : '';
  if (!src) return null;
  return Object.freeze({ src, source: 'viewer_local' });
}

function handLabel(hand) {
  if (typeof hand !== 'string' || !hand.trim()) return '';
  const key = hand.trim().toLowerCase();
  return JANKEN_LABELS[key] ?? hand.trim();
}

function roundOfEventId(eventId) {
  if (typeof eventId !== 'string') return null;
  const match = eventId.match(/:r(\d+):/);
  if (!match) return null;
  const round = Number(match[1]);
  return Number.isSafeInteger(round) ? round : null;
}

function validSlots(chain) {
  if (!chain || !Array.isArray(chain.finalSlots) || chain.finalSlots.length !== 4) return null;
  for (const slot of chain.finalSlots) {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return null;
    if (typeof slot.playerId !== 'string' || !slot.playerId.trim()) return null;
    if (typeof slot.cardId !== 'string' || !slot.cardId.trim()) return null;
    if (slot.displayNumber != null && !Number.isFinite(slot.displayNumber)) return null;
    // A played card without a janken hand carries no order meaning: hide the
    // whole rail rather than showing a partial order.
    if (typeof slot.hand !== 'string' || !slot.hand.trim()) return null;
    if (slot.visualState != null && !VISUAL_STATES.has(slot.visualState)) return null;
  }
  return chain.finalSlots;
}

export function mountPersistentActionOrderRail(document, host, options = {}) {
  if (!document || typeof document.createElement !== 'function') {
    fail('BATTLE_ACTION_ORDER_PERSISTENT_RAIL_DOCUMENT_INVALID');
  }
  if (!host || typeof host.appendChild !== 'function') {
    fail('BATTLE_ACTION_ORDER_PERSISTENT_RAIL_HOST_INVALID');
  }
  const resolveArt = typeof options.resolveArt === 'function'
    ? options.resolveArt
    : resolvePersistentRailCardArt;

  const rail = createNode(document, 'div', 'grPersistentActionOrderRail');
  rail.hidden = true;
  rail.setAttribute?.('aria-label', '出したカードの順番');
  rail.setAttribute?.('data-gr-action-order-rail', 'persistent');
  host.appendChild(rail);

  let shown = false;
  let shownEventId = null;

  function hide(reason) {
    clearChildren(rail);
    rail.hidden = true;
    rail.setAttribute?.('aria-hidden', 'true');
    shown = false;
    shownEventId = null;
    return Object.freeze({ ok: true, shown: false, reason });
  }

  function sync(screenModel, currentRound) {
    if (screenModel == null || typeof screenModel !== 'object' || Array.isArray(screenModel)) {
      return hide('HIDDEN_NO_SNAPSHOT');
    }
    const slots = validSlots(screenModel.actionOrderChain);
    if (!slots) return hide('HIDDEN_INVALID_CHAIN');
    const eventId = typeof screenModel.eventId === 'string' ? screenModel.eventId : null;
    const snapshotRound = roundOfEventId(eventId);
    if (typeof currentRound === 'number' && Number.isFinite(currentRound)) {
      if (snapshotRound == null || snapshotRound !== currentRound) {
        return hide('HIDDEN_ROUND_MISMATCH');
      }
    }
    const labelByPlayer = new Map(
      (Array.isArray(screenModel.lanes) ? screenModel.lanes : [])
        .filter((lane) => lane && typeof lane.id === 'string')
        .map((lane) => [lane.id, typeof lane.label === 'string' && lane.label ? lane.label : lane.id]),
    );
    clearChildren(rail);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const chip = createNode(document, 'div', 'grPersistentActionOrderChip');
      setData(chip, 'sequenceIndex', index);
      setData(chip, 'playerId', slot.playerId);
      setData(chip, 'cardId', slot.cardId);
      setData(chip, 'finalState', slot.visualState ?? null);
      const numberLabel = slot.displayNumber == null ? '' : String(slot.displayNumber);
      const hand = handLabel(slot.hand);
      const player = labelByPlayer.get(slot.playerId) ?? slot.playerId;
      const readable = [numberLabel, hand].filter(Boolean).join('、');
      chip.setAttribute?.('aria-label', `処理順${index + 1}、${player}${readable ? `、${readable}` : ''}`);
      const art = resolveArt(document, slot.cardId);
      if (art && typeof art.src === 'string' && art.src) {
        const image = createNode(document, 'img', 'grPersistentActionOrderChipArt');
        image.src = art.src;
        image.alt = '';
        image.setAttribute?.('aria-hidden', 'true');
        chip.appendChild(image);
        setData(chip, 'artSource', art.source ?? 'viewer_local');
      } else {
        const fallback = createNode(document, 'span', 'grPersistentActionOrderChipFallback');
        fallback.setAttribute?.('aria-hidden', 'true');
        chip.appendChild(fallback);
      }
      const meta = createNode(document, 'span', 'grPersistentActionOrderChipMeta');
      meta.appendChild(createNode(document, 'span', 'grPersistentActionOrderChipOrder', String(index + 1)));
      if (numberLabel) meta.appendChild(createNode(document, 'span', 'grPersistentActionOrderChipNumber', numberLabel));
      if (hand) meta.appendChild(createNode(document, 'span', 'grPersistentActionOrderChipHand', hand));
      chip.appendChild(meta);
      chip.appendChild(createNode(document, 'span', 'grPersistentActionOrderChipPlayer', player));
      rail.appendChild(chip);
    }
    rail.hidden = false;
    rail.setAttribute?.('aria-hidden', 'false');
    shown = true;
    shownEventId = eventId;
    return Object.freeze({ ok: true, shown: true, eventId, round: snapshotRound });
  }

  return Object.freeze({
    element: rail,
    sync,
    status() {
      return Object.freeze({ shown, eventId: shownEventId });
    },
  });
}

export const BATTLE_ACTION_ORDER_PERSISTENT_RAIL_CONTRACT = Object.freeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  source: 'CALLER_SUPPLIED_COMPARE4_SCREEN_MODEL_ACTION_ORDER_CHAIN',
  sortingOwnedHere: false,
  winnerCalculation: false,
  targetCalculation: false,
  gameStateWrite: false,
  invalidPresentationPolicy: 'HIDE_WITHOUT_PRESENTING',
  placement: 'INSIDE_PUBLIC_TURN_HUD_BELOW_PLAYER_STRIP_RELATIVE',
});
