export const RANK_MATCH_ENTRY_SCHEMA = 'gameroad.rank-match-entry.v1';

export const RANK_MATCH_WAITING_TEXTURE = Object.freeze({
  role: 'generated_reference_texture',
  path: '../assets/visual/rank/rank-match-waiting-skin-v1.webp',
  source: 'attached_rank_match_reference',
  canvas: Object.freeze({ width: 1536, height: 864 }),
});

// Normalized anchors measured from the supplied 1536x864 reference. The runtime keeps these
// anchors in CSS percentages so the generated texture and the live controls share one frame.
export const RANK_MATCH_REFERENCE_LAYOUT = Object.freeze({
  breadcrumb: Object.freeze({ left: 0.081, top: 0.035 }),
  panel: Object.freeze({ left: 0.122, top: 0.123, width: 0.781, height: 0.522 }),
  rail: Object.freeze({ left: 0.122, top: 0.123, width: 0.111, height: 0.522 }),
  center: Object.freeze({ left: 0.252, top: 0.153, width: 0.352, height: 0.388 }),
  rank: Object.freeze({ left: 0.603, top: 0.172, width: 0.205, height: 0.303 }),
  action: Object.freeze({ left: 0.764, top: 0.421, width: 0.106, height: 0.191 }),
  status: Object.freeze({ left: 0.326, top: 0.703, width: 0.354, height: 0.072 }),
});

const VALID_SEARCH_STATES = new Set(['ready', 'searching', 'cancelled']);

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveOr(value, fallback) {
  const number = finiteOr(value, fallback);
  return number > 0 ? number : fallback;
}

function freezeBox(box) {
  return Object.freeze({
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  });
}

function projectBox(box, width, height) {
  return freezeBox({
    left: Math.round(box.left * width),
    top: Math.round(box.top * height),
    width: Math.round(box.width * width),
    height: Math.round(box.height * height),
  });
}

export function projectRankMatchWaitingLayout({ viewportWidth = 1536, viewportHeight = 864 } = {}) {
  const width = positiveOr(viewportWidth, 1536);
  const height = positiveOr(viewportHeight, 864);
  return Object.freeze({
    schema: `${RANK_MATCH_ENTRY_SCHEMA}.layout`,
    reference: Object.freeze({ ...RANK_MATCH_WAITING_TEXTURE.canvas }),
    viewport: Object.freeze({ width, height }),
    breadcrumb: freezeBox({
      left: RANK_MATCH_REFERENCE_LAYOUT.breadcrumb.left * width,
      top: RANK_MATCH_REFERENCE_LAYOUT.breadcrumb.top * height,
      width: 0,
      height: 0,
    }),
    panel: projectBox(RANK_MATCH_REFERENCE_LAYOUT.panel, width, height),
    rail: projectBox(RANK_MATCH_REFERENCE_LAYOUT.rail, width, height),
    center: projectBox(RANK_MATCH_REFERENCE_LAYOUT.center, width, height),
    rank: projectBox(RANK_MATCH_REFERENCE_LAYOUT.rank, width, height),
    action: projectBox(RANK_MATCH_REFERENCE_LAYOUT.action, width, height),
    status: projectBox(RANK_MATCH_REFERENCE_LAYOUT.status, width, height),
  });
}

export function createRankMatchEntryState({
  screen = 'home',
  searchState = 'ready',
  rankChoiceVisible = false,
  waitingVisible = false,
} = {}) {
  const normalizedScreen = String(screen || 'home');
  const normalizedSearchState = VALID_SEARCH_STATES.has(searchState) ? searchState : 'ready';
  const onSetup = normalizedScreen === 'setup';
  return Object.freeze({
    schema: RANK_MATCH_ENTRY_SCHEMA,
    screen: normalizedScreen,
    homeRankTextVisible: false,
    setupRankChoiceVisible: onSetup && rankChoiceVisible === true,
    waitingVisible: onSetup && waitingVisible === true,
    searchState: normalizedSearchState,
    presentationSource: RANK_MATCH_WAITING_TEXTURE.path,
    gameplayAuthorityChanged: false,
  });
}

export function resolveRankMatchEntryAction({ screen = 'home', action = '' } = {}) {
  const normalizedScreen = String(screen || 'home');
  const normalizedAction = String(action || '');
  if (normalizedScreen !== 'setup') {
    return Object.freeze({ ok: false, reason: 'SETUP_REQUIRED', screen: normalizedScreen, action: normalizedAction });
  }
  if (normalizedAction === 'open-waiting') {
    return Object.freeze({ ok: true, next: 'waiting', screen: normalizedScreen, action: normalizedAction });
  }
  if (normalizedAction === 'start-search') {
    return Object.freeze({ ok: true, next: 'searching', screen: normalizedScreen, action: normalizedAction });
  }
  if (normalizedAction === 'cancel-search') {
    return Object.freeze({ ok: true, next: 'cancelled', screen: normalizedScreen, action: normalizedAction });
  }
  return Object.freeze({ ok: false, reason: 'UNKNOWN_ACTION', screen: normalizedScreen, action: normalizedAction });
}
