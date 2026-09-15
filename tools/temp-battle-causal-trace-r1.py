from pathlib import Path

RUNTIME = Path('browser/battle-screen-runtime-mount.mjs')
TEST = Path('tests/battle-screen-runtime-mount.test.mjs')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return text.replace(old, new, 1)


runtime = RUNTIME.read_text(encoding='utf-8')
if 'data-battle-causal-trace' in runtime:
    raise SystemExit('runtime already contains causal trace marker')

runtime = replace_once(
    runtime,
    "const CURRENT_ACTION_ATTR = 'data-battle-current-action';\nconst PROGRESS_GUIDE_ATTR = 'data-battle-progress-guide';",
    "const CURRENT_ACTION_ATTR = 'data-battle-current-action';\nconst CAUSAL_TRACE_ATTR = 'data-battle-causal-trace';\nconst PROGRESS_GUIDE_ATTR = 'data-battle-progress-guide';",
    'runtime constant anchor',
)

runtime = replace_once(
    runtime,
    '[${CURRENT_ACTION_ATTR}][data-phase="settle"]{max-width:min(76vw,620px)}\n',
    '''[${CURRENT_ACTION_ATTR}][data-phase="settle"]{max-width:min(76vw,620px)}
[${CAUSAL_TRACE_ATTR}]{position:absolute;z-index:8;top:clamp(144px,24vh,190px);left:50%;transform:translateX(-50%);width:min(76vw,720px);display:flex;align-items:stretch;justify-content:center;gap:4px;pointer-events:none;color:#f8fbeb;text-shadow:0 2px 8px rgba(0,0,0,.72)}
[${CAUSAL_TRACE_ATTR}][hidden]{display:none!important}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage{position:relative;min-width:0;flex:1 1 0;padding:5px 7px;border:1px solid rgba(245,248,225,.38);border-radius:8px;background:rgba(4,28,24,.76);box-shadow:0 5px 14px rgba(0,0,0,.2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:clamp(9px,.84vw,12px);font-weight:900;letter-spacing:.03em;opacity:.9}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage:not(:last-child)::after{content:"›";position:absolute;right:-6px;top:50%;transform:translateY(-52%);z-index:2;color:#ffe181;font-size:15px;text-shadow:0 1px 6px rgba(0,0,0,.8)}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage[data-kind="processing"]{border-color:rgba(161,219,255,.48);background:rgba(12,43,58,.8)}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage[data-kind="accepted_resolution"]{border-color:rgba(255,226,129,.54);background:rgba(70,57,18,.82)}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage[data-kind="destination"]{border-color:rgba(255,190,135,.64);background:rgba(78,38,18,.84)}
[${CAUSAL_TRACE_ATTR}][data-motion="causal_return"] .grBattleCausalTraceStage{animation:grBattleCausalTraceStage 1.35s cubic-bezier(.2,.72,.24,1) both}
[${CAUSAL_TRACE_ATTR}][data-motion="static_causal_trace"] .grBattleCausalTraceStage{animation:none!important;opacity:1!important;transform:none!important}
@keyframes grBattleCausalTraceStage{0%{opacity:.18;transform:translateY(8px) scale(.97)}45%{opacity:1;transform:translateY(0) scale(1.02)}100%{opacity:.9;transform:translateY(0) scale(1)}}
''',
    'runtime causal trace css anchor',
)

