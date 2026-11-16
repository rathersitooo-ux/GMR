// サイキックリンク演出（v23仕様）を本体の対戦フローへつなぐ実行部。
// 土台は試作デモの v23（2026-11-11にライカが「スタートとして良い」と受理）：
// 3枚が寄って裏返り、合体カードの公開の後、最後の絵は「彼女」（パートナー）で、
// 彼女を約1.5秒＋微拡大で止め、舞台ごと480msで引いて盤面へ戻る。
// 彼女が出た後にカード側の見せ場（入れ替わり・飛行・着地・枠の光）は作らない。
// 不変条件：内部は3枚を保持したまま表示だけ1枚へ／演出中はカード要素を
// 作り直さない（裏返しの90度で同じ要素の中身だけ差し替える）／タップで
// 飛ばしても必ず合体状態へ到達する／動きを減らす設定では即合体。
//
// 止め絵の数値（2026-11-12の決め）：アニメーションの後の止め絵でパワー値を
// 出す。パワー値は内部も千倍の整数で持つ（素の値13.5なら13500）。
// 出どころはカード側の既存の数字（3枚の power の合計）。歩数・費用・枚数・
// 同数判定などの既存の計算は千倍にしない（このパワー値だけの話）。
//
// 接続の地点：対戦の解決で勝者のカードが列へ入った直後（lastBattleResolution）。
// 人間プレイヤーの盤面のカードが初めて3枚そろった所で発火する（試作の接続。
// 発火条件その物はギミックカード側の仕様が決まったら差し替える）。

// v23の時間割（ミリ秒）。試作デモの正本と同じ。
export const PSYCHIC_LINK_BATTLE_TIMELINE = [
  { atMs: 0, phase: 'charge' },
  { atMs: 240, phase: 'rise' },
  { atMs: 500, phase: 'converge' },
  { atMs: 910, phase: 'materialize' },
  { atMs: 1750, phase: 'flip' },
  { atMs: 1930, phase: 'flash' },
  { atMs: 2030, phase: 'reveal' },
  { atMs: 2580, phase: 'cutin' },
  { atMs: 3780, phase: 'pillar' },
  { atMs: 4110, phase: 'land' },
  { atMs: 4360, phase: 'settle' },
  { atMs: 4690, phase: 'linked' },
];

export const PSYCHIC_LINK_BATTLE_TOTAL_MS = 4690;

// パワー値：3枚のカードの既存の数字（power）の合計を素の値として、
// 千倍の整数で保持する。小数の素の値（13.5等）でも小数点は持たない。
export function derivePsychicLinkPowerValue(cards) {
  const base = (cards || []).reduce((sum, card) => sum + (Number(card?.power) || 0), 0);
  return Math.round(base * 1000);
}

// 盤面のカード（列の順に並んだ物）から、リンクの材料にする最初の3枚を取る。
export function pickLinkComponents(fieldCards) {
  if (!Array.isArray(fieldCards) || fieldCards.length < 3) return null;
  return fieldCards.slice(0, 3);
}

// 発火の判定：盤面に3枚そろい、この対戦でまだリンクしていないこと。
export function shouldStartPsychicLink({ fieldCount = 0, alreadyLinked = false, playing = false } = {}) {
  return fieldCount >= 3 && !alreadyLinked && !playing;
}

const SUIT_GLYPHS = { SP: '♠', HT: '♥', DI: '♦', CL: '♣' };
export function suitGlyphOf(card) {
  if (!card) return '◆';
  if (card.glyph) return String(card.glyph);
  return SUIT_GLYPHS[String(card.suit || '').toUpperCase()] || '◆';
}

