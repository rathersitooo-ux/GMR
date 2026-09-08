const PROFILE_PRESENTATION_VERSION = 'PROFILE_IDENTITY_PRESENTATION_R1C';
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
[data-screen="profile"] .profileStats{display:flex;flex-direction:column;gap:12px}
[data-screen="profile"] .profileIdentitySummary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
[data-screen="profile"] .profileIdentityCard{min-height:92px;border:1px solid var(--line);background:linear-gradient(145deg,rgba(14,47,39,.82),rgba(6,20,17,.86));padding:11px;display:grid;grid-template-columns:48px minmax(0,1fr);gap:10px;align-items:center}
[data-screen="profile"] .profileIdentityMark{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,208,123,.62);background:#0c3028;color:var(--gold);font-size:20px;font-weight:1000}
[data-screen="profile"] .profileIdentityCard[data-role="partner"] .profileIdentityMark{border-color:rgba(154,240,213,.62);color:var(--a)}
[data-screen="profile"] .profileIdentityCopy{min-width:0}
[data-screen="profile"] .profileIdentityCopy span{display:block;color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.08em;line-height:1.35}
[data-screen="profile"] .profileIdentityCopy b{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px}
[data-screen="profile"] .profileRecordsNote{border-left:3px solid var(--a);background:rgba(154,240,213,.06);padding:9px 10px;color:#c9ddd6;font-size:12px;line-height:1.45}
[data-screen="profile"] .profileActions{margin-top:auto}
[data-screen="records"] #recordsList .record[data-records-selectable="true"]{cursor:pointer;outline:1px solid transparent;outline-offset:2px;transition:transform .14s ease,outline-color .14s ease,background-color .14s ease}
[data-screen="records"] #recordsList .record[data-records-selectable="true"]:focus-visible{outline:2px solid var(--a);outline-offset:3px}
[data-screen="records"] #recordsList .record[data-records-selected="true"]{outline:2px solid var(--a);outline-offset:2px;transform:translateY(-2px);background:rgba(154,240,213,.08)}
[data-screen="records"] .recordsMatchDetail{margin-top:10px;border:1px solid var(--line);border-left:4px solid var(--a);background:linear-gradient(145deg,rgba(14,47,39,.88),rgba(6,20,17,.9));padding:12px;display:grid;gap:7px}
[data-screen="records"] .recordsMatchDetail[hidden]{display:none!important}
[data-screen="records"] .recordsMatchDetail h3{margin:0;font-size:14px;color:var(--a);letter-spacing:.03em}
[data-screen="records"] .recordsMatchDetailSummary{margin:0;font-size:13px;line-height:1.55;color:#eef7f3}
[data-screen="records"] .recordsMatchDetailDeck{margin:0;padding-top:7px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;line-height:1.45;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:540px) and (orientation:portrait){[data-screen="profile"] .profileIdentitySummary{grid-template-columns:1fr}[data-screen="profile"] .profileIdentityCard{min-height:72px}[data-screen="records"] .recordsMatchDetail{padding:10px}}
@media(max-height:470px) and (orientation:landscape){[data-screen="profile"] .profileStats{gap:6px;padding:8px}[data-screen="profile"] .profileIdentityCard{min-height:58px;padding:6px;grid-template-columns:36px minmax(0,1fr);gap:7px}[data-screen="profile"] .profileIdentityMark{width:36px;height:36px;font-size:16px}[data-screen="profile"] .profileIdentityCopy b{font-size:12px}[data-screen="profile"] .profileRecordsNote{padding:5px 7px;font-size:10px;line-height:1.35}.profileActions{margin-top:0}[data-screen="records"] .recordsMatchDetail{margin-top:6px;padding:7px;gap:4px}[data-screen="records"] .recordsMatchDetail h3{font-size:11px}[data-screen="records"] .recordsMatchDetailSummary,[data-screen="records"] .recordsMatchDetailDeck{font-size:10px;line-height:1.35}}
@media(prefers-reduced-motion:reduce){[data-screen="records"] #recordsList .record[data-records-selectable="true"]{transition:none}[data-screen="records"] #recordsList .record[data-records-selected="true"]{transform:none}}
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
  const card = cardData?.get?.(id) ?? cardData?.[id] ?? cardData?.[key] ?? null;
  const name = cleanText(card?.name, 80);
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

  let summary = stats.querySelector('.profileIdentitySummary');
  if (!summary) {
    summary = doc.createElement('section');
    summary.className = 'profileIdentitySummary';
    summary.setAttribute('aria-label', 'プロフィールの人物');
    stats.prepend(summary);
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

  const recordsButton = stats.querySelector('[data-go="records"]');
  if (recordsButton) recordsButton.textContent = '対戦記録を見る';
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