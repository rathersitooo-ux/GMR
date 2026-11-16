import assert from 'node:assert/strict';
import { TEST_MAP, CONNECTIONS, ROUTE, advance, pathBetween, nodeById } from '../browser/test-board-core.mjs';

// 出どころの配置図どおりか：18マス、属性は各4、城と砦は1つずつ
assert.equal(TEST_MAP.nodes.length, 18);
// 位置関係：全マスがちょうど2つの接続を持ち、接続は位置から導かれて互いに向き合う
for (const n of TEST_MAP.nodes) {
  const c = CONNECTIONS[n.id];
  assert.equal(Object.keys(c).length, 2, n.id + ' connections');
  for (const [d, to] of Object.entries(c)) {
    const back = { N: 'S', S: 'N', W: 'E', E: 'W' }[d];
    assert.equal(CONNECTIONS[to][back], n.id, n.id + '->' + to);
  }
}
// 道順は位置関係から導かれ、全マスを1回ずつ通って城へ戻る
assert.equal(ROUTE.length, 18);
assert.deepEqual([...ROUTE].sort(), TEST_MAP.nodes.map((n) => n.id).sort());
assert.deepEqual(ROUTE.map((id) => nodeById(TEST_MAP, id).type === 'land' ? nodeById(TEST_MAP, id).element : nodeById(TEST_MAP, id).type),
  ['castle', 'fire', 'fire', 'fire', 'fire', 'earth', 'earth', 'earth', 'earth', 'fort', 'wind', 'wind', 'wind', 'wind', 'water', 'water', 'water', 'water']);
const count = (fn) => TEST_MAP.nodes.filter(fn).length;
assert.equal(count((n) => n.type === 'castle'), 1);
assert.equal(count((n) => n.type === 'fort'), 1);
for (const el of ['fire', 'water', 'earth', 'wind']) {
  assert.equal(count((n) => n.element === el), 4, el);
}
// 座標の重なりなし
const keys = new Set(TEST_MAP.nodes.map((n) => n.x + ',' + n.y));
assert.equal(keys.size, 18);
// 進み方：城→火→…→砦→風→…→城へ戻る
assert.equal(advance(TEST_MAP, 'N0', 1), 'N1');
assert.equal(nodeById(TEST_MAP, advance(TEST_MAP, 'N0', 9)).type, 'fort');
assert.equal(advance(TEST_MAP, 'N0', 18), 'N0');
assert.equal(pathBetween(TEST_MAP, 'N0', 3).length, 3);
assert.deepEqual(pathBetween(TEST_MAP, 'N8', 2), ['N9', 'N10']);
assert.equal(pathBetween(TEST_MAP, 'N17', 1)[0], 'N0');
// 格子状の決め：道順で隣り合うマスは全部、縦か横にだけ隣接する（斜めの進みは無い）
for (let i = 0; i < ROUTE.length; i++) {
  const a = nodeById(TEST_MAP, ROUTE[i]);
  const b = nodeById(TEST_MAP, ROUTE[(i + 1) % ROUTE.length]);
  const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  assert.equal(d, 1, a.id + '->' + b.id);
}

console.log('test-board-core: all assertions passed');