helper_anchor = '''function clearChildren(node) {
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
'''
helper_insert = '''function causalStageLabel(stage, model) {
  if (!stage || typeof stage !== 'object') return '';
  if (stage.kind === 'cause') {
    const handKey = typeof stage.jankenHand === 'string' ? stage.jankenHand.trim().toLowerCase() : '';
    const hand = LOAD_JANKEN_LABELS[handKey] ?? stage.jankenHand ?? '';
    return `攻撃 ${stage.cardId ?? ''}${hand ? `（${hand}）` : ''}`.trim();
  }
  if (stage.kind === 'processing') {
    const order = Array.isArray(stage.processingOrder)
      ? stage.processingOrder.map(id => participantLabelById(model, id) || id).filter(Boolean)
      : [];
    return order.length ? `比較 ${order.join(' → ')}` : '比較';
  }
  if (stage.kind === 'accepted_resolution') return '結果確定';
  if (stage.kind === 'return_path') return '盤面へ帰着';
  if (stage.kind === 'destination') {
    const participant = participantLabelById(model, stage.opponentId) || stage.opponentId || '';
    const shield = stage.shieldLane ? `Shield ${stage.shieldLane}` : '';
    return [participant, shield].filter(Boolean).join(' / ');
  }
  return '';
}

function createCausalTrace(document) {
  const trace = createNode(document, 'section', 'grBattleCausalTrace');
  trace.setAttribute?.(CAUSAL_TRACE_ATTR, '1');
  trace.setAttribute?.('role', 'status');
  trace.setAttribute?.('aria-live', 'polite');
  trace.setAttribute?.('aria-atomic', 'true');
  trace.setAttribute?.('aria-label', '攻撃から盤面反映までの因果');
  trace.dataset.presentationOnly = 'true';
  trace.dataset.authority = 'accepted-causal-return-stages-only';
  trace.hidden = true;
  return trace;
}

function writeCausalTrace(document, trace, model) {
  clearChildren(trace);
  const causal = model?.causalReturn;
  const stages = Array.isArray(causal?.stages) ? causal.stages : [];
  setData(trace, 'traceKey', null);
  setData(trace, 'eventId', null);
  setData(trace, 'motion', null);
  setData(trace, 'stageCount', null);
  setData(trace, 'preserveStageOrder', null);
  if (!causal || stages.length === 0) {
    trace.hidden = true;
    trace.setAttribute?.('aria-hidden', 'true');
    return null;
  }

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const label = causalStageLabel(stage, model);
    const item = createNode(document, 'span', 'grBattleCausalTraceStage', label);
    setData(item, 'kind', stage.kind ?? null);
    setData(item, 'stageIndex', index + 1);
    item.style.animationDelay = `${index * 160}ms`;
    trace.appendChild(item);
  }
  trace.hidden = false;
  trace.setAttribute?.('aria-hidden', 'false');
  setData(trace, 'traceKey', causal.traceKey ?? null);
  setData(trace, 'eventId', causal.eventId ?? null);
  setData(trace, 'motion', causal.motion?.mode ?? null);
  setData(trace, 'stageCount', stages.length);
  setData(trace, 'preserveStageOrder', causal.motion?.preserveStageOrder === true ? 'true' : null);
  return trace;
}

function clearChildren(node) {
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
'''
runtime = replace_once(runtime, helper_anchor, helper_insert, 'runtime helper anchor')

runtime = replace_once(
    runtime,
    '''  const currentActionCue = createCurrentActionCue(document);
  const currentActionHost = adoptingExistingPhase && validRoot(root) ? root : shell;
  currentActionHost.appendChild(currentActionCue);

  const progressGuide = createProgressGuide(document);
''',
    '''  const currentActionCue = createCurrentActionCue(document);
  const currentActionHost = adoptingExistingPhase && validRoot(root) ? root : shell;
  currentActionHost.appendChild(currentActionCue);

  const causalTrace = createCausalTrace(document);
  currentActionHost.appendChild(causalTrace);

  const progressGuide = createProgressGuide(document);
''',
    'runtime mount causal trace anchor',
)

runtime = replace_once(
    runtime,
    '''    // Rejected/stale input must not leave the previous accepted return highlighted.
    writeCurrentActionCue(currentActionCue, null);
    setData(shell, 'boardReturnDestination', null);
''',
    '''    // Rejected/stale input must not leave the previous accepted return highlighted.
    writeCurrentActionCue(currentActionCue, null);
    writeCausalTrace(document, causalTrace, null);
    setData(shell, 'boardReturnDestination', null);
''',
    'runtime rejected clear anchor',
)

