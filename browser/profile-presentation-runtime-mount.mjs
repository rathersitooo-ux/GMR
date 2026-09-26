const PROFILE_PRESENTATION_VERSION = 'PROFILE_IDENTITY_PRESENTATION_R1C';

export const PROFILE_RECORDS_SELECTION_SWEEP_ASSET = Object.freeze({
  id: 'records-selection-sweep-sprite-v1',
  sourcePath: 'assets/visual/effects/records-selection-sweep-sprite-v1.png',
  runtimePath: '../assets/visual/effects/records-selection-sweep-sprite-v1.png',
  formal: true,
  presentationOnly: true,
  frameCount: 4,
  frameLayout: 'horizontal-4-up',
});
const PROFILE_RECORDS_SELECTION_SWEEP_URL = new URL(
  PROFILE_RECORDS_SELECTION_SWEEP_ASSET.runtimePath,
  import.meta.url,
).href;
const ALLOWED_PUBLIC_FIELDS = Object.freeze(['rank', 'rating', 'publicPlayerId', 'mode']);

function cleanText(value, max = 80) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanText(value.id, 120);
  const name = cleanText(value.name, 80);
  if (!id || !name) return null;
  return Object.freeze({ id, name });
}

export function projectProfilePresentation({
  player = null,
  partner = null,
  publicFields = null,
  favoriteCards = null,
  ownershipAuthoritative = false,
} = {}) {
  const identities = Object.freeze({
    player: cleanIdentity(player),
    partner: cleanIdentity(partner),
  });

  const stats = {};
  if (publicFields && typeof publicFields === 'object' && !Array.isArray(publicFields)) {
    for (const key of ALLOWED_PUBLIC_FIELDS) {
      const value = cleanText(publicFields[key], 80);
      if (value) stats[key] = value;
    }
  }

  const favorites = [];
  if (ownershipAuthoritative && Array.isArray(favoriteCards)) {
    const seen = new Set();
    for (const raw of favoriteCards) {
      if (!raw || typeof raw !== 'object' || raw.owned !== true) continue;
      const id = cleanText(raw.id, 120);
      const name = cleanText(raw.name, 80);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      favorites.push(Object.freeze({ id, name }));
      if (favorites.length === 3) break;
    }
  }

  return Object.freeze({
    version: PROFILE_PRESENTATION_VERSION,
    identities,
    publicFields: Object.freeze(stats),
    favoriteCards: Object.freeze(favorites),
    detailedRecordsRoute: 'records',
    publicDeck: false,
    freeComment: false,
  });
}

export function readCurrentProfileAuthority(win = globalThis) {
  const source = win?.GAMEROAD_PARTNER_STATE;
  const player = typeof source?.player === 'function' ? source.player() : null;
  const partner = typeof source?.partner === 'function' ? source.partner() : null;
  return projectProfilePresentation({ player, partner });
}

