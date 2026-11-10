// ドッペルゲンガー試し版の核（純粋な計算、2026-11-10）。
// 正式な仕様の置き換えではなく、写しの中で切り替えて比べるための試し版。
//
// 系統（2026-11-10、ライカの裁定）：正は「手札に戻る」版の系統。
// 数値が下がる版は間違い（バトルは全員の出したカードの合計で戦うので、
// 戻れば合計は既に下がっている。下げる版は同じ効果の二重作り）。
//
// 形は3つを切り替えられる：
// - normal （通常）：同じ数字が2枚以上 → そのカードは手札へ戻る（表向きで戻り、
//   公開のまま保つ。公開手札の記録と一体）。
// - super （超）：同じ数字が2枚以上 → 手札に戻る代わりに消滅する。
// - unified （統一形、ライカの案 11:52）：同じ名前 → 消滅（大きい悪い）、
//   同じ数字 → 手札に戻る（小さい悪い）。両方に当たった時の先後を切り替えられる。
//
// 細則（2026-11-10、ライカ）：
// - オリカ（ユーザーが作ったカード）は同名判定の対象外（isOriginal の印）。
// - 同名は名前だけで見る（絵違い・着せ替えでも名前が同じなら同名）。
// - 変身したカードは変身後の名前で見る（渡された name がその時点の名前）。
// - 名前をコピーするカードは作らない方針なので、コピーの判定は持たない。
//
// 同名判定の点検（2026-11-10、試し版での仮置き。正式な所は比べと一緒に上げる）：
// 1. 自分の同名同士：既定は「含まない」（相手との間だけ）。2026-11-10に
//    試し版で両方の数を測って寄せを決めた（最終の採用はライカの判定待ち）。
//    同名2枚入りのデッキで1,000巡を測ると、同名の消滅が起きる巡は377巡、
//    そのうち自分の2枚が消え合う巡が75巡（全体の7.5%）。投票の解禁は
//    「同名を2枚以上入れられる」ことが報酬なので、その2枚を同じ巡に出すと
//    両方消える形では報酬に罠が入る。消滅は相手とのぶつかりで起きる形に
//    寄せる。includeOwnPairs=true の形も選べるようには残してある。
// 2. 別絵とリメイク：判定は表示の名前の文字列ではなく、カードの系統の
//    識別子（lineageId）でやる。リメイクは元のカードと同じ系統として渡す。
//    名前が変わるリメイクは、デュエル・マスターズ「神アート」と同じ扱い
//    （2026-11-10に公式ページで確認）：上に見える別名ではなく、下にある
//    既存カード名が実際のカード名で、デッキ構築上もゲーム上も常にその
//    実際の名前だけを持つ。GAMEROAD側では lineageId に実際のカードの
//    系統を入れ、別名や表示名は同名判定に使わない。
// 3. 同じキャラの別カード：名前（系統）が違えば同名にしない。キャラでは
//    判定しない。
// 4. コピーと変身（2026-11-10、ライカの線引きで確定）：
//    コピー：名前をコピーするようなカードは実装しない。それが一番丸い、
//    という方針。コピーの判定問題は、作らないことで消す。
//    変身：シャドウバースと同じ仕組み。変身したカードは変身先のカード
//    として扱い、同名判定も変身後の名前・系統で見る（渡される name と
//    lineageId は、その時点の姿の物を使う）。
// 5. 名前の表記ゆれ：系統の識別子で判定するので表示の揺れは効かない。
//    識別子が無いカードだけ、名前をならして（中黒・空白を除き、英字と
//    数字は半角にそろえる）から比べる。
//
// 対象は場に出ている札（ロード札とバトル札）。仕様その1にある
// 「アタッカー以外の全員」という細則は未確定のため、寄せ先（excludePlayerId）
// を選べる形にして、試しでは全員を含める方を既定にする。

export const DOPPEL_TRIAL_FORMS = ['normal', 'super', 'unified'];