runtime = replace_once(
    runtime,
    '''    hud.root.hidden = !battle;
    writeCurrentActionCue(currentActionCue, resultExit ? null : model);
    if (planSlot) planSlot.hidden = battle || resultExit;
''',
    '''    hud.root.hidden = !battle;
    writeCurrentActionCue(currentActionCue, resultExit ? null : model);
    writeCausalTrace(document, causalTrace, resultExit ? null : model);
    if (planSlot) planSlot.hidden = battle || resultExit;
''',
    'runtime render causal trace anchor',
)

runtime = replace_once(
    runtime,
    '''    if (currentActionCue?.parentNode && typeof currentActionCue.parentNode.removeChild === 'function') currentActionCue.parentNode.removeChild(currentActionCue);
    if (progressGuide?.parentNode && typeof progressGuide.parentNode.removeChild === 'function') progressGuide.parentNode.removeChild(progressGuide);
''',
    '''    if (currentActionCue?.parentNode && typeof currentActionCue.parentNode.removeChild === 'function') currentActionCue.parentNode.removeChild(currentActionCue);
    if (causalTrace?.parentNode && typeof causalTrace.parentNode.removeChild === 'function') causalTrace.parentNode.removeChild(causalTrace);
    if (progressGuide?.parentNode && typeof progressGuide.parentNode.removeChild === 'function') progressGuide.parentNode.removeChild(progressGuide);
''',
    'runtime destroy causal trace anchor',
)

runtime = replace_once(
    runtime,
    '''    fieldLandmark,
    currentActionCue,
    progressGuide,
''',
    '''    fieldLandmark,
    currentActionCue,
    causalTrace,
    progressGuide,
''',
    'runtime public surface causal trace anchor',
)

runtime = replace_once(
    runtime,
    '''  currentActionAuthority: 'ACCEPTED_PUBLIC_MODEL_ONLY',
  planCurrentActionPolicy: 'GENERIC_SELECTION_LABEL_ONLY_NO_LEGAL_ACTION_INFERENCE',
''',
    '''  currentActionAuthority: 'ACCEPTED_PUBLIC_MODEL_ONLY',
  causalTraceAuthority: 'MODEL_CAUSAL_RETURN_STAGES_ONLY_NO_RECALCULATION',
  causalTraceStageOrder: 'MODEL_ORDER_ONLY',
  planCurrentActionPolicy: 'GENERIC_SELECTION_LABEL_ONLY_NO_LEGAL_ACTION_INFERENCE',
''',
    'runtime contract causal trace anchor',
)

RUNTIME.write_text(runtime, encoding='utf-8')


test = TEST.read_text(encoding='utf-8')
if 'causalTraceStageOrder' in test:
    raise SystemExit('test already contains causal trace assertions')

test = replace_once(
    test,
    "import { createBattleScreenModel } from '../browser/battle-screen-presentation-core.mjs';\n",
    "import { projectBattleActionOrderChain } from '../browser/battle-action-order-presentation-core.mjs';\nimport { createBattleScreenModel } from '../browser/battle-screen-presentation-core.mjs';\n",
    'test import anchor',
)

test = replace_once(
    test,
    '''assert.equal(runtime.currentActionCue.dataset.authority, 'accepted-public-model-only');
assert.equal(runtime.currentActionCue.hidden, true);
assert.ok(runtime.progressGuide);
''',
    '''assert.equal(runtime.currentActionCue.dataset.authority, 'accepted-public-model-only');
assert.equal(runtime.currentActionCue.hidden, true);
assert.ok(runtime.causalTrace);
assert.equal(runtime.causalTrace.getAttribute('data-battle-causal-trace'), '1');
assert.equal(runtime.causalTrace.getAttribute('role'), 'status');
assert.equal(runtime.causalTrace.getAttribute('aria-live'), 'polite');
assert.equal(runtime.causalTrace.dataset.presentationOnly, 'true');
assert.equal(runtime.causalTrace.dataset.authority, 'accepted-causal-return-stages-only');
assert.equal(runtime.causalTrace.hidden, true);
assert.ok(runtime.progressGuide);
''',
    'test initial causal trace anchor',
)

