// ランクマッチの相手探し（サーバー役）の芯。
//
// 正本の形：待ち列に入る → 4人集まったら対戦成立 → 人が足りなければAIで補充する。
// 開始の合図は MatchFound（相手が見つかった）→ BattleStart（対戦開始）の順で出す。
// この芯は「探す・そろえる・合図を出す」だけを持ち、画面の表示と対戦そのものの
// 開始は持たない。呼ぶ側（rank-match-search-provider-mount）が窓口になり、
// 見つかった合図を受けて待機画面側が本物の対戦開始へつなぐ。
//
// peerSource は「すでに待ち列にいる他の人」を返す差し込み口。手元の写しでは
// ネットワークの相手がいないため既定では空で、全席がAI補充になるのが正しい
// 動きになる（通常のローカル対戦も相手は全員CPU）。サーバー接続時は、ここに
// サーバーから届いた顔ぶれを渡せば、残りの席だけがAI補充になる。

export const RANK_MATCH_SEARCH_SCHEMA = 'gameroad.rank-match-search.v1';
export const RANK_MATCH_FOUND_SCHEMA = 'gameroad.rank-match-found.v1';
export const RANK_MATCH_PLAYER_COUNT = 4;
export const RANK_MATCH_SEARCH_WINDOW_MS = 2200;

function rankMatchSeat(index) {
  return 'P' + (index + 1);
}

export function createRankMatchSearchSession(options = {}) {
  const schedule = typeof options.schedule === 'function'
    ? options.schedule
    : (fn, ms) => setTimeout(fn, ms);
  const cancelSchedule = typeof options.cancelSchedule === 'function'
    ? options.cancelSchedule
    : (id) => clearTimeout(id);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const searchWindowMs = Number.isFinite(options.searchWindowMs)
    ? Math.max(0, options.searchWindowMs)
    : RANK_MATCH_SEARCH_WINDOW_MS;
  const peerSource = typeof options.peerSource === 'function' ? options.peerSource : null;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

  let state = 'idle'; // idle | searching | found | cancelled
  let timer = null;
  let descriptor = null;

  function emit(type, detail) {
    if (onEvent) onEvent(Object.freeze({ type, ...detail }));
  }

  function statusText() {
    if (state === 'searching') return '対戦相手を探しています…';
    if (state === 'found') return '対戦相手が見つかりました';
    if (state === 'cancelled') return '対戦相手探しをやめました';
    return '対戦相手を探す準備ができています';
  }

  function snapshot() {
    return Object.freeze({
      schema: RANK_MATCH_SEARCH_SCHEMA,
      state,
      status: statusText(),
      match: descriptor,
    });
  }

  function buildDescriptor() {
    const peers = [];
    if (peerSource) {
      try {
        const found = peerSource();
        if (Array.isArray(found)) {
          for (const peer of found) {
            if (peers.length >= RANK_MATCH_PLAYER_COUNT - 1) break;
            if (peer && typeof peer === 'object') peers.push(peer);
          }
        }
      } catch {}
    }
    const players = [Object.freeze({ seat: rankMatchSeat(0), kind: 'you', filledByAi: false })];
    for (let i = 1; i < RANK_MATCH_PLAYER_COUNT; i += 1) {
      const peer = peers[i - 1];
      if (peer) {
        players.push(Object.freeze({
          seat: rankMatchSeat(i),
          kind: 'remote',
          filledByAi: false,
          name: typeof peer.name === 'string' ? peer.name : null,
        }));
      } else {
        players.push(Object.freeze({ seat: rankMatchSeat(i), kind: 'cpu', filledByAi: true }));
      }
    }
    const aiFilledCount = players.filter((player) => player.filledByAi).length;
    return Object.freeze({
      schema: RANK_MATCH_FOUND_SCHEMA,
      signals: Object.freeze(['MatchFound', 'BattleStart']),
      mode: 'rank',
      matchId: 'RANK-' + now().toString(36).toUpperCase(),
      playerCount: RANK_MATCH_PLAYER_COUNT,
      aiFilledCount,
      // ランクの決まりはサーバー側の固定プリセット。利用者は自由に編集できない。
      preset: Object.freeze({ mode: '4p', editable: false }),
      players: Object.freeze(players),
    });
  }

  function start() {
    if (state === 'searching' || state === 'found') return snapshot();
    state = 'searching';
    descriptor = null;
    emit('searching', { status: statusText() });
    timer = schedule(() => {
      timer = null;
      if (state !== 'searching') return;
      descriptor = buildDescriptor();
      state = 'found';
      emit('found', { status: statusText(), match: descriptor });
    }, searchWindowMs);
    return snapshot();
  }

  function cancel() {
    if (state !== 'searching') return snapshot();
    if (timer !== null) {
      cancelSchedule(timer);
      timer = null;
    }
    state = 'cancelled';
    emit('cancelled', { status: statusText() });
    return snapshot();
  }

  return Object.freeze({ start, cancel, snapshot });
}
