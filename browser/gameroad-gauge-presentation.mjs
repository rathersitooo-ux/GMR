const GAUGE_SCHEMA = 'gameroad.gauge-presentation.v1';
const STYLE_ID = 'gameroad-gauge-presentation-style';
const ROOT_ATTR = 'data-gameroad-gauge';
const UNRESOLVED = '—';
const KINDS = new Set(['bar', 'ring', 'segments', 'value', 'milestones', 'steps', 'loading']);
const EXPLICIT_STATES = new Set(['done', 'current', 'future', 'blocked', 'locked', 'inactive']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function finiteNumber(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function projectRange(source) {
  const value = finiteNumber(source.value);
  const min = finiteNumber(source.min);
  const max = finiteNumber(source.max);
  const resolved = value !== null && min !== null && max !== null && max > min;
  const ratio = resolved ? clamp((value - min) / (max - min), 0, 1) : null;
  return {
    resolved,
    value,
    min,
    max,
    ratio,
    valueText: value === null ? UNRESOLVED : String(value),
    rangeText: resolved ? `${value} / ${max}` : UNRESOLVED
  };
}

function projectItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { resolved: false, items: [] };
  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { resolved: false, items: [] };
    const state = text(item.state);
    if (!EXPLICIT_STATES.has(state)) return { resolved: false, items: [] };
    normalized.push({
      id: text(item.id) || `item-${index + 1}`,
      label: text(item.label),
      state,
      position: Number.isFinite(item.position) && item.position >= 0 && item.position <= 1
        ? Number(item.position)
        : null
    });
  }
  return { resolved: true, items: normalized };
}

export function projectGameroadGauge(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const kind = KINDS.has(source.kind) ? source.kind : 'value';
  const label = text(source.label);
  const lowPerf = source.lowPerf === true;
  const reducedMotion = source.reducedMotion === true;
  const delta = finiteNumber(source.delta);
  const deltaLabel = text(source.deltaLabel || source.deltaSource);

  const common = {
    schema: GAUGE_SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    authority: 'CALLER_ONLY',
    kind,
    label,
    lowPerf,
    reducedMotion,
    infersUnknownMaximum: false,
    deltaResolved: delta !== null,
    delta,
    deltaLabel,
    deltaText: delta === null ? '' : `${delta > 0 ? '+' : ''}${delta}${deltaLabel ? `・${deltaLabel}` : ''}`
  };

  if (kind === 'bar' || kind === 'ring') {
    const range = projectRange(source);
    return deepFreeze({ ...common, ...range, determinate: range.resolved });
  }

  if (kind === 'loading') {
    if (source.indeterminate === true) {
      return deepFreeze({
        ...common,
        resolved: true,
        determinate: false,
        indeterminate: true,
        value: null,
        min: null,
        max: null,
        ratio: null,
        valueText: UNRESOLVED,
        rangeText: UNRESOLVED
      });
    }
    const range = projectRange(source);
    return deepFreeze({ ...common, ...range, determinate: range.resolved, indeterminate: false });
  }

  if (kind === 'segments') {
    const count = nonNegativeInteger(source.count);
    const total = positiveInteger(source.total);
    const resolved = count !== null && total !== null && count <= total;
    return deepFreeze({
      ...common,
      resolved,
      determinate: resolved,
      count,
      total,
      ratio: resolved ? count / total : null,
      valueText: count === null ? UNRESOLVED : String(count),
      rangeText: resolved ? `${count} / ${total}` : UNRESOLVED,
      segments: resolved
        ? Array.from({ length: total }, (_, index) => ({ index, filled: index < count }))
        : []
    });
  }

  if (kind === 'steps' || kind === 'milestones') {
    const projected = projectItems(source.items);
    return deepFreeze({
      ...common,
      resolved: projected.resolved,
      determinate: false,
      items: projected.items,
      valueText: projected.resolved ? String(projected.items.length) : UNRESOLVED
    });
  }

  const value = finiteNumber(source.value);
  return deepFreeze({
    ...common,
    resolved: value !== null,
    determinate: false,
    value,
    valueText: value === null ? UNRESOLVED : String(value)
  });
}

