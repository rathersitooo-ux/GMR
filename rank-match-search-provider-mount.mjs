// ランクマッチの相手探しの窓口を window へ登録する。
//
// 待機画面（home-boot-runtime-base-r3.mjs）は、主ボタンが押されたときに
// window.GAMEROAD_RANK_MATCH_SEARCH を呼んで状態の文を受け取る決まりで、
// 登録そのものは待機画面側では行わない（既存の検査の決まり）。
// 登録はこのファイルだけが行う。GAMEROAD.html の module script から読み込む。
//
// 動き：
// - 呼ばれると探し始める（探している間の再呼び出しは今の状態を返すだけ）。
// - 4人そろったら（足りない席はAI補充）'gameroad:rank-match-found' を window へ
//   出す。待機画面側がそれを受けて待機を終わり、本物の対戦開始へつなぐ。
// - 待機をやめた合図 'gameroad:rank-match-search-cancel' が来たら、探している
//   途中なら取り消し、次に呼ばれたときは新しい探し直しから始める。

import { createRankMatchSearchSession } from './rank-match-search-core.mjs';

export const RANK_MATCH_FOUND_EVENT = 'gameroad:rank-match-found';
export const RANK_MATCH_SEARCH_CANCEL_EVENT = 'gameroad:rank-match-search-cancel';

function providerWindow() {
  return typeof window !== 'undefined' ? window : globalThis;
}

function dispatchWindowEvent(win, name, detail) {
  if (!win || typeof win.dispatchEvent !== 'function') return false;
  try {
    if (typeof win.CustomEvent === 'function') {
      win.dispatchEvent(new win.CustomEvent(name, { detail }));
    } else {
      win.dispatchEvent({ type: name, detail });
    }
    return true;
  } catch {
    return false;
  }
}

export function createRankMatchSearchProvider(win = providerWindow(), options = {}) {
  let session = null;

  function ensureSession() {
    if (session) {
      const state = session.snapshot().state;
      if (state !== 'found' && state !== 'cancelled') return session;
      session = null;
    }
    session = createRankMatchSearchSession({
      ...options,
      onEvent(event) {
        if (event.type === 'found' && event.match) {
          dispatchWindowEvent(win, RANK_MATCH_FOUND_EVENT, event.match);
        }
      },
    });
    return session;
  }

  function rankMatchSearchProvider(request = {}) {
    if (request && request.cancel === true) {
      if (session) session.cancel();
      session = null;
      return Object.freeze({ status: '対戦相手探しをやめました', state: 'cancelled', match: null });
    }
    const current = ensureSession();
    const snap = current.start();
    return Object.freeze({ status: snap.status, state: snap.state, match: snap.match });
  }

  rankMatchSearchProvider.cancelSearch = () => {
    if (session) session.cancel();
    session = null;
  };
  rankMatchSearchProvider.snapshot = () => (session ? session.snapshot() : null);
  return rankMatchSearchProvider;
}

// 待機をやめる操作（戻る・待機をやめる・Esc）は待機画面側が cancel の合図を出す。
// ここで受けて、探している途中なら取り消す。見つかったあとの合図は対戦開始の
// つなぎの途中でも飛ぶため、見つかったセッションはそのまま閉じてよい。
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const provider = createRankMatchSearchProvider(window);
  window.addEventListener(RANK_MATCH_SEARCH_CANCEL_EVENT, () => provider.cancelSearch());
  const existing = globalThis.GAMEROAD_RANK_MATCH_SEARCH;
  if (existing && existing !== provider) throw new Error('GAMEROAD_RANK_MATCH_SEARCH_CONFLICT');
  if (!existing) {
    Object.defineProperty(globalThis, 'GAMEROAD_RANK_MATCH_SEARCH', {
      value: provider,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
}
