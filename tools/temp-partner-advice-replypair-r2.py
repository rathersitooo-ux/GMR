from pathlib import Path
import hashlib


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: anchor count {count} != 1: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def git_blob_sha(path):
    data = Path(path).read_bytes()
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()

runtime = 'browser/partner-advice-runtime-mount.mjs'
replace_once(runtime,
"  selectApprovedPartnerIdleUtterance,\n} from './partner-dialogue-source-registry.mjs';\n",
"  selectApprovedPartnerIdleUtterance,\n  resolveApprovedPartnerAdviceReplyPairSource,\n} from './partner-dialogue-source-registry.mjs';\n")
replace_once(runtime,
"} from './tutorial-experience-profile-core.mjs';\n\nconst VERSION_KEYS",
"} from './tutorial-experience-profile-core.mjs';\nimport { projectPartnerAdviceReplyPair } from './partner-advice-player-control-core.mjs';\n\nconst VERSION_KEYS")
replace_once(runtime,
"const DELEGATE_REPLY_TEXT = 'まかせた！';\n",
"const DELEGATE_REPLY_TEXT = 'まかせた！';\nconst ADVICE_REPLY_RECEIPT_SCHEMA = 'gameroad.partner-advice-reply-pair-receipt.v1';\n")

control = r'''
function inactivePartnerAdviceReplyPairRuntime(reason, fingerprint = null) {
  return Object.freeze({
    schema: 'gameroad.partner-advice-reply-pair-runtime.v1',
    visible: false,
    reason,
    fingerprint,
    sourceId: null,
    dialogueVersion: null,
    conversationId: null,
    options: Object.freeze([]),
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    gameplayAuthorityMutated: false,
  });
}

function adviceReplyPairContext(context, pair) {
  const partnerId = exactPresentationToken(context?.partnerId);
  const matchId = exactPresentationToken(context?.matchId);
  const partnerText = typeof context?.partnerText === 'string' && context.partnerText.trim() === context.partnerText
    ? context.partnerText.slice(0, 240)
    : null;
  const round = Number.isInteger(context?.round) && context.round >= 0 ? context.round : 'x';
  if (!partnerId || !matchId || !partnerText || pair?.visible !== true) return null;
  return Object.freeze({
    partnerId,
    matchId,
    round,
    partnerText,
    fingerprint: JSON.stringify([
      partnerId,
      matchId,
      round,
      partnerText,
      pair.sourceId,
      pair.dialogueVersion,
      pair.conversationId,
    ]),
  });
}

export function createPartnerAdviceReplyPairControl({
  resolveSource = resolveApprovedPartnerAdviceReplyPairSource,
} = {}) {
  if (typeof resolveSource !== 'function') throw new TypeError('resolveSource must be a function');
  const consumed = new Set();
  const project = (context = {}) => {
    const partnerId = exactPresentationToken(context?.partnerId);
    if (!partnerId) return inactivePartnerAdviceReplyPairRuntime('CURRENT_PARTNER_REQUIRED');
    let source;
    try { source = resolveSource(partnerId); }
    catch { return inactivePartnerAdviceReplyPairRuntime('APPROVED_CURRENT_REPLY_SOURCE_REQUIRED'); }
    const pair = projectPartnerAdviceReplyPair({ source });
    if (!pair.visible) return Object.freeze({ ...pair, fingerprint: null });
    const current = adviceReplyPairContext(context, pair);
    if (!current) return inactivePartnerAdviceReplyPairRuntime('CURRENT_ADVICE_CONTEXT_REQUIRED');
    if (consumed.has(current.fingerprint)) {
      return Object.freeze({ ...pair, visible: false, reason: 'ALREADY_CONSUMED', fingerprint: current.fingerprint });
    }
    return Object.freeze({ ...pair, fingerprint: current.fingerprint });
  };
  return Object.freeze({
    project,
    commit({ optionId, expectedFingerprint, context } = {}) {
      const id = exactPresentationToken(optionId);
      const expected = exactPresentationToken(expectedFingerprint, 2048);
      if (!id || !expected) return null;
      const current = project(context);
      if (!current.visible || current.fingerprint !== expected || consumed.has(expected)) return null;
      const option = current.options.find((candidate) => candidate.id === id);
      if (!option) return null;
      consumed.add(expected);
      return Object.freeze({
        schema: ADVICE_REPLY_RECEIPT_SCHEMA,
        fingerprint: expected,
        optionId: option.id,
        playerText: option.label,
        sourceId: current.sourceId,
        dialogueVersion: current.dialogueVersion,
        conversationId: current.conversationId,
        presentationOnly: true,
        autoExecute: false,
        emits2v2Ping: false,
        gameplayAuthorityMutated: false,
        exactlyOnce: true,
      });
    },
    status() {
      return Object.freeze({
        consumedFingerprints: Object.freeze([...consumed]),
        presentationOnly: true,
        autoExecute: false,
        emits2v2Ping: false,
        gameplayAuthorityMutated: false,
      });
    },
  });
}

'''
replace_once(runtime,
"export const PARTNER_ADVICE_DELEGATE_REPLY_TEXT = DELEGATE_REPLY_TEXT;\n\n\nconst QUICK_ROUTE_SCHEMA",
"export const PARTNER_ADVICE_DELEGATE_REPLY_TEXT = DELEGATE_REPLY_TEXT;\n\n" + control + "const QUICK_ROUTE_SCHEMA")