function requireDocument(global) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('GAMEROAD_GAUGE_DOCUMENT_REQUIRED');
  }
  return document;
}

function createNode(document, tag, className = '', value = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function clearNode(node) {
  while (node?.children?.length) node.removeChild(node.children[node.children.length - 1]);
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null) delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function removeAttribute(node, name) {
  if (typeof node?.removeAttribute === 'function') node.removeAttribute(name);
}

function addStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = createNode(document, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[${ROOT_ATTR}="1"]{--gr-gauge-ink:rgba(245,248,250,.94);--gr-gauge-track:rgba(245,248,250,.13);--gr-gauge-edge:rgba(245,248,250,.30);display:inline-grid;gap:4px;min-width:0;color:var(--gr-gauge-ink);font:inherit;pointer-events:none}
[${ROOT_ATTR}="1"] .grGaugeLabel{font-size:10px;font-weight:900;line-height:1;letter-spacing:.04em;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[${ROOT_ATTR}="1"] .grGaugeValueRow{display:flex;align-items:baseline;gap:6px;min-width:0}
[${ROOT_ATTR}="1"] .grGaugeValue{font-size:14px;font-weight:1000;line-height:1}
[${ROOT_ATTR}="1"] .grGaugeDelta{font-size:9px;font-weight:850;line-height:1;opacity:.74;white-space:nowrap}
[${ROOT_ATTR}="1"] .grGaugeTrack{position:relative;width:min(180px,28vw);height:8px;border:1px solid var(--gr-gauge-edge);border-radius:999px;background:var(--gr-gauge-track);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.45)}
[${ROOT_ATTR}="1"] .grGaugeFill{height:100%;width:0;background:currentColor;opacity:.82;border-radius:inherit;transition:width 160ms ease-out}
[${ROOT_ATTR}="1"] .grGaugeRing{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--gr-gauge-track);box-shadow:inset 0 0 0 1px var(--gr-gauge-edge)}
[${ROOT_ATTR}="1"] .grGaugeRing::after{content:"";width:32px;height:32px;border-radius:50%;background:rgba(6,10,12,.92);box-shadow:0 0 0 1px rgba(255,255,255,.08)}
[${ROOT_ATTR}="1"] .grGaugeSegments{display:flex;gap:3px;align-items:center;min-height:10px}
[${ROOT_ATTR}="1"] .grGaugeSegment{width:11px;height:7px;border:1px solid var(--gr-gauge-edge);border-radius:3px;background:var(--gr-gauge-track)}
[${ROOT_ATTR}="1"] .grGaugeSegment[data-filled="true"]{background:currentColor;opacity:.85}
[${ROOT_ATTR}="1"] .grGaugeSequence{display:flex;align-items:flex-start;gap:4px;max-width:min(320px,64vw)}
[${ROOT_ATTR}="1"] .grGaugeSequenceItem{display:grid;grid-template-rows:auto auto;gap:2px;justify-items:center;min-width:28px;opacity:.50}
[${ROOT_ATTR}="1"] .grGaugeSequenceMark{width:9px;height:9px;border:1px solid var(--gr-gauge-edge);border-radius:50%;background:var(--gr-gauge-track)}
[${ROOT_ATTR}="1"] .grGaugeSequenceItem[data-state="done"]{opacity:.80}
[${ROOT_ATTR}="1"] .grGaugeSequenceItem[data-state="done"] .grGaugeSequenceMark{background:currentColor}
[${ROOT_ATTR}="1"] .grGaugeSequenceItem[data-state="current"]{opacity:1;transform:translateY(-1px)}
[${ROOT_ATTR}="1"] .grGaugeSequenceItem[data-state="current"] .grGaugeSequenceMark{background:currentColor;box-shadow:0 0 0 3px rgba(255,255,255,.12)}
[${ROOT_ATTR}="1"] .grGaugeSequenceItem[data-state="blocked"],[${ROOT_ATTR}="1"] .grGaugeSequenceItem[data-state="locked"]{opacity:.28}
[${ROOT_ATTR}="1"] .grGaugeSequenceText{font-size:8px;font-weight:800;line-height:1.1;text-align:center;max-width:58px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${ROOT_ATTR}="1"] .grGaugeLoadingIndeterminate .grGaugeFill{width:38%;animation:grGaugeSlide 900ms ease-in-out infinite alternate}
[${ROOT_ATTR}="1"][data-low-perf="true"] .grGaugeLoadingIndeterminate .grGaugeFill{animation:none;width:52%}
[${ROOT_ATTR}="1"][data-resolved="false"]{opacity:.60}
@keyframes grGaugeSlide{from{transform:translateX(-65%)}to{transform:translateX(165%)}}
@media(max-height:420px),(max-width:720px){[${ROOT_ATTR}="1"]{gap:2px}[${ROOT_ATTR}="1"] .grGaugeTrack{width:min(138px,31vw);height:7px}[${ROOT_ATTR}="1"] .grGaugeValue{font-size:12px}[${ROOT_ATTR}="1"] .grGaugeLabel{font-size:9px}[${ROOT_ATTR}="1"] .grGaugeRing{width:38px;height:38px}[${ROOT_ATTR}="1"] .grGaugeRing::after{width:28px;height:28px}}
@media(prefers-reduced-motion:reduce){[${ROOT_ATTR}="1"] *{transition:none!important;animation:none!important;transform:none!important}}
`;
  document.head?.appendChild(style);
}

function formatAria(model) {
  const label = model.label || '進行状況';
  if (model.kind === 'value') return `${label} ${model.valueText}${model.deltaText ? ` ${model.deltaText}` : ''}`;
  if (model.kind === 'segments' || model.kind === 'bar' || model.kind === 'ring') return `${label} ${model.rangeText}`;
  if (model.kind === 'loading') return model.indeterminate ? `${label} 処理中` : `${label} ${model.rangeText}`;
  return `${label} ${model.resolved ? '段階表示' : '未確定'}`;
}

function applyAccessibility(root, model) {
  removeAttribute(root, 'aria-valuemin');
  removeAttribute(root, 'aria-valuemax');
  removeAttribute(root, 'aria-valuenow');
  removeAttribute(root, 'aria-busy');
  root.setAttribute?.('aria-label', formatAria(model));

  const quantitative = (model.kind === 'bar' || model.kind === 'ring' || model.kind === 'segments' || model.kind === 'loading');
  if (quantitative) root.setAttribute?.('role', 'progressbar');
  else root.setAttribute?.('role', 'status');

  if ((model.kind === 'bar' || model.kind === 'ring' || (model.kind === 'loading' && !model.indeterminate)) && model.resolved) {
    root.setAttribute?.('aria-valuemin', model.min);
    root.setAttribute?.('aria-valuemax', model.max);
    root.setAttribute?.('aria-valuenow', model.value);
  } else if (model.kind === 'segments' && model.resolved) {
    root.setAttribute?.('aria-valuemin', '0');
    root.setAttribute?.('aria-valuemax', model.total);
    root.setAttribute?.('aria-valuenow', model.count);
  } else if (model.kind === 'loading' && model.indeterminate) {
    root.setAttribute?.('aria-busy', 'true');
  }
}

function appendLabel(document, root, model) {
  if (!model.label) return;
  root.appendChild(createNode(document, 'small', 'grGaugeLabel', model.label));
}

function appendValueRow(document, root, valueText, deltaText = '') {
  const row = createNode(document, 'div', 'grGaugeValueRow');
  row.appendChild(createNode(document, 'b', 'grGaugeValue', valueText));
  if (deltaText) row.appendChild(createNode(document, 'span', 'grGaugeDelta', deltaText));
  root.appendChild(row);
}

function appendBar(document, root, model, indeterminate = false) {
  const track = createNode(document, 'div', `grGaugeTrack${indeterminate ? ' grGaugeLoadingIndeterminate' : ''}`);
  const fill = createNode(document, 'div', 'grGaugeFill');
  if (!indeterminate && model.resolved && fill.style) fill.style.width = `${(model.ratio * 100).toFixed(3)}%`;
  track.appendChild(fill);
  root.appendChild(track);
  return { track, fill };
}

function appendRing(document, root, model) {
  const ring = createNode(document, 'div', 'grGaugeRing');
  if (model.resolved && ring.style) {
    const degrees = (model.ratio * 360).toFixed(3);
    ring.style.background = `conic-gradient(from -90deg,currentColor 0deg ${degrees}deg,var(--gr-gauge-track) ${degrees}deg 360deg)`;
  }
  root.appendChild(ring);
  return ring;
}

function appendSegments(document, root, model) {
  const wrap = createNode(document, 'div', 'grGaugeSegments');
  for (const segment of model.segments) {
    const node = createNode(document, 'span', 'grGaugeSegment');
    setData(node, 'filled', segment.filled);
    wrap.appendChild(node);
  }
  root.appendChild(wrap);
  return wrap;
}

function appendSequence(document, root, model) {
  const wrap = createNode(document, 'div', 'grGaugeSequence');
  for (const item of model.items) {
    const node = createNode(document, 'div', 'grGaugeSequenceItem');
    setData(node, 'state', item.state);
    setData(node, 'position', item.position);
    node.appendChild(createNode(document, 'span', 'grGaugeSequenceMark'));
    if (item.label) node.appendChild(createNode(document, 'small', 'grGaugeSequenceText', item.label));
    wrap.appendChild(node);
  }
  root.appendChild(wrap);
  return wrap;
}

export function mountGameroadGauge(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const host = options.host;
  if (!host || typeof host.appendChild !== 'function') throw new TypeError('GAMEROAD_GAUGE_HOST_REQUIRED');
  addStyle(document);

  const root = createNode(document, 'div', 'grGameroadGauge');
  root.setAttribute?.(ROOT_ATTR, '1');
  root.dataset.presentationOnly = 'true';
  root.dataset.authority = 'caller_only';
  host.appendChild(root);

  let destroyed = false;
  let lastModel = null;
  let refs = Object.freeze({});

  function sync(input = {}) {
    if (destroyed) throw new Error('GAMEROAD_GAUGE_DESTROYED');
    const model = projectGameroadGauge(input);
    clearNode(root);
    setData(root, 'kind', model.kind);
    setData(root, 'resolved', model.resolved);
    setData(root, 'determinate', model.determinate);
    setData(root, 'lowPerf', model.lowPerf);
    setData(root, 'reducedMotion', model.reducedMotion);
    applyAccessibility(root, model);
    appendLabel(document, root, model);

    const nextRefs = {};
    if (model.kind === 'bar') {
      appendValueRow(document, root, model.rangeText, model.deltaText);
      Object.assign(nextRefs, appendBar(document, root, model));
    } else if (model.kind === 'ring') {
      appendValueRow(document, root, model.rangeText, model.deltaText);
      nextRefs.ring = appendRing(document, root, model);
    } else if (model.kind === 'segments') {
      appendValueRow(document, root, model.rangeText, model.deltaText);
      nextRefs.segments = appendSegments(document, root, model);
    } else if (model.kind === 'steps' || model.kind === 'milestones') {
      nextRefs.sequence = appendSequence(document, root, model);
    } else if (model.kind === 'loading') {
      if (!model.indeterminate) appendValueRow(document, root, model.rangeText, model.deltaText);
      Object.assign(nextRefs, appendBar(document, root, model, model.indeterminate));
    } else {
      appendValueRow(document, root, model.valueText, model.deltaText);
    }

    lastModel = model;
    refs = Object.freeze(nextRefs);
    return model;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (root.parentNode && typeof root.parentNode.removeChild === 'function') root.parentNode.removeChild(root);
    return true;
  }

  sync(options.gauge ?? {});

  return Object.freeze({
    schema: GAUGE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    authority: 'CALLER_ONLY',
    root,
    sync,
    snapshot: () => lastModel,
    refs: () => refs,
    destroy
  });
}

export const GAMEROAD_GAUGE_PRESENTATION = deepFreeze({
  schema: GAUGE_SCHEMA,
  kinds: Object.freeze(['bar', 'ring', 'segments', 'value', 'milestones', 'steps', 'loading']),
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  authority: 'CALLER_ONLY',
  infersUnknownMaximum: false,
  infersThresholds: false,
  infersStepState: false,
  resourceCalculationOwnedHere: false,
  progressionCalculationOwnedHere: false,
  storageOwnedHere: false,
  imageAssetRequired: false
});
