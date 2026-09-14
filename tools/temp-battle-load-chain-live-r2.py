from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


runtime_path = Path('browser/battle-screen-runtime-mount.mjs')
test_path = Path('tests/battle-screen-runtime-mount.test.mjs')
runtime = runtime_path.read_text()
test = test_path.read_text()

runtime = replace_once(
    runtime,
    "import { buildBattleLoadCardChainPresentation } from './battle-load-card-chain-presentation-core.mjs';",
    "import {\n  buildBattleLoadCardChainPresentation,\n  verifyBattleLoadCommitTransition\n} from './battle-load-card-chain-presentation-core.mjs';",
    'runtime import',
)

runtime = replace_once(
    runtime,
    "function normalizeHudSnapshot(snapshot = {}) {",
    """const FOCUS_RUNTIME_SELECTOR = '[data-gr-janken-focus-runtime]';
const FOCUS_PHYSICAL_CARD_SELECTOR = '[data-physical-card-id]';
const FOCUS_JANKEN_ROLE_SELECTOR = '[data-janken-role]';
const FOCUS_ACCEPTED_IDENTITY_SOURCES = Object.freeze(['GLOBAL_CARD_DATA_EXACT_ID', 'PACKAGE_CARD_ID_ONLY']);

function hudSourceOf(snapshot) {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
}

function normalizePlayedCards(value) {
  if (!Array.isArray(value)) return [];
  const cards = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const cardId = typeof raw.cardId === 'string' ? raw.cardId.trim() : '';
    if (!cardId) continue;
    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : cardId;
    cards.push({ ...raw, cardId, label });
  }
  return cards;
}

function samePlayedCardSequence(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((card, index) => card?.cardId === right[index]?.cardId);
}

function copyPlayedCards(cards) {
  return normalizePlayedCards(cards).map(card => ({ ...card }));
}

function readFocusCommittingCandidate(host) {
  if (!host || host.hidden || String(host.dataset?.surface ?? '') !== 'COMMITTING') return null;
  const physicalCard = host.querySelector?.(FOCUS_PHYSICAL_CARD_SELECTOR) ?? null;
  const cardId = typeof physicalCard?.dataset?.physicalCardId === 'string'
    ? physicalCard.dataset.physicalCardId.trim()
    : '';
  const identitySource = typeof physicalCard?.dataset?.cardIdentitySource === 'string'
    ? physicalCard.dataset.cardIdentitySource.trim()
    : '';
  if (!cardId || !FOCUS_ACCEPTED_IDENTITY_SOURCES.includes(identitySource)) return null;

  const roleNode = physicalCard.querySelector?.(FOCUS_JANKEN_ROLE_SELECTOR)
    ?? host.querySelector?.(FOCUS_JANKEN_ROLE_SELECTOR)
    ?? null;
  const role = typeof roleNode?.dataset?.jankenRole === 'string'
    ? roleNode.dataset.jankenRole.trim().toUpperCase()
    : '';
  const jankenHand = role === 'ROCK' ? 'rock' : role === 'SCISSORS' ? 'scissors' : role === 'PAPER' ? 'paper' : null;
  const nativeSuit = typeof physicalCard.dataset?.nativeSuit === 'string' && physicalCard.dataset.nativeSuit.trim()
    ? physicalCard.dataset.nativeSuit.trim()
    : null;
  const printedNumber = typeof physicalCard.dataset?.printedRank === 'string' && physicalCard.dataset.printedRank.trim()
    ? physicalCard.dataset.printedRank.trim()
    : null;

  return Object.freeze({ cardId, identitySource, jankenHand, nativeSuit, printedNumber });
}

function normalizeHudSnapshot(snapshot = {}) {""",
    'runtime helper insertion',
)

runtime = replace_once(
    runtime,
    """  const playedCards = Array.isArray(source.playedCards)
    ? source.playedCards.filter(card => card && typeof card === 'object').map((card, index) => ({
        cardId: typeof card.cardId === 'string' && card.cardId ? card.cardId : `played-${index + 1}`,
        label: typeof card.label === 'string' && card.label ? card.label : (typeof card.cardId === 'string' ? card.cardId : '?')
      }))
    : [];""",
    "  const playedCards = normalizePlayedCards(source.playedCards);",
    'runtime fail-closed played cards',
)

