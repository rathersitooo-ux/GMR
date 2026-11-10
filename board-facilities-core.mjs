// 盤面のマスと施設の仮置き実装（2026-11-10 ライカの指示「店とか施設もとりあえず仮置きでいいから全部実装しよう」）
// 土台は仕様その2（盤面・マス・アイテム）。マスの効果は全部「移動フェーズ終了時」に発動する（仕様その2の決め）。
// 数値・品揃え・報酬は正本でも未定の物が多いので、仮の数字には provisional の印を付け、遊びながら直していく。
// GAMEROAD.html へのつなぎは別段（この核は状態の計算だけを持つ）。

export const TILE_TIMING = 'move_end'; // 仕様その2：マス目の効果の発動は全て移動フェーズ終了時

// マスと施設の一覧（仕様その2の「マスの種類」全部＋エリアの施設）
export const TILE_TYPES = [
  { id: 'item', name: 'アイテムマス', provisional: false },
  { id: 'jackpot', name: 'ジャックポットマス', provisional: true },
  { id: 'arena', name: '闘技場マス', provisional: true },
  { id: 'ride', name: 'ライドマス', provisional: true },
  { id: 'card', name: 'カードマス', provisional: true },
  { id: 'handicap', name: 'ハンデスマス', provisional: true },
  { id: 'switch', name: 'スイッチマス', provisional: false },
  { id: 'draw', name: 'ドローマス', provisional: false },
  { id: 'shop', name: 'ショップマス', provisional: true },
  { id: 'honey', name: 'ハニーマス', provisional: true },
  { id: 'heal', name: '回復マス', provisional: false },
  { id: 'event', name: 'イベントマス', provisional: true },
  { id: 'area', name: 'エリア', provisional: true },
  // 他のゲームから借りて仮置きしたマス（2026-11-10 ライカ「他のカードゲームからもマスとか適当に実装したいならして」）
  { id: 'chance', name: 'チャンスマス', from: 'モノポリー', provisional: true },
  { id: 'tax', name: 'マイナスマス', from: '桃太郎電鉄のマイナス駅／モノポリーの所得税', provisional: true },
  { id: 'salary', name: '給料マス', from: '人生ゲームの給料日／モノポリーのGO', provisional: true },
  { id: 'bank', name: '銀行マス', from: 'いただきストリート', provisional: true },
  { id: 'weaponshop', name: '武器屋', from: 'ドカポン', provisional: true },
  { id: 'shrine', name: '祠マス', from: 'カルドセプトの祠／ドカポンの教会', provisional: true },
  { id: 'territory', name: '領地マス', from: 'カルドセプト', provisional: true },
];

// アイテムマスとライドマスで出る物の仮の池（仕様その2の例：ライドグリフォン、アイシクルランス等）
// サイコロ4種はカードとして実装済みの物と対応付ける想定で、対応付けはつなぎの段でやる。
export const ITEM_POOL = [
  'ITEM_DICE_DOUBLE', 'ITEM_DICE_TRIPLE', 'ITEM_DICE_456', 'ITEM_DICE_10',
  'RIDE_GRIFFON', 'WEAPON_ICICLE_LANCE', 'WEAPON_SWORD', 'FAMILIAR_BAT', 'ITEM_WARP',
];

// ライド・武器・使い魔は同じ「付与」枠で、重ねがけ不可・一番新しい物に書き換わる（仕様その2）
// 使い魔がライドを書き換えた場合、消えたライドは復活しない（破棄される）。
export function applyRideLike(player, kind, cardId, bonus) {
  const prev = player.rideLike || null;
  player.rideLike = { kind, cardId, bonus, appliedRound: player.round ?? null };
  return { replaced: prev };
}

