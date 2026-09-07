const SCHEMA = 'gameroad.partner-advice-evidence-presentation.v1';
const STYLE_ID = 'gameroad-partner-advice-evidence-r1-style';
const ROOT_ROLE = 'partner-advice-evidence';

const SHARED_REASON_TEXT = Object.freeze({
  LEFTMOST: '左側を優先する作戦設定から',
  RIGHTMOST: '右側を優先する作戦設定から',
  MAXIMUM: '比較値が高い候補を優先する作戦設定から',
  MINIMUM: '比較値が低い候補を優先する作戦設定から',
});

function exactText(value, max = 240) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function inactive(reason) {
  return deepFreeze({
    schema: SCHEMA,
    active: false,
    reason,
    suggestion: null,
    badge: null,
    sourceKind: null,
    why: null,
    support: null,
    detailLines: [],
    collectiveEvidenceUsed: false,
    optimalActionProven: false,
    goodMisplaySignal: false,
    autoExecute: false,
    presentationOnly: true,
  });
}

function publicCandidateLabel(adviceResult) {
  const payload = adviceResult?.selected?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  for (const key of ['label', 'name', 'title']) {
    const label = exactText(payload[key], 96);
    if (label) return label;
  }
  return null;
}

function sourceDescriptor(adviceResult) {
  const source = exactText(adviceResult?.source, 96);
  if (source === 'approved-runtime-manifest' && adviceResult?.manifestUsed === true) {
    const rawSupport = Number(adviceResult?.manifestSupport);
    const support = Number.isSafeInteger(rawSupport) && rawSupport > 0 ? rawSupport : null;
    const manifestSource = exactText(adviceResult?.manifestSource, 96);
    const detail = support !== null
      ? `参照 ${support}件の局面データ`
      : manifestSource?.includes('global')
        ? '承認済みの全体傾向を参照'
        : '承認済みの集合知を参照';
    return {
      sourceKind: 'collective',
      badge: '集合知',
      why: '似た局面の承認済み対戦記録を参照',
      support,
      detailLines: [
        detail,
        '公開可能な情報と現行版だけを使用',
        '最適解の断定ではなく、現在の助言候補',
      ],
      collectiveEvidenceUsed: true,
    };
  }

  if (source === 'shared-legal-action-core' && adviceResult?.manifestUsed !== true) {
    const reason = exactText(adviceResult?.reason, 96);
    return {
      sourceKind: 'strategy',
      badge: '作戦設定',
      why: SHARED_REASON_TEXT[reason] || '現在の作戦設定から',
      support: null,
      detailLines: [
        '現在の合法な候補だけから選択',
        'この提案は集合知の採用結果ではありません',
      ],
      collectiveEvidenceUsed: false,
    };
  }

  if (source === 'legacy' && adviceResult?.containsPrivate === false) {
    return {
      sourceKind: 'legacy',
      badge: '通常助言',
      why: '現在の対戦ロジックから',
      support: null,
      detailLines: [
        '集合知の採用結果ではありません',
        '自動操作は行いません',
      ],
      collectiveEvidenceUsed: false,
    };
  }
  return null;
}

/**
 * Converts an already-produced Partner advice result into viewer-only explanation.
 * It never decides legality, changes ranking, writes learning labels, or claims optimality.
 */
export function projectPartnerAdviceEvidencePresentation({ adviceResult } = {}) {
  if (!adviceResult?.ok) return inactive('ADVICE_UNAVAILABLE');
  if (adviceResult?.containsPrivate !== false) return inactive('PUBLIC_SCOPE_UNVERIFIED');
  const candidateId = exactText(adviceResult?.selected?.candidateId, 96);
  if (!candidateId) return inactive('SELECTED_CANDIDATE_UNAVAILABLE');
  const descriptor = sourceDescriptor(adviceResult);
  if (!descriptor) return inactive('SOURCE_AUTHORITY_UNVERIFIED');
  const label = publicCandidateLabel(adviceResult);
  const suggestion = label ? `提案：${label}` : '提案を盤面に表示中';

  return deepFreeze({
    schema: SCHEMA,
    active: true,
    reason: null,
    suggestion,
    badge: descriptor.badge,
    sourceKind: descriptor.sourceKind,
    why: descriptor.why,
    support: descriptor.support,
    detailLines: descriptor.detailLines,
    collectiveEvidenceUsed: descriptor.collectiveEvidenceUsed,
    optimalActionProven: false,
    goodMisplaySignal: false,
    autoExecute: false,
    presentationOnly: true,
  });
}