runtime = replace_once(
    runtime,
    """  const hud = createHud(document, shell);
  let lastHudSnapshot = writeHud(document, hud, options.hud);
  const resourceHud = mountBattleCriticalResourceHud(global, { host: hud.right, snapshot: options.hud ?? {} });""",
    """  const hud = createHud(document, shell);
  let lastCallerHudSource = hudSourceOf(options.hud);
  let lastHudSnapshot = writeHud(document, hud, lastCallerHudSource);
  let focusCommitCandidate = null;
  let pendingLoadCard = null;
  let pendingLoadJanken = null;
  let pendingPlayedBaseline = [];
  let loadLineageStatus = 'idle';
  const resourceHud = mountBattleCriticalResourceHud(global, { host: hud.right, snapshot: options.hud ?? {} });""",
    'runtime state insertion',
)

runtime = replace_once(
    runtime,
    """  let destroyed = false;
  function renderHud(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    lastHudSnapshot = writeHud(document, hud, snapshot);
    resourceHud.sync(snapshot);
    return lastHudSnapshot;
  }

  function render(model, hudSnapshot = null) {""",
    """  let destroyed = false;
  let focusObserver = null;

  function setLoadLineageStatus(status, cardId = null) {
    loadLineageStatus = status;
    setData(hud.root, 'loadLineageStatus', status);
    setData(hud.root, 'loadLineageCardId', cardId);
    return status;
  }

  function clearPendingLoad() {
    pendingLoadCard = null;
    pendingLoadJanken = null;
    pendingPlayedBaseline = [];
  }

  function composeHudSource(snapshot) {
    const source = hudSourceOf(snapshot);
    if (!pendingLoadCard) return source;

    const callerLoadCardId = typeof source.loadCard?.cardId === 'string' ? source.loadCard.cardId.trim() : '';
    if (callerLoadCardId) {
      clearPendingLoad();
      setLoadLineageStatus('caller-load-authority', callerLoadCardId);
      return source;
    }

    const callerPlayed = normalizePlayedCards(source.playedCards);
    if (samePlayedCardSequence(callerPlayed, pendingPlayedBaseline)) {
      return { ...source, loadCard: pendingLoadCard, loadJanken: pendingLoadJanken };
    }

    const pendingCardId = pendingLoadCard.cardId;
    try {
      verifyBattleLoadCommitTransition({
        before: {
          loadCard: pendingLoadCard,
          loadJanken: pendingLoadJanken,
          playedCards: pendingPlayedBaseline
        },
        after: { loadCard: null, loadJanken: null, playedCards: callerPlayed }
      });
      clearPendingLoad();
      setLoadLineageStatus('moved-to-played-chain', pendingCardId);
    } catch {
      clearPendingLoad();
      setLoadLineageStatus('continuity-unresolved', pendingCardId);
    }
    return source;
  }

  function renderHud(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    lastCallerHudSource = hudSourceOf(snapshot);
    const effectiveSnapshot = composeHudSource(lastCallerHudSource);
    lastHudSnapshot = writeHud(document, hud, effectiveSnapshot);
    resourceHud.sync(lastCallerHudSource);
    return lastHudSnapshot;
  }

  function syncLoadCardFocusDom() {
    if (destroyed) return null;
    const host = document.querySelector?.(FOCUS_RUNTIME_SELECTOR) ?? null;
    if (!host) {
      focusCommitCandidate = null;
      if (!pendingLoadCard && loadLineageStatus === 'committing') setLoadLineageStatus('idle');
      return null;
    }

    const surface = String(host.dataset?.surface ?? '');
    if (!host.hidden && surface === 'COMMITTING') {
      const candidate = readFocusCommittingCandidate(host);
      if (!candidate) {
        focusCommitCandidate = null;
        if (!pendingLoadCard) setLoadLineageStatus('identity-unresolved');
        return null;
      }
      if (!focusCommitCandidate || focusCommitCandidate.cardId !== candidate.cardId) {
        focusCommitCandidate = Object.freeze({
          ...candidate,
          playedCards: Object.freeze(copyPlayedCards(lastHudSnapshot.playedCards))
        });
      }
      setLoadLineageStatus('committing', candidate.cardId);
      return focusCommitCandidate;
    }

    if (host.hidden && surface === 'COMMITTING' && focusCommitCandidate) {
      const accepted = focusCommitCandidate;
      focusCommitCandidate = null;
      pendingLoadCard = Object.freeze({
        cardId: accepted.cardId,
        label: accepted.cardId,
        ...(accepted.nativeSuit ? { nativeSuit: accepted.nativeSuit } : {}),
        ...(accepted.printedNumber ? { printedNumber: accepted.printedNumber } : {})
      });
      pendingLoadJanken = accepted.jankenHand;
      pendingPlayedBaseline = copyPlayedCards(accepted.playedCards);
      setLoadLineageStatus('accepted-load', accepted.cardId);
      const effectiveSnapshot = composeHudSource(lastCallerHudSource);
      lastHudSnapshot = writeHud(document, hud, effectiveSnapshot);
      return Object.freeze({ status: loadLineageStatus, cardId: accepted.cardId });
    }

    if (surface !== 'COMMITTING') {
      focusCommitCandidate = null;
      if (!pendingLoadCard && (loadLineageStatus === 'committing' || loadLineageStatus === 'identity-unresolved')) {
        setLoadLineageStatus('idle');
      }
    }
    return null;
  }

  setLoadLineageStatus('idle');
  const FocusObserver = global?.MutationObserver;
  const observationRoot = document.getElementById?.('battleScreen') ?? currentPlayerUiRoot ?? root ?? document.body ?? null;
  if (typeof FocusObserver === 'function' && observationRoot) {
    try {
      focusObserver = new FocusObserver(() => {
        try { syncLoadCardFocusDom(); } catch {}
      });
      focusObserver.observe(observationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-surface', 'hidden']
      });
    } catch {
      focusObserver = null;
    }
  }
  syncLoadCardFocusDom();

  function render(model, hudSnapshot = null) {""",
    'runtime live bridge',
)