// 仮置きの配置：中央のマスの一部に施設を置く（配置の正式な決めはまだ。109マスの正本対応もまだ）
export const PROVISIONAL_TILE_ASSIGNMENT = {
  'C:1:0': 'shop',
  'C:-1:0': 'arena',
  'C:0:1': 'heal',
  'C:0:-1': 'honey',
  'C:1:1': 'item',
  'C:-1:-1': 'draw',
  'C:1:-1': 'card',
  'C:-1:1': 'event',
  // 他のゲームのマスの仮置きは、道の途中と角のマスへ（中央が埋まった分の広げ方）
  'R:P1:L:4': 'chance',
  'R:P2:L:4': 'tax',
  'R:P3:L:4': 'salary',
  'R:P4:L:4': 'bank',
  'R:P1:C:4': 'territory',
  'R:P3:C:4': 'territory',
  'K:NW': 'weaponshop',
  'K:SE': 'shrine',
};

function pick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function rankOf(ctx, player) {
  return ctx?.ranks?.[player.id] ?? 1;
}

// エリア所有者がいるマスではマナを要求される（アイテムマス・カードマス・ドローマス。回復マスは無し）
// 仮の要求量は1。払えない時は効果なし（徴収そのものは行われない、というショップの決めとは別に、ここは仮置き）。
function demandMana(player, world, tileId, ctx, events) {
  const area = world.areaByTile?.[tileId];
  if (!area || !area.ownerId || area.ownerId === player.id) return true;
  if (tileId === 'heal') return true;
  if ((player.manaCurrent ?? 0) >= 1) {
    player.manaCurrent -= 1;
    const owner = ctx.players.find((p) => p.id === area.ownerId);
    if (owner) owner.manaCurrent = (owner.manaCurrent ?? 0) + 1;
    events.push(`${player.name}：エリア所有者へマナ1を支払った。`);
    return true;
  }
  events.push(`${player.name}：マナが足りず、マスの効果はなかった。`);
  return false;
}

// 闘技場の仮の相手：山札の一番上ではなく、仮に「力9の相手カード」と比べる（相手の決めは未定のため仮置き）
export const ARENA_PROVISIONAL_OPPONENT_POWER = 9;
export const ARENA_PROVISIONAL_STAKE_HONEY = 1;
export const ARENA_PROVISIONAL_REWARD_HONEY = 3;