function ensureStyle(doc) {
  if (doc.getElementById('gameroad-profile-presentation-r1c-style')) return;
  const style = doc.createElement('style');
  style.id = 'gameroad-profile-presentation-r1c-style';
  style.textContent = `
[data-screen="profile"] .profileLegacyMetrics{display:none!important}
[data-screen="profile"] .profileLayout{grid-template-columns:minmax(280px,.9fr) minmax(360px,1.35fr);gap:14px;min-height:0}
[data-screen="profile"] .profileStage,[data-screen="profile"] .profileStats{min-width:0;min-height:0}
[data-screen="profile"] .profileStage{isolation:isolate;background:radial-gradient(circle at 50% 24%,rgba(154,240,213,.18),transparent 34%),linear-gradient(165deg,rgba(14,47,39,.9),rgba(5,18,16,.98))}
[data-screen="profile"] .profileStage::before{content:"";position:absolute;inset:7%;border:1px solid rgba(154,240,213,.12);clip-path:polygon(0 0,100% 0,100% 74%,78% 100%,0 100%);pointer-events:none}
[data-screen="profile"] .profileStage::after{content:"";position:absolute;inset:auto -18% -22% 22%;height:48%;background:radial-gradient(ellipse at center,rgba(154,240,213,.16),transparent 68%);filter:blur(18px);pointer-events:none}
[data-screen="profile"] .profileStage .profileName{z-index:3;padding:12px 14px;background:linear-gradient(90deg,rgba(4,17,15,.92),rgba(4,17,15,.42),transparent);border-left:3px solid var(--a)}
[data-screen="profile"] .profileStage .profileName h2{margin:4px 0 0;font-size:clamp(22px,2.6vw,34px)}
[data-screen="profile"] .profileStats{position:relative;isolation:isolate;display:flex;flex-direction:column;gap:12px;background:linear-gradient(155deg,rgba(9,31,26,.94),rgba(5,18,16,.98));overflow:auto}
[data-screen="profile"] .profileStats::before{content:"";position:absolute;inset:-35% -18% auto 42%;height:64%;background:radial-gradient(circle,rgba(255,208,123,.09),transparent 67%);pointer-events:none;z-index:-1}
[data-screen="profile"] .profileOverviewHead{display:grid;gap:3px;padding:2px 2px 0}
[data-screen="profile"] .profileOverviewHead span{color:var(--a);font-size:10px;font-weight:1000;letter-spacing:.15em}
[data-screen="profile"] .profileOverviewHead b{font-size:clamp(18px,2.1vw,28px);letter-spacing:.01em}
[data-screen="profile"] .profileOverviewHead small{color:var(--muted);font-size:11px;line-height:1.45}
[data-screen="profile"] .profileIdentitySummary{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.85fr);gap:8px}
[data-screen="profile"] .profileIdentityCard{position:relative;min-height:92px;border:1px solid var(--line);background:linear-gradient(145deg,rgba(14,47,39,.9),rgba(6,20,17,.92));padding:11px;display:grid;grid-template-columns:48px minmax(0,1fr);gap:10px;align-items:center;overflow:hidden}
[data-screen="profile"] .profileIdentityCard::after{content:"";position:absolute;width:90px;height:90px;border:1px solid rgba(154,240,213,.11);right:-48px;top:-42px;transform:rotate(34deg);pointer-events:none}
[data-screen="profile"] .profileIdentityCard[data-role="player"]{min-height:116px;border-color:rgba(255,208,123,.38);background:linear-gradient(145deg,rgba(35,55,38,.92),rgba(8,27,23,.96))}
[data-screen="profile"] .profileIdentityCard[data-role="player"] .profileIdentityMark{width:58px;height:58px;font-size:22px;box-shadow:0 0 0 5px rgba(255,208,123,.05)}
[data-screen="profile"] .profileIdentityMark{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,208,123,.62);background:#0c3028;color:var(--gold);font-size:20px;font-weight:1000}
[data-screen="profile"] .profileIdentityCard[data-role="partner"] .profileIdentityMark{border-color:rgba(154,240,213,.62);color:var(--a)}
[data-screen="profile"] .profileIdentityCopy{min-width:0}
[data-screen="profile"] .profileIdentityCopy span{display:block;color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.08em;line-height:1.35}
[data-screen="profile"] .profileIdentityCopy b{display:-webkit-box;margin-top:3px;overflow:hidden;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;font-size:16px;line-height:1.2}
[data-screen="profile"] .profileIdentityCard[data-role="player"] .profileIdentityCopy b{font-size:20px}
[data-screen="profile"] .profileRecordsNote{border:1px solid rgba(154,240,213,.18);border-left:4px solid var(--a);background:rgba(154,240,213,.065);padding:10px 12px;color:#d9ebe5;font-size:12px;line-height:1.5}
[data-screen="profile"] .profileActions{display:grid;grid-template-columns:minmax(0,1.45fr) repeat(2,minmax(0,1fr));gap:7px;margin-top:auto}
[data-screen="profile"] .profileActions .btn{min-height:46px;width:100%;white-space:normal;line-height:1.2}
[data-screen="profile"] .profileActions [data-go="records"]{border-color:rgba(154,240,213,.72);background:linear-gradient(180deg,rgba(24,89,72,.95),rgba(10,48,39,.95));box-shadow:0 0 0 1px rgba(154,240,213,.08) inset}
[data-screen="profile"] .profileActions [data-go="characters"],[data-screen="profile"] .profileActions [data-go="settings"]{background:rgba(7,28,23,.86)}
[data-screen="records"] #recordsList .record[data-records-selectable="true"]{position:relative;isolation:isolate;cursor:pointer;outline:1px solid transparent;outline-offset:2px;transition:transform .14s ease,outline-color .14s ease,background-color .14s ease}
[data-screen="records"] #recordsList .record[data-records-selectable="true"]:focus-visible{outline:2px solid var(--a);outline-offset:3px}
[data-screen="records"] #recordsList .record[data-records-selected="true"]{outline:2px solid var(--a);outline-offset:2px;transform:translateY(-2px);background:rgba(154,240,213,.08)}
[data-screen="records"] #recordsList .record[data-records-selectable="true"]:active{transform:translateY(1px) scale(.992);filter:brightness(.94);background-color:rgba(154,240,213,.045);transition-duration:.06s}
[data-screen="records"] #recordsList .record[data-records-selected="true"]::after{content:"";position:absolute;inset:0;z-index:1;border-radius:inherit;pointer-events:none;background-image:url('${PROFILE_RECORDS_SELECTION_SWEEP_URL}');background-repeat:no-repeat;background-size:400% 100%;background-position:0% 50%;mix-blend-mode:screen;opacity:0;will-change:background-position,opacity;animation:gameroadRecordsSelectionSweep .72s steps(4,end) both}
@keyframes gameroadRecordsSelectionSweep{0%{background-position:0% 50%;opacity:0}15%{background-position:0% 50%;opacity:var(--records-selection-sweep-alpha,.72)}40%{background-position:33.333% 50%;opacity:var(--records-selection-sweep-alpha,.7)}66%{background-position:66.667% 50%;opacity:var(--records-selection-sweep-alpha,.56)}86%{background-position:100% 50%;opacity:var(--records-selection-sweep-alpha,.32)}100%{background-position:100% 50%;opacity:0}}
html.r10LowPerf{--records-selection-sweep-alpha:.44}
html.r10Reduced{--records-selection-sweep-alpha:.26}
[data-screen="records"] .recordsMatchDetail{margin-top:10px;border:1px solid var(--line);border-left:4px solid var(--a);background:linear-gradient(145deg,rgba(14,47,39,.88),rgba(6,20,17,.9));padding:12px;display:grid;gap:7px;transform-origin:50% 0;animation:gameroadRecordsDetailReveal .18s cubic-bezier(.2,.78,.24,1) both}
@keyframes gameroadRecordsDetailReveal{0%{opacity:.08;transform:translateY(5px) scale(.995)}55%{opacity:1;transform:translateY(0) scale(1.002)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes gameroadRecordsDetailFade{0%{opacity:.12}100%{opacity:1}}
html.r10LowPerf [data-screen="records"] .recordsMatchDetail,html.r10Reduced [data-screen="records"] .recordsMatchDetail{animation:gameroadRecordsDetailFade .1s linear both}
[data-screen="records"] .recordsMatchDetail[hidden]{display:none!important}
[data-screen="records"] .recordsMatchDetail h3{margin:0;font-size:14px;color:var(--a);letter-spacing:.03em}
[data-screen="records"] .recordsMatchDetailSummary{margin:0;font-size:13px;line-height:1.55;color:#eef7f3}
[data-screen="records"] .recordsMatchDetailDeck{margin:0;padding-top:7px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;line-height:1.45;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:540px) and (orientation:portrait){[data-screen="profile"] .profileLayout{grid-template-columns:1fr;grid-template-rows:minmax(240px,38vh) auto;height:auto;min-height:calc(100% - 70px);gap:9px;overflow:visible}[data-screen="profile"] .profileStage{min-height:240px}[data-screen="profile"] .profileStats{overflow:visible}[data-screen="profile"] .profileOverviewHead b{font-size:20px}[data-screen="profile"] .profileIdentitySummary{grid-template-columns:1fr}[data-screen="profile"] .profileIdentityCard,[data-screen="profile"] .profileIdentityCard[data-role="player"]{min-height:82px}[data-screen="profile"] .profileIdentityCard[data-role="player"] .profileIdentityMark{width:48px;height:48px;font-size:20px}[data-screen="profile"] .profileActions{grid-template-columns:1fr 1fr;margin-top:4px}[data-screen="profile"] .profileActions [data-go="records"]{grid-column:1/-1}[data-screen="profile"] .profileActions .btn{min-height:46px}[data-screen="records"] .recordsMatchDetail{padding:10px}}
@media(max-height:470px) and (orientation:landscape){[data-screen="profile"] .profileLayout{grid-template-columns:minmax(180px,.72fr) minmax(0,1.45fr);gap:7px}[data-screen="profile"] .profileStats{gap:5px;padding:8px}[data-screen="profile"] .profileOverviewHead{gap:1px}[data-screen="profile"] .profileOverviewHead span{font-size:7px}[data-screen="profile"] .profileOverviewHead b{font-size:14px}[data-screen="profile"] .profileOverviewHead small{display:none}[data-screen="profile"] .profileIdentitySummary{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:5px}[data-screen="profile"] .profileIdentityCard,[data-screen="profile"] .profileIdentityCard[data-role="player"]{min-height:58px;padding:6px;grid-template-columns:36px minmax(0,1fr);gap:7px}[data-screen="profile"] .profileIdentityMark,[data-screen="profile"] .profileIdentityCard[data-role="player"] .profileIdentityMark{width:36px;height:36px;font-size:16px;box-shadow:none}[data-screen="profile"] .profileIdentityCard[data-role="player"] .profileIdentityCopy b,[data-screen="profile"] .profileIdentityCopy b{font-size:12px}[data-screen="profile"] .profileRecordsNote{padding:5px 7px;font-size:9px;line-height:1.3}[data-screen="profile"] .profileActions{margin-top:0;gap:5px}[data-screen="profile"] .profileActions .btn{min-height:44px;font-size:9px;padding:4px 6px}[data-screen="profile"] .profileStage .profileName{padding:6px 8px}[data-screen="profile"] .profileStage .profileName h2{font-size:18px}[data-screen="records"] .recordsMatchDetail{margin-top:6px;padding:7px;gap:4px}[data-screen="records"] .recordsMatchDetail h3{font-size:11px}[data-screen="records"] .recordsMatchDetailSummary,[data-screen="records"] .recordsMatchDetailDeck{font-size:10px;line-height:1.35}}
@media(prefers-reduced-motion:reduce){[data-screen="records"] #recordsList .record[data-records-selectable="true"]{transition:none}[data-screen="records"] #recordsList .record[data-records-selectable="true"]:active{transform:none;filter:brightness(.94)}[data-screen="records"] #recordsList .record[data-records-selected="true"]{transform:none}[data-screen="records"] #recordsList .record[data-records-selected="true"]::after{animation:none;background-position:50% 50%;opacity:.18}[data-screen="records"] .recordsMatchDetail{animation:gameroadRecordsDetailFade .09s linear both;transform:none}}
`;
  doc.head?.appendChild(style);
}