// 軌跡と枠の色。3枚それぞれの色（試作デモの正本と同じ）。
const TRAIL_COLORS = ['#ff7847', '#ffd23e', '#57c7ff'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE_ID = 'psychic-link-battle-style';
const STYLE_TEXT = `
.psychic-link-battle-stage { position: fixed; inset: 0; z-index: 9500; cursor: pointer; overflow: hidden; background: rgba(2, 3, 10, 0.001); font-family: sans-serif; }
.psychic-link-battle-board { position: absolute; inset: 0; overflow: hidden; }
.psychic-link-battle-cards { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 10px; }
.psychic-link-battle-card { width: 150px; text-align: center; }
.psychic-link-battle-card.super { width: 190px; }
.psychic-link-battle-face {
  width: 100%; aspect-ratio: 5 / 7; border-radius: 8px; border: 2px solid #35507a; background: #101736;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #fff;
}
.psychic-link-battle-card.super .psychic-link-battle-face { border-color: #37d67a; box-shadow: 0 0 24px rgba(55, 214, 122, 0.8); }
.psychic-link-battle-face .glyph { font-size: 54px; line-height: 1; }
.psychic-link-battle-face .pow { font-size: 26px; font-weight: bold; }
.psychic-link-battle-card .name { font-size: 13px; margin-top: 6px; min-height: 2.4em; color: #fff; text-shadow: 0 1px 4px #000; }
.psychic-link-battle-card .spec { font-size: 12px; color: #bcd; }
.psychic-link-battle-card .spec b { color: #fff; }
.psychic-link-battle-board.fx-charging .psychic-link-battle-face {
  animation: psychic-link-battle-charge-glow 0.24s ease-in forwards;
}
@keyframes psychic-link-battle-charge-glow {
  from { box-shadow: 0 0 0 rgba(255, 190, 80, 0); border-color: #7a5a1e; }
  to { box-shadow: 0 0 18px rgba(255, 190, 80, 0.95), 0 0 42px rgba(255, 160, 60, 0.5); border-color: #ffd23e; }
}
.psychic-link-battle-fx { position: absolute; inset: 0; pointer-events: none; }
.psychic-link-battle-fx svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.psychic-link-battle-fx .fx-bolts { animation: psychic-link-battle-bolt-flicker 0.09s infinite alternate; filter: drop-shadow(0 0 5px rgba(255, 180, 70, 0.9)); }
@keyframes psychic-link-battle-bolt-flicker { from { opacity: 0.55; } to { opacity: 1; } }
.psychic-link-battle-fx-dim { position: absolute; inset: 0; background: rgba(3, 8, 24, 0.52); opacity: 0; transition: opacity 0.24s ease-in; }
.psychic-link-battle-fx-space {
  position: absolute; inset: 0; opacity: 0; z-index: 0;
  background:
    radial-gradient(circle at 50% 42%, rgba(88, 60, 190, 0.5) 0%, rgba(24, 16, 74, 0.88) 46%, rgba(4, 3, 18, 0.98) 78%),
    radial-gradient(circle at 18% 22%, rgba(70, 160, 255, 0.28) 0%, transparent 34%),
    radial-gradient(circle at 84% 70%, rgba(60, 255, 190, 0.16) 0%, transparent 36%),
    #05030f;
}
.psychic-link-battle-fx-vortex {
  position: absolute; border-radius: 50%; pointer-events: none; opacity: 0; z-index: 2;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(140, 200, 255, 0.55) 50deg, transparent 110deg, rgba(255, 210, 62, 0.45) 180deg, transparent 240deg, rgba(120, 255, 190, 0.5) 300deg, transparent 360deg);
  filter: blur(7px);
  animation: psychic-link-battle-vortex-spin 0.85s linear infinite;
}
@keyframes psychic-link-battle-vortex-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
.psychic-link-battle-fx .fx-circle-rot-a { transform-box: fill-box; transform-origin: center; animation: psychic-link-battle-spin-a 9s linear infinite; }
.psychic-link-battle-fx .fx-circle-rot-b { transform-box: fill-box; transform-origin: center; animation: psychic-link-battle-spin-b 13s linear infinite; }
@keyframes psychic-link-battle-spin-a { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes psychic-link-battle-spin-b { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
.psychic-link-battle-fx-minipillar {
  position: absolute; top: 0; height: 100%; opacity: 0; z-index: 1; transform-origin: center bottom;
  background: linear-gradient(90deg, transparent 0%, rgba(170, 210, 255, 0.28) 34%, rgba(255, 255, 255, 0.75) 50%, rgba(170, 210, 255, 0.28) 66%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 22%, #000 92%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 22%, #000 92%, transparent 100%);
}
.psychic-link-battle-fx-pillar {
  position: absolute; top: 0; height: 100%; opacity: 0; transform-origin: center center;
  background: linear-gradient(90deg, transparent 0%, rgba(190, 255, 220, 0.22) 28%, rgba(160, 200, 255, 0.42) 44%, #ffffff 50%, rgba(160, 200, 255, 0.42) 56%, rgba(190, 255, 220, 0.22) 72%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
}
.psychic-link-battle-fx-burst {
  position: absolute; border-radius: 50%; pointer-events: none; opacity: 0;
  background: radial-gradient(circle, #ffffff 0%, rgba(210, 240, 255, 0.85) 34%, rgba(140, 200, 255, 0.35) 62%, transparent 72%);
}
.psychic-link-battle-fx-flame {
  position: absolute; border-radius: 50%; pointer-events: none; opacity: 0;
  background: radial-gradient(circle, rgba(255, 246, 200, 0.98) 0%, rgba(255, 190, 60, 0.9) 30%, rgba(255, 110, 40, 0.75) 55%, rgba(220, 50, 20, 0.35) 75%, transparent 80%);
  filter: blur(2px);
}
.psychic-link-battle-fx-whiteout { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 7; pointer-events: none; }
.psychic-link-battle-fx-windcut {
  position: absolute; width: 46px; height: 9px; border-radius: 999px; pointer-events: none;
  background: linear-gradient(90deg, transparent 0%, rgba(190, 230, 255, 0.75) 38%, #ffffff 55%, rgba(160, 210, 255, 0.5) 78%, transparent 100%);
  opacity: 0;
}
.psychic-link-battle-fx-fragment {
  position: absolute; width: 6px; height: 6px; border-radius: 50%; pointer-events: none;
  background: #dff6ff; box-shadow: 0 0 8px #9fd0ff, 0 0 16px rgba(255, 255, 255, 0.7);
  opacity: 0;
}
.psychic-link-battle-fx-art {
  position: absolute; pointer-events: none; z-index: 5;
  display: flex; align-items: center; justify-content: center;
}
.psychic-link-battle-fx-art .glyph-big { font-size: 150px; line-height: 1; color: #fff; }
.psychic-link-battle-fullscreen {
  position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 50%, #0d2b18 0%, #04120a 55%, #000 100%);
  overflow: hidden;
}
.psychic-link-battle-fullscreen .rays {
  position: absolute; width: 160vmax; height: 160vmax; left: 50%; top: 50%;
  margin-left: -80vmax; margin-top: -80vmax; border-radius: 50%; pointer-events: none;
  background: repeating-conic-gradient(from 0deg, rgba(140, 255, 195, 0.13) 0deg 9deg, transparent 9deg 22deg);
  animation: psychic-link-battle-rays-spin 16s linear infinite;
}
@keyframes psychic-link-battle-rays-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.psychic-link-battle-fullscreen svg.reveal-bolts { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.psychic-link-battle-fullscreen .reveal-card { width: 300px; text-align: center; }
.psychic-link-battle-fullscreen .reveal-face {
  width: 100%; aspect-ratio: 5 / 7; border-radius: 10px; border: 3px solid #37d67a; background: #0c2416; color: #fff;
  box-shadow: 0 0 48px rgba(55, 214, 122, 0.9), 0 0 120px rgba(255, 255, 255, 0.35);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  animation: psychic-link-battle-reveal-zoom 0.6s ease-out forwards;
}
@keyframes psychic-link-battle-reveal-zoom { 0% { transform: scale(0.88); } 68% { transform: scale(1.1); } 100% { transform: scale(1.05); } }
.psychic-link-battle-fullscreen .reveal-face .glyphs { font-size: 44px; letter-spacing: 6px; }
.psychic-link-battle-fullscreen .reveal-face .pow { font-size: 34px; font-weight: bold; }
.psychic-link-battle-fullscreen .caption { position: absolute; bottom: 9vh; left: 5vw; right: 0; text-align: left; transform: rotate(-8deg); font-size: 26px; font-weight: bold; letter-spacing: 0.06em; color: #d9ffe6; text-shadow: 0 0 12px #37d67a; }
.psychic-link-battle-creature {
  position: absolute; inset: 0; z-index: 45; pointer-events: none; opacity: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.psychic-link-battle-creature .atmo { position: absolute; inset: 0; }
.psychic-link-battle-creature .being {
  position: relative; width: min(880px, 94vw); height: min(620px, 82vh);
  display: flex; align-items: center; justify-content: center;
}
.psychic-link-battle-creature .being img {
  max-width: 100%; max-height: 100%; object-fit: contain; display: block;
  animation: psychic-link-battle-being-breathe 1.5s ease-in-out infinite;
}
@keyframes psychic-link-battle-being-breathe {
  0%, 100% { transform: scale(1) translateY(0px); }
  50% { transform: scale(1.022) translateY(-7px); }
}
.psychic-link-battle-creature .streak {
  position: absolute; height: 3px; width: 130vw; left: -15vw; border-radius: 999px; opacity: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%);
}
.psychic-link-battle-creature .burstflash {
  position: absolute; left: 50%; top: 46%; width: 70vmin; height: 70vmin;
  margin-left: -35vmin; margin-top: -35vmin; border-radius: 50%; pointer-events: none; opacity: 0;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(190, 225, 255, 0.55) 42%, transparent 70%);
}
.psychic-link-battle-creature .banner {
  position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%);
  padding: 10px 46px 12px; text-align: center; pointer-events: none;
  background: linear-gradient(90deg, transparent 0%, rgba(4, 10, 30, 0.82) 18%, rgba(4, 10, 30, 0.82) 82%, transparent 100%);
}
.psychic-link-battle-creature .banner .name {
  font-size: clamp(26px, 4.6vw, 44px); font-weight: bold; letter-spacing: 0.14em; color: #eaf4ff;
  text-shadow: 0 0 14px rgba(140, 200, 255, 0.9), 0 2px 6px rgba(0, 0, 0, 0.8);
}
.psychic-link-battle-power {
  position: absolute; right: 6vw; bottom: 16%; text-align: right; pointer-events: none; opacity: 0;
  color: #fff;
}
.psychic-link-battle-power .label { font-size: clamp(15px, 2vw, 22px); font-weight: bold; letter-spacing: 0.3em; color: #ffe9a8; text-shadow: 0 0 10px rgba(255, 190, 60, 0.9), 0 2px 6px rgba(0, 0, 0, 0.85); }
.psychic-link-battle-power .value { font-size: clamp(44px, 7.5vw, 84px); font-weight: 900; line-height: 1.05; color: #fff; text-shadow: 0 0 18px rgba(255, 200, 70, 0.95), 0 0 44px rgba(255, 160, 40, 0.55), 0 3px 8px rgba(0, 0, 0, 0.9); }
.psychic-link-battle-still {
  position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; pointer-events: none;
  background: radial-gradient(circle at 50% 46%, rgba(255, 210, 62, 0.20) 0%, rgba(6, 10, 26, 0.88) 62%, rgba(2, 3, 10, 0.96) 100%);
}
.psychic-link-battle-still img { max-height: 82vh; max-width: 94vw; object-fit: contain; }
`;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

// 2点間をギザギザに結ぶ電撃線の点列を作る（試作デモと同じ作り方）。
function boltPoints(a, b, amp = 11, segments = 5) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [`${a.x.toFixed(1)},${a.y.toFixed(1)}`];
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const off = (Math.random() * 2 - 1) * amp * Math.sin(Math.PI * t);
    pts.push(`${(a.x + dx * t + nx * off).toFixed(1)},${(a.y + dy * t + ny * off).toFixed(1)}`);
  }
  pts.push(`${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  return pts.join(' ');
}

// 演出本体。play(components) で舞台を作って v23 の段取りを再生し、
// 合体状態へ到達したら解決する Promise を返す。
// components: [{ id, name, suit, glyph, power }]（3枚）。
export function createPsychicLinkPerformance({
  herImage,
  herLabel = '',
  stageTint = '#ffd23e',
  timers = null,
  reducedMotion = null,
  onLinked = null,
} = {}) {
  const clock = timers || {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };
  let state = { status: 'components', componentIds: [], powerValue: null };
  let stage = null;
  let board = null;
  let fx = null;
  let fullscreen = null;
  let timerIds = [];
  let rafId = null;
  let destroyed = false;
  let resolvePlay = null;
  let components = [];
  let powerValue = null;

  function later(fn, ms) {
    timerIds.push(clock.setTimeout(fn, ms));
  }

  function clearTimers() {
    timerIds.forEach((id) => clock.clearTimeout(id));
    timerIds = [];
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function boardCenter() {
    return { x: board.clientWidth / 2, y: board.clientHeight / 2 };
  }

  function cardNode(card) {
    const wrap = document.createElement('div');
    wrap.className = 'psychic-link-battle-card';
    wrap.dataset.cardId = card.id;
    const face = document.createElement('div');
    face.className = 'psychic-link-battle-face';
    const glyph = document.createElement('div');
    glyph.className = 'glyph';
    glyph.textContent = suitGlyphOf(card);
    const pow = document.createElement('div');
    pow.className = 'pow';
    pow.textContent = String(card.power ?? '');
    face.append(glyph, pow);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.name || '';
    const spec = document.createElement('div');
    spec.className = 'spec';
    const power = document.createElement('span');
    power.innerHTML = 'パワー <b></b>';
    power.querySelector('b').textContent = String(card.power ?? '');
    spec.append(power);
    wrap.append(face, name, spec);
    return wrap;
  }

  // 魔法陣（実動画の実測：地面で回る光の円陣）。外側と内側が逆向きに回る2層。
  function buildMagicCircle(c) {
    const root = svgEl('g', { opacity: 0, style: 'filter: drop-shadow(0 0 9px rgba(140, 200, 255, 0.8))' });
    const rotA = svgEl('g', { class: 'fx-circle-rot-a' });
    const rotB = svgEl('g', { class: 'fx-circle-rot-b' });
    const R = 188;
    rotA.append(
      svgEl('circle', { cx: c.x, cy: c.y, r: R, fill: 'none', stroke: '#9fd0ff', 'stroke-width': 3 }),
      svgEl('circle', { cx: c.x, cy: c.y, r: R - 15, fill: 'none', stroke: '#ffd23e', 'stroke-width': 2, 'stroke-dasharray': '7 11', opacity: 0.95 }),
    );
    for (let i = 0; i < 24; i += 1) {
      const a = (Math.PI * 2 * i) / 24;
      rotA.append(svgEl('line', {
        x1: c.x + Math.cos(a) * (R - 30), y1: c.y + Math.sin(a) * (R - 30),
        x2: c.x + Math.cos(a) * (R - 19), y2: c.y + Math.sin(a) * (R - 19),
        stroke: '#cfeeff', 'stroke-width': 2.4, opacity: 0.85,
      }));
    }
    const tri = (rot) => [0, 1, 2].map((k) => {
      const a = rot + (Math.PI * 2 * k) / 3;
      return `${(c.x + Math.cos(a) * 120).toFixed(1)},${(c.y + Math.sin(a) * 120).toFixed(1)}`;
    }).join(' ');
    rotB.append(
      svgEl('circle', { cx: c.x, cy: c.y, r: 120, fill: 'none', stroke: '#9fd0ff', 'stroke-width': 2.4 }),
      svgEl('polygon', { points: tri(-Math.PI / 2), fill: 'none', stroke: 'rgba(255, 255, 255, 0.65)', 'stroke-width': 1.8 }),
      svgEl('polygon', { points: tri(Math.PI / 2), fill: 'none', stroke: 'rgba(255, 210, 62, 0.55)', 'stroke-width': 1.8 }),
    );
    for (let k = 0; k < 3; k += 1) {
      const a = -Math.PI / 2 + (Math.PI * 2 * k) / 3;
      rotB.append(svgEl('circle', {
        cx: c.x + Math.cos(a) * 141, cy: c.y + Math.sin(a) * 141, r: 13,
        fill: 'none', stroke: TRAIL_COLORS[k], 'stroke-width': 2.6,
      }));
    }
    root.append(rotA, rotB);
    return root;
  }

  // 演出の土台を作る。3枚のカード要素はそのまま使い、位置だけ絶対配置へ移す
  // （要素を作り直さない、という不変条件のため）。
  function buildFx(cardEls) {
    const layer = document.createElement('div');
    layer.className = 'psychic-link-battle-fx';
    const dim = document.createElement('div');
    dim.className = 'psychic-link-battle-fx-dim';
    const space = document.createElement('div');
    space.className = 'psychic-link-battle-fx-space';
    const svgBack = svgEl('svg', { viewBox: `0 0 ${board.clientWidth} ${board.clientHeight}` });
    const cc = boardCenter();
    const circleRoot = buildMagicCircle({ x: cc.x, y: cc.y + 58 });
    const trailsG = svgEl('g', {});
    svgBack.append(circleRoot, trailsG);
    const pillar = document.createElement('div');
    pillar.className = 'psychic-link-battle-fx-pillar';
    const pillarL = document.createElement('div');
    pillarL.className = 'psychic-link-battle-fx-pillar';
    const pillarR = document.createElement('div');
    pillarR.className = 'psychic-link-battle-fx-pillar';
    const vortex = document.createElement('div');
    vortex.className = 'psychic-link-battle-fx-vortex';
    const c0 = boardCenter();
    vortex.style.width = '330px';
    vortex.style.height = '330px';
    vortex.style.left = `${c0.x}px`;
    vortex.style.top = `${c0.y}px`;
    const svgFront = svgEl('svg', { viewBox: `0 0 ${board.clientWidth} ${board.clientHeight}` });
    const boltsG = svgEl('g', { class: 'fx-bolts' });
    svgFront.append(boltsG);
    const whiteout = document.createElement('div');
    whiteout.className = 'psychic-link-battle-fx-whiteout';
    layer.append(dim, space, svgBack, pillar, pillarL, pillarR, vortex, svgFront, whiteout);
    board.append(layer);

    const starts = cardEls.map((el) => {
      const b = board.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        left: r.left - b.left, top: r.top - b.top,
        cx: r.left - b.left + r.width / 2, cy: r.top - b.top + r.height / 2,
        ax: r.left - b.left + r.width / 2, ay: r.top - b.top + 82,
      };
    });
    cardEls.forEach((el, i) => {
      el.style.position = 'absolute';
      el.style.left = `${starts[i].left}px`;
      el.style.top = `${starts[i].top}px`;
      el.style.margin = '0';
      el.style.zIndex = '3';
      el.style.willChange = 'transform';
      board.append(el);
    });
    const row = board.querySelector('.psychic-link-battle-cards');
    if (row) row.remove();

    const miniPillars = starts.map((s) => {
      const mp = document.createElement('div');
      mp.className = 'psychic-link-battle-fx-minipillar';
      mp.style.left = `${s.cx - 48}px`;
      mp.style.width = '96px';
      layer.insertBefore(mp, svgFront);
      return mp;
    });

    return { layer, dim, space, svgBack, circleRoot, trailsG, boltsG, pillar, pillarL, pillarR, vortex, miniPillars, svgFront, whiteout, starts, artPanels: null, creatureStage: null, superEl: null };
  }

  function clearFx() {
    if (fx) {
      if (fx.artPanels) { fx.artPanels.forEach((p) => p.remove()); fx.artPanels = null; }
      if (fx.creatureStage) { fx.creatureStage.remove(); fx.creatureStage = null; }
      fx.layer.remove();
      fx = null;
    }
    if (board) board.classList.remove('fx-charging');
  }

  function drawBolts(centers, withBranches) {
    fx.boltsG.innerHTML = '';
    const pairs = [[0, 1], [1, 2]];
    for (const [i, j] of pairs) {
      fx.boltsG.append(
        svgEl('polyline', { points: boltPoints(centers[i], centers[j], 17, 6), fill: 'none', stroke: '#ff9e2c', 'stroke-width': 7, opacity: 0.75, 'stroke-linejoin': 'round' }),
        svgEl('polyline', { points: boltPoints(centers[i], centers[j], 14, 6), fill: 'none', stroke: '#fff3c4', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      );
      if (withBranches) {
        const mid = { x: (centers[i].x + centers[j].x) / 2, y: (centers[i].y + centers[j].y) / 2 };
        const tip = { x: mid.x + (Math.random() * 30 - 15), y: mid.y + 26 + Math.random() * 14 };
        fx.boltsG.append(svgEl('polyline', {
          points: boltPoints(mid, tip, 6, 3), fill: 'none', stroke: '#ffd23e', 'stroke-width': 1.6, opacity: 0.85, 'stroke-linejoin': 'round',
        }));
      }
    }
  }

  function spawnWindCut(x, y, angleDeg, delayMs) {
    later(() => {
      if (!fx) return;
      const cut = document.createElement('div');
      cut.className = 'psychic-link-battle-fx-windcut';
      cut.style.left = `${x - 23}px`;
      cut.style.top = `${y - 5}px`;
      cut.style.zIndex = '6';
      fx.layer.append(cut);
      const anim = cut.animate([
        { transform: `rotate(${angleDeg}deg) translateX(-8px)`, opacity: 0 },
        { transform: `rotate(${angleDeg}deg) translateX(10px)`, opacity: 1, offset: 0.35 },
        { transform: `rotate(${angleDeg}deg) translateX(30px)`, opacity: 0 },
      ], { duration: 125, easing: 'ease-out', fill: 'forwards' });
      anim.onfinish = () => cut.remove();
    }, delayMs);
  }

  // 段階1：溜め。専用空間へ切り替わり、魔法陣が回り始め、細い光の柱が立ち、
  // カードの縁に光が集まって SVG の電撃線が走る。
  function phaseCharge() {
    board.classList.add('fx-charging');
    fx.dim.style.opacity = '1';
    fx.space.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    fx.circleRoot.style.transformBox = 'fill-box';
    fx.circleRoot.style.transformOrigin = 'center';
    fx.circleRoot.animate([
      { opacity: 0, transform: 'scale(0.55)' },
      { opacity: 1, transform: 'scale(1.05)', offset: 0.72 },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: 280, easing: 'ease-out', fill: 'forwards' });
    fx.miniPillars.forEach((mp, i) => {
      mp.animate([
        { opacity: 0, transform: 'scaleY(0.25)' },
        { opacity: 0.9, transform: 'scaleY(1)' },
      ], { duration: 280, delay: i * 50, easing: 'ease-out', fill: 'forwards' });
    });
    const centers = fx.starts.map((s) => ({ x: s.ax, y: s.ay }));
    drawBolts(centers, true);
  }

  // 段階2：浮上と風切り。まず少し沈んでから、行き過ぎて戻る（直線で持ち上げない）。
  function phaseRise(cardEls) {
    const tilts = [9, 0, -9];
    cardEls.forEach((el, i) => {
      el.animate([
        { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
        { transform: `translate(0px, 5px) scale(0.98) rotate(${tilts[i] * 0.3}deg)`, offset: 0.18 },
        { transform: `translate(0px, -37px) scale(1.13) rotate(${tilts[i] * 1.25}deg)`, offset: 0.72 },
        { transform: `translate(0px, -30px) scale(1.10) rotate(${tilts[i]}deg)` },
      ], { duration: 290, easing: 'ease-out', fill: 'forwards' });
      const s = fx.starts[i];
      spawnWindCut(s.cx - 34, s.cy - 44, -90, i * 40);
      spawnWindCut(s.cx + 30, s.cy - 60, -90, i * 40 + 45);
    });
  }

  // 段階3：渦巻き収束。3枚が回転しながら渦の中心へ吸い込まれる。
  // カードの移動は毎コマ、渦の曲線上の位置を計算して置く（直線つなぎにしない）。
  function phaseConverge(cardEls) {
    const c = boardCenter();
    const tilts = [9, 0, -9];
    const moveMs = 400;
    const SWIRL = 2.5;
    fx.vortex.animate([{ opacity: 0 }, { opacity: 0.95 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    const speedG = svgEl('g', { opacity: 0 });
    for (let i = 0; i < 30; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r1 = 120 + Math.random() * 60;
      const r2 = r1 + 110 + Math.random() * 150;
      speedG.append(svgEl('line', {
        x1: c.x + Math.cos(a) * r1, y1: c.y + Math.sin(a) * r1,
        x2: c.x + Math.cos(a) * r2, y2: c.y + Math.sin(a) * r2,
        stroke: '#ffffff', 'stroke-width': 2, opacity: 0.55, 'stroke-linecap': 'round',
      }));
    }
    fx.svgBack.append(speedG);
    const speedAnim = speedG.animate([
      { opacity: 0 }, { opacity: 0.85, offset: 0.25 }, { opacity: 0.85, offset: 0.7 }, { opacity: 0 },
    ], { duration: 470, easing: 'ease-out', fill: 'forwards' });
    speedAnim.onfinish = () => speedG.remove();
    fx.miniPillars.forEach((mp) => {
      mp.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    });
    const spiralOf = (s) => {
      const vx = s.cx - c.x;
      const vy = s.cy - c.y;
      return { r0: Math.hypot(vx, vy) || 1, a0: Math.atan2(vy, vx) };
    };
    const spiralPoint = (s, e) => {
      const { r0, a0 } = spiralOf(s);
      const a = a0 + SWIRL * e;
      const r = r0 * (1 - e);
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    };
    cardEls.forEach((el) => { el.getAnimations().forEach((a) => a.cancel()); });
    cardEls.forEach((el, i) => {
      const s = fx.starts[i];
      const dur = moveMs - i * 60;
      const cp1 = spiralPoint(s, 0.3);
      const cp2 = spiralPoint(s, 0.72);
      const path = svgEl('path', {
        d: `M ${s.cx} ${s.cy} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${c.x} ${c.y}`,
        fill: 'none', stroke: TRAIL_COLORS[i], 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0.95,
      });
      fx.trailsG.append(path);
      const len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      path.animate([
        { strokeDashoffset: len },
        { strokeDashoffset: 0 },
      ], { duration: dur, delay: i * 60, easing: 'ease-in', fill: 'forwards' });
      const dx = c.x - s.cx;
      const dy = c.y - s.cy;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      spawnWindCut(s.cx + dx * 0.3, s.cy + dy * 0.3 - 20, angle, i * 60);
      spawnWindCut(s.cx + dx * 0.55, s.cy + dy * 0.55 - 8, angle, i * 60 + 45);
    });
    fx.boltsG.querySelectorAll('polyline').forEach((p) => { if (p.getAttribute('stroke-width') === '1.6') p.remove(); });
    const t0 = performance.now();
    const tick = () => {
      if (!fx || state.status !== 'linking') { rafId = null; return; }
      const elapsed = performance.now() - t0;
      const centers = fx.starts.map((s, i) => {
        const p = Math.min(1, Math.max(0, (elapsed - i * 60) / (moveMs - i * 60)));
        const eA = Math.pow(p, 1.3);
        const eR = Math.pow(p, 1.8);
        const { r0, a0 } = spiralOf(s);
        const a = a0 + SWIRL * eA;
        const r = r0 * (1 - eR);
        const pt = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
        const bank = tilts[i] + 42 * Math.sin(Math.PI * eA);
        const scale = 1.10 - 0.16 * eR;
        cardEls[i].style.transform = `translate(${pt.x - s.cx}px, ${pt.y - s.cy - 30 * (1 - p)}px) scale(${scale.toFixed(3)}) rotate(${bank.toFixed(1)}deg)`;
        return { x: pt.x + (s.ax - s.cx), y: pt.y + (s.ay - s.cy) - 30 * (1 - p) };
      });
      drawBolts(centers, false);
      if (elapsed < moveMs + 130) { rafId = requestAnimationFrame(tick); } else { rafId = null; }
    };
    rafId = requestAnimationFrame(tick);
  }

  // 段階4：実体化。カードは消えて「中身そのもの」が出てくる。
  // 仮絵の段階では中身はスートの大きな印。中央の1枚はフェードアウトしながら
  // カットイン（彼女）へつながり、終わりに裏返る1枚として姿を戻す。
  function phaseMaterialize(cardEls) {
    if (!fx) return;
    const c = boardCenter();
    cardEls.forEach((el, i) => {
      if (i === 1) return;
      el.animate([
        { opacity: 1 },
        { opacity: 0 },
      ], { duration: 130, delay: i * 40, easing: 'ease-in', fill: 'forwards' });
    });
    later(() => {
      if (!fx) return;
      const centerEl = cardEls[1];
      const t = centerEl.style.transform;
      centerEl.animate([
        { opacity: 1, transform: t },
        { opacity: 0, transform: `${t} scale(1.45)` },
      ], { duration: 420, easing: 'ease-in', fill: 'forwards' });
    }, 240);
    fx.artPanels = [];
    const sizes = [[360, 280], [420, 320], [360, 280]];
    components.forEach((card, i) => {
      if (i === 1) return;
      const panel = document.createElement('div');
      panel.className = 'psychic-link-battle-fx-art';
      const [W, H] = sizes[i];
      panel.style.width = `${W}px`;
      panel.style.height = `${H}px`;
      panel.style.left = `${c.x - W / 2 + (i - 1) * 150}px`;
      panel.style.top = `${c.y - H / 2 + 18}px`;
      panel.style.opacity = '0';
      panel.style.filter = `drop-shadow(0 0 22px ${TRAIL_COLORS[i]})`;
      const glyph = document.createElement('div');
      glyph.className = 'glyph-big';
      glyph.textContent = suitGlyphOf(card);
      panel.append(glyph);
      panel.style.zIndex = `${6 + i}`;
      board.append(panel);
      fx.artPanels.push(panel);
      const rot = (i - 1) * 6;
      panel.animate([
        { opacity: 0, transform: `translateY(84px) scale(0.3) rotate(${rot - 12}deg)` },
        { opacity: 1, transform: `translateY(0px) scale(1.12) rotate(${rot}deg)`, offset: 0.34 },
        { opacity: 1, transform: `translateY(-11px) scale(1.16) rotate(${rot + 1.2}deg)`, offset: 0.52 },
        { opacity: 1, transform: `translateY(3px) scale(1.13) rotate(${rot - 0.8}deg)`, offset: 0.68 },
        { opacity: 1, transform: `translateY(-6px) scale(1.15) rotate(${rot}deg)`, offset: 0.82 },
        { opacity: 0, transform: `translate(${(1 - i) * 150}px, 8px) scale(0.06) rotate(${rot + 12}deg)` },
      ], { duration: 460, delay: i * 95, easing: 'cubic-bezier(.3, 1.25, .4, 1)', fill: 'forwards' });
    });
    later(() => {
      if (!fx) return;
      const centerEl = cardEls[1];
      const t = centerEl.style.transform;
      centerEl.getAnimations().forEach((a) => a.cancel());
      centerEl.animate([
        { opacity: 0, transform: `${t} scale(0.45)` },
        { opacity: 1, transform: t },
      ], { duration: 110, easing: 'ease-out', fill: 'forwards' });
      if (fx.artPanels) { fx.artPanels.forEach((p) => p.remove()); fx.artPanels = null; }
    }, 810);
  }

  // 段階5：つながる瞬間。中央の1枚がその場で裏返って合体後の姿になる。
  // 90度（真横）の瞬間に、同じ要素のまま中身だけを差し替える。
  function phaseFlip(cardEls) {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (fx && fx.artPanels) { fx.artPanels.forEach((p) => p.remove()); fx.artPanels = null; }
    if (!fx) return;
    fx.vortex.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 130, fill: 'forwards' });
    fx.boltsG.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
    const c = boardCenter();
    const centerEl = cardEls[1];
    centerEl.style.perspective = '700px';
    centerEl.style.zIndex = '4';
    const face = centerEl.querySelector('.psychic-link-battle-face');
    face.animate([
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(90deg)' },
    ], { duration: 125, easing: 'cubic-bezier(.55, .02, .3, 1)', fill: 'forwards' });
    later(() => {
      if (!fx) return;
      const basePower = components.reduce((sum, card) => sum + (Number(card.power) || 0), 0);
      face.querySelector('.glyph').textContent = components.map((card) => suitGlyphOf(card)).join('');
      face.querySelector('.glyph').style.fontSize = '30px';
      face.querySelector('.pow').textContent = String(basePower);
      face.getAnimations().forEach((a) => a.cancel());
      face.animate([
        { transform: 'rotateY(-90deg)' },
        { transform: 'rotateY(0deg)' },
      ], { duration: 130, easing: 'cubic-bezier(.25, .8, .35, 1.15)', fill: 'forwards' });
      centerEl.classList.add('super');
      centerEl.querySelector('.name').textContent = herLabel;
      const spec = centerEl.querySelector('.spec');
      spec.innerHTML = '';
      const power = document.createElement('span');
      power.innerHTML = 'パワー <b></b>';
      power.querySelector('b').textContent = String(basePower);
      spec.append(power);
      const w = 190;
      centerEl.style.width = `${w}px`;
      centerEl.style.left = `${c.x - w / 2}px`;
      const h = centerEl.offsetHeight;
      centerEl.style.top = `${c.y - h / 2}px`;
      centerEl.style.transform = '';
      fx.superEl = centerEl;
    }, 122);
    later(() => {
      if (!fx || !fx.superEl) return;
      fx.superEl.animate([
        { transform: 'scale(1.3)' },
        { transform: 'scale(0.97)', offset: 0.55 },
        { transform: 'scale(1)' },
      ], { duration: 210, easing: 'cubic-bezier(.3, 1.4, .4, 1)', fill: 'none' });
      fx.whiteout.animate([
        { opacity: 0 }, { opacity: 0.65, offset: 0.3 }, { opacity: 0 },
      ], { duration: 170, easing: 'ease-out', fill: 'forwards' });
      const ring = svgEl('circle', {
        cx: c.x, cy: c.y, r: 96, fill: 'none', stroke: '#ffd23e', 'stroke-width': 4, opacity: 0.95,
        style: 'filter: drop-shadow(0 0 7px rgba(255, 180, 60, 0.95))',
      });
      ring.style.transformBox = 'fill-box';
      ring.style.transformOrigin = 'center';
      fx.svgFront.append(ring);
      const ringAnim = ring.animate([
        { transform: 'scale(0.4)', opacity: 0.95 },
        { transform: 'scale(2.4)', opacity: 0 },
      ], { duration: 260, easing: 'ease-out', fill: 'forwards' });
      ringAnim.onfinish = () => ring.remove();
      board.animate([
        { transform: 'translate(0px, 0px)' },
        { transform: 'translate(6px, 3px)' },
        { transform: 'translate(-5px, -2px)' },
        { transform: 'translate(0px, 0px)' },
      ], { duration: 140, easing: 'ease-out' });
    }, 255);
  }

  // 段階6：中央で衝突の閃光。大きな炎と閃光の爆発が盤面を覆う。
  function phaseFlash() {
    if (!fx) return;
    fx.circleRoot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    const c = boardCenter();
    fx.whiteout.animate([
      { opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 },
    ], { duration: 210, easing: 'ease-out', fill: 'forwards' });
    const flame = document.createElement('div');
    flame.className = 'psychic-link-battle-fx-flame';
    const fsize = 620;
    flame.style.width = `${fsize}px`;
    flame.style.height = `${fsize}px`;
    flame.style.left = `${c.x - fsize / 2}px`;
    flame.style.top = `${c.y - fsize / 2}px`;
    flame.style.zIndex = '6';
    fx.layer.append(flame);
    const flameAnim = flame.animate([
      { opacity: 0, transform: 'scale(0.3)' },
      { opacity: 1, transform: 'scale(0.85)', offset: 0.3 },
      { opacity: 0, transform: 'scale(1.3)' },
    ], { duration: 400, easing: 'ease-out', fill: 'forwards' });
    flameAnim.onfinish = () => flame.remove();
    for (let i = 0; i < 10; i += 1) {
      const ember = document.createElement('div');
      ember.className = 'psychic-link-battle-fx-fragment';
      ember.style.background = i % 2 ? '#ffb62e' : '#ff7847';
      ember.style.boxShadow = '0 0 8px #ff9e2c, 0 0 16px rgba(255, 120, 40, 0.7)';
      ember.style.left = `${c.x - 3 + (Math.random() * 120 - 60)}px`;
      ember.style.top = `${c.y - 3}px`;
      ember.style.zIndex = '6';
      fx.layer.append(ember);
      const drift = Math.random() * 90 - 45;
      const rise = 60 + Math.random() * 110;
      const emberAnim = ember.animate([
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: `translate(${drift}px, ${-rise}px)`, opacity: 0 },
      ], { duration: 340 + Math.random() * 160, easing: 'ease-out', fill: 'forwards' });
      emberAnim.onfinish = () => ember.remove();
    }
    const burst = document.createElement('div');
    burst.className = 'psychic-link-battle-fx-burst';
    const size = 460;
    burst.style.width = `${size}px`;
    burst.style.height = `${size}px`;
    burst.style.left = `${c.x - size / 2}px`;
    burst.style.top = `${c.y - size / 2}px`;
    burst.style.zIndex = '6';
    fx.layer.append(burst);
    const anim = burst.animate([
      { opacity: 0, transform: 'scale(0.25)' },
      { opacity: 1, transform: 'scale(0.7)', offset: 0.3 },
      { opacity: 0, transform: 'scale(1.15)' },
    ], { duration: 130, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = () => burst.remove();
  }

  // 段階7：合体後カードを全画面で公開（見せ場）。回る光の放射と雷で持たせる。
  function showFullscreen() {
    if (fullscreen) { fullscreen.remove(); fullscreen = null; }
    fullscreen = document.createElement('div');
    fullscreen.className = 'psychic-link-battle-fullscreen';
    fullscreen.dataset.role = 'reveal';
    const rays = document.createElement('div');
    rays.className = 'rays';
    const cardWrap = document.createElement('div');
    cardWrap.className = 'reveal-card';
    const face = document.createElement('div');
    face.className = 'reveal-face';
    const glyphs = document.createElement('div');
    glyphs.className = 'glyphs';
    glyphs.textContent = components.map((card) => suitGlyphOf(card)).join('');
    const pow = document.createElement('div');
    pow.className = 'pow';
    pow.textContent = String(components.reduce((sum, card) => sum + (Number(card.power) || 0), 0));
    face.append(glyphs, pow);
    cardWrap.append(face);
    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = herLabel;
    fullscreen.append(rays, cardWrap, caption);
    const boltSvg = svgEl('svg', { class: 'reveal-bolts', viewBox: '0 0 1000 700', preserveAspectRatio: 'none' });
    const boltSpots = [
      [{ x: 120, y: 60 }, { x: 210, y: 300 }],
      [{ x: 880, y: 40 }, { x: 790, y: 280 }],
      [{ x: 850, y: 660 }, { x: 760, y: 430 }],
      [{ x: 150, y: 650 }, { x: 230, y: 420 }],
    ];
    boltSpots.forEach(([a, b], i) => {
      const bolt = svgEl('polyline', {
        points: boltPoints(a, b, 30, 6), fill: 'none', stroke: i % 2 ? '#ffd23e' : '#fff3c4',
        'stroke-width': 3.5, 'stroke-linejoin': 'round', opacity: 0,
        style: 'filter: drop-shadow(0 0 8px rgba(255, 190, 80, 0.95))',
      });
      boltSvg.append(bolt);
      bolt.animate([
        { opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.15, offset: 0.45 },
        { opacity: 1, offset: 0.6 }, { opacity: 0 },
      ], { duration: 480, delay: 60 + i * 85, easing: 'ease-out', fill: 'forwards' });
    });
    fullscreen.append(boltSvg);
    stage.append(fullscreen);
  }

  // 段階8：彼女のカットイン。カードではなく彼女その物が画面いっぱいに出て、
  // 止め絵として止まる。止め絵にはパワー値（千倍の整数）を重ねて出す。
  // 彼女を最後の絵として約1.5秒止め、舞台ごと480msで引いて盤面へ戻る。
  function showCreatureStage() {
    if (fullscreen) {
      const fs = fullscreen;
      fs.animate([
        { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
        { opacity: 0, transform: 'scale(0.78)', filter: 'brightness(0.6)' },
      ], { duration: 200, delay: 30, easing: 'ease-in', fill: 'forwards' });
      later(() => { fs.remove(); if (fullscreen === fs) fullscreen = null; }, 260);
    }
    if (!fx) return;
    const tint = stageTint;
    const stageEl = document.createElement('div');
    stageEl.className = 'psychic-link-battle-creature';
    stageEl.dataset.role = 'creature-stage';
    const atmo = document.createElement('div');
    atmo.className = 'atmo';
    atmo.style.backgroundColor = 'rgb(3, 4, 10)';
    atmo.style.backgroundImage = `radial-gradient(circle at 50% 46%, ${tint}55 0%, rgba(6, 10, 26, 0.55) 58%, rgba(2, 3, 10, 0.2) 100%)`;
    const being = document.createElement('div');
    being.className = 'being';
    being.style.filter = `drop-shadow(0 0 34px ${tint})`;
    const img = document.createElement('img');
    img.src = herImage;
    img.alt = herLabel;
    being.append(img);
    const burstflash = document.createElement('div');
    burstflash.className = 'burstflash';
    stageEl.append(atmo, burstflash, being);
    burstflash.animate([
      { opacity: 0, transform: 'scale(0.25)' },
      { opacity: 0.95, transform: 'scale(0.9)', offset: 0.35 },
      { opacity: 0, transform: 'scale(1.7)' },
    ], { duration: 430, easing: 'ease-out', fill: 'forwards' });
    if (herLabel) {
      const banner = document.createElement('div');
      banner.className = 'banner';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = herLabel;
      banner.append(name);
      stageEl.append(banner);
      banner.animate([
        { opacity: 0, transform: 'translateX(-50%) translateY(16px)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0px)' },
      ], { duration: 260, delay: 200, easing: 'ease-out', fill: 'backwards' });
    }
    // 止め絵の数値表示：パワー値（内部も千倍の整数で持つ値その物）。
    const powerEl = document.createElement('div');
    powerEl.className = 'psychic-link-battle-power';
    powerEl.dataset.role = 'power-value';
    const pLabel = document.createElement('div');
    pLabel.className = 'label';
    pLabel.textContent = 'パワー';
    const pValue = document.createElement('div');
    pValue.className = 'value';
    pValue.textContent = String(powerValue);
    powerEl.append(pLabel, pValue);
    stageEl.append(powerEl);
    powerEl.animate([
      { opacity: 0, transform: 'translateY(14px) scale(0.9)' },
      { opacity: 1, transform: 'translateY(0px) scale(1.06)', offset: 0.6 },
      { opacity: 1, transform: 'translateY(0px) scale(1)' },
    ], { duration: 320, delay: 300, easing: 'ease-out', fill: 'forwards' });
    for (let s = 0; s < 3; s += 1) {
      const streak = document.createElement('div');
      streak.className = 'streak';
      streak.style.top = `${22 + s * 24}%`;
      streak.style.transform = 'rotate(-14deg)';
      stageEl.append(streak);
      later(() => {
        streak.animate([
          { opacity: 0, transform: 'rotate(-14deg) translateX(-24vw)' },
          { opacity: 0.9, transform: 'rotate(-14deg) translateX(10vw)', offset: 0.4 },
          { opacity: 0, transform: 'rotate(-14deg) translateX(46vw)' },
        ], { duration: 300, easing: 'ease-out' });
      }, 60 + s * 110);
    }
    stage.append(stageEl);
    fx.creatureStage = stageEl;
    stageEl.animate([
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 150, easing: 'ease-out', fill: 'forwards' });
    const glow = `drop-shadow(0 0 34px ${tint})`;
    being.animate([
      { transform: 'scale(0.14) translateY(16px)', filter: `${glow} brightness(2.4)` },
      { transform: 'scale(1.1) translateY(-10px)', filter: `${glow} brightness(1.25)`, offset: 0.55 },
      { transform: 'scale(0.985) translateY(2px)', filter: `${glow} brightness(1)`, offset: 0.78 },
      { transform: 'scale(1) translateY(0px)', filter: `${glow} brightness(1)` },
    ], { duration: 470, easing: 'cubic-bezier(.3, 1.35, .4, 1)', fill: 'forwards' });
    // 彼女を最後の絵として止め、舞台ごと静かに引く（v23の退場）。
    later(() => {
      if (!fx || fx.creatureStage !== stageEl) return;
      being.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.035)' },
      ], { duration: 480, easing: 'ease-out', fill: 'forwards' });
      stageEl.animate([
        { opacity: 1 },
        { opacity: 0 },
      ], { duration: 480, easing: 'ease-in', fill: 'forwards' });
    }, 1500);
    later(() => {
      if (fx && fx.creatureStage === stageEl) { stageEl.remove(); fx.creatureStage = null; }
    }, 2050);
  }

  // 段階9：背景を通常へ戻す（カードの見せ場は作らない）。
  function phasePillar() {
    if (fullscreen) { fullscreen.remove(); fullscreen = null; }
    if (!fx) return;
    fx.dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    fx.space.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
  }

  // 段階10：残っている軌跡を消すだけ（カードを囲む光や枠の見せ場は作らない）。
  function phaseSettle() {
    if (!fx) return;
    if (fx.trailsG) {
      fx.trailsG.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    }
  }

  function finishLink() {
    clearTimers();
    if (fullscreen) { fullscreen.remove(); fullscreen = null; }
    clearFx();
    state = { status: 'linked', componentIds: components.map((c) => c.id), powerValue };
    if (stage) {
      stage.dataset.phase = 'linked';
      stage.remove();
      stage = null;
      board = null;
    }
    if (onLinked) {
      try { onLinked({ ...state }); } catch (e) { console.warn('psychic-link-battle-onlinked', e); }
    }
    if (resolvePlay) {
      const done = resolvePlay;
      resolvePlay = null;
      done({ ...state });
    }
  }

  function skipToLinked() {
    if (state.status !== 'linking') return;
    finishLink();
  }

  function isReducedMotion() {
    if (typeof reducedMotion === 'function') return !!reducedMotion();
    if (reducedMotion != null) return !!reducedMotion;
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function play(nextComponents) {
    if (state.status === 'linking') return Promise.resolve({ ...state });
    components = Array.isArray(nextComponents) ? nextComponents.slice(0, 3) : [];
    powerValue = derivePsychicLinkPowerValue(components);
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE_TEXT;
      document.head.append(style);
    }
    if (isReducedMotion()) {
      // 動きを減らす設定では即合体。止め絵と数値だけを短く出して盤面へ戻る。
      state = { status: 'linked', componentIds: components.map((c) => c.id), powerValue };
      stage = document.createElement('div');
      stage.className = 'psychic-link-battle-stage';
      stage.dataset.role = 'psychic-link-stage';
      stage.dataset.phase = 'linked';
      stage.dataset.powerValue = String(powerValue);
      const still = document.createElement('div');
      still.className = 'psychic-link-battle-still';
      const img = document.createElement('img');
      img.src = herImage;
      img.alt = herLabel;
      const powerEl = document.createElement('div');
      powerEl.className = 'psychic-link-battle-power';
      powerEl.dataset.role = 'power-value';
      powerEl.style.opacity = '1';
      const pLabel = document.createElement('div');
      pLabel.className = 'label';
      pLabel.textContent = 'パワー';
      const pValue = document.createElement('div');
      pValue.className = 'value';
      pValue.textContent = String(powerValue);
      powerEl.append(pLabel, pValue);
      still.append(img, powerEl);
      stage.append(still);
      document.body.append(stage);
      if (onLinked) {
        try { onLinked({ ...state }); } catch (e) { console.warn('psychic-link-battle-onlinked', e); }
      }
      const doneStage = stage;
      later(() => { doneStage.remove(); if (stage === doneStage) { stage = null; } }, 500);
      return Promise.resolve({ ...state });
    }
    state = { status: 'linking', componentIds: components.map((c) => c.id), powerValue };
    stage = document.createElement('div');
    stage.className = 'psychic-link-battle-stage';
    stage.dataset.role = 'psychic-link-stage';
    stage.dataset.powerValue = String(powerValue);
    board = document.createElement('div');
    board.className = 'psychic-link-battle-board';
    const row = document.createElement('div');
    row.className = 'psychic-link-battle-cards';
    const cardEls = components.map((card) => cardNode(card));
    cardEls.forEach((el) => row.append(el));
    board.append(row);
    stage.append(board);
    stage.addEventListener('click', skipToLinked);
    document.body.append(stage);
    fx = buildFx(cardEls);
    const promise = new Promise((resolve) => { resolvePlay = resolve; });
    const phaseHandlers = {
      charge: () => phaseCharge(),
      rise: () => phaseRise(cardEls),
      converge: () => phaseConverge(cardEls),
      materialize: () => phaseMaterialize(cardEls),
      flip: () => phaseFlip(cardEls),
      flash: () => phaseFlash(),
      reveal: () => showFullscreen(),
      cutin: () => showCreatureStage(),
      pillar: () => phasePillar(),
      land: () => {},
      settle: () => phaseSettle(),
      linked: () => finishLink(),
    };
    PSYCHIC_LINK_BATTLE_TIMELINE.forEach((step) => {
      const handler = phaseHandlers[step.phase];
      if (!handler) return;
      if (step.atMs === 0) { stage.dataset.phase = step.phase; handler(); return; }
      later(() => {
        if (destroyed || state.status !== 'linking') return;
        stage.dataset.phase = step.phase;
        handler();
      }, step.atMs);
    });
    return promise;
  }

  function destroy() {
    destroyed = true;
    clearTimers();
    if (stage) { stage.remove(); stage = null; board = null; }
    fx = null;
    fullscreen = null;
  }

  return {
    play,
    skip: skipToLinked,
    destroy,
    getState: () => ({ ...state }),
    isPlaying: () => state.status === 'linking',
  };
}

// 対戦フローへの橋。対戦の状態を定期的に見て、解決で勝者のカードが列へ
// 入った直後（lastBattleResolution の更新）に、人間プレイヤーの盤面の
// カードが初めて3枚そろっていたら演出を発火させる。
// ゲーム本体の状態は一切書き換えない（演出は重ね表示だけ）。
export function createPsychicLinkBattleBridge({
  getState,
  getCardFace,
  herImage,
  herLabel = '',
  stageTint = '#ffd23e',
  reducedMotion = null,
  createPerformance = null,
  pollMs = 400,
} = {}) {
  let intervalId = null;
  let seenMatchId = null;
  let lastSerial = 0;
  let linkState = null;
  let performance = null;
  let playing = false;
  let lastTrigger = null;

  function humanOf(match) {
    return (match?.players || []).find((p) => p && p.human) || null;
  }

  function fieldIdsOf(player) {
    if (!player) return [];
    return ['L', 'C', 'R'].flatMap((lane) => (Array.isArray(player.lanes?.[lane]) ? player.lanes[lane] : []));
  }

  function toComponent(id) {
    let face = null;
    try { face = getCardFace ? getCardFace(id) : null; } catch (e) { face = null; }
    return {
      id,
      name: face?.name || String(id),
      suit: face?.suit || '',
      glyph: face?.glyph || '',
      power: Number(face?.power) || 0,
    };
  }

  function makePerformance() {
    if (createPerformance) return createPerformance();
    return createPsychicLinkPerformance({ herImage, herLabel, stageTint, reducedMotion });
  }

  function fire(fieldIds, via, match) {
    const picked = pickLinkComponents(fieldIds.map(toComponent));
    if (!picked) return false;
    lastTrigger = {
      matchId: match?.id ?? null,
      via,
      componentIds: picked.map((c) => c.id),
      powerValue: derivePsychicLinkPowerValue(picked),
    };
    try {
      performance = performance || makePerformance();
      playing = true;
      Promise.resolve(performance.play(picked)).then((result) => {
        playing = false;
        linkState = { ...(result || {}), matchId: match?.id ?? null };
      }, () => { playing = false; });
    } catch (e) {
      playing = false;
      console.warn('psychic-link-battle-fire', e);
      return false;
    }
    return true;
  }

  function tick() {
    let st = null;
    try { st = getState ? getState() : null; } catch (e) { st = null; }
    const match = st?.match || null;
    if (!match) {
      seenMatchId = null;
      lastSerial = 0;
      return;
    }
    if ((match.id ?? null) !== seenMatchId) {
      seenMatchId = match.id ?? null;
      lastSerial = 0;
      linkState = null;
    }
    const res = match.lastBattleResolution;
    if (!res || typeof res.serial !== 'number' || res.serial === lastSerial) return;
    lastSerial = res.serial;
    const human = humanOf(match);
    if (!human) return;
    if (!Array.isArray(res.winnerIds) || !res.winnerIds.includes(human.id)) return;
    const fieldIds = fieldIdsOf(human);
    if (!shouldStartPsychicLink({ fieldCount: fieldIds.length, alreadyLinked: !!linkState, playing })) return;
    fire(fieldIds, 'battle-resolution', match);
  }

  function playNow() {
    let st = null;
    try { st = getState ? getState() : null; } catch (e) { st = null; }
    const match = st?.match || null;
    if (!match || linkState || playing) return false;
    const human = humanOf(match);
    if (!human) return false;
    return fire(fieldIdsOf(human), 'manual', match);
  }

  function start() {
    if (intervalId !== null) return;
    intervalId = globalThis.setInterval(tick, pollMs);
  }

  function stop() {
    if (intervalId !== null) {
      globalThis.clearInterval(intervalId);
      intervalId = null;
    }
    if (performance) performance.destroy();
  }

  function probe() {
    return {
      status: () => (playing ? 'playing' : (linkState ? 'linked' : 'idle')),
      linkState: () => (linkState ? { ...linkState } : null),
      powerValue: () => linkState?.powerValue ?? lastTrigger?.powerValue ?? null,
      lastTrigger: () => (lastTrigger ? { ...lastTrigger } : null),
      playNow,
      tick,
    };
  }

  return { start, stop, tick, probe };
}