export function resolveTileLanding(tileId, player, world, ctx) {
  const events = [];
  const rng = ctx.rng || Math.random;
  world.shopStock = world.shopStock || [];
  world.areas = world.areas || {};
  world.areaByTile = world.areaByTile || {};

  switch (tileId) {
    case 'item': {
      if (!demandMana(player, world, tileId, ctx, events)) break;
      const got = pick(rng, ITEM_POOL);
      player.items = player.items || [];
      player.items.push(got);
      events.push(`${player.name}：アイテムマスで ${got} を貰った。`);
      break;
    }
    case 'jackpot': {
      // 仮：ハニー5（たまり場の仕組みは未定のため固定の仮数字）
      player.honey = (player.honey || 0) + 5;
      events.push(`${player.name}：ジャックポットマスでハニー5を貰った（仮）。`);
      break;
    }
    case 'arena': {
      // 仕様その2：カードとハニーを預けてバトル。勝つと報酬＋カードは次のターンの開始時に帰る。負けるとカードは墓地へ。
      const stake = (player.hand || [])[0];
      if (!stake || (player.honey || 0) < ARENA_PROVISIONAL_STAKE_HONEY) {
        events.push(`${player.name}：闘技場に入る材料（カードとハニー）が足りなかった。`);
        break;
      }
      player.hand.splice(player.hand.indexOf(stake), 1);
      player.honey -= ARENA_PROVISIONAL_STAKE_HONEY;
      const myPower = ctx.cardPower ? ctx.cardPower(stake) : 0;
      if (myPower > ARENA_PROVISIONAL_OPPONENT_POWER) {
        player.honey += ARENA_PROVISIONAL_REWARD_HONEY;
        player.pendingReturns = player.pendingReturns || [];
        player.pendingReturns.push(stake);
        events.push(`${player.name}：闘技場で勝ち、報酬ハニー${ARENA_PROVISIONAL_REWARD_HONEY}。預けたカードは次のターンの開始時に帰ってくる。`);
      } else {
        player.discard = player.discard || [];
        player.discard.push(stake);
        events.push(`${player.name}：闘技場で負け、預けたカードは墓地に送られた。`);
      }
      break;
    }
    case 'ride': {
      const r = applyRideLike(player, 'ride', 'RIDE_GRIFFON', { moveBonus: 2 });
      events.push(`${player.name}：ライドマスでライドが付与された（移動+2、仮）。${r.replaced ? '前の付与は書き換えられた。' : ''}`);
      break;
    }
    case 'card': {
      if (!demandMana(player, world, tileId, ctx, events)) break;
      // 仕様その2：順位枚数ルーレットを押して、押した分だけ普通のトランプが貰える。
      // 置き場はアイテム枠（じゃんけん枠）。埋まっていたら手札へ。仮：枠の広さは3。
      const n = rankOf(ctx, player);
      player.itemSlots = player.itemSlots || [];
      for (let i = 0; i < n; i++) {
        const id = ctx.drawTrump ? ctx.drawTrump() : 'SP_A';
        if (player.itemSlots.length < 3) player.itemSlots.push(id);
        else player.hand.push(id);
      }
      events.push(`${player.name}：カードマスでトランプ${n}枚を貰った。`);
      break;
    }
    case 'handicap': {
      // 仕様その2：順位枚数ルーレットを押して、ハズレが出た分だけランダムで手札を捨てる。仮：ハズレ数は0〜順位。
      const miss = Math.floor(rng() * (rankOf(ctx, player) + 1));
      let discarded = 0;
      while (discarded < miss && (player.hand || []).length) {
        const ix = Math.floor(rng() * player.hand.length);
        const [gone] = player.hand.splice(ix, 1);
        player.discard = player.discard || [];
        player.discard.push(gone);
        discarded++;
      }
      events.push(`${player.name}：ハンデスマスでハズレ${miss}、手札を${discarded}枚捨てた。`);
      break;
    }
    case 'switch': {
      // 仕様その2：スイッチマス1はカードマスとハンデスマスが入れ替わる
      world.swapped = !world.swapped;
      events.push(`${player.name}：スイッチマス。カードマスとハンデスマスが入れ替わった。`);
      break;
    }
    case 'draw': {
      if (!demandMana(player, world, tileId, ctx, events)) break;
      // 仕様その2：順位分ドロー
      const n = rankOf(ctx, player);
      let drew = 0;
      while (drew < n && (player.deck || []).length) {
        player.hand.push(player.deck.shift());
        drew++;
      }
      events.push(`${player.name}：ドローマスで${drew}枚引いた。`);
      break;
    }
    case 'shop': {
      // 仕様その2：手持ちのアイテムや手札の要らないカードを、好きな枚数、1個1ハニーで売ることができる。
      // 売られた物はショップに並び、買うことができる。売る物も買う物も無かった場合はふっとばされる（スタート地点へ）。
      const sellIds = ctx.shopSellIds || [];
      const buyIds = ctx.shopBuyIds || [];
      let acted = false;
      for (const id of sellIds) {
        const hi = (player.hand || []).indexOf(id);
        const ii = (player.items || []).indexOf(id);
        if (hi >= 0) player.hand.splice(hi, 1);
        else if (ii >= 0) player.items.splice(ii, 1);
        else continue;
        world.shopStock.push(id);
        player.honey = (player.honey || 0) + 1;
        acted = true;
      }
      for (const id of buyIds) {
        const si = world.shopStock.indexOf(id);
        if (si < 0 || (player.honey || 0) < 1) continue;
        world.shopStock.splice(si, 1);
        player.honey -= 1;
        player.items = player.items || [];
        player.items.push(id);
        acted = true;
      }
      if (!acted) {
        player.position = ctx.startPosition ?? player.position;
        events.push(`${player.name}：ショップで売る物も買う物もなく、ふっとばされてスタート地点に戻された。`);
      } else {
        events.push(`${player.name}：ショップで売買した（売り${sellIds.length}・買い${buyIds.length}）。`);
      }
      break;
    }
    case 'honey': {
      // 仕様その2：先着1名。ターン数分のハニー＋順位数分ボーナス。取ったら次のターンから消える。
      if (world.honeyTileTakenRound != null && world.honeyTileTakenRound >= (ctx.round ?? 0)) {
        events.push(`${player.name}：ハニーマスはもう取られていた。`);
        break;
      }
      world.honeyTileTakenRound = ctx.round ?? 0;
      world.honeyTileGoneFromRound = (ctx.round ?? 0) + 1;
      const gain = (ctx.round ?? 1) + rankOf(ctx, player);
      player.honey = (player.honey || 0) + gain;
      events.push(`${player.name}：ハニーマスでハニー${gain}を貰った（先着）。`);
      break;
    }
    case 'heal': {
      // 仕様その2：マナ徴収無し、マナが全快する
      player.manaCurrent = player.manaMax ?? player.manaCurrent;
      events.push(`${player.name}：回復マスでマナが全快した。`);
      break;
    }
    case 'event': {
      // 仕様その2：内容は全てスロットで決まる（目押し不可）。仮のスロット4種。
      const slot = Math.floor(rng() * 4);
      if (slot === 0) { player.honey = (player.honey || 0) + 3; events.push(`${player.name}：イベントマス（スロット）：ハニー3。`); }
      else if (slot === 1 && (player.deck || []).length) { player.hand.push(player.deck.shift()); events.push(`${player.name}：イベントマス（スロット）：1枚引いた。`); }
      else if (slot === 2) { player.manaCurrent = player.manaMax ?? player.manaCurrent; events.push(`${player.name}：イベントマス（スロット）：マナ全快。`); }
      else events.push(`${player.name}：イベントマス（スロット）：何も起きなかった。`);
      break;
    }
    case 'chance': {
      // モノポリーのチャンス：引いたカードで良い事も悪い事も起きる。仮の4種。
      const slot = Math.floor(rng() * 4);
      if (slot === 0) { player.honey = (player.honey || 0) + 4; events.push(`${player.name}：チャンスマス：ハニー4を貰った（仮）。`); }
      else if (slot === 1) { const lost = Math.min(player.honey || 0, 2); player.honey -= lost; events.push(`${player.name}：チャンスマス：ハニー${lost}を失った（仮）。`); }
      else if (slot === 2 && (player.deck || []).length) { player.hand.push(player.deck.shift()); events.push(`${player.name}：チャンスマス：1枚引いた（仮）。`); }
      else events.push(`${player.name}：チャンスマス：もう3歩進む（仮。進む処理はつなぎの段）。`);
      break;
    }
    case 'tax': {
      // 桃鉄のマイナス駅／モノポリーの所得税：お金を失うマス。仮：ハニー2（0未満にはならない）。
      const lost = Math.min(player.honey || 0, 2);
      player.honey -= lost;
      events.push(`${player.name}：マイナスマスでハニー${lost}を失った（仮）。`);
      break;
    }
    case 'salary': {
      // 人生ゲームの給料日／モノポリーのGO：止まるとお金が入る。仮：ハニー4。
      player.honey = (player.honey || 0) + 4;
      events.push(`${player.name}：給料マスでハニー4を貰った（仮）。`);
      break;
    }
    case 'bank': {
      // いただきストリートの銀行：預けると増えて戻ってくる。仮：預けた分＋2割（端数は切り上げ）で戻る。
      world.bank = world.bank || {};
      const saved = world.bank[player.id] || 0;
      if (saved > 0) {
        const back = saved + Math.ceil(saved * 0.2);
        player.honey = (player.honey || 0) + back;
        world.bank[player.id] = 0;
        events.push(`${player.name}：銀行からハニー${back}を引き出した（預け${saved}＋増えた分、仮）。`);
      } else {
        const dep = Math.min(player.honey || 0, ctx.bankDeposit ?? 3);
        if (dep > 0) {
          player.honey -= dep;
          world.bank[player.id] = dep;
          events.push(`${player.name}：銀行にハニー${dep}を預けた（仮）。`);
        } else {
          events.push(`${player.name}：銀行に預けるハニーがなかった。`);
        }
      }
      break;
    }
    case 'weaponshop': {
      // ドカポンの武器屋：お金で武器カードを買う店。仮の値段はハニー3。
      if ((player.honey || 0) >= 3) {
        player.honey -= 3;
        player.items = player.items || [];
        player.items.push('WEAPON_SWORD');
        events.push(`${player.name}：武器屋で WEAPON_SWORD を買った（ハニー3、仮）。`);
      } else {
        events.push(`${player.name}：武器屋を見たが、ハニーが足りなかった（仮の値段3）。`);
      }
      break;
    }
    case 'shrine': {
      // カルドセプトの祠／ドカポンの教会の借り物。仮：墓地から1枚を手札へ戻す。
      // 墓地は公開の置き場なので、戻ったカードは公開のまま保つ（2026-11-10の原則）。
      // 記録は world.publicReturns に積み、接続側が公開手札の記録へ取り込む。
      if ((player.discard || []).length) {
        const back = player.discard.pop();
        player.hand.push(back);
        if (world) (world.publicReturns ||= []).push({ playerId: player.id, cardId: back });
        events.push(`${player.name}：祠マスで ${back} が墓地から手札へ戻った（仮）。`);
      } else {
        events.push(`${player.name}：祠マス。墓地にカードはなかった。`);
      }
      break;
    }
    case 'territory': {
      // カルドセプトの領地：空いていればお金で自分の土地にでき、他人の土地では通行料を払う。仮：取得2、通行料2。
      world.tileOwners = world.tileOwners || {};
      const nodeId = ctx.nodeId || 'unknown';
      const ownerId = world.tileOwners[nodeId];
      if (!ownerId) {
        if ((player.honey || 0) >= 2) {
          player.honey -= 2;
          world.tileOwners[nodeId] = player.id;
          events.push(`${player.name}：領地マスをハニー2で自分の土地にした（仮）。`);
        } else {
          events.push(`${player.name}：領地マス。取るためのハニーが足りなかった（仮の値段2）。`);
        }
      } else if (ownerId !== player.id) {
        const toll = Math.min(player.honey || 0, 2);
        player.honey -= toll;
        const owner = ctx.players.find((p) => p.id === ownerId);
        if (owner) owner.honey = (owner.honey || 0) + toll;
        events.push(`${player.name}：他人の領地で通行料ハニー${toll}を払った（仮）。`);
      } else {
        events.push(`${player.name}：自分の領地に止まった。`);
      }
      break;
    }
    case 'area': {
      events.push(...resolveAreaTile(player, world, ctx).events);
      break;
    }
    default:
      events.push(`${player.name}：まだ無いマス（${tileId}）。`);
  }
  return { events };
}