test = replace_once(
    test,
    '''assert.ok(runtimeStyle.textContent.includes('[data-battle-current-action]'));
assert.ok(runtimeStyle.textContent.includes('max-width:min(42vw,420px)'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-progress-guide]'));
''',
    '''assert.ok(runtimeStyle.textContent.includes('[data-battle-current-action]'));
assert.ok(runtimeStyle.textContent.includes('max-width:min(42vw,420px)'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-causal-trace]'));
assert.ok(runtimeStyle.textContent.includes('.grBattleCausalTraceStage'));
assert.ok(runtimeStyle.textContent.includes('@keyframes grBattleCausalTraceStage'));
assert.ok(runtimeStyle.textContent.includes('[data-motion="static_causal_trace"] .grBattleCausalTraceStage{animation:none!important'));
assert.ok(runtimeStyle.textContent.includes('[data-battle-progress-guide]'));
''',
    'test style causal trace anchor',
)

settle_assert_anchor = '''assert.equal(runtime.shieldRails[3].children[2].dataset.boardReturnTarget, undefined);

const reducedSettle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN', reducedMotion: true });
'''
settle_assert_insert = '''assert.equal(runtime.shieldRails[3].children[2].dataset.boardReturnTarget, undefined);
assert.equal(runtime.causalTrace.hidden, false);
assert.equal(runtime.causalTrace.dataset.traceKey, 'settle-1:P3:R');
assert.equal(runtime.causalTrace.dataset.motion, 'causal_return');
assert.equal(runtime.causalTrace.dataset.stageCount, '4');
assert.equal(runtime.causalTrace.dataset.preserveStageOrder, 'true');
assert.deepEqual(runtime.causalTrace.children.map(node => node.dataset.kind), ['cause', 'accepted_resolution', 'return_path', 'destination']);
assert.deepEqual(runtime.causalTrace.children.map(node => node.textContent), ['攻撃 C1（グー）', '結果確定', '盤面へ帰着', 'B-1 / Shield R']);

const acceptedActionOrder = projectBattleActionOrderChain({
  orderedCards: [
    { participantId: 'P2', cardId: 'C2', printedNumber: 2, jankenHand: 'SCISSORS' },
    { participantId: 'P4', cardId: 'C4', printedNumber: 4, jankenHand: 'PAPER' },
    { participantId: 'P1', cardId: 'C1', printedNumber: 7, jankenHand: 'ROCK' },
    { participantId: 'P3', cardId: 'C3', printedNumber: 9, jankenHand: 'ROCK' }
  ],
  resolution: {
    processingOrder: ['P2', 'P4', 'P1', 'P3'],
    resolvedWinners: ['P3'],
    invalidated: ['P2', 'P4', 'P1'],
    unresolvedSurvivors: [],
    steps: [
      { processedPlayerId: 'P2', winningHand: null, resolvedWinner: false, invalidated: [], survivors: ['P2', 'P4', 'P1', 'P3'] },
      { processedPlayerId: 'P4', winningHand: null, resolvedWinner: false, invalidated: ['P2'], survivors: ['P4', 'P1', 'P3'] },
      { processedPlayerId: 'P1', winningHand: null, resolvedWinner: false, invalidated: ['P4'], survivors: ['P1', 'P3'] },
      { processedPlayerId: 'P3', winningHand: 'ROCK', resolvedWinner: true, invalidated: ['P1'], survivors: ['P3'] }
    ]
  }
});
const orderedSettle = createBattleScreenModel({
  participants,
  plan: settlePlan,
  returnIntent: 'MATCH_PLAN',
  actionOrder: acceptedActionOrder
});
runtime.render(orderedSettle);
assert.equal(runtime.causalTrace.hidden, false);
assert.equal(runtime.causalTrace.dataset.stageCount, '5');
assert.deepEqual(runtime.causalTrace.children.map(node => node.dataset.kind), ['cause', 'processing', 'accepted_resolution', 'return_path', 'destination']);
assert.equal(runtime.causalTrace.children[1].textContent, '比較 A-2 → B-2 → A-1 → B-1');
assert.deepEqual(runtime.causalTrace.children.map(node => node.dataset.stageIndex), ['1', '2', '3', '4', '5']);
assert.deepEqual(runtime.causalTrace.children.map(node => node.style.animationDelay), ['0ms', '160ms', '320ms', '480ms', '640ms']);

const reducedSettle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN', reducedMotion: true, actionOrder: acceptedActionOrder });
'''
test = replace_once(test, settle_assert_anchor, settle_assert_insert, 'test settle causal trace anchor')

