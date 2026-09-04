import {
  advanceSlotRollDrag,
  createSlotRollState,
  projectSlotRollWindow,
  resolveSlotRollCommit,
} from './slidepad-slot-roll-core.mjs';

export const HOME_SLIDEPAD_SLOT_ROLL_SCHEMA = 'gameroad.home-slidepad-slot-roll.v1';

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw new Error(`${label} must be greater than 0`);
  return number;
}

function choiceId(value) {
  return String(value ?? '').trim();
}

export function normalizeHomeSlotRollChoices(choices = []) {
  if (!Array.isArray(choices)) throw new Error('choices must be an array');
  const seen = new Set();
  const normalized = [];
  choices.forEach((choice, index) => {
    const source = choice && typeof choice === 'object' ? choice : { id: choice };
    const id = choiceId(source.id);
    if (!id) throw new Error(`choices[${index}].id must be non-empty`);
    if (seen.has(id)) return;
    seen.add(id);
    normalized.push(Object.freeze({ ...source, id }));
  });
  return Object.freeze(normalized);
}

export function deriveHomeSlotRollDetentPx({ anchorSpanPx, touchTargetMinPx } = {}) {
  const anchor = positive(anchorSpanPx, 'anchorSpanPx');
  const touchMin = positive(touchTargetMinPx, 'touchTargetMinPx');
  return Math.max(anchor, touchMin);
}

function freezeSession(session) {
  return Object.freeze({
    schema: HOME_SLIDEPAD_SLOT_ROLL_SCHEMA,
    choices: session.choices,
    state: session.state,
    detentPx: session.detentPx,
    lastClientX: session.lastClientX,
    engaged: Boolean(session.engaged),
    anchorId: session.anchorId,
  });
}

function assertSession(session) {
  if (!session || session.schema !== HOME_SLIDEPAD_SLOT_ROLL_SCHEMA) {
    throw new Error('session must be a Home SlidePad Slot Roll session');
  }
}

function indexForChoice(choices, id) {
  const normalizedId = choiceId(id);
  return choices.findIndex((choice) => choice.id === normalizedId);
}

export function createHomeSlotRollSession({
  choices = [],
  anchorId,
  detentPx,
  clientX = 0,
} = {}) {
  const normalized = normalizeHomeSlotRollChoices(choices);
  if (!normalized.length) throw new Error('choices must contain at least one item');
  const anchorIndex = indexForChoice(normalized, anchorId);
  if (anchorIndex < 0) throw new Error(`anchorId is not present in choices: ${choiceId(anchorId)}`);
  const detent = positive(detentPx, 'detentPx');
  const x = finite(clientX, 'clientX');
  return freezeSession({
    choices: normalized,
    state: createSlotRollState({ items: normalized, anchorIndex }),
    detentPx: detent,
    lastClientX: x,
    engaged: false,
    anchorId: normalized[anchorIndex].id,
  });
}

export function advanceHomeSlotRollSession(session, { anchorId = null, clientX } = {}) {
  assertSession(session);
  const x = finite(clientX, 'clientX');
  const requestedAnchor = choiceId(anchorId);

  if (!session.engaged && requestedAnchor && requestedAnchor !== session.anchorId) {
    const anchorIndex = indexForChoice(session.choices, requestedAnchor);
    if (anchorIndex >= 0) {
      const reanchored = freezeSession({
        choices: session.choices,
        state: createSlotRollState({ items: session.choices, anchorIndex }),
        detentPx: session.detentPx,
        lastClientX: x,
        engaged: false,
        anchorId: requestedAnchor,
      });
      return Object.freeze({
        session: reanchored,
        detents: Object.freeze([]),
        focusId: reanchored.state.itemId,
        engaged: false,
        reanchored: true,
      });
    }
  }

  const result = advanceSlotRollDrag(session.state, {
    deltaPx: x - session.lastClientX,
    detentPx: session.detentPx,
  });
  const engaged = session.engaged || result.detents.length > 0;
  const next = freezeSession({
    choices: session.choices,
    state: result.state,
    detentPx: session.detentPx,
    lastClientX: x,
    engaged,
    anchorId: session.anchorId,
  });
  return Object.freeze({
    session: next,
    detents: result.detents,
    focusId: next.state.itemId,
    engaged,
    reanchored: false,
  });
}

export function projectHomeSlotRollSession(session, { radius = 1 } = {}) {
  assertSession(session);
  return projectSlotRollWindow(session.state, { radius });
}

export function resolveHomeSlotRollRelease(session) {
  assertSession(session);
  if (!session.engaged) return null;
  const commit = resolveSlotRollCommit(session.state);
  if (!commit) return null;
  return Object.freeze({
    ...commit,
    choice: commit.item,
    control: commit.item?.control ?? null,
    lastDirection: commit.lastDirection,
  });
}