// スイッチで入れ替わった後の実効のマス
export function effectiveTileId(tileId, world) {
  if (!world?.swapped) return tileId;
  if (tileId === 'card') return 'handicap';
  if (tileId === 'handicap') return 'card';
  return tileId;
}

// ターン開始時：闘技場で預けたカードが帰ってくる（仕様その2）
export function applyTurnStartReturns(player) {
  const back = player.pendingReturns || [];
  if (back.length) {
    player.hand = player.hand || [];
    player.hand.push(...back);
    player.pendingReturns = [];
  }
  return back;
}

// エリア：1マス単位ではなくエリア制。最初にカードを置いた人がエリアごと取れる（仕様その2）。
// 置いたカードは派遣社員のように成長していく（仮：置いたラウンド数でレベルが上がる）。
export function claimOrGrowArea(player, world, areaId, cardId, ctx) {
  world.areas = world.areas || {};
  const area = world.areas[areaId] || (world.areas[areaId] = { ownerId: null, cards: [], placedRound: {} });
  const events = [];
  if (!area.ownerId) {
    area.ownerId = player.id;
    events.push(`${player.name}：エリア「${areaId}」を取った。`);
  }
  if (area.ownerId === player.id && cardId) {
    const hi = (player.hand || []).indexOf(cardId);
    if (hi >= 0) {
      player.hand.splice(hi, 1);
      area.cards.push(cardId);
      area.placedRound[cardId] = ctx.round ?? 0;
      events.push(`${player.name}：エリアに ${cardId} を置いた（働き手として成長していく）。`);
    }
  }
  return { events, area };
}

