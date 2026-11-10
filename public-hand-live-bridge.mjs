// 公開手札の接続（対戦画面・観戦画面の入口）。
// 原則（2026-11-10、ライカの決め）：手札に戻るカードは表向きで戻り、公開のまま保つ。
// 表向きの手札は、他のプレイヤーから実際に開いて見れなければならない。
//
// この接続がやること：
// - 対戦の状態（match.publicHandState）に公開の記録を持つ。
// - 戻りの場所から markReturn(playerId, cardId) で記録を受け取る。
// - 対戦画面に「公開手札」の入口（相手ごとのボタン）を出し、押すと左側に
//   その人の公開手札が開く。非公開の分は中身を出さず、裏向きの枚数だけ。
// - 観戦（自分の席が無い見方）でも同じ入口が使える。
// 詳細の見せ方は左側のパネル（マスターデュエルと同じ側、2026-11-10の決め）。

import { createPublicHandState, markPublicInHand, syncWithHand, viewForViewer } from './public-hand-core.mjs';

const PANEL_ID = 'gameroadPublicHandPanel';
const BAR_ID = 'gameroadPublicHandBar';

export function createPublicHandBridge(hooks) {
  const { getMatch, cardLabel, cardPower, cardFace, log } = hooks;
  let selectedPlayerId = null;

  const SUIT_MARKS = { CL: '♣', DI: '♦', HT: '♥', HE: '♥', SP: '♠' };
  const SUIT_RED = { DI: true, HT: true, HE: true };

  // 公開カード1枚を「札の面」で作る。文章の札にはしない（2026-11-10の
  // 画面の作り方の決め：文字と数字だけの表示は駄目）。面の材料が無い時は
  // 名前だけの小さな面に落とす。
  function faceElement(id) {
    const face = cardFace ? cardFace(id) : null;
    const el = document.createElement('div');
    el.className = 'publicHandCardFace';
    el.style.cssText = 'position:relative;width:52px;height:70px;border-radius:7px;background:linear-gradient(145deg,#f7f8ff,#ccd4ee);border:1px solid #8fa0cc;box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:3px';
    if (face && (face.suit || face.rank)) {
      const top = document.createElement('div');
      const mark = SUIT_MARKS[face.suit] || '';
      top.textContent = `${mark}${face.rank || ''}`;
      top.style.cssText = `font:800 16px/1.1 system-ui;color:${SUIT_RED[face.suit] ? '#c62f45' : '#232a45'}`;
      const nm = document.createElement('div');
      nm.textContent = face.name || (cardLabel ? cardLabel(id) : id);
      nm.style.cssText = 'font:600 8px/1.2 system-ui;color:#4a5578;text-align:center';
      el.append(top, nm);
    } else {
      const nm = document.createElement('div');
      nm.textContent = cardLabel ? cardLabel(id) : id;
      nm.style.cssText = 'font:700 10px/1.3 system-ui;color:#232a45;text-align:center';
      el.appendChild(nm);
    }
    const power = cardPower ? cardPower(id) : null;
    if (power != null) {
      const pw = document.createElement('span');
      pw.className = 'publicHandCardPower';
      pw.textContent = String(power);
      pw.style.cssText = 'position:absolute;right:3px;bottom:2px;font:800 9px/1 system-ui;color:#8a6d1f';
      el.appendChild(pw);
    }
    return el;
  }

  // 裏向きの分は、裏面の札の重なりと枚数の印だけで出す。文章にはしない。
  function backsElement(count) {
    const wrap = document.createElement('div');
    wrap.className = 'publicHandBacks';
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px';
    wrap.setAttribute('aria-label', `裏向きのカード ${count}枚`);
    const stack = document.createElement('div');
    stack.style.cssText = 'display:flex';
    const shown = Math.min(count, 7);
    for (let i = 0; i < shown; i++) {
      const back = document.createElement('div');
      back.className = 'publicHandCardBack';
      back.style.cssText = `width:30px;height:42px;border-radius:5px;background:repeating-linear-gradient(45deg,#2c3a6e 0 5px,#1d2749 5px 10px);border:1px solid #5a6da3;box-shadow:0 2px 5px rgba(0,0,0,.4)${i ? ';margin-left:-18px' : ''}`;
      stack.appendChild(back);
    }
    const badge = document.createElement('span');
    badge.className = 'publicHandBackCount';
    badge.textContent = `×${count}`;
    badge.style.cssText = 'font:800 12px/1 system-ui;color:#cdd7f5';
    wrap.append(stack, badge);
    return wrap;
  }

  // 入口のボタンに付ける小さな札の面。文字の名札（表○・裏○）は付けない
  // （2026-11-10 ライカの指摘：名札と説明文だらけで幼稚）。
  // 公開分は実物の面を並べ、非公開分は裏面の絵の上に枚数を重ねる。
  function miniFace(id, i) {
    const face = cardFace ? cardFace(id) : null;
    const el = document.createElement('span');
    el.className = 'publicHandMiniFace';
    const mark = face ? (SUIT_MARKS[face.suit] || '') : '';
    el.textContent = face ? `${mark}${face.rank || ''}` : (cardLabel ? cardLabel(id) : id);
    el.style.cssText = `display:inline-grid;place-items:center;width:20px;height:27px;border-radius:3px;background:linear-gradient(145deg,#f7f8ff,#ccd4ee);border:1px solid #8fa0cc;font:800 9px/1 system-ui;color:${face && SUIT_RED[face.suit] ? '#c62f45' : '#232a45'}${i ? ';margin-left:-7px' : ''}`;
    return el;
  }

  function miniBack(count) {
    const el = document.createElement('span');
    el.className = 'publicHandMiniBack';
    el.textContent = String(count);
    el.style.cssText = 'display:inline-grid;place-items:center;min-width:20px;height:27px;padding:0 3px;border-radius:3px;background:repeating-linear-gradient(45deg,#2c3a6e 0 4px,#1d2749 4px 8px);border:1px solid #5a6da3;font:800 10px/1 system-ui;color:#e6ecff;text-shadow:0 1px 2px #000';
    el.setAttribute('aria-label', `裏向きのカード ${count}枚`);
    return el;
  }

  function state() {
    const m = getMatch();
    if (!m) return null;
    if (!m.publicHandState) m.publicHandState = createPublicHandState();
    return m.publicHandState;
  }

  // カードが公開のまま手札へ戻った時に、戻りの場所から呼ばれる。
  function markReturn(playerId, cardId) {
    const m = getMatch();
    const st = state();
    if (!m || !st) return false;
    const player = (m.players || []).find((p) => p.id === playerId);
    if (!player || !(player.hand || []).includes(cardId)) return false;
    const added = markPublicInHand(st, playerId, cardId);
    if (added) refresh();
    return added;
  }

  // 施設の核などが world.publicReturns に積んだ戻りをまとめて取り込む。
  function drainWorldReturns(world) {
    const list = world?.publicReturns;
    if (!Array.isArray(list) || !list.length) return 0;
    let n = 0;
    for (const r of list.splice(0, list.length)) {
      if (markReturn(r.playerId, r.cardId)) n++;
    }
    return n;
  }

  function currentView() {
    const m = getMatch();
    const st = state();
    if (!m || !st) return [];
    for (const p of m.players || []) syncWithHand(st, p);
    const viewer = (m.players || []).find((p) => p.human);
    // 観戦（自分の席が無い）時は viewerId=null で全員分が見れる。
    return viewForViewer(st, m.players || [], viewer ? viewer.id : null);
  }

  function ensureDom() {
    if (typeof document === 'undefined') return null;
    const battle = document.querySelector('section.screen.battle') || document.body;
    if (!battle) return null;
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.className = 'publicHandBar';
      bar.style.cssText = 'position:absolute;left:10px;top:176px;z-index:60;display:flex;flex-direction:column;gap:6px;align-items:flex-start;font:12px/1.4 system-ui;color:#eef2ff';
      bar.setAttribute('aria-label', '相手の公開手札を見る入口');
      battle.appendChild(bar);
    }
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('aside');
      panel.id = PANEL_ID;
      panel.className = 'publicHandPanel';
      // 詳細は左側（マスターデュエルと同じ側、2026-11-10の決め）。
      panel.style.cssText = 'position:absolute;left:10px;top:176px;z-index:70;width:min(280px,80vw);max-height:52%;overflow:auto;background:#141a2e;color:#eef2ff;border:1px solid #3a4a7a;border-radius:12px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);font:13px/1.5 system-ui';
      panel.setAttribute('aria-label', '公開手札');
      panel.hidden = true;
      battle.appendChild(panel);
    }
    return { bar, panel };
  }

  function refresh() {
    const dom = ensureDom();
    if (!dom) return;
    const view = currentView();
    const { bar, panel } = dom;
    // 詳細を開いている間は入口の列を隠す（同じ左側の列で重ねない）。
    bar.hidden = Boolean(selectedPlayerId);
    bar.replaceChildren();
    const title = document.createElement('span');
    title.className = 'publicHandBarTitle';
    title.textContent = '公開手札';
    bar.appendChild(title);
    for (const row of view) {
      if (row.isViewer) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'publicHandBtn';
      btn.style.cssText = 'display:flex;align-items:center;gap:6px;background:#232c4a;color:#eef2ff;border:1px solid #3a4a7a;border-radius:999px;padding:4px 10px;cursor:pointer;font:12px system-ui';
      const nm = document.createElement('span');
      nm.textContent = row.name;
      btn.appendChild(nm);
      if (row.publicCards.length) {
        const faces = document.createElement('span');
        faces.className = 'publicHandMiniFaces';
        faces.style.cssText = 'display:flex;align-items:center';
        row.publicCards.slice(0, 3).forEach((id, i) => faces.appendChild(miniFace(id, i)));
        if (row.publicCards.length > 3) {
          const more = document.createElement('span');
          more.textContent = `+${row.publicCards.length - 3}`;
          more.style.cssText = 'font:800 10px/1 system-ui;color:#cdd7f5;margin-left:3px';
          faces.appendChild(more);
        }
        btn.appendChild(faces);
      }
      if (row.hiddenCount > 0) btn.appendChild(miniBack(row.hiddenCount));
      btn.addEventListener('click', () => openPanel(row.playerId));
      bar.appendChild(btn);
    }
    if (selectedPlayerId) renderPanel();
  }

  function openPanel(playerId) {
    selectedPlayerId = playerId;
    renderPanel();
    const dom = ensureDom();
    if (dom) {
      dom.panel.hidden = false;
      dom.bar.hidden = true;
    }
  }

  function closePanel() {
    selectedPlayerId = null;
    const dom = ensureDom();
    if (dom) {
      dom.panel.hidden = true;
      dom.bar.hidden = false;
    }
  }

  function renderPanel() {
    const dom = ensureDom();
    if (!dom || !selectedPlayerId) return;
    const row = currentView().find((r) => r.playerId === selectedPlayerId);
    const { panel } = dom;
    panel.replaceChildren();
    const head = document.createElement('div');
    head.className = 'publicHandPanelHead';
    const name = document.createElement('strong');
    name.textContent = row ? `${row.name}の公開手札` : '公開手札';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'publicHandClose';
    close.textContent = '×';
    close.setAttribute('aria-label', '閉じる');
    close.addEventListener('click', closePanel);
    head.append(name, close);
    panel.appendChild(head);
    if (row && row.publicCards.length) {
      const list = document.createElement('div');
      list.className = 'publicHandCards';
      list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
      for (const id of row.publicCards) list.appendChild(faceElement(id));
      panel.appendChild(list);
    }
    if (row && row.hiddenCount > 0) {
      panel.appendChild(backsElement(row.hiddenCount));
    }
  }

  return { markReturn, drainWorldReturns, currentView, refresh, openPanel, closePanel, state };
}

// 本体（GAMEROAD.html）からの入口。本体が GAMEROAD_PUBLIC_HAND_HOOKS を
// 置いていればそれを使い、無ければ素の状態で待つ。
if (typeof window !== 'undefined') {
  const bodyHooks = window.GAMEROAD_PUBLIC_HAND_HOOKS || {};
  const bridge = createPublicHandBridge({
    getMatch: bodyHooks.getMatch || (() => null),
    cardLabel: bodyHooks.cardLabel || ((id) => id),
    cardPower: bodyHooks.cardPower || (() => null),
    cardFace: bodyHooks.cardFace || null,
    log: bodyHooks.log || (() => {}),
  });
  window.GAMEROAD_PUBLIC_HAND = bridge;
  // 入口の数字（公開・裏の枚数）を対戦の進行に合わせて保つ。
  setInterval(() => { try { bridge.refresh(); } catch { /* 画面が無い間は黙る */ } }, 2000);
}