replace_once(runtime,
'<div class="partnerAdviceSpeech player" aria-live="polite"></div><section class="partnerAdviceTutorialConversation"',
'<div class="partnerAdviceSpeech player" aria-live="polite"></div><div class="partnerAdviceReplyPair" data-role="advice-reply-pair" aria-label="返事を選ぶ" hidden></div><section class="partnerAdviceTutorialConversation"')
replace_once(runtime,
"  let lastReceipt = null;\n  let lastCharacterReaction = null;\n",
"  let lastReceipt = null;\n  let lastReplyPairReceipt = null;\n  let lastCharacterReaction = null;\n")
replace_once(runtime,
"  const quickRoutes = createPartnerAdviceQuickRouteControl();\n",
"  const quickRoutes = createPartnerAdviceQuickRouteControl();\n  const replyPair = createPartnerAdviceReplyPairControl();\n")
replace_once(runtime,
"    const tutorialStatus = tutorialReplay.refresh();\n",
"    const replyPairContext = Object.freeze({ partnerId: current?.partnerId, matchId: current?.matchId, round: current?.round, partnerText: current?.partnerText || null });\n    const replyPairProjection = projection.active && current?.partnerText ? replyPair.project(replyPairContext) : inactivePartnerAdviceReplyPairRuntime('CURRENT_ADVICE_CONTEXT_REQUIRED');\n    if (lastReplyPairReceipt && lastReplyPairReceipt.fingerprint !== replyPairProjection.fingerprint) lastReplyPairReceipt = null;\n    const tutorialStatus = tutorialReplay.refresh();\n")
replace_once(runtime,
"    const adviceSpeechActive = Boolean(projection.partnerText || projection.playerText || quickRouteStatus.active);\n",
"    const replyPairVisible = replyPairProjection.visible && !quickRouteStatus.active && !tutorialStatus.active && !tutorialExperienceStatus.active && !reactionActive;\n    const adviceSpeechActive = Boolean(projection.partnerText || projection.playerText || quickRouteStatus.active || lastReplyPairReceipt?.playerText);\n")
replace_once(runtime,
"      const playerSpeechText = quickRouteStatus.active ? quickRouteStatus.playerText || '' : projection.active ? projection.playerText || '' : '';\n",
"      const playerSpeechText = lastReplyPairReceipt?.playerText || (quickRouteStatus.active ? quickRouteStatus.playerText || '' : projection.active ? projection.playerText || '' : '');\n")
reply_render = r'''    const replyPairNode = root.querySelector('[data-role="advice-reply-pair"]');
    if (replyPairNode) {
      replyPairNode.hidden = !replyPairVisible;
      const signature = replyPairVisible ? `${replyPairProjection.fingerprint}:${replyPairProjection.options.map((option) => `${option.id}:${option.label}`).join('|')}` : 'hidden';
      if (replyPairNode.dataset.replyPairSignature !== signature) {
        replyPairNode.dataset.replyPairSignature = signature;
        replyPairNode.replaceChildren();
        if (replyPairVisible) {
          for (const option of replyPairProjection.options) {
            const choice = doc.createElement('button');
            choice.type = 'button';
            choice.className = 'partnerAdviceReplyPairChoice';
            choice.dataset.adviceReplyOption = option.id;
            choice.dataset.adviceReplyFingerprint = replyPairProjection.fingerprint;
            choice.textContent = option.label;
            replyPairNode.append(choice);
          }
        }
      }
    }
'''
replace_once(runtime,
"    const tutorialConversationNode = root.querySelector('[data-role=\"tutorial-experience-conversation\"]');\n",
reply_render + "    const tutorialConversationNode = root.querySelector('[data-role=\"tutorial-experience-conversation\"]');\n")
replace_once(runtime,
"      lastReceipt = null;\n      lastCharacterReaction = null;\n      quickRoutes.clear();\n",
"      lastReceipt = null;\n      lastReplyPairReceipt = null;\n      lastCharacterReaction = null;\n      quickRoutes.clear();\n")

