const VIEWS = new Set(['hub', 'list', 'detail', 'formation', 'strategy']);

function token(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 ? value : null;
}

function freezeArray(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)));
}

function projectRoster(roster) {
  if (!Array.isArray(roster)) return freezeArray([]);
  const seen = new Set();
  const out = [];
  for (const raw of roster) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const partnerId = token(raw.partnerId);
    if (!partnerId || seen.has(partnerId)) continue;
    seen.add(partnerId);
    out.push({
      partnerId,
      displayName: token(raw.displayName),
      portraitRef: token(raw.portraitRef),
    });
  }
  return freezeArray(out);
}

function actionsFor(view) {
  if (view === 'hub') return ['OPEN_LIST', 'OPEN_FORMATION', 'OPEN_STRATEGY'];
  if (view === 'list') return ['OPEN_DETAIL', 'BACK_HUB'];
  if (view === 'detail') return ['BACK_LIST', 'BACK_HUB'];
  return ['BACK_HUB'];
}

export function buildPartnerShellView(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('partner shell input must be an object');
  }

  const activePartnerId = token(input.activePartnerId);
  if (!activePartnerId) {
    throw new TypeError('activePartnerId is required; Partner Shell never auto-picks a partner');
  }

  const view = VIEWS.has(input.view) ? input.view : 'hub';
  const roster = projectRoster(input.roster);
  const activePartner = roster.find((entry) => entry.partnerId === activePartnerId) ?? null;
  const detailPartnerId = view === 'detail' ? token(input.detailPartnerId) : null;
  const detailPartner = detailPartnerId
    ? roster.find((entry) => entry.partnerId === detailPartnerId) ?? null
    : null;

  const formationPartnerIds = Array.isArray(input.formationPartnerIds)
    ? Object.freeze(input.formationPartnerIds.map(token).filter(Boolean))
    : Object.freeze([]);
  const strategyId = token(input.strategyId);

  return Object.freeze({
    view,
    activePartnerId,
    activePartner,
    roster,
    detailPartner,
    formationPartnerIds,
    strategyId,
    availableActions: Object.freeze(actionsFor(view)),
    readOnlyProjection: true,
  });
}

export function nextPartnerShellView(currentView, action) {
  const view = VIEWS.has(currentView) ? currentView : 'hub';
  switch (action) {
    case 'OPEN_LIST': return view === 'hub' ? 'list' : view;
    case 'OPEN_DETAIL': return view === 'list' ? 'detail' : view;
    case 'OPEN_FORMATION': return view === 'hub' ? 'formation' : view;
    case 'OPEN_STRATEGY': return view === 'hub' ? 'strategy' : view;
    case 'BACK_LIST': return view === 'detail' ? 'list' : view;
    case 'BACK_HUB': return 'hub';
    default: return view;
  }
}

export const PARTNER_SHELL_VIEWS = Object.freeze([...VIEWS]);