function ensureStyle(doc) {
  if (!doc?.createElement || doc.getElementById?.(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[data-role="${ROOT_ROLE}"]{display:grid;gap:5px;padding:8px 9px;border:1px solid rgba(185,226,214,.28);border-radius:10px;background:rgba(5,25,22,.78)}
[data-role="${ROOT_ROLE}"][hidden]{display:none}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceTop{display:flex;align-items:center;gap:7px;min-width:0}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceSuggestion{min-width:0;flex:1;font-size:12px;font-weight:950;line-height:1.3;overflow-wrap:anywhere}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceBadge{flex:none;padding:4px 7px;border:1px solid rgba(198,236,224,.34);border-radius:999px;font-size:9px;font-weight:950;line-height:1}
[data-role="${ROOT_ROLE}"][data-source-kind="collective"] .partnerAdviceEvidenceBadge{border-color:rgba(255,221,133,.58);background:rgba(87,61,14,.52);color:#fff0be}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceWhy{font-size:10px;font-weight:800;line-height:1.4;color:#c8ddd6}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceToggle{justify-self:start;min-height:40px;padding:7px 10px;border:1px solid rgba(185,226,214,.28);border-radius:9px;background:rgba(10,45,38,.72);color:inherit;font:850 10px/1 system-ui}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceDetails{display:grid;gap:3px;padding-top:2px;font-size:9px;line-height:1.45;color:#aebfba}
[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceDetails[hidden]{display:none}
@media(max-width:540px){[data-role="${ROOT_ROLE}"]{padding:7px}[data-role="${ROOT_ROLE}"] .partnerAdviceEvidenceSuggestion{font-size:11px}}
@media(prefers-reduced-motion:reduce){[data-role="${ROOT_ROLE}"] *{transition:none!important;animation:none!important}}
`;
  (doc.head ?? doc.documentElement)?.appendChild?.(style);
}

export function mountPartnerAdviceEvidencePresentation({ document: doc, parent, before = null } = {}) {
  if (!doc?.createElement || !parent?.insertBefore) return null;
  const prior = parent.querySelector?.(`[data-role="${ROOT_ROLE}"]`);
  if (prior) return prior.__gameroadPartnerAdviceEvidenceMount ?? null;
  ensureStyle(doc);

  const root = doc.createElement('section');
  root.dataset.role = ROOT_ROLE;
  root.dataset.sourceKind = '';
  root.hidden = true;
  root.setAttribute?.('aria-label', 'パートナーの提案根拠');
  root.innerHTML = '<div class="partnerAdviceEvidenceTop"><strong class="partnerAdviceEvidenceSuggestion"></strong><span class="partnerAdviceEvidenceBadge"></span></div><div class="partnerAdviceEvidenceWhy"></div><button type="button" class="partnerAdviceEvidenceToggle" aria-expanded="false">根拠を見る</button><div class="partnerAdviceEvidenceDetails" hidden></div>';
  parent.insertBefore(root, before);

  const suggestion = root.querySelector('.partnerAdviceEvidenceSuggestion');
  const badge = root.querySelector('.partnerAdviceEvidenceBadge');
  const why = root.querySelector('.partnerAdviceEvidenceWhy');
  const toggle = root.querySelector('.partnerAdviceEvidenceToggle');
  const details = root.querySelector('.partnerAdviceEvidenceDetails');
  let current = inactive('NOT_RENDERED');
  let expanded = false;

  const applyExpanded = () => {
    if (!toggle || !details) return;
    details.hidden = !expanded;
    toggle.setAttribute?.('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '根拠を閉じる' : '根拠を見る';
  };
  toggle?.addEventListener?.('click', () => {
    if (!current.active) return;
    expanded = !expanded;
    applyExpanded();
  });

  const render = (model) => {
    current = model?.schema === SCHEMA ? model : inactive('MODEL_INVALID');
    root.hidden = current.active !== true;
    if (!current.active) {
      expanded = false;
      root.dataset.sourceKind = '';
      if (suggestion) suggestion.textContent = '';
      if (badge) badge.textContent = '';
      if (why) why.textContent = '';
      if (details) details.replaceChildren?.();
      applyExpanded();
      return current;
    }
    root.dataset.sourceKind = current.sourceKind || '';
    if (suggestion) suggestion.textContent = current.suggestion || '';
    if (badge) badge.textContent = current.badge || '';
    if (why) why.textContent = current.why || '';
    if (details) {
      details.replaceChildren?.();
      for (const line of current.detailLines || []) {
        const row = doc.createElement('div');
        row.textContent = line;
        details.appendChild?.(row);
      }
    }
    applyExpanded();
    return current;
  };

  const mount = Object.freeze({ root, render, model: () => current });
  root.__gameroadPartnerAdviceEvidenceMount = mount;
  return mount;
}

export const PARTNER_ADVICE_EVIDENCE_PRESENTATION = deepFreeze({
  schema: SCHEMA,
  rootRole: ROOT_ROLE,
  sourceKinds: ['collective', 'strategy', 'legacy'],
  collectiveLabel: '集合知',
  optimalActionProven: false,
  goodMisplaySignal: false,
  autoExecute: false,
  presentationOnly: true,
});