click_handler = r'''
  const replyPairNode = root.querySelector('[data-role="advice-reply-pair"]');
  if (replyPairNode && replyPairNode.dataset.adviceReplyPairBound !== 'true') {
    replyPairNode.dataset.adviceReplyPairBound = 'true';
    replyPairNode.addEventListener('click', (event) => {
      const choice = event.target?.closest?.('[data-advice-reply-option]');
      const optionId = exactPresentationToken(choice?.dataset?.adviceReplyOption);
      const expectedFingerprint = choice?.dataset?.adviceReplyFingerprint;
      if (!optionId || !expectedFingerprint) return;
      const current = currentBattleChatSnapshot(win);
      const receipt = replyPair.commit({
        optionId,
        expectedFingerprint,
        context: Object.freeze({ partnerId: current?.partnerId, matchId: current?.matchId, round: current?.round, partnerText: current?.partnerText || null }),
      });
      if (!receipt) return;
      lastReplyPairReceipt = receipt;
      quickRoutes.clear();
      render();
    });
  }

'''
replace_once(runtime,
"  const tutorialChoices = root.querySelector('[data-role=\"tutorial-experience-choices\"]');\n",
click_handler + "  const tutorialChoices = root.querySelector('[data-role=\"tutorial-experience-choices\"]');\n")
replace_once(runtime,
"  return Object.freeze({ root, render, tutorialReplay, tutorialExperience, characterReaction, quickRoutes });\n",
"  return Object.freeze({ root, render, tutorialReplay, tutorialExperience, characterReaction, quickRoutes, replyPair });\n")

# Add runtime focused tests.
test_path = 'tests/partner-advice-runtime-mount.test.mjs'
replace_once(test_path,
"  createPartnerAdviceRuntimeControl,\n  createPartnerAdviceQuickRouteControl,\n",
"  createPartnerAdviceRuntimeControl,\n  createPartnerAdviceQuickReplyControl,\n  createPartnerAdviceReplyPairControl,\n  createPartnerAdviceQuickRouteControl,\n")
with Path(test_path).open('a', encoding='utf-8') as f:
    f.write(r'''

test('separate approved reply pair is presentation-only, stale-safe and exactly once', () => {
  const source = Object.freeze({
    approvedCurrent: true,
    sourceId: 'SOURCE-DIALOGUE-SAASUNA-20260810',
    dialogueVersion: 'saasuna.dialogue.current.r1.20260810',
    conversationId: 'battle_advice_reply_pair',
    options: Object.freeze([
      Object.freeze({ id: 'acknowledge', label: 'わかった' }),
      Object.freeze({ id: 'consider', label: 'ちょっと考える' }),
    ]),
  });
  const control = createPartnerAdviceReplyPairControl({
    resolveSource: (partnerId) => partnerId === 'partner.saasuna' ? source : null,
  });
  const context = Object.freeze({ partnerId: 'partner.saasuna', matchId: 'match-7', round: 2, partnerText: 'ここは左列です。' });
  const projected = control.project(context);
  assert.equal(projected.visible, true);
  assert.deepEqual(projected.options.map(({ id, label }) => ({ id, label })), [
    { id: 'acknowledge', label: 'わかった' },
    { id: 'consider', label: 'ちょっと考える' },
  ]);
  const receipt = control.commit({ optionId: 'acknowledge', expectedFingerprint: projected.fingerprint, context });
  assert.ok(receipt);
  assert.equal(receipt.playerText, 'わかった');
  assert.equal(receipt.presentationOnly, true);
  assert.equal(receipt.autoExecute, false);
  assert.equal(receipt.emits2v2Ping, false);
  assert.equal(receipt.gameplayAuthorityMutated, false);
  assert.equal(receipt.exactlyOnce, true);
  assert.equal(control.commit({ optionId: 'acknowledge', expectedFingerprint: projected.fingerprint, context }), null);
  assert.equal(control.project(context).reason, 'ALREADY_CONSUMED');

  const nextContext = Object.freeze({ ...context, partnerText: '次は中央列です。' });
  const next = control.project(nextContext);
  assert.equal(next.visible, true);
  assert.notEqual(next.fingerprint, projected.fingerprint);
  assert.equal(control.commit({ optionId: 'consider', expectedFingerprint: projected.fingerprint, context: nextContext }), null);
  assert.equal(control.project({ ...context, partnerId: 'partner.other' }).visible, false);
});

test('runtime mounts the reply pair inside the existing Partner chat surface without reusing delegation wording', () => {
  const runtimeSource = readFileSync(new URL('../browser/partner-advice-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(runtimeSource, /data-role="advice-reply-pair"/);
  assert.match(runtimeSource, /partnerAdviceReplyPairChoice/);
  assert.match(runtimeSource, /createPartnerAdviceReplyPairControl/);
  assert.doesNotMatch(runtimeSource, /で、かんじんの上策は？|上策を聞かせて/);
});
''')

