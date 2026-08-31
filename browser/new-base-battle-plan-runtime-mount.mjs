import { NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA } from './new-base-battle-plan-presentation-core.mjs';

const OWN_ROOT_SELECTOR = '[data-new-base-battle-plan-root="1"]';

function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

function text(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function appendTextElement(document, parent, tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

function renderStatus(document, shell, projection) {
  const status = document.createElement('div');
  status.className = 'new-base-plan__status';
  status.setAttribute('data-new-base-plan-status', '1');

  const dice = document.createElement('div');
  dice.className = 'new-base-plan__status-item';
  dice.setAttribute('data-new-base-plan-dice', '1');
  appendTextElement(document, dice, 'span', 'new-base-plan__status-label', 'DICE');
  appendTextElement(document, dice, 'strong', 'new-base-plan__status-value', text(projection.dice?.rollValue));
  if (projection.dice?.movementDelta !== null && projection.dice?.movementDelta !== undefined) {
    appendTextElement(document, dice, 'span', 'new-base-plan__status-detail', `MOVE +${text(projection.dice.movementDelta)}`);
  }
  status.appendChild(dice);

  const movement = document.createElement('div');
  movement.className = 'new-base-plan__status-item';
  movement.setAttribute('data-new-base-plan-movement', '1');
  appendTextElement(document, movement, 'span', 'new-base-plan__status-label', 'MOVE');
  appendTextElement(document, movement, 'strong', 'new-base-plan__status-value', text(projection.movementBudget?.total));
  status.appendChild(movement);

  const mana = document.createElement('div');
  mana.className = 'new-base-plan__status-item';
  mana.setAttribute('data-new-base-plan-mana', '1');
  appendTextElement(document, mana, 'span', 'new-base-plan__status-label', 'MANA');
  appendTextElement(document, mana, 'strong', 'new-base-plan__status-value', `${text(projection.mana?.current)}/${text(projection.mana?.max)}`);
  const recoveryText = projection.mana?.recoveryStatus === 'UNDECIDED'
    ? 'RECOVERY 未決定'
    : `RECOVERY ${text(projection.mana?.recoveryAmount)}`;
  appendTextElement(document, mana, 'span', 'new-base-plan__status-detail', recoveryText);
  status.appendChild(mana);

  shell.appendChild(status);
}

function renderBoard(document, shell, projection) {
  const board = document.createElement('div');
  board.className = 'new-base-plan__board';
  board.setAttribute('data-new-base-plan-board', '1');
  const zoneOrder = ['goal', 'shield', 'roadSlot', 'field'];
  const zones = projection.board?.zones ?? {};
  const rendered = new Set();

  for (const zoneId of [...zoneOrder, ...Object.keys(zones)]) {
    if (rendered.has(zoneId) || !Array.isArray(zones[zoneId])) continue;
    rendered.add(zoneId);
    const zone = document.createElement('section');
    zone.className = 'new-base-plan__zone';
    zone.setAttribute('data-zone-id', zoneId);
    appendTextElement(document, zone, 'h3', 'new-base-plan__zone-title', zoneId);
    const positions = document.createElement('div');
    positions.className = 'new-base-plan__positions';
    for (const positionId of zones[zoneId]) {
      const marker = document.createElement('span');
      marker.className = 'new-base-plan__position';
      marker.setAttribute('data-position-id', positionId);
      marker.textContent = positionId;
      positions.appendChild(marker);
    }
    zone.appendChild(positions);
    board.appendChild(zone);
  }
  shell.appendChild(board);
}

function renderSlots(document, shell, projection) {
  const slots = document.createElement('div');
  slots.className = 'new-base-plan__fixed-slots';
  slots.setAttribute('data-new-base-plan-fixed-slots', '1');
  for (const slot of projection.slots) {
    const element = document.createElement('article');
    element.className = 'new-base-plan__slot';
    element.setAttribute('data-slot-id', slot.slotId);
    element.setAttribute('data-janken-hand', slot.jankenHand);
    element.setAttribute('data-card-id', slot.card.cardId);
    element.setAttribute('data-selected', slot.selected ? 'true' : 'false');
    appendTextElement(document, element, 'span', 'new-base-plan__hand', slot.jankenHand);
    appendTextElement(document, element, 'strong', 'new-base-plan__card-label', text(slot.card.label, slot.card.cardId));
    if (slot.card.intrinsicSuit !== null && slot.card.intrinsicSuit !== undefined) {
      const suit = appendTextElement(document, element, 'span', 'new-base-plan__intrinsic-suit', String(slot.card.intrinsicSuit));
      suit.setAttribute('data-intrinsic-suit', String(slot.card.intrinsicSuit));
    }
    slots.appendChild(element);
  }
  shell.appendChild(slots);
}

function createShell(document, projection) {
  const shell = document.createElement('section');
  shell.className = 'new-base-plan';
  shell.setAttribute('data-new-base-battle-plan-root', '1');
  shell.setAttribute('data-presentation-schema', NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA);
  shell.setAttribute('data-presentation-only', 'true');
  if (projection.camera?.mode !== null && projection.camera?.mode !== undefined) {
    shell.setAttribute('data-camera-mode', String(projection.camera.mode));
  }
  if (projection.camera?.focusPositionId !== null && projection.camera?.focusPositionId !== undefined) {
    shell.setAttribute('data-camera-focus-position-id', String(projection.camera.focusPositionId));
  }

  renderStatus(document, shell, projection);
  renderBoard(document, shell, projection);
  renderSlots(document, shell, projection);
  return shell;
}

export function mountNewBaseBattlePlan({ root, projection }) {
  invariant(root && typeof root.appendChild === 'function' && typeof root.querySelector === 'function', 'root must be an explicit DOM-like caller-owned element');
  const document = root.ownerDocument;
  invariant(document && typeof document.createElement === 'function', 'root.ownerDocument.createElement is required');
  invariant(projection && projection.schemaVersion === NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA, 'projection schema mismatch');
  invariant(projection.authority?.gameStateWrite === false, 'projection must be presentation-only');

  const previous = root.querySelector(OWN_ROOT_SELECTOR);
  if (previous && typeof previous.remove === 'function') previous.remove();

  let element = null;
  if (projection.active === true) {
    element = createShell(document, projection);
    root.appendChild(element);
  }

  return Object.freeze({
    element,
    destroy() {
      if (element && typeof element.remove === 'function') element.remove();
      element = null;
    },
  });
}
