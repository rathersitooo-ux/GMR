// 7枚以上の先の扱いの計測（2026-11-10）。
// 今の対戦の流れのうち、列の伸び方に関わる部分だけを決まった乱数で再現する：
// - 毎巡、4人のうち1人が勝つ。勝った人の列（L/C/Rのどれか1列）へ、
//   その人の出した札1枚＋その人のチップ全部が流れる（写しの実物の形）。
// - 負けた人の出した札は、その人自身のチップに積まれる。
// カードの強さ比べ・効果は含まない（列の伸びと、その先の判定だけを見る）。
// 使い方：node browser/over-seven-trial-measure.mjs

import {
  OVER_SEVEN_FORMS,
  applyLaneGain,
  gateOpenByMaxLane,
  gateOpenByTotal,
  goalArrivalPossible,
  invisibleCardCount,
} from './over-seven-trial-core.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANES = ['L', 'C', 'R'];
const MAX_ROUNDS = 60;

function runMatch(form, seed) {
  const rng = mulberry32(seed);
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `P${i + 1}`,
    lanes: { L: [], C: [], R: [] },
    chip: [],
    serial: 0,
  }));
  const nextCard = (p) => `${p.id}-${++p.serial}`;
  let gateRoundByMax = null;
  let gateRoundByTotal = null;
  let arrivalEverPossible = false;
  let destroyedTotal = 0;
  let destroyedAtGate = null;
  let chipAtGate = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const winner = players[Math.floor(rng() * players.length)];
    const laneKey = LANES[Math.floor(rng() * LANES.length)];
    // 負けた人の札は、その人のチップへ。
    for (const p of players) {
      if (p !== winner) p.chip.push(nextCard(p));
    }
    // 勝った人の列へ：出した札1枚＋チップ全部。
    const gained = [nextCard(winner), ...winner.chip];
    const result = applyLaneGain({ lane: winner.lanes[laneKey], gained, form });
    winner.lanes[laneKey] = [...result.lane];
    destroyedTotal += result.destroyed.length;
    // 上限形で置かれなかった分はチップに戻る。消滅形の分は消える。
    winner.chip = [...result.heldBack];

    const allLengths = players.flatMap((p) => LANES.map((k) => p.lanes[k].length));
    if (gateRoundByMax === null && players.some((p) => gateOpenByMaxLane(LANES.map((k) => p.lanes[k].length)))) {
      gateRoundByMax = round;
      destroyedAtGate = destroyedTotal;
      chipAtGate = players.reduce((sum, p) => sum + p.chip.length, 0);
    }
    if (gateRoundByTotal === null && players.some((p) => gateOpenByTotal(LANES.map((k) => p.lanes[k].length)))) {
      gateRoundByTotal = round;
    }
    if (!arrivalEverPossible
      && players.some((p) => LANES.some((k) => goalArrivalPossible(p.lanes[k].length)))) {
      arrivalEverPossible = true;
    }
    void allLengths;
  }

  const endLengths = players.flatMap((p) => LANES.map((k) => p.lanes[k].length));
  return {
    gateRoundByMax,
    gateRoundByTotal,
    destroyedAtGate,
    chipAtGate,
    arrivalEverPossible,
    arrivalPossibleAtEnd: players.some((p) => LANES.some((k) => goalArrivalPossible(p.lanes[k].length))),
    maxLaneAtEnd: Math.max(...endLengths),
    invisibleAtEnd: invisibleCardCount(endLengths),
    destroyedTotal,
    chipAtEnd: players.reduce((sum, p) => sum + p.chip.length, 0),
  };
}

function summarize(form, matches = 1000) {
  const rows = [];
  for (let i = 0; i < matches; i++) rows.push(runMatch(form, 10000 + i));
  const avg = (values) => {
    const present = values.filter((v) => v !== null && v !== undefined);
    return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
  };
  const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    form,
    matches,
    gateOpenedByMax: rows.filter((r) => r.gateRoundByMax !== null).length,
    avgGateRoundByMax: round1(avg(rows.map((r) => r.gateRoundByMax))),
    avgGateRoundByTotal: round1(avg(rows.map((r) => r.gateRoundByTotal))),
    arrivalEverPossible: rows.filter((r) => r.arrivalEverPossible).length,
    arrivalPossibleAtEnd: rows.filter((r) => r.arrivalPossibleAtEnd).length,
    avgMaxLaneAtEnd: round1(avg(rows.map((r) => r.maxLaneAtEnd))),
    avgInvisibleAtEnd: round1(avg(rows.map((r) => r.invisibleAtEnd))),
    avgDestroyedTotal: round1(avg(rows.map((r) => r.destroyedTotal))),
    avgChipAtEnd: round1(avg(rows.map((r) => r.chipAtEnd))),
    avgDestroyedAtGate: round1(avg(rows.map((r) => r.destroyedAtGate))),
    avgChipAtGate: round1(avg(rows.map((r) => r.chipAtGate))),
  };
}

const results = Object.values(OVER_SEVEN_FORMS).map((form) => summarize(form));
console.log(JSON.stringify(results, null, 2));