# Public package must include the imported read-only core.
build = 'deploy/cloudflare/scripts/build.mjs'
anchor = "  { option: 'partnerAdviceRuntimeMountSource', expected: 'expectedPartnerAdviceRuntimeMountBlob', source: 'browser/partner-advice-runtime-mount.mjs', output: 'partner-advice-runtime-mount.mjs', artifact: 'partner_advice_runtime_mount', label: 'Partner advice runtime mount', sourceFlag: '--partner-advice-runtime-mount-source', expectedFlag: '--expected-partner-advice-runtime-mount-blob' },\n"
insert = anchor + "  { option: 'partnerAdvicePlayerControlCoreSource', expected: 'expectedPartnerAdvicePlayerControlCoreBlob', source: 'browser/partner-advice-player-control-core.mjs', output: 'partner-advice-player-control-core.mjs', artifact: 'partner_advice_player_control_core', label: 'Partner advice player control core', sourceFlag: '--partner-advice-player-control-core-source', expectedFlag: '--expected-partner-advice-player-control-core-blob' },\n"
replace_once(build, anchor, insert)

# Build-test dependency contract: runtime new blob + player-control core package row.
build_test = 'deploy/cloudflare/tests/build.test.mjs'
old_runtime_row = "  { file: 'partner-advice-runtime-mount.mjs', source: 'browser/partner-advice-runtime-mount.mjs', sourceArg: 'partnerAdviceRuntimeMountSource', expectedArg: 'expectedPartnerAdviceRuntimeMountBlob', artifact: 'partner_advice_runtime_mount', fixture: \"import './partner-legal-action-adapter.mjs';\\nimport './tutorial-experience-profile-core.mjs';\\nexport const PARTNER_ADVICE_RUNTIME = Object.freeze({});\\n\", currentBlob: '43287b732dc63c78d42b159094fd788b7a3555e7' },\n"
# Runtime blob is known only after this script writes it.
new_runtime_blob = git_blob_sha(runtime)
new_runtime_row = f"  {{ file: 'partner-advice-runtime-mount.mjs', source: 'browser/partner-advice-runtime-mount.mjs', sourceArg: 'partnerAdviceRuntimeMountSource', expectedArg: 'expectedPartnerAdviceRuntimeMountBlob', artifact: 'partner_advice_runtime_mount', fixture: \"import './partner-legal-action-adapter.mjs';\\nimport './tutorial-experience-profile-core.mjs';\\nimport './partner-advice-player-control-core.mjs';\\nexport const PARTNER_ADVICE_RUNTIME = Object.freeze({{}});\\n\", currentBlob: '{new_runtime_blob}' }},\n"
player_row = "  { file: 'partner-advice-player-control-core.mjs', source: 'browser/partner-advice-player-control-core.mjs', sourceArg: 'partnerAdvicePlayerControlCoreSource', expectedArg: 'expectedPartnerAdvicePlayerControlCoreBlob', artifact: 'partner_advice_player_control_core', fixture: \"export function projectPartnerAdviceReplyPair(){ return Object.freeze({ visible: false }); }\\n\", currentBlob: '39c080f1a543f777537f52391ab3b2d2814e357c' },\n"
replace_once(build_test, old_runtime_row, new_runtime_row + player_row)

print('patched runtime blob', new_runtime_blob)
