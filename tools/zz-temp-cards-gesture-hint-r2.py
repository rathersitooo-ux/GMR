from pathlib import Path

path = Path('browser/cards-deck-presentation.mjs')
text = path.read_text()

anchor = "const CARDS_FAVORITE_STORAGE_KEY = 'gameroad.cards.favorite.v1';\n"
insert = r'''const DECK_SWIPE_DISCOVERY_STORAGE_KEY = 'gameroad.cards.deckSwipeDiscovery.v1';

export const DECK_SWIPE_DISCOVERY_CONTRACT = Object.freeze({
  schema: 'gameroad.cards-deck-swipe-discovery.v1',
  storageKey: DECK_SWIPE_DISCOVERY_STORAGE_KEY,
  localUiOnly: true,
  dismissOn: 'matching-success-only',
  motion: 'none',
  ownsDeck: false,
  mutatesDeckRules: false,
});

export function normalizeDeckSwipeDiscoveryState(value = {}) {
  return Object.freeze({
    add: value?.add === true,
    remove: value?.remove === true,
  });
}

export function parseDeckSwipeDiscoveryState(raw) {
  if (typeof raw !== 'string' || !raw) return normalizeDeckSwipeDiscoveryState();
  try { return normalizeDeckSwipeDiscoveryState(JSON.parse(raw)); }
  catch { return normalizeDeckSwipeDiscoveryState(); }
}

export function readDeckSwipeDiscoveryState({ storage, key = DECK_SWIPE_DISCOVERY_STORAGE_KEY } = {}) {
  try { return parseDeckSwipeDiscoveryState(storage?.getItem?.(key) ?? null); }
  catch { return normalizeDeckSwipeDiscoveryState(); }
}

export function writeDeckSwipeDiscoveryState({ storage, value, key = DECK_SWIPE_DISCOVERY_STORAGE_KEY } = {}) {
  try {
    if (typeof storage?.setItem !== 'function') return false;
    storage.setItem(key, JSON.stringify(normalizeDeckSwipeDiscoveryState(value)));
    return true;
  } catch {
    return false;
  }
}

export function createDeckSwipeDiscoveryController({ storage, key = DECK_SWIPE_DISCOVERY_STORAGE_KEY } = {}) {
  let state = readDeckSwipeDiscoveryState({ storage, key });
  const hints = () => Object.freeze({
    add: Object.freeze({ visible: !state.add, text: '→ 右フリックで札組へ' }),
    remove: Object.freeze({ visible: !state.remove, text: '← 左フリックで外す' }),
  });
  const recordSuccessfulSwipe = ({ surface, result } = {}) => {
    const learnedKey = surface === 'collection' && result?.action === 'deck-add'
      ? 'add'
      : surface === 'deck' && result?.action === 'deck-remove'
        ? 'remove'
        : null;
    if (result?.ok !== true || !learnedKey || state[learnedKey]) return false;
    state = normalizeDeckSwipeDiscoveryState({ ...state, [learnedKey]: true });
    writeDeckSwipeDiscoveryState({ storage, value: state, key });
    return true;
  };
  return Object.freeze({
    contract: DECK_SWIPE_DISCOVERY_CONTRACT,
    state: () => state,
    hints,
    recordSuccessfulSwipe,
  });
}
'''
if text.count(anchor) != 1:
    raise SystemExit(f'top anchor count={text.count(anchor)}')
text = text.replace(anchor, anchor + insert, 1)

anchor = "  const presentation = createDeckSwipePresentationController({ document: doc, window: win });\n\n  let gesture = null;\n"
insert = r'''  const discovery = createDeckSwipeDiscoveryController({ storage: cardsFavoriteStorage(win) });
  const discoveryHost = doc.createElement('div');
  discoveryHost.setAttribute?.('data-role', 'deck-swipe-discovery-hints');
  discoveryHost.setAttribute?.('aria-label', 'カードのフリック操作ヒント');
  const addDiscoveryHint = doc.createElement('span');
  addDiscoveryHint.setAttribute?.('data-role', 'deck-swipe-discovery-add');
  const removeDiscoveryHint = doc.createElement('span');
  removeDiscoveryHint.setAttribute?.('data-role', 'deck-swipe-discovery-remove');
  discoveryHost.appendChild?.(addDiscoveryHint);
  discoveryHost.appendChild?.(removeDiscoveryHint);
  host.after?.(discoveryHost);
  if (!discoveryHost.parentNode) screen.appendChild?.(discoveryHost);
  if (!doc.getElementById?.('gameroad-deck-swipe-discovery-style')) {
    const style = doc.createElement('style');
    style.id = 'gameroad-deck-swipe-discovery-style';
    style.textContent = '[data-role="deck-swipe-discovery-hints"]{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0;font:700 12px/1.25 system-ui;opacity:.82}[data-role="deck-swipe-discovery-hints"][hidden],[data-role="deck-swipe-discovery-hints"]>span[hidden]{display:none}[data-role="deck-swipe-discovery-hints"]>span{padding:5px 8px;border-radius:999px;border:1px solid currentColor}';
    (doc.head ?? doc.documentElement)?.appendChild?.(style);
  }
  const renderDiscoveryHints = () => {
    const model = discovery.hints();
    addDiscoveryHint.textContent = model.add.text;
    addDiscoveryHint.hidden = !model.add.visible;
    removeDiscoveryHint.textContent = model.remove.text;
    removeDiscoveryHint.hidden = !model.remove.visible;
    discoveryHost.hidden = !model.add.visible && !model.remove.visible;
  };
  renderDiscoveryHints();

  let gesture = null;
'''
if text.count(anchor) != 1:
    raise SystemExit(f'presentation anchor count={text.count(anchor)}')