export function areaCardLevel(area, cardId, currentRound) {
  const placed = area?.placedRound?.[cardId];
  if (placed == null) return 0;
  return Math.max(0, (currentRound ?? 0) - placed);
}

function resolveAreaTile(player, world, ctx) {
  // エリアのマスに止まった時：自分のエリアなら成長の確認、相手のエリアなら「施設を使う／奪いに行く」の入口（実際の選択は下の関数）
  return { events: [`${player.name}：エリアのマスに止まった。`] };
}

// 相手のエリアに止まった場合の3つの選び方（仕様その2）
// ・攻撃する：自分のカードを出して、置いてあるカードを超えれば奪い取れる。超えなければスタート地点へ。
// ・支払う：置いてあるカードの枚数分ハニーを払う。不足分はマナをハニーにして払う。払った分は相手のハニーに足される。
// ・ふっとばされる：スタート地点に戻される。
export function resolveOpponentAreaStop(player, owner, area, choice, ctx) {
  const events = [];
  const startPosition = ctx.startPosition ?? player.position;
  if (choice === 'pay') {
    let due = area.cards.length;
    const fromHoney = Math.min(player.honey || 0, due);
    player.honey -= fromHoney;
    due -= fromHoney;
    if (due > 0) {
      const fromMana = Math.min(player.manaCurrent || 0, due);
      player.manaCurrent -= fromMana;
      due -= fromMana;
    }
    const paid = area.cards.length - due;
    owner.honey = (owner.honey || 0) + paid;
    events.push(`${player.name}：エリアの持ち主にハニー${paid}を支払った${due > 0 ? `（${due}分は払い切れなかった）` : ''}。`);
  } else if (choice === 'attack') {
    const myCard = (player.hand || [])[0];
    const myPower = myCard && ctx.cardPower ? ctx.cardPower(myCard) : 0;
    const defense = area.cards.reduce((a, id) => a + (ctx.cardPower ? ctx.cardPower(id) : 0), 0);
    if (myCard && myPower > defense) {
      player.hand.splice(player.hand.indexOf(myCard), 1);
      area.ownerId = player.id;
      events.push(`${player.name}：エリアを攻撃して奪い取った。`);
    } else {
      player.position = startPosition;
      events.push(`${player.name}：エリアの攻撃に失敗し、スタート地点に戻された。`);
    }
  } else {
    player.position = startPosition;
    events.push(`${player.name}：ふっとばされてスタート地点に戻された。`);
  }
  return { events };
}

// 貧乏神（ペットちゃん）：目的地に一番遠い人に付く（仕様その2）。迷惑の中身は仮置き（仮：付いた人のハニーが毎ターン1減る）。
export function binbougamiTarget(players) {
  let target = null;
  for (const p of players) {
    if (target == null || (p.distanceToGoal ?? 0) > (target.distanceToGoal ?? 0)) target = p;
  }
  return target;
}

export function applyBinbougamiMischief(player) {
  const events = [];
  if ((player.honey || 0) > 0) {
    player.honey -= 1;
    events.push(`${player.name}：貧乏神（ペットちゃん）の迷惑でハニー1を失った（仮）。`);
  }
  return { events };
}