function identityCard(doc, role, label, identity) {
  if (!identity) return null;
  const card = doc.createElement('article');
  card.className = 'profileIdentityCard';
  card.dataset.role = role;
  card.setAttribute('aria-label', `${label} ${identity.name}`);

  const mark = doc.createElement('div');
  mark.className = 'profileIdentityMark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = identity.name.slice(0, 1);

  const copy = doc.createElement('div');
  copy.className = 'profileIdentityCopy';
  const kicker = doc.createElement('span');
  kicker.textContent = label;
  const name = doc.createElement('b');
  name.textContent = identity.name;
  copy.append(kicker, name);
  card.append(mark, copy);
  return card;
}

function recordSummaryText(row) {
  if (!row) return '';
  const source = typeof row.innerText === 'string' ? row.innerText : row.textContent;
  return cleanText(source, 280);
}

function historicalCardLabel(id, win = globalThis) {
  const key = cleanText(id, 120);
  if (!key) return '';
  const cardData = win?.__CARD_DATA__;
  const arrayCard = Array.isArray(cardData)
    ? cardData.find((entry) => cleanText(entry?.id, 120) === key)
    : null;
  const card = arrayCard ?? cardData?.get?.(id) ?? cardData?.[id] ?? cardData?.[key] ?? null;
  const name = cleanText(card?.display_name ?? card?.name, 80);
  return name ? `${name}（${key}）` : key;
}