test = replace_once(
    test,
    '''assert.equal(runtime.currentActionCue.textContent, '今：盤面反映 C1（グー） → 解決 → B-1 / Shield R');

const lowPerfSettle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN', lowPerf: true });
''',
    '''assert.equal(runtime.currentActionCue.textContent, '今：盤面反映 C1（グー） → 解決 → B-1 / Shield R');
assert.equal(runtime.causalTrace.dataset.motion, 'static_causal_trace');
assert.equal(runtime.causalTrace.dataset.stageCount, '5');
assert.deepEqual(runtime.causalTrace.children.map(node => node.dataset.kind), ['cause', 'processing', 'accepted_resolution', 'return_path', 'destination']);

const lowPerfSettle = createBattleScreenModel({ participants, plan: settlePlan, returnIntent: 'MATCH_PLAN', lowPerf: true });
''',
    'test reduced causal trace anchor',
)

test = replace_once(
    test,
    '''assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.dataset.causalCardId, undefined);
assert.equal(runtime.shell.dataset.boardReturnDestination, undefined);
''',
    '''assert.equal(runtime.currentActionCue.hidden, true);
assert.equal(runtime.currentActionCue.dataset.causalCardId, undefined);
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);
assert.equal(runtime.causalTrace.dataset.traceKey, undefined);
assert.equal(runtime.shell.dataset.boardReturnDestination, undefined);
''',
    'test malformed causal trace clear anchor',
)

test = replace_once(
    test,
    '''assert.equal(runtime.currentActionCue.dataset.causalJanken, undefined);
assert.equal(runtime.shieldRails[2].dataset.boardReturnParticipant, undefined);
''',
    '''assert.equal(runtime.currentActionCue.dataset.causalJanken, undefined);
assert.equal(runtime.causalTrace.hidden, true);
assert.equal(runtime.causalTrace.children.length, 0);
assert.equal(runtime.shieldRails[2].dataset.boardReturnParticipant, undefined);
''',
    'test nonsettle causal trace clear anchor',
)

test = replace_once(
    test,
    '''const currentActionCue = runtime.currentActionCue;
const resourceHudRoot = runtime.resourceHud.root;
assert.equal(runtime.destroy(), true);
''',
    '''const currentActionCue = runtime.currentActionCue;
const causalTrace = runtime.causalTrace;
const resourceHudRoot = runtime.resourceHud.root;
assert.equal(runtime.destroy(), true);
''',
    'test destroy capture causal trace anchor',
)

test = replace_once(
    test,
    '''assert.equal(currentActionCue.parentNode, null);
assert.equal(resourceHudRoot.parentNode, null);
''',
    '''assert.equal(currentActionCue.parentNode, null);
assert.equal(causalTrace.parentNode, null);
assert.equal(resourceHudRoot.parentNode, null);
''',
    'test destroy causal trace anchor',
)