text = text.replace(anchor, "  const presentation = createDeckSwipePresentationController({ document: doc, window: win });\n\n" + insert, 1)

anchor = "    if (!result?.ok) return;\n    suppressClick = { cardId: current.cardId, until: now() + 450 };\n"
replacement = "    if (!result?.ok) return;\n    discovery.recordSuccessfulSwipe({ surface: current.surface, result });\n    renderDiscoveryHints();\n    suppressClick = { cardId: current.cardId, until: now() + 450 };\n"
if text.count(anchor) != 1:
    raise SystemExit(f'success anchor count={text.count(anchor)}')
text = text.replace(anchor, replacement, 1)

anchor = "      presentation?.dispose?.();\n      mounted?.dispose?.();\n"
replacement = "      presentation?.dispose?.();\n      discoveryHost.remove?.();\n      mounted?.dispose?.();\n"
if text.count(anchor) != 1:
    raise SystemExit(f'destroy anchor count={text.count(anchor)}')
text = text.replace(anchor, replacement, 1)
path.write_text(text)

test = Path('tests/cards-deck-swipe-discovery.test.mjs')
test.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SWIPE_DISCOVERY_CONTRACT,
  createDeckSwipeDiscoveryController,
  normalizeDeckSwipeDiscoveryState,
  parseDeckSwipeDiscoveryState,
} from '../browser/cards-deck-presentation.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

test('discovery contract is local UI only and motion independent', () => {
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.localUiOnly, true);
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.motion, 'none');
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.ownsDeck, false);
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.mutatesDeckRules, false);
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.dismissOn, 'matching-success-only');
});

test('missing or invalid persistence starts with both directional hints visible', () => {
  assert.deepEqual(normalizeDeckSwipeDiscoveryState(), { add: false, remove: false });
  assert.deepEqual(parseDeckSwipeDiscoveryState('not-json'), { add: false, remove: false });
  const controller = createDeckSwipeDiscoveryController({ storage: memoryStorage() });
  assert.deepEqual(controller.hints(), {
    add: { visible: true, text: '→ 右フリックで札組へ' },
    remove: { visible: true, text: '← 左フリックで外す' },
  });
});

test('failed neutral or mismatched gestures never dismiss a hint', () => {
  const controller = createDeckSwipeDiscoveryController({ storage: memoryStorage() });
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: false, action: 'deck-add' } }), false);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'none' } }), false);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'deck', result: { ok: true, action: 'deck-add' } }), false);
  assert.deepEqual(controller.state(), { add: false, remove: false });
});

test('matching successful swipes dismiss only their own hint and persist', () => {
  const storage = memoryStorage();
  const controller = createDeckSwipeDiscoveryController({ storage });
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'deck-add' } }), true);
  assert.deepEqual(controller.state(), { add: true, remove: false });
  assert.equal(controller.hints().add.visible, false);
  assert.equal(controller.hints().remove.visible, true);
  assert.match(storage.value(DECK_SWIPE_DISCOVERY_CONTRACT.storageKey), /"add":true/);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'deck-add' } }), false);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'deck', result: { ok: true, action: 'deck-remove' } }), true);
  assert.deepEqual(controller.state(), { add: true, remove: true });
  assert.equal(controller.hints().add.visible, false);
  assert.equal(controller.hints().remove.visible, false);
});

test('storage failure is non-fatal and current-session learning still works', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const controller = createDeckSwipeDiscoveryController({ storage });
  assert.doesNotThrow(() => controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'deck-add' } }));
  assert.deepEqual(controller.state(), { add: true, remove: false });
});
''')