function historicalDeckPart(cards, win = globalThis) {
  if (!Array.isArray(cards) || cards.length === 0) return 'なし';
  const counts = new Map();
  for (const raw of cards) {
    const id = cleanText(raw, 120);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size === 0) return 'なし';
  return Array.from(counts, ([id, count]) => {
    const label = historicalCardLabel(id, win);
    return `${label}${count > 1 ? ` ×${count}` : ''}`;
  }).join(' / ');
}

export function projectHistoricalDeckText(historyEntry, win = globalThis) {
  const snapshot = historyEntry?.deckStartSnapshot;
  const deck = snapshot?.deck;
  if (!deck || typeof deck !== 'object' || (!Array.isArray(deck.main) && !Array.isArray(deck.ex))) {
    return '使用デッキ：この対戦履歴では未記録です。';
  }

  const main = Array.isArray(deck.main) ? deck.main : [];
  const ex = Array.isArray(deck.ex) ? deck.ex : [];
  const slotName = cleanText(snapshot?.deckRef?.deckSlotName, 80);
  const slotId = cleanText(snapshot?.deckRef?.deckSlotId, 120);
  const identity = slotName ? `「${slotName}」` : slotId ? `（${slotId}）` : '';

  return [
    `使用デッキ${identity}`,
    `メイン ${main.length}枚：${historicalDeckPart(main, win)}`,
    `EX ${ex.length}枚：${historicalDeckPart(ex, win)}`,
  ].join('\n');
}

