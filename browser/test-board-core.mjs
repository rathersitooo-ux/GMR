// テスト盤面の核（いちから作り直した盤面の唯一の出どころ）。
// マップデータはカルドセプト サーガ（Xbox 360）「サンタナ村」の実マップを、
// GameFAQs のガイド（Oni_Chikara）の配置図から写したもの。
// 配置図の記号：C=城 / Frt=砦 / F=火 / Wt=水 / E=地 / W=風。
// マスの種類・数・道順は配置図どおり。置き場所はライカの指定（2026-11-11）で格子状。
//
// 移動の土台は「位置関係」（2026-11-11、ライカの指摘）：
// 盤面データが持つのは各マスの位置（x, y）だけで、接続は位置から導く。
// 各マスについて「北・南・西・東にどのマスがつながっているか」が位置関係で、
// 道順も移動も全部この位置関係の上で成立する。位置がずれれば接続が切れて移動も壊れる。

export const TEST_MAP_SOURCE = 'Culdcept Saga (Xbox 360) "Santana Village" - GameFAQs Guide by Oni_Chikara の配置図を転写し、格子状に配置';

// 道順のまま並べたマス（城→火4→地4→砦→風4→水4→城へ戻る、18マス1周）。
// 置き場所は6×5の格子の外周で、隣り合うマスは全部、縦か横に隣接する。
const RAW = [
  // [x, y, 種別, 属性]
  [2, 0, 'castle', null],
  [1, 0, 'land', 'fire'],
  [0, 0, 'land', 'fire'],
  [0, 1, 'land', 'fire'],
  [0, 2, 'land', 'fire'],
  [0, 3, 'land', 'earth'],
  [0, 4, 'land', 'earth'],
  [1, 4, 'land', 'earth'],
  [2, 4, 'land', 'earth'],
  [3, 4, 'fort', null],
  [4, 4, 'land', 'wind'],
  [5, 4, 'land', 'wind'],
  [5, 3, 'land', 'wind'],
  [5, 2, 'land', 'wind'],
  [5, 1, 'land', 'water'],
  [5, 0, 'land', 'water'],
  [4, 0, 'land', 'water'],
  [3, 0, 'land', 'water'],
];

export const TEST_MAP = Object.freeze({
  id: 'santana-village',
  name: 'サンタナ村',
  origin: 'カルドセプト サーガ',
  winTG: 5000,
  gridWidth: 6,
  gridHeight: 5,
  startId: 'N0',
  startDirection: 'W', // 城からは火の列の方へ進む
  nodes: Object.freeze(RAW.map(([x, y, type, element], i) => Object.freeze({
    id: 'N' + i, x, y, type, element,
  }))),
});

// 位置関係：各マスについて、東西南北につながるマスを位置（x, y）から導く。
// ここが移動の正本。座標がずれれば、ここで接続が切れる。
const DIRS = Object.freeze({ N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] });

export function buildConnections(map) {
  const byPos = new Map(map.nodes.map((n) => [n.x + ',' + n.y, n.id]));
  const out = {};
  for (const n of map.nodes) {
    const c = {};
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const id = byPos.get((n.x + dx) + ',' + (n.y + dy));
      if (id) c[d] = id;
    }
    out[n.id] = Object.freeze(c);
  }
  return Object.freeze(out);
}

export const CONNECTIONS = buildConnections(TEST_MAP);

// 道順を位置関係から導く：城から開始の向きへ出て、来たマスではない方の接続をたどり続ける。
// 位置関係が切れていれば一周できず、短いまま返る（検査で落ちる）。
export function walkRoute(map, connections) {
  const order = [map.startId];
  let from = map.startId;
  let at = connections[map.startId]?.[map.startDirection] || null;
  while (at && at !== map.startId && order.length <= map.nodes.length) {
    order.push(at);
    const nexts = Object.values(connections[at] || {}).filter((id) => id !== from);
    from = at;
    at = nexts.length === 1 ? nexts[0] : null;
  }
  return Object.freeze(order);
}

export const ROUTE = walkRoute(TEST_MAP, CONNECTIONS);

export function nodeById(map, id) {
  return map.nodes.find((n) => n.id === id) || null;
}

export function routeIndex(id) {
  return ROUTE.indexOf(id);
}

// 今のマスから steps 進んだ先のマス（位置関係から導いた道順の上を進む）
export function advance(map, id, steps) {
  const i = routeIndex(id);
  if (i < 0) return null;
  const n = ROUTE.length;
  return ROUTE[(((i + steps) % n) + n) % n];
}

// 進路の途中にあるマス全部（出発点を含まない）
export function pathBetween(map, id, steps) {
  const out = [];
  let cur = id;
  for (let s = 0; s < steps; s++) {
    cur = advance(map, cur, 1);
    out.push(cur);
  }
  return out;
}

export const ELEMENT_LABEL = Object.freeze({
  fire: '火', water: '水', earth: '地', wind: '風',
});
