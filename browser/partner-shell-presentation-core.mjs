const MENU_ITEMS = Object.freeze([
  Object.freeze({ id: 'detail', label: '人物詳細', action: 'OPEN_ACTIVE_DETAIL', targetView: 'detail' }),
  Object.freeze({ id: 'list', label: 'パートナー変更', action: 'OPEN_LIST', targetView: 'list' }),
  Object.freeze({ id: 'formation', label: '編成', action: 'OPEN_FORMATION', targetView: 'formation' }),
  Object.freeze({ id: 'strategy', label: '作戦', action: 'OPEN_STRATEGY', targetView: 'strategy' }),
  Object.freeze({ id: 'conversation', label: '話す', action: 'OPEN_CONVERSATION', targetView: 'conversation' }),
  Object.freeze({ id: 'dialogue_feedback', label: 'セリフ・声調整', action: 'OPEN_DIALOGUE_FEEDBACK', targetView: 'dialogue_feedback' }),
  Object.freeze({ id: 'tea', label: 'お茶会', action: 'OPEN_TEA', targetView: 'tea' }),
]);

const VIEW_META = Object.freeze({
  hub: Object.freeze({ title: 'パートナー', surfaceKind: 'hub' }),
  list: Object.freeze({ title: 'パートナー変更', surfaceKind: 'panel' }),
  detail: Object.freeze({ title: '人物詳細', surfaceKind: 'panel' }),
  formation: Object.freeze({ title: '編成', surfaceKind: 'panel' }),
  strategy: Object.freeze({ title: '作戦', surfaceKind: 'panel' }),
  conversation: Object.freeze({ title: '話す', surfaceKind: 'mode_entry' }),
  dialogue_feedback: Object.freeze({ title: 'セリフ・声調整', surfaceKind: 'panel' }),
  tea: Object.freeze({ title: 'お茶会', surfaceKind: 'mode_entry' }),
});

const VIEWS = new Set(Object.keys(VIEW_META));
const HUB_ACTION_TARGET = new Map(MENU_ITEMS.map((item) => [item.action, item.targetView]));

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
  if (view === 'hub') return MENU_ITEMS.map((item) => item.action);
  if (view === 'list') return ['OPEN_DETAIL', 'BACK_HUB'];
  if (view === 'detail') return ['BACK_LIST', 'BACK_HUB'];
  return ['BACK_HUB'];
}

function projectPostBattleLine(input) {
  const raw = input?.postBattleLine;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sourceLineId = token(raw.sourceLineId);
  const text = token(raw.text);
  const sourceStateIdentity = token(raw.sourceStateIdentity);
  const versions = raw.versions && typeof raw.versions === 'object' && !Array.isArray(raw.versions)
    ? Object.freeze({
      rules: token(raw.versions.rules),
      content: token(raw.versions.content),
      state: token(raw.versions.state),
    })
    : null;
  if (!sourceLineId || !text || !sourceStateIdentity || !versions?.rules || !versions?.content || !versions?.state) return null;
  return Object.freeze({ sourceLineId, text, sourceStateIdentity, versions });
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
  const requestedDetailPartnerId = token(input.detailPartnerId);
  const detailPartnerId = view === 'detail' ? (requestedDetailPartnerId ?? activePartnerId) : null;
  const detailPartner = detailPartnerId
    ? roster.find((entry) => entry.partnerId === detailPartnerId) ?? null
    : null;

  const formationPartnerIds = Array.isArray(input.formationPartnerIds)
    ? Object.freeze(input.formationPartnerIds.map(token).filter(Boolean))
    : Object.freeze([]);
  const strategyId = token(input.strategyId);
  const postBattleLine = projectPostBattleLine(input);
  const meta = VIEW_META[view];

  return Object.freeze({
    view,
    viewTitle: meta.title,
    surfaceKind: meta.surfaceKind,
    activePartnerId,
    activePartner,
    roster,
    detailPartner,
    formationPartnerIds,
    strategyId,
    postBattleLine,
    hubMenuItems: view === 'hub' ? MENU_ITEMS : Object.freeze([]),
    availableActions: Object.freeze(actionsFor(view)),
    deadButtonAllowed: false,
    readOnlyProjection: true,
  });
}

export function nextPartnerShellView(currentView, action) {
  const view = VIEWS.has(currentView) ? currentView : 'hub';
  if (view === 'hub' && HUB_ACTION_TARGET.has(action)) return HUB_ACTION_TARGET.get(action);
  switch (action) {
    case 'OPEN_DETAIL': return view === 'list' ? 'detail' : view;
    case 'BACK_LIST': return view === 'detail' ? 'list' : view;
    case 'BACK_HUB': return 'hub';
    default: return view;
  }
}

export const PARTNER_SHELL_VIEWS = Object.freeze([...VIEWS]);
export const PARTNER_HUB_MENU_ITEMS = MENU_ITEMS;