function ensureRecordsDetailPanel(doc, screen, list) {
  let panel = screen.querySelector('.recordsMatchDetail');
  if (panel) return panel;

  panel = doc.createElement('section');
  panel.className = 'recordsMatchDetail';
  panel.id = 'recordsMatchDetail';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-labelledby', 'recordsMatchDetailTitle');

  const title = doc.createElement('h3');
  title.id = 'recordsMatchDetailTitle';
  title.textContent = '選択した対戦';

  const summary = doc.createElement('p');
  summary.className = 'recordsMatchDetailSummary';

  const deck = doc.createElement('p');
  deck.className = 'recordsMatchDetailDeck';
  deck.textContent = '使用デッキ：この対戦履歴では未記録です。';

  panel.append(title, summary, deck);
  list.insertAdjacentElement('afterend', panel);
  return panel;
}

export function dismissRecordsMatchDetail(list, panel, { restoreFocus = true } = {}) {
  if (!list || !panel || panel.hidden) return false;
  const opener = panel.__gameroadRecordsOpener ?? null;
  for (const candidate of list.querySelectorAll('.record')) {
    candidate.dataset.recordsSelected = 'false';
    candidate.setAttribute('aria-expanded', 'false');
  }
  panel.hidden = true;
  panel.__gameroadRecordsOpener = null;
  if (restoreFocus && typeof opener?.focus === 'function') {
    try {
      opener.focus({ preventScroll: true });
    } catch {
      opener.focus();
    }
  }
  return true;
}