runtime = replace_once(
    runtime,
    """    destroyed = true;
    currentPlayerUi?.destroy?.();""",
    """    destroyed = true;
    try { focusObserver?.disconnect?.(); } catch {}
    currentPlayerUi?.destroy?.();""",
    'runtime observer destroy',
)

runtime = replace_once(
    runtime,
    """    renderHud,
    render,
    syncCurrentPlayerUi,""",
    """    renderHud,
    syncLoadCardFocusDom,
    render,
    syncCurrentPlayerUi,""",
    'runtime API exposure',
)

runtime = replace_once(
    runtime,
    """  loadCardIdentityAuthority: 'CALLER_CARD_ID_ONLY__JANKEN_SECONDARY__NO_ID_INFERENCE',""",
    """  loadCardIdentityAuthority: 'CALLER_CARD_ID_ONLY__JANKEN_SECONDARY__NO_ID_INFERENCE',
  loadCardLiveProjectionSource: 'EXISTING_FOCUS_DOM_EXACT_PHYSICAL_CARD_ID_ACCEPTED_ONLY',
  loadCardFocusDomMutation: false,""",
    'runtime contract',
)

# Focused test fake DOM support.
test = replace_once(
    test,
    """  querySelector(selector) {
    if (selector === '[data-role=\"fanart-local-skin-overlay\"]') {
      return walk(this, node => node !== this && node.dataset?.role === 'fanart-local-skin-overlay');
    }
    return null;
  }""",
    """  querySelector(selector) {
    if (selector === '[data-role=\"fanart-local-skin-overlay\"]') {
      return walk(this, node => node !== this && node.dataset?.role === 'fanart-local-skin-overlay');
    }
    if (selector === '[data-physical-card-id]') {
      return walk(this, node => node !== this && typeof node.dataset?.physicalCardId === 'string');
    }
    if (selector === '[data-janken-role]') {
      return walk(this, node => node !== this && typeof node.dataset?.jankenRole === 'string');
    }
    return null;
  }""",
    'test FakeElement selector',
)

test = replace_once(
    test,
    """  querySelector(selector) {
    if (selector === '[data-gr-battle-screen-root]') {
      return walk(this.body, node => node.attributes?.has('data-gr-battle-screen-root'));
    }
    return null;
  }""",
    """  querySelector(selector) {
    if (selector === '[data-gr-battle-screen-root]') {
      return walk(this.body, node => node.attributes?.has('data-gr-battle-screen-root'));
    }
    if (selector === '[data-gr-janken-focus-runtime]') {
      return walk(this.body, node => node.attributes?.has('data-gr-janken-focus-runtime'));
    }
    return null;
  }""",
    'test FakeDocument selector',
)

test = replace_once(
    test,
    "assert.equal(runtime.hud.chain.children.length, 0);",
    """assert.equal(runtime.hud.chain.children.length, 0);
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'idle');""",
    'test initial lineage status',
)

