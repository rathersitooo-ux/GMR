// 投票の解禁（2026-11-10 ライカの決め）
// 票が溜まる → ラインに届いたら解禁。表示はメーター式で、ユーザーに票数の数字は見せない。
// 満タンになったら表示が変わる（解禁の表示になる）。
//
// ライン：
// - 通常時は当面 10,000 票。
// - リリース記念セール中は小さい数で回す。仕様その3の本人メモ「リリース・テスト時の
//   セール用は3票とかでも良い」から、セールのラインは 3 票。
//
// 未定のまま残す所（ここでは決めない）：
// - 2段（デッキ投入枚数の増／リメイクカード）への数の当てはめ。解禁したかどうかだけを
//   状態として持ち、当てはめは決まってから別途つなぐ。
// - G・E・D（カードID 'GED'）の解禁の票数そのもの。未定のカードにはラインを引かず、
//   どれだけ票が溜まってもこの仕組みでは解禁しない。
//
// 数え方：そのカードへの投票（賛成＋反対の合計）が溜まる。賛成と反対は別々に記録して
// あるので、後から数え方を変えても記録は壊れない。

export const VOTE_UNLOCK_SCHEMA = 'GAMEROAD_CARD_VOTE_UNLOCK_V1';
export const VOTE_UNLOCK_NORMAL_LINE = 10000;
export const VOTE_UNLOCK_SALE_LINE = 3;

// 解禁の票数が未定のカード。ここに入っている間はラインなし（解禁しない）。
export const VOTE_UNLOCK_UNDECIDED_LINE_CARD_IDS = Object.freeze(['GED']);

export function voteUnlockLineFor(cardId, { saleActive = false } = {}) {
  const id = String(cardId ?? '');
  if (!id) return null;
  if (VOTE_UNLOCK_UNDECIDED_LINE_CARD_IDS.includes(id)) return null;
  return saleActive ? VOTE_UNLOCK_SALE_LINE : VOTE_UNLOCK_NORMAL_LINE;
}

function blankCard() {
  return { for: 0, against: 0, total: 0, unlocked: false, unlockedAt: '', unlockedLine: 0, unlockedSale: false };
}

function cleanCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function cleanCard(raw) {
  const c = blankCard();
  if (!raw || typeof raw !== 'object') return c;
  c.for = cleanCount(raw.for);
  c.against = cleanCount(raw.against);
  c.total = Math.max(cleanCount(raw.total), c.for + c.against);
  c.unlocked = !!raw.unlocked;
  c.unlockedAt = typeof raw.unlockedAt === 'string' ? raw.unlockedAt : '';
  c.unlockedLine = cleanCount(raw.unlockedLine);
  c.unlockedSale = !!raw.unlockedSale;
  return c;
}

export function createCardVoteUnlockState() {
  return { schema: VOTE_UNLOCK_SCHEMA, saleActive: false, importedKeys: [], cards: {} };
}

export function normalizeCardVoteUnlockState(raw) {
  const s = createCardVoteUnlockState();
  if (!raw || typeof raw !== 'object') return s;
  s.saleActive = !!raw.saleActive;
  if (Array.isArray(raw.importedKeys)) {
    s.importedKeys = raw.importedKeys.filter((k) => typeof k === 'string').slice(-400);
  }
  if (raw.cards && typeof raw.cards === 'object') {
    for (const [id, card] of Object.entries(raw.cards)) {
      if (id) s.cards[String(id)] = cleanCard(card);
    }
  }
  return s;
}

// 解禁の判定を今のラインでやり直す。解禁は一度したら戻らない（取り消さない）。
function evaluateUnlock(card, cardId, saleActive, at) {
  if (card.unlocked) return card;
  const line = voteUnlockLineFor(cardId, { saleActive });
  if (line === null || card.total < line) return card;
  return { ...card, unlocked: true, unlockedAt: at, unlockedLine: line, unlockedSale: !!saleActive };
}

// 1票ぶんを加える。stance は 'for' | 'against'。新しい状態を返す（元の状態は変えない）。
export function applyCardVoteToUnlockState(state, { cardId, stance, at = '' } = {}) {
  const s = normalizeCardVoteUnlockState(state);
  const id = String(cardId ?? '');
  if (!id || (stance !== 'for' && stance !== 'against')) return s;
  const card = { ...(s.cards[id] ?? blankCard()) };
  if (stance === 'for') card.for += 1; else card.against += 1;
  card.total += 1;
  s.cards[id] = evaluateUnlock(card, id, s.saleActive, String(at ?? ''));
  return s;
}

// セールの開始・終了。ラインが下がると、その場で届いているカードが解禁になる。
export function setCardVoteSaleActive(state, saleActive, at = '') {
  const s = normalizeCardVoteUnlockState(state);
  s.saleActive = !!saleActive;
  for (const [id, card] of Object.entries(s.cards)) {
    s.cards[id] = evaluateUnlock(card, id, s.saleActive, String(at ?? ''));
  }
  return s;
}

// 1枚ぶんの進み具合。line が null のカードは hasLine:false（メーター自体を出さない）。
// fillRatio はメーターの長さ専用で、ユーザーへ数字として見せる物ではない。
export function cardVoteUnlockProgress(state, cardId) {
  const s = normalizeCardVoteUnlockState(state);
  const id = String(cardId ?? '');
  const card = s.cards[id] ?? blankCard();
  const line = voteUnlockLineFor(id, { saleActive: s.saleActive });
  const hasLine = line !== null;
  const fillRatio = hasLine ? Math.min(1, card.total / line) : 0;
  return {
    cardId: id,
    tallyFor: card.for,
    tallyAgainst: card.against,
    tallyTotal: card.total,
    line,
    hasLine,
    fillRatio,
    unlocked: card.unlocked,
    saleActive: s.saleActive,
  };
}

// 表示用の形。票数の数字は含めない。状態は3つだけ：ラインなし／溜まっている途中／満タン（解禁）。
export function cardVoteMeterModel(state, cardId) {
  const p = cardVoteUnlockProgress(state, cardId);
  if (!p.hasLine) return Object.freeze({ cardId: p.cardId, kind: 'no-line', fillRatio: 0, unlocked: p.unlocked });
  if (p.unlocked || p.fillRatio >= 1) return Object.freeze({ cardId: p.cardId, kind: 'full', fillRatio: 1, unlocked: true });
  return Object.freeze({ cardId: p.cardId, kind: 'filling', fillRatio: p.fillRatio, unlocked: false });
}