function selectRecordRow(row, list, panel) {
  if (!row || !list || !panel) return;
  panel.__gameroadRecordsOpener = row;
  for (const candidate of list.querySelectorAll('.record')) {
    const selected = candidate === row;
    candidate.dataset.recordsSelected = selected ? 'true' : 'false';
    candidate.setAttribute('aria-expanded', selected ? 'true' : 'false');
  }

  const summary = recordSummaryText(row);
  const summaryNode = panel.querySelector('.recordsMatchDetailSummary');
  if (summaryNode) summaryNode.textContent = summary || '対戦内容を確認できませんでした。';
  const deckNode = panel.querySelector('.recordsMatchDetailDeck');
  if (deckNode) deckNode.textContent = projectHistoricalDeckText(row.__gameroadHistoryEntry);
  panel.hidden = false;
}

function bindRecordsInteraction(screen, list, panel, doc) {
  if (screen.dataset.recordsInteractionBound === 'true') return;
  screen.dataset.recordsInteractionBound = 'true';

  list.addEventListener('click', (event) => {
    const row = event.target?.closest?.('.record');
    if (!row || !list.contains(row)) return;
    selectRecordRow(row, list, panel);
  });

  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target?.closest?.('.record');
    if (!row || event.target !== row || !list.contains(row)) return;
    event.preventDefault();
    selectRecordRow(row, list, panel);
  });

  doc.addEventListener('click', (event) => {
    if (panel.hidden || !screen.classList.contains('active') || panel.contains(event.target)) return;
    const row = event.target?.closest?.('.record');
    if (row && list.contains(row)) return;
    event.preventDefault();
    event.stopPropagation();
    dismissRecordsMatchDetail(list, panel);
  }, true);

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden || !screen.classList.contains('active')) return;
    event.preventDefault();
    event.stopPropagation();
    dismissRecordsMatchDetail(list, panel);
  }, true);
}

export function mountRecordsPresentation(doc = globalThis.document) {
  if (!doc?.querySelector) return Object.freeze({ ok: false, reason: 'document_unavailable' });
  const screen = doc.querySelector('section[data-screen="records"]');
  const list = screen?.querySelector('#recordsList');
  if (!screen || !list) return Object.freeze({ ok: false, reason: 'records_surface_missing' });

  ensureStyle(doc);
  const panel = ensureRecordsDetailPanel(doc, screen, list);
  const rows = Array.from(list.querySelectorAll('.record'));

  for (const row of rows) {
    const summary = recordSummaryText(row);
    row.dataset.recordsSelectable = 'true';
    if (!row.hasAttribute('role')) row.setAttribute('role', 'button');
    if (!row.hasAttribute('tabindex')) row.tabIndex = 0;
    row.setAttribute('aria-controls', panel.id);
    if (!row.hasAttribute('aria-expanded')) row.setAttribute('aria-expanded', 'false');
    if (summary) row.setAttribute('aria-label', `${summary} 詳細を開く`);
  }

  bindRecordsInteraction(screen, list, panel, doc);
  screen.dataset.recordsPresentation = PROFILE_PRESENTATION_VERSION;

  return Object.freeze({
    ok: true,
    version: PROFILE_PRESENTATION_VERSION,
    recordCount: rows.length,
    selectableCount: rows.filter((row) => row.dataset.recordsSelectable === 'true').length,
    detailVisible: !panel.hidden,
  });
}

