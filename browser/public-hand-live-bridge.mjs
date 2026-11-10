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
  const { getMatch, cardLabel, cardPower, log } = hooks;
  let selectedPlayerId = null;

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
      bar.style.cssText = 'position:absolute;left:10px;bottom:118px;z-index:60;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:60vw;font:12px/1.4 system-ui;color:#eef2ff';
      bar.setAttribute('aria-label', '相手の公開手札を見る入口');
      battle.appendChild(bar);
    }
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('aside');
      panel.id = PANEL_ID;
      panel.className = 'publicHandPanel';
      // 詳細は左側（マスターデュエルと同じ側、2026-11-10の決め）。
      panel.style.cssText = 'position:absolute;left:10px;top:86px;z-index:70;width:min(300px,80vw);max-height:62%;overflow:auto;background:#141a2e;color:#eef2ff;border:1px solid #3a4a7a;border-radius:12px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);font:13px/1.5 system-ui';
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
      btn.style.cssText = 'background:#232c4a;color:#eef2ff;border:1px solid #3a4a7a;border-radius:999px;padding:4px 10px;cursor:pointer;font:12px system-ui';
      btn.textContent = `${row.name}（公開${row.publicCards.length}・裏${row.hiddenCount}）`;
      btn.addEventListener('click', () => openPanel(row.playerId));
      bar.appendChild(btn);
    }
    if (selectedPlayerId) renderPanel();
  }

  function openPanel(playerId) {
    selectedPlayerId = playerId;
    renderPanel();
    const dom = ensureDom();
    if (dom) dom.panel.hidden = false;
  }

  function closePanel() {
    selectedPlayerId = null;
    const dom = ensureDom();
    if (dom) dom.panel.hidden = true;
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
    if (!row || !row.publicCards.length) {
      const none = document.createElement('p');
      none.className = 'publicHandNone';
      none.textContent = '公開されている手札はまだありません。';
      panel.appendChild(none);
    } else {
      const list = document.createElement('div');
      list.className = 'publicHandCards';
      for (const id of row.publicCards) {
        const chip = document.createElement('div');
        chip.className = 'publicHandCard';
        chip.style.cssText = 'background:#232c4a;border:1px solid #3a4a7a;border-radius:8px;padding:6px 8px;margin-bottom:6px';
        const label = cardLabel ? cardLabel(id) : id;
        const power = cardPower ? cardPower(id) : null;
        chip.textContent = power != null ? `${label}（強さ${power}）` : label;
        list.appendChild(chip);
      }
      panel.appendChild(list);
    }
    if (row && row.hiddenCount > 0) {
      const backs = document.createElement('p');
      backs.className = 'publicHandBacks';
      backs.textContent = `裏向き（中身は見えない）：${row.hiddenCount}枚`;
      panel.appendChild(backs);
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
    log: bodyHooks.log || (() => {}),
  });
  window.GAMEROAD_PUBLIC_HAND = bridge;
  // 入口の数字（公開・裏の枚数）を対戦の進行に合わせて保つ。
  setInterval(() => { try { bridge.refresh(); } catch { /* 画面が無い間は黙る */ } }, 2000);
}
