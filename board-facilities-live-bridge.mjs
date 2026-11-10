// 盤面の施設とエリアの核（board-facilities-core.mjs）を、本体（GAMEROAD.html）の対戦へつなぐ橋（2026-11-10）。
// 仕様その2の決め「マスの効果は移動フェーズ終了時」に合わせ、本体は各プレイヤーの移動が終わった直後に
// onLanding を呼び、巡の開始（initRoundRuntime）で onRoundStart を呼ぶ。
// 本体側の材料（ログ・カードの数値・カードの名前・通常トランプの配布・この端末の人の判定）は
// window.GAMEROAD_FACILITIES_HOOKS で受け取る。数字と方針は全部仮置き（provisional）で、遊びながら直す。
import {
  PROVISIONAL_TILE_ASSIGNMENT,
  effectiveTileId,
  resolveTileLanding,
  claimOrGrowArea,
  areaCardLevel,
  resolveOpponentAreaStop,
  applyTurnStartReturns,
} from './board-facilities-core.mjs';

// エリアの割り当て（仮置き）：中央3×3だけを使う。道とシールドは第1段ではエリアに入れない。
// 大きさの前提（2026-11-10 ライカの見立て）：1エリア2〜3マスが基本線で、1マスでも可。
// エリアが多い（小さい）方が4人戦で所有が分散して雪だるまになりにくく、ヘイトも分散する。
// 2マス割りと3マス割りの両方を用意し、実際の盤面で比べて選べる形にする。
// 切り替えは globalThis.GAMEROAD_FACILITIES_LAYOUT に 'two' か 'three' を入れる（既定は 'three'）。
export const AREA_DEFS = [
  { id: 'area-north', name: '北エリア', tiles: ['C:-1:-1', 'C:-1:0', 'C:-1:1'] },
  { id: 'area-middle', name: '中央エリア', tiles: ['C:0:-1', 'C:0:0', 'C:0:1'] },
  { id: 'area-south', name: '南エリア', tiles: ['C:1:-1', 'C:1:0', 'C:1:1'] },
];
export const AREA_DEFS_TWO = [
  { id: 'area-nw', name: '北西エリア', tiles: ['C:-1:-1', 'C:-1:0'] },
  { id: 'area-ne', name: '北東エリア', tiles: ['C:-1:1', 'C:0:1'] },
  { id: 'area-mid', name: '中央エリア', tiles: ['C:0:0', 'C:0:-1'] },
  { id: 'area-se', name: '南東エリア', tiles: ['C:1:0', 'C:1:1'] },
  { id: 'area-sw', name: '南西エリア', tiles: ['C:1:-1'] },
];
export const AREA_LAYOUTS = Object.freeze({ three: AREA_DEFS, two: AREA_DEFS_TWO });
export const AREA_BY_TILE = Object.freeze(
  Object.fromEntries(AREA_DEFS.flatMap((a) => a.tiles.map((t) => [t, a.id]))),
);
export const AREA_NAME = Object.freeze(Object.fromEntries(AREA_DEFS.map((a) => [a.id, a.name])));
export const FACILITY_START_POSITION = 'C:0:0';
export const AREA_INCOME_CAP = 5; // 仮：巡の開始のエリア収入の上限

export function areaDefsForLayout(layout) {
  return AREA_LAYOUTS[layout] || AREA_DEFS;
}
export function byTileForDefs(defs) {
  return Object.fromEntries(defs.flatMap((a) => a.tiles.map((t) => [t, a.id])));
}

export function createFacilityWorld(layout = globalThis.GAMEROAD_FACILITIES_LAYOUT || 'three') {
  const defs = areaDefsForLayout(layout);
  const byTile = byTileForDefs(defs);
  return {
    areas: {},
    areaLayout: AREA_LAYOUTS[layout] ? layout : 'three',
    areaDefs: defs,
    nodeArea: byTile,
    areaByTile: { ...byTile },
    shopStock: [],
    tileOwners: {},
    swapped: false,
    bank: {},
    honeyTileTakenRound: null,
    honeyTileGoneFromRound: null,
  };
}
function defsOf(world) {
  return world.areaDefs || AREA_DEFS;
}
function nameOf(world, areaId) {
  const d = defsOf(world).find((a) => a.id === areaId);
  return d ? d.name : areaId;
}
function areaIdOfNode(world, nodeId) {
  return (world.nodeArea || AREA_BY_TILE)[nodeId];
}

function hooks() {
  return globalThis.GAMEROAD_FACILITIES_HOOKS || {};
}
function hLog(t) {
  try { hooks().log?.(t); } catch (e) { /* ログで本体を止めない */ }
}
function hPower(id) {
  const f = hooks().cardPower;
  const v = typeof f === 'function' ? Number(f(id)) : NaN;
  return Number.isFinite(v) ? v : 0;
}
function hDrawTrump() {
  const f = hooks().drawTrump;
  const v = typeof f === 'function' ? f() : null;
  return v || 'SP_A';
}
function hLabel(id) {
  const f = hooks().cardLabel;
  return typeof f === 'function' ? String(f(id)) : String(id);
}
function hMatch() {
  const f = hooks().getMatch;
  return typeof f === 'function' ? f() : null;
}
function hIsLocalHuman(player) {
  const f = hooks().isLocalHuman;
  if (typeof f === 'function') return !!f(player);
  return !!player?.human;
}