export function mountProfilePresentation(doc = globalThis.document, win = globalThis) {
  if (!doc?.querySelector) return Object.freeze({ ok: false, reason: 'document_unavailable' });
  const screen = doc.querySelector('section[data-screen="profile"]');
  const stats = screen?.querySelector('.profileStats');
  if (!screen || !stats) return Object.freeze({ ok: false, reason: 'profile_surface_missing' });

  ensureStyle(doc);
  const projection = readCurrentProfileAuthority(win);
  const legacy = stats.querySelector('.metricGrid');
  if (legacy) {
    legacy.classList.add('profileLegacyMetrics');
    legacy.hidden = true;
    legacy.setAttribute('aria-hidden', 'true');
  }

  let overview = stats.querySelector('.profileOverviewHead');
  if (!overview) {
    overview = doc.createElement('div');
    overview.className = 'profileOverviewHead';
    const kicker = doc.createElement('span');
    kicker.textContent = '本人情報';
    const title = doc.createElement('b');
    title.textContent = '現在のプロフィール';
    const sub = doc.createElement('small');
    sub.textContent = '操作人物とパートナー';
    overview.append(kicker, title, sub);
    stats.prepend(overview);
  }

  let summary = stats.querySelector('.profileIdentitySummary');
  if (!summary) {
    summary = doc.createElement('section');
    summary.className = 'profileIdentitySummary';
    summary.setAttribute('aria-label', 'プロフィールの人物');
    overview.insertAdjacentElement('afterend', summary);
  } else if (summary.previousElementSibling !== overview) {
    overview.insertAdjacentElement('afterend', summary);
  }
  summary.replaceChildren();
  const player = identityCard(doc, 'player', '操作人物', projection.identities.player);
  const partner = identityCard(doc, 'partner', 'パートナー', projection.identities.partner);
  if (player) summary.appendChild(player);
  if (partner) summary.appendChild(partner);
  summary.hidden = summary.childElementCount === 0;

  let note = stats.querySelector('.profileRecordsNote');
  if (!note) {
    note = doc.createElement('div');
    note.className = 'profileRecordsNote';
    const actions = stats.querySelector('.profileActions');
    if (actions) stats.insertBefore(note, actions); else stats.appendChild(note);
  }
  note.textContent = '対戦の詳しい履歴は「対戦記録」で確認できます。';

  const actions = stats.querySelector('.profileActions');
  const recordsButton = stats.querySelector('[data-go="records"]');
  const partnerButton = stats.querySelector('[data-go="characters"]');
  if (recordsButton) {
    recordsButton.textContent = '対戦記録を見る';
    recordsButton.classList.add('primary');
    actions?.prepend(recordsButton);
  }
  partnerButton?.classList.remove('primary');
  screen.dataset.profilePresentation = PROFILE_PRESENTATION_VERSION;

  return Object.freeze({
    ok: true,
    version: PROFILE_PRESENTATION_VERSION,
    player: projection.identities.player,
    partner: projection.identities.partner,
    legacyMetricsHidden: !!legacy,
    favoriteCardCount: projection.favoriteCards.length,
    publicFieldCount: Object.keys(projection.publicFields).length,
  });
}

function installRuntime(doc = globalThis.document, win = globalThis) {
  if (!doc?.querySelector || !win?.MutationObserver) return;
  const profileScreen = doc.querySelector('section[data-screen="profile"]');
  const recordsScreen = doc.querySelector('section[data-screen="records"]');
  if (!profileScreen && !recordsScreen) return;

  const refresh = () => {
    if (profileScreen?.classList.contains('active')) mountProfilePresentation(doc, win);
    if (recordsScreen?.classList.contains('active')) mountRecordsPresentation(doc);
  };

  if (profileScreen) {
    const profileObserver = new win.MutationObserver(refresh);
    profileObserver.observe(profileScreen, { attributes: true, attributeFilter: ['class'] });
  }
  if (recordsScreen) {
    const recordsObserver = new win.MutationObserver(refresh);
    recordsObserver.observe(recordsScreen, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  win.addEventListener?.('pageshow', refresh);
  refresh();
  win.GAMEROAD_PROFILE_PRESENTATION = Object.freeze({
    version: PROFILE_PRESENTATION_VERSION,
    refresh,
    snapshot: () => mountProfilePresentation(doc, win),
    recordsSnapshot: () => mountRecordsPresentation(doc),
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') installRuntime(document, window);

export const PROFILE_PRESENTATION_CONTRACT = Object.freeze({
  version: PROFILE_PRESENTATION_VERSION,
  source: 'GAMEROAD_PARTNER_STATE',
  recordsSurfaceSource: '#recordsList .record',
  publicFieldAllowlist: ALLOWED_PUBLIC_FIELDS,
  favoriteCardsRequireOwnershipAuthority: true,
  maxFavoriteCards: 3,
  publicDeck: false,
  freeComment: false,
  detailedRecordsRoute: 'records',
  recordsPersistence: 'existing-history-only',
  persistence: 'none',
});