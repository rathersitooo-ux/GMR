const PROFILE_PRESENTATION_VERSION = 'PROFILE_IDENTITY_PRESENTATION_R1B';
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
  if (doc.getElementById('gameroad-profile-identity-r1b-style')) return;
  const style = doc.createElement('style');
  style.id = 'gameroad-profile-identity-r1b-style';
  style.textContent = `
[data-screen="profile"] .profileLegacyMetrics{display:none!important}
[data-screen="profile"] .profileStats{display:flex;flex-direction:column;gap:12px}
[data-screen="profile"] .profileIdentitySummary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
[data-screen="profile"] .profileIdentityCard{min-height:92px;border:1px solid var(--line);background:linear-gradient(145deg,rgba(14,47,39,.82),rgba(6,20,17,.86));padding:11px;display:grid;grid-template-columns:48px minmax(0,1fr);gap:10px;align-items:center}
[data-screen="profile"] .profileIdentityMark{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,208,123,.62);background:#0c3028;color:var(--gold);font-size:20px;font-weight:1000}
[data-screen="profile"] .profileIdentityCard[data-role="partner"] .profileIdentityMark{border-color:rgba(154,240,213,.62);color:var(--a)}
[data-screen="profile"] .profileIdentityCopy{min-width:0}
[data-screen="profile"] .profileIdentityCopy span{display:block;color:var(--muted);font-size:8px;font-weight:900;letter-spacing:.08em}
[data-screen="profile"] .profileIdentityCopy b{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px}
[data-screen="profile"] .profileRecordsNote{border-left:3px solid var(--a);background:rgba(154,240,213,.06);padding:9px 10px;color:#c9ddd6;font-size:9px;line-height:1.5}
[data-screen="profile"] .profileActions{margin-top:auto}
@media(max-width:540px) and (orientation:portrait){[data-screen="profile"] .profileIdentitySummary{grid-template-columns:1fr}[data-screen="profile"] .profileIdentityCard{min-height:72px}}
@media(max-height:470px) and (orientation:landscape){[data-screen="profile"] .profileStats{gap:6px;padding:8px}[data-screen="profile"] .profileIdentityCard{min-height:58px;padding:6px;grid-template-columns:36px minmax(0,1fr);gap:7px}[data-screen="profile"] .profileIdentityMark{width:36px;height:36px;font-size:16px}[data-screen="profile"] .profileIdentityCopy b{font-size:12px}[data-screen="profile"] .profileRecordsNote{padding:5px 7px;font-size:8px}.profileActions{margin-top:0}}
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
  const screen = doc.querySelector('section[data-screen="profile"]');
  if (!screen) return;
  const refresh = () => {
    if (screen.classList.contains('active')) mountProfilePresentation(doc, win);
  };
  const observer = new win.MutationObserver(refresh);
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  win.addEventListener?.('pageshow', refresh);
  refresh();
  win.GAMEROAD_PROFILE_PRESENTATION = Object.freeze({
    version: PROFILE_PRESENTATION_VERSION,
    refresh,
    snapshot: () => mountProfilePresentation(doc, win),
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') installRuntime(document, window);

export const PROFILE_PRESENTATION_CONTRACT = Object.freeze({
  version: PROFILE_PRESENTATION_VERSION,
  source: 'GAMEROAD_PARTNER_STATE',
  publicFieldAllowlist: ALLOWED_PUBLIC_FIELDS,
  favoriteCardsRequireOwnershipAuthority: true,
  maxFavoriteCards: 3,
  publicDeck: false,
  freeComment: false,
  detailedRecordsRoute: 'records',
  persistence: 'none',
});