export function ensureWorld(match) {
  if (!match) return null;
  if (!match.facilityWorld) match.facilityWorld = createFacilityWorld();
  const w = match.facilityWorld;
  if (!w.areas) w.areas = {};
  return w;
}
function ensureArea(world, areaId) {
  return world.areas[areaId] || (world.areas[areaId] = { ownerId: null, cards: [], placedRound: {} });
}
function buildCtx(match, player) {
  return {
    players: match.players,
    round: match.round ?? 1,
    rng: Math.random,
    cardPower: hPower,
    drawTrump: hDrawTrump,
    startPosition: FACILITY_START_POSITION,
    ranks: Object.fromEntries(match.players.map((p) => [p.id, p.rank ?? 1])),
    nodeId: player?.position,
    shopSellIds: [],
    shopBuyIds: [],
    bankDeposit: 3,
  };
}

// ボットの仮の方針：置く時は一番弱いカード。エリアは無主なら取り、自分のエリアは3枚まで育てる。
export function botPlaceCardId(player, area) {
  if (!(player.hand || []).length) return null;
  if (area.ownerId && area.ownerId === player.id && area.cards.length >= 3) return null;
  if (area.ownerId && area.ownerId !== player.id) return null;
  let best = null;
  let bestPower = Infinity;
  for (const id of player.hand) {
    const pw = hPower(id);
    if (pw < bestPower) { bestPower = pw; best = id; }
  }
  return best;
}

// ボットの仮の方針：払えるなら払う。勝てそうなら攻撃。だめならふっとばされる。
export function botOpponentChoice(player, area) {
  const due = area.cards.length;
  if (due === 0) return 'pay';
  if ((player.honey || 0) + (player.manaCurrent || 0) >= due) return 'pay';
  const defense = area.cards.reduce((a, id) => a + hPower(id), 0);
  const strongest = Math.max(0, ...(player.hand || []).map((id) => hPower(id)));
  if ((player.hand || []).length && strongest > defense) return 'attack';
  return 'flee';
}

// 人の選ぶ画面（この橋の中だけで完結する小さい物）。選ばれた値を Promise で返す。
function choicePanel({ title, lines = [], buttons }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(6,8,20,.45)';
    const box = document.createElement('div');
    box.style.cssText = 'background:#141a2e;color:#eef2ff;border:1px solid #3a4a7a;border-radius:12px;padding:16px;max-width:min(92vw,430px);box-shadow:0 12px 40px rgba(0,0,0,.5);font:14px/1.5 system-ui';
    const head = document.createElement('div');
    head.textContent = title;
    head.style.cssText = 'font-weight:700;margin-bottom:8px';
    box.appendChild(head);
    for (const line of lines) {
      const d = document.createElement('div');
      d.textContent = line;
      d.style.cssText = 'opacity:.85;margin-bottom:4px';
      box.appendChild(d);
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
    let done = false;
    const finish = (v) => { if (done) return; done = true; wrap.remove(); resolve(v); };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.value));
      row.appendChild(btn);
    }
    box.appendChild(row);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  });
}

async function humanPlaceCard(player, area, areaName) {
  const buttons = (player.hand || []).map((id) => ({ label: `${hLabel(id)}（${hPower(id)}）`, value: id }));
  buttons.push({ label: '置かない', value: null });
  return choicePanel({
    title: area.ownerId ? `${areaName}（自分のエリア）にカードを置く` : `${areaName}はまだ誰の物でもない。カードを置くとエリアごと取れる`,
    lines: [`今の置き札：${area.cards.length}枚。置いたカードは巡ごとに育ち、巡の開始にハニーが入る（仮）。`],
    buttons,
  });
}

async function humanOpponentChoice(player, owner, area, areaName) {
  const due = area.cards.length;
  const defense = area.cards.reduce((a, id) => a + hPower(id), 0);
  const strongest = Math.max(0, ...(player.hand || []).map((id) => hPower(id)));
  return choicePanel({
    title: `${owner.name}の${areaName}に止まった`,
    lines: [
      `置いてあるカード：${due}枚（防御の合計 ${defense}）`,
      `攻撃する：自分の最強のカード（${strongest}）が防御を超えれば奪える。失敗するとスタート地点へ。`,
      `支払う：置いてある枚数ぶん（${due}）をハニーとマナで払う。`,
      'ふっとばされる：スタート地点へ戻る。',
    ],
    buttons: [
      { label: '攻撃する', value: 'attack' },
      { label: `支払う（${due}）`, value: 'pay' },
      { label: 'ふっとばされる', value: 'flee' },
    ],
  });
}

// 置き場の決め（2026-11-10）：エリアと施設は当面、カスタマイズルール（ルームマッチ専用）の中の物。
// ランクマッチ側には入れない。なので動くのはフレンド部屋の対戦だけ。
// 手元の対戦で試す時は、ページの合図（?facilities=test）か GAMEROAD_FACILITIES_LOCAL_TEST=true の時だけ。
export function facilitiesEnabled(match) {
  if (!match) return false;
  if (match.friendRoom) return true;
  if (globalThis.GAMEROAD_FACILITIES_LOCAL_TEST === true) return true;
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('facilities') === 'test') return true;
  } catch (e) { /* 場所の合図が読めない環境では無効のまま */ }
  return false;
}

// 移動が終わった直後の着地の解決。本体は移動したプレイヤーごとに呼ぶ。
export async function onLanding(match, player) {
  if (!facilitiesEnabled(match)) return;
  const world = ensureWorld(match);
  if (!world || !player) return;
  try {
    await onLandingInner(match, player, world);
  } finally {
    // 公開の置き場から手札へ戻った分（祠など）を、公開手札の記録へ取り込む。
    try { globalThis.GAMEROAD_PUBLIC_HAND?.drainWorldReturns?.(world); } catch { /* 公開記録で本体を止めない */ }
  }
}

async function onLandingInner(match, player, world) {
  const nodeId = player.position;
  const ctx = buildCtx(match, player);

  const rawType = PROVISIONAL_TILE_ASSIGNMENT[nodeId];
  if (rawType) {
    const type = effectiveTileId(rawType, world);
    if (type === 'shop') {
      hLog(`${player.name}：ショップマスに立ち寄った（売買の画面は次の段）。`);
    } else if (type !== 'area') {
      // 核の demandMana は「マスの種類→そのマスのエリア」で引く形なので、今いるマスの分だけ渡して戻す。
      const areaId = areaIdOfNode(world, nodeId);
      const saved = world.areaByTile;
      world.areaByTile = areaId ? { [type]: ensureArea(world, areaId) } : {};
      try {
        const r = resolveTileLanding(type, player, world, ctx);
        (r.events || []).forEach(hLog);
      } catch (e) {
        hLog(`マスの効果で止まった：${e?.message || e}`);
      } finally {
        world.areaByTile = saved;
      }
    }
  }

  const areaId = areaIdOfNode(world, nodeId);
  if (!areaId) return;
  const area = ensureArea(world, areaId);
  const areaName = nameOf(world, areaId);

  if (area.ownerId && area.ownerId !== player.id) {
    const owner = match.players.find((p) => p.id === area.ownerId);
    if (!owner) return;
    const choice = hIsLocalHuman(player)
      ? await humanOpponentChoice(player, owner, area, areaName)
      : botOpponentChoice(player, area);
    if (hMatch() !== match) return;
    try {
      const r = resolveOpponentAreaStop(player, owner, area, choice, ctx);
      (r.events || []).forEach(hLog);
    } catch (e) {
      hLog(`エリアの3択で止まった：${e?.message || e}`);
    }
    return;
  }

  if ((player.hand || []).length) {
    const cardId = hIsLocalHuman(player)
      ? await humanPlaceCard(player, area, areaName)
      : botPlaceCardId(player, area);
    if (cardId && hMatch() === match) {
      try {
        const r = claimOrGrowArea(player, world, areaId, cardId, ctx);
        (r.events || []).forEach(hLog);
      } catch (e) {
        hLog(`エリアへの配置で止まった：${e?.message || e}`);
      }
    }
  }
}

// 巡の開始：闘技場で預けたカードの返却と、エリアの育ちの実り（仮）と、エリアの状態の1行。
export function onRoundStart(match) {
  if (!facilitiesEnabled(match)) return;
  const world = ensureWorld(match);
  if (!world) return;
  const round = match.round ?? 1;
  for (const p of match.players) {
    try {
      const back = applyTurnStartReturns(p);
      if (back && back.length) hLog(`${p.name}：闘技場に預けたカード${back.length}枚が帰ってきた。`);
    } catch (e) { /* 返却で本体を止めない */ }
  }
  for (const p of match.players) {
    let total = 0;
    for (const area of Object.values(world.areas)) {
      if (area.ownerId !== p.id) continue;
      for (const id of area.cards) total += areaCardLevel(area, id, round);
    }
    if (total > 0) {
      const gain = Math.min(AREA_INCOME_CAP, total);
      p.honey = (p.honey || 0) + gain;
      hLog(`${p.name}：エリアの働き手からハニー${gain}（育ちの合計${total}、仮の実り）。`);
    }
  }
  const owned = defsOf(world).filter((a) => world.areas[a.id]?.ownerId);
  if (owned.length) {
    hLog('エリア：' + owned.map((a) => {
      const ar = world.areas[a.id];
      const o = match.players.find((p) => p.id === ar.ownerId);
      return `${a.name}＝${o ? o.name : '？'}（${ar.cards.length}枚）`;
    }).join('、'));
  }
}

if (typeof window !== 'undefined') {
  window.GAMEROAD_FACILITIES = Object.freeze({
    onLanding,
    onRoundStart,
    createWorld: createFacilityWorld,
    facilitiesEnabled,
    AREA_BY_TILE,
    AREA_DEFS,
    AREA_LAYOUTS,
  });
}