// 名前の表記ゆれをならす（系統の識別子が無いカード用の予備）。
export function normalizeCardName(name) {
  return String(name || '')
    .replace(/[・\s　]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

// 同名判定のキー：系統の識別子があればそれ、無ければならした名前。
export function sameNameKey(card) {
  if (!card || card.isOriginal) return null;
  if (card.lineageId) return `L:${card.lineageId}`;
  if (card.name) return `N:${normalizeCardName(card.name)}`;
  return null;
}

// fieldCards: [{ playerId, cardId, name, number, isOriginal?, lineageId? }]
// options: { form, order: 'nameFirst'|'numberFirst', excludePlayerId?,
//            includeOwnPairs?: boolean （既定は false＝相手との間だけ） }
export function evaluateDoppelTrial(fieldCards, options = {}) {
  const form = options.form || 'normal';
  if (!DOPPEL_TRIAL_FORMS.includes(form)) throw new Error(`unknown doppel trial form: ${form}`);
  const order = options.order === 'numberFirst' ? 'numberFirst' : 'nameFirst';
  const includeOwnPairs = options.includeOwnPairs === true;
  const cards = (fieldCards || []).filter((c) => c && c.playerId !== options.excludePlayerId);

  const byNumber = new Map();
  const byName = new Map();
  for (const c of cards) {
    if (Number.isFinite(c.number)) {
      if (!byNumber.has(c.number)) byNumber.set(c.number, []);
      byNumber.get(c.number).push(c);
    }
    const key = sameNameKey(c);
    if (key) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(c);
    }
  }
  const numberHits = new Set();
  for (const group of byNumber.values()) {
    if (group.length >= 2) group.forEach((c) => numberHits.add(c));
  }
  const nameHits = new Set();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // 自分の同名同士だけの集まりは、仮置きの設定で含む／除くを選べる。
    if (!includeOwnPairs && new Set(group.map((c) => c.playerId)).size < 2) continue;
    group.forEach((c) => nameHits.add(c));
  }

  const returns = [];
  const destroys = [];
  const steps = [];
  const pushStep = (kind, c) => steps.push({ kind, playerId: c.playerId, cardId: c.cardId, name: c.name, number: c.number });

  if (form === 'normal') {
    for (const c of cards) if (numberHits.has(c)) { returns.push(c); pushStep('return', c); }
  } else if (form === 'super') {
    for (const c of cards) if (numberHits.has(c)) { destroys.push(c); pushStep('destroy', c); }
  } else {
    // unified：両方に当たったカードは、先に見る方で決まる。
    const firstKind = order === 'nameFirst' ? 'destroy' : 'return';
    for (const c of cards) {
      const inName = nameHits.has(c);
      const inNumber = numberHits.has(c);
      if (!inName && !inNumber) continue;
      let kind = null;
      if (inName && inNumber) kind = firstKind;
      else kind = inName ? 'destroy' : 'return';
      if (kind === 'destroy') { destroys.push(c); pushStep('destroy', c); }
      else { returns.push(c); pushStep('return', c); }
    }
    // 見せる順番：先に見る方の段を前に並べ替える（同じ段の中は場の順）。
    steps.sort((a, b) => {
      const ka = a.kind === firstKind ? 0 : 1;
      const kb = b.kind === firstKind ? 0 : 1;
      return ka - kb;
    });
  }

  const slim = (c) => ({ playerId: c.playerId, cardId: c.cardId, name: c.name, number: c.number });
  return {
    form,
    order: form === 'unified' ? order : null,
    triggered: returns.length + destroys.length > 0,
    returns: returns.map(slim),
    destroys: destroys.map(slim),
    steps: steps.map((s) => ({ ...s })),
    counts: {
      fieldCards: cards.length,
      numberGroups: [...byNumber.values()].filter((g) => g.length >= 2).length,
      nameGroups: [...byName.values()].filter((g) => g.length >= 2 && g.some((c) => nameHits.has(c))).length,
      returned: returns.length,
      destroyed: destroys.length,
    },
  };
}

// その巡の合計（プレイヤーごと）。戻った・消えたカードは場に残らないので数えない。
export function fieldTotalsAfter(fieldCards, result) {
  const gone = new Set([...result.returns, ...result.destroys].map((c) => `${c.playerId}:${c.cardId}`));
  const totals = {};
  for (const c of fieldCards || []) {
    if (gone.has(`${c.playerId}:${c.cardId}`)) continue;
    totals[c.playerId] = (totals[c.playerId] || 0) + (Number.isFinite(c.number) ? c.number : 0);
  }
  return totals;
}

export function winnerOf(totals) {
  let best = null;
  let bestValue = -Infinity;
  let tie = false;
  for (const [pid, v] of Object.entries(totals)) {
    if (v > bestValue) { best = pid; bestValue = v; tie = false; }
    else if (v === bestValue) tie = true;
  }
  return tie ? null : best;
}
