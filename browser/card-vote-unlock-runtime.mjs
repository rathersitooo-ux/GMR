// 投票の解禁の置き場（ブラウザ版・端末内）
// 毎日の無料投票（GAMEROAD_CARD_VOTE）の履歴を取り込んで、カードごとに票を溜める。
// 解禁ラインとメーターの計算は card-vote-unlock-core.mjs が正本。
// ここは保存・取り込み・窓口だけを持つ。
import {
  VOTE_UNLOCK_SCHEMA,
  applyCardVoteToUnlockState,
  cardVoteMeterModel,
  cardVoteUnlockProgress,
  createCardVoteUnlockState,
  normalizeCardVoteUnlockState,
  setCardVoteSaleActive,
} from './card-vote-unlock-core.mjs';

const STORAGE_KEY = 'GAMEROAD_CARD_VOTE_UNLOCK_LOCAL_V1';

function historyFingerprint(entry) {
  return `${String(entry?.cardId ?? '')}|${String(entry?.day ?? '')}|${String(entry?.stance ?? '')}|${String(entry?.at ?? '')}`;
}

export function installCardVoteUnlockRuntime({
  window: win = globalThis.window,
  storage = null,
} = {}) {
  if (!win?.addEventListener) return Object.freeze({ installed: false });
  if (win.GAMEROAD_CARD_VOTE_UNLOCK) return win.GAMEROAD_CARD_VOTE_UNLOCK;

  const store = storage ?? (() => { try { return win.localStorage ?? null; } catch { return null; } })();
  let memoryRaw = null;

  function readState() {
    let raw = null;
    try { raw = store?.getItem(STORAGE_KEY) ?? null; } catch { raw = null; }
    if (!raw) raw = memoryRaw;
    if (!raw) return createCardVoteUnlockState();
    try { return normalizeCardVoteUnlockState(JSON.parse(raw)); }
    catch { return createCardVoteUnlockState(); }
  }

  function writeState(state) {
    const normalized = normalizeCardVoteUnlockState(state);
    const raw = JSON.stringify(normalized);
    memoryRaw = raw;
    try { store?.setItem(STORAGE_KEY, raw); } catch { /* 端末保存が使えない時はメモリだけで続ける */ }
    return normalized;
  }

  // 毎日の投票の履歴から、まだ取り込んでいない票を取り込む（二重に数えない）。
  function syncFromVoteHistory() {
    const authority = win.GAMEROAD_CARD_VOTE;
    if (typeof authority?.snapshot !== 'function') return readState();
    let snapshot;
    try { snapshot = authority.snapshot(); } catch { return readState(); }
    const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
    let state = readState();
    const known = new Set(state.importedKeys);
    let changed = false;
    for (const entry of history) {
      const key = historyFingerprint(entry);
      if (known.has(key)) continue;
      const next = applyCardVoteToUnlockState(state, {
        cardId: entry?.cardId,
        stance: entry?.stance,
        at: entry?.at ?? '',
      });
      // カードIDか賛否が不正で数えられなかった票は、取り込み済みにして繰り返さない。
      known.add(key);
      state = next;
      state.importedKeys = [...known].slice(-400);
      changed = true;
    }
    if (changed) state = writeState(state);
    return state;
  }

  function meterFor(cardId) {
    return cardVoteMeterModel(syncFromVoteHistory(), cardId);
  }

  function progressFor(cardId) {
    return cardVoteUnlockProgress(syncFromVoteHistory(), cardId);
  }

  function setSaleActive(saleActive) {
    const state = setCardVoteSaleActive(syncFromVoteHistory(), !!saleActive, new Date().toISOString());
    return writeState(state);
  }

  function snapshot() {
    const state = syncFromVoteHistory();
    return {
      schema: VOTE_UNLOCK_SCHEMA,
      saleActive: state.saleActive,
      cards: Object.fromEntries(
        Object.keys(state.cards).map((id) => [id, cardVoteUnlockProgress(state, id)]),
      ),
    };
  }

  function resetQa() {
    try { store?.removeItem(STORAGE_KEY); } catch { /* noop */ }
    memoryRaw = null;
    return writeState(createCardVoteUnlockState());
  }

  const onVote = () => { syncFromVoteHistory(); };
  win.addEventListener('gameroad:card-vote-local', onVote);
  syncFromVoteHistory();

  const api = Object.freeze({
    schema: VOTE_UNLOCK_SCHEMA,
    installed: true,
    meterFor,
    progressFor,
    setSaleActive,
    snapshot,
    resetQa,
  });
  win.GAMEROAD_CARD_VOTE_UNLOCK = api;
  return api;
}

if (typeof globalThis.window !== 'undefined' && globalThis.window?.document) {
  installCardVoteUnlockRuntime();
}