x9_tests = r"""

// X9: LOAD must preserve the exact physical card identity and move to the
// already-played chain only after that same cardId is appended once.
const hudPlayedCardIds = () => runtime.hud.chain.children
  .map(node => node.dataset?.cardId)
  .filter(Boolean);

runtime.renderHud({
  playedCards: [
    { label: 'identity-missing-must-drop' },
    { cardId: 'C1', label: 'CARD-1' }
  ]
});
assert.deepEqual(hudPlayedCardIds(), ['C1']);
assert.equal(runtime.hud.root.dataset.playedCardCount, '1');
assert.equal(runtime.hud.chain.children.some(node => node.dataset?.cardId === 'played-1'), false);

const played123 = [
  { cardId: 'C1', label: 'CARD-1' },
  { cardId: 'C2', label: 'CARD-2' },
  { cardId: 'C3', label: 'CARD-3' }
];
runtime.renderHud({ playedCards: played123 });

const focusHost = document.createElement('div');
focusHost.setAttribute('data-gr-janken-focus-runtime', '');
focusHost.dataset.surface = 'COMMITTING';
const focusCardC4 = document.createElement('div');
focusCardC4.dataset.physicalCardId = 'C4';
focusCardC4.dataset.cardIdentitySource = 'PACKAGE_CARD_ID_ONLY';
focusCardC4.dataset.nativeSuit = 'SP';
focusCardC4.dataset.printedRank = '7';
const focusRoleC4 = document.createElement('span');
focusRoleC4.dataset.jankenRole = 'ROCK';
focusCardC4.appendChild(focusRoleC4);
focusHost.appendChild(focusCardC4);
root.appendChild(focusHost);

runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'committing');
assert.notEqual(runtime.hud.loadCard.dataset.cardId, 'C4');

focusHost.hidden = true;
focusHost.replaceChildren();
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'accepted-load');
assert.equal(runtime.hud.loadCard.dataset.cardId, 'C4');
assert.equal(runtime.hud.loadCard.dataset.nativeSuit, 'SP');
assert.equal(runtime.hud.loadCard.dataset.displayNumber, '7');
assert.equal(runtime.hud.loadValue.textContent, 'グー');

runtime.renderHud({ playedCards: played123 });
assert.equal(runtime.hud.loadCard.dataset.cardId, 'C4');
assert.deepEqual(hudPlayedCardIds(), ['C1', 'C2', 'C3']);

const played1234 = [...played123, { cardId: 'C4', label: 'CARD-4' }];
runtime.renderHud({ playedCards: played1234 });
assert.equal(runtime.hud.loadCard.hidden, true);
assert.deepEqual(hudPlayedCardIds(), ['C1', 'C2', 'C3', 'C4']);
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'moved-to-played-chain');
assert.equal(runtime.hud.root.dataset.loadLineageCardId, 'C4');

focusHost.hidden = false;
focusHost.dataset.surface = 'COMMITTING';
const focusCardC5 = document.createElement('div');
focusCardC5.dataset.physicalCardId = 'C5';
focusCardC5.dataset.cardIdentitySource = 'GLOBAL_CARD_DATA_EXACT_ID';
const focusRoleC5 = document.createElement('span');
focusRoleC5.dataset.jankenRole = 'PAPER';
focusCardC5.appendChild(focusRoleC5);
focusHost.appendChild(focusCardC5);
runtime.syncLoadCardFocusDom();
focusHost.hidden = true;
focusHost.replaceChildren();
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.loadCard.dataset.cardId, 'C5');

const playedWrong = [...played1234, { cardId: 'C6', label: 'CARD-6' }];
runtime.renderHud({ playedCards: playedWrong });
assert.equal(runtime.hud.loadCard.hidden, true);
assert.deepEqual(hudPlayedCardIds(), ['C1', 'C2', 'C3', 'C4', 'C6']);
assert.equal(hudPlayedCardIds().includes('C5'), false);
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'continuity-unresolved');
assert.equal(runtime.hud.root.dataset.loadLineageCardId, 'C5');

focusHost.hidden = false;
focusHost.dataset.surface = 'COMMITTING';
const focusCardC7 = document.createElement('div');
focusCardC7.dataset.physicalCardId = 'C7';
focusCardC7.dataset.cardIdentitySource = 'PACKAGE_CARD_ID_ONLY';
focusHost.appendChild(focusCardC7);
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'committing');
focusHost.dataset.surface = 'LOAD_FOCUS';
focusHost.replaceChildren();
runtime.syncLoadCardFocusDom();
assert.equal(runtime.hud.root.dataset.loadLineageStatus, 'idle');
assert.notEqual(runtime.hud.loadCard.dataset.cardId, 'C7');

assert.equal(BATTLE_SCREEN_RUNTIME.loadCardLiveProjectionSource, 'EXISTING_FOCUS_DOM_EXACT_PHYSICAL_CARD_ID_ACCEPTED_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.loadCardFocusDomMutation, false);
"""

test = replace_once(
    test,
    "assert.equal(runtimeStyle.textContent.includes('♥'), false);\n\nconst idle = createBattleScreenModel({ participants });",
    "assert.equal(runtimeStyle.textContent.includes('♥'), false);" + x9_tests + "\n\nconst idle = createBattleScreenModel({ participants });",
    'test X9 regressions',
)

runtime_path.write_text(runtime)
test_path.write_text(test)
print('patched X9 Battle LOAD -> played chain live integration')