test = replace_once(
    test,
    '''assert.equal(adopted.currentActionCue.parentNode, existingShell);
assert.equal(adopted.currentActionCue.dataset.presentationOnly, 'true');
assert.equal(adopted.progressGuide.parentNode, adopted.shell);
''',
    '''assert.equal(adopted.currentActionCue.parentNode, existingShell);
assert.equal(adopted.currentActionCue.dataset.presentationOnly, 'true');
assert.equal(adopted.causalTrace.parentNode, existingShell);
assert.equal(adopted.causalTrace.dataset.presentationOnly, 'true');
assert.equal(adopted.progressGuide.parentNode, adopted.shell);
''',
    'test adopted causal trace mount anchor',
)

test = replace_once(
    test,
    '''assert.equal(adopted.currentActionCue.textContent, '今：盤面反映 C1（グー） → 解決 → B-1 / Shield R');
assert.equal(adopted.resolutionSurface.dataset.battleBoardReturnDestination, 'P3:R');
''',
    '''assert.equal(adopted.currentActionCue.textContent, '今：盤面反映 C1（グー） → 解決 → B-1 / Shield R');
assert.equal(adopted.causalTrace.hidden, false);
assert.deepEqual(adopted.causalTrace.children.map(node => node.dataset.kind), ['cause', 'accepted_resolution', 'return_path', 'destination']);
assert.equal(adopted.resolutionSurface.dataset.battleBoardReturnDestination, 'P3:R');
''',
    'test adopted causal trace settle anchor',
)

test = replace_once(
    test,
    '''assert.equal(adopted.currentActionCue.hidden, true);
assert.equal(adopted.resolutionSurface.dataset.battleBoardReturnDestination, undefined);
const adoptedOverlay = adopted.shell;
const adoptedCurrentActionCue = adopted.currentActionCue;
''',
    '''assert.equal(adopted.currentActionCue.hidden, true);
assert.equal(adopted.causalTrace.hidden, true);
assert.equal(adopted.causalTrace.children.length, 0);
assert.equal(adopted.resolutionSurface.dataset.battleBoardReturnDestination, undefined);
const adoptedOverlay = adopted.shell;
const adoptedCurrentActionCue = adopted.currentActionCue;
const adoptedCausalTrace = adopted.causalTrace;
''',
    'test adopted causal trace result anchor',
)

test = replace_once(
    test,
    '''assert.equal(adoptedCurrentActionCue.parentNode, null);
assert.equal(adoptedProgressGuide.parentNode, null);
''',
    '''assert.equal(adoptedCurrentActionCue.parentNode, null);
assert.equal(adoptedCausalTrace.parentNode, null);
assert.equal(adoptedProgressGuide.parentNode, null);
''',
    'test adopted causal trace destroy anchor',
)

test = replace_once(
    test,
    '''assert.equal(BATTLE_SCREEN_RUNTIME.currentActionAuthority, 'ACCEPTED_PUBLIC_MODEL_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.shieldLanePresentation, 'STRUCTURE_PLUS_EXACT_ACCEPTED_BOARD_RETURN_CUE_NO_SHIELD_STATE_INFERENCE');
''',
    '''assert.equal(BATTLE_SCREEN_RUNTIME.currentActionAuthority, 'ACCEPTED_PUBLIC_MODEL_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.causalTraceAuthority, 'MODEL_CAUSAL_RETURN_STAGES_ONLY_NO_RECALCULATION');
assert.equal(BATTLE_SCREEN_RUNTIME.causalTraceStageOrder, 'MODEL_ORDER_ONLY');
assert.equal(BATTLE_SCREEN_RUNTIME.shieldLanePresentation, 'STRUCTURE_PLUS_EXACT_ACCEPTED_BOARD_RETURN_CUE_NO_SHIELD_STATE_INFERENCE');
''',
    'test contract causal trace anchor',
)

TEST.write_text(test, encoding='utf-8')
print('patched runtime and test for causal trace r1')
