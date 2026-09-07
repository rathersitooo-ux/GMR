from pathlib import Path
import subprocess


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


partner = 'browser/partner-advice-runtime-mount.mjs'
replace_once(
    partner,
    "import { readBattleR75SelfHudDom } from './partner-battle-event-log-projection.mjs';\n",
    "import { readBattleR75SelfHudDom } from './partner-battle-event-log-projection.mjs';\nimport {\n  createTutorialExperienceProfileControl,\n  createTutorialSharedContextControl,\n  projectTutorialExperienceConversation,\n  projectTutorialExperienceHelp,\n} from './tutorial-experience-profile-core.mjs';\n",
    'partner tutorial core import',
)

control = '''export function createBattleTutorialExperienceConversationControl({
  isEligible = () => false,
  onChange,
} = {}) {
  if (typeof isEligible !== 'function') throw new TypeError('isEligible must be a function');
  if (onChange !== undefined && typeof onChange !== 'function') throw new TypeError('onChange must be a function when provided');

  const profileControl = createTutorialExperienceProfileControl();
  const sharedContextControl = createTutorialSharedContextControl();
  const changed = () => { if (typeof onChange === 'function') onChange(); };
  const eligible = () => {
    try {
      return isEligible() === true;
    } catch {
      return false;
    }
  };
  const inactiveConversation = () => Object.freeze({
    schema: 'gameroad.tutorial-experience-conversation.v1',
    active: false,
    reason: 'TUTORIAL_ELIGIBILITY_REQUIRED',
    stage: null,
    partnerText: null,
    options: Object.freeze([]),
    optional: false,
    readyForGameplayExplanation: false,
    canContinueWithoutSharedInterest: false,
    presentationOnly: true,
    persistenceOwned: false,
    tutorialRunOwned: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
    autoExecute: false,
  });
  const conversation = () => {
    if (!eligible()) return inactiveConversation();
    const current = projectTutorialExperienceConversation({
      experienceStatus: profileControl.status(),
      sharedContext: sharedContextControl.status(),
    });
    return Object.freeze({ ...current, active: true, reason: null });
  };
  const mutate = (operation) => {
    if (!eligible()) return false;
    const accepted = operation() === true;
    if (accepted) changed();
    return accepted;
  };

  return Object.freeze({
    chooseAudience(audienceId) {
      return mutate(() => profileControl.chooseAudience(audienceId));
    },
    chooseSourceGame(sourceGameId) {
      return mutate(() => profileControl.chooseSourceGame(sourceGameId));
    },
    chooseSharedInterest(sharedInterestId) {
      return mutate(() => sharedContextControl.chooseSharedInterest(sharedInterestId));
    },
    skipSharedInterest() {
      if (conversation().stage !== 'common-ground-optional') return false;
      return mutate(() => sharedContextControl.chooseSharedInterest('none'));
    },
    profile() {
      return eligible() ? profileControl.profile() : null;
    },
    conversation,
    adaptHelp({ canonicalMessage, focusRole } = {}) {
      return projectTutorialExperienceHelp({
        canonicalMessage,
        focusRole,
        experienceProfile: eligible() ? profileControl.profile() : null,
      });
    },
    status() {
      const current = conversation();
      return Object.freeze({
        eligible: eligible(),
        active: current.active === true,
        reason: current.reason ?? null,
        stage: current.stage ?? null,
        readyForGameplayExplanation: current.readyForGameplayExplanation === true,
        sourceGameId: profileControl.status().sourceGameId,
        sharedInterestId: sharedContextControl.status().sharedInterestId,
        conversation: current,
        presentationOnly: true,
        persistenceOwned: false,
        tutorialRunOwned: false,
        saveMutated: false,
        gameplayAuthorityMutated: false,
        autoExecute: false,
      });
    },
  });
}

'''
replace_once(
    partner,
    'export function projectBattleContextualTutorialReplay(snapshot = {}) {',
    control + 'export function projectBattleContextualTutorialReplay(snapshot = {}) {',
    'visible Tutorial experience control insertion',
)

replace_once(
    partner,
    "  setFocus = null,\n  onChange,\n} = {}) {\n  if (typeof getSnapshot !== 'function') throw new TypeError('getSnapshot must be a function');\n  if (showHelp !== null && typeof showHelp !== 'function') throw new TypeError('showHelp must be a function or null');\n  if (clearHelp !== null && typeof clearHelp !== 'function') throw new TypeError('clearHelp must be a function or null');\n  if (setFocus !== null && typeof setFocus !== 'function') throw new TypeError('setFocus must be a function or null');\n",
    "  setFocus = null,\n  getExperienceProfile = () => null,\n  onChange,\n} = {}) {\n  if (typeof getSnapshot !== 'function') throw new TypeError('getSnapshot must be a function');\n  if (showHelp !== null && typeof showHelp !== 'function') throw new TypeError('showHelp must be a function or null');\n  if (clearHelp !== null && typeof clearHelp !== 'function') throw new TypeError('clearHelp must be a function or null');\n  if (setFocus !== null && typeof setFocus !== 'function') throw new TypeError('setFocus must be a function or null');\n  if (typeof getExperienceProfile !== 'function') throw new TypeError('getExperienceProfile must be a function');\n",
    'contextual replay experience profile parameter',
)
replace_once(
    partner,
    "  const available = () => projection().active && typeof showHelp === 'function' && typeof clearHelp === 'function';\n  const status = () => {\n    const current = projection();\n    return Object.freeze({\n",
    "  const available = () => projection().active && typeof showHelp === 'function' && typeof clearHelp === 'function';\n  const helpMessage = (current) => {\n    try {\n      const adapted = projectTutorialExperienceHelp({\n        canonicalMessage: current?.message,\n        focusRole: current?.focusRole,\n        experienceProfile: getExperienceProfile(),\n      });\n      return adapted?.active && exactPresentationToken(adapted.message) ? adapted.message : current?.message ?? null;\n    } catch {\n      return current?.message ?? null;\n    }\n  };\n  const status = () => {\n    const current = projection();\n    return Object.freeze({\n",
    'contextual replay help adapter',
)
replace_once(partner, "      message: active ? current.message : null,\n", "      message: active ? helpMessage(current) : null,\n", 'contextual replay adapted status message')
replace_once(partner, "        message: current.message,\n        kind: 'ok',\n", "        message: helpMessage(current),\n        kind: 'ok',\n", 'contextual replay adapted shown message')

replace_once(
    partner,
    'export function mountPartnerAdviceChatPresentation({ windowRef = globalThis.window } = {}) {',
    "export function mountPartnerAdviceChatPresentation({ windowRef = globalThis.window, tutorialExperienceEligibility = () => false } = {}) {\n  if (typeof tutorialExperienceEligibility !== 'function') throw new TypeError('tutorialExperienceEligibility must be a function');",
    'mount eligibility injection',
)
replace_once(
    partner,
    '.partnerAdviceQuickReply,.partnerAdviceTutorialReplay{min-height:44px;padding:9px 14px;border-radius:12px;font-size:11px;font-weight:950}',
    '.partnerAdviceQuickReply,.partnerAdviceTutorialReplay,.partnerAdviceTutorialChoice,.partnerAdviceTutorialSkip{min-height:44px;padding:9px 14px;border-radius:12px;font-size:11px;font-weight:950}.partnerAdviceTutorialConversation{display:grid;gap:6px;padding:8px;border:1px solid rgba(173,235,214,.3);border-radius:10px;background:rgba(7,31,27,.86)}.partnerAdviceTutorialConversation[hidden]{display:none}.partnerAdviceTutorialQuestion{font-size:11px;font-weight:850;line-height:1.45}.partnerAdviceTutorialChoices{display:flex;flex-wrap:wrap;gap:6px}.partnerAdviceTutorialChoice,.partnerAdviceTutorialSkip{border:1px solid rgba(173,235,214,.38);background:rgba(10,45,38,.78);color:#e4fff6}.partnerAdviceTutorialSkip{justify-self:start}',
    'tutorial conversation styles',
)
replace_once(
    partner,
    '<div class="partnerAdviceSpeech player" aria-live="polite"></div><button type="button" class="partnerAdviceTutorialReplay"',
    '<div class="partnerAdviceSpeech player" aria-live="polite"></div><section class="partnerAdviceTutorialConversation" data-role="tutorial-experience-conversation" aria-live="polite" hidden><div class="partnerAdviceTutorialQuestion" data-role="tutorial-experience-question"></div><div class="partnerAdviceTutorialChoices" data-role="tutorial-experience-choices"></div><button type="button" class="partnerAdviceTutorialSkip" data-role="tutorial-experience-skip" hidden>このまま進む</button></section><button type="button" class="partnerAdviceTutorialReplay"',
    'tutorial conversation DOM',
)
replace_once(
    partner,
    "  characterReaction.prime(readBattleR75SelfHudDom(doc)?.resolution);\n  const tutorialReplay = createBattleContextualTutorialReplayControl({\n",
    "  characterReaction.prime(readBattleR75SelfHudDom(doc)?.resolution);\n  const tutorialExperience = createBattleTutorialExperienceConversationControl({\n    isEligible: tutorialExperienceEligibility,\n  });\n  const tutorialReplay = createBattleContextualTutorialReplayControl({\n",
    'instantiate tutorial experience control',
)
replace_once(
    partner,
    "    setFocus: (role) => setBattleContextualTutorialFocus(doc, role),\n  });\n",
    "    setFocus: (role) => setBattleContextualTutorialFocus(doc, role),\n    getExperienceProfile: () => tutorialExperience.profile(),\n  });\n",
    'connect experience profile to contextual help',
)
replace_once(
    partner,
    "    const tutorialStatus = tutorialReplay.refresh();\n    const reactionActive = Boolean(lastCharacterReaction?.partnerText);\n    root.hidden = !projection.active && !tutorialStatus.available && !reactionActive && !roleControlActive;\n",
    "    const tutorialStatus = tutorialReplay.refresh();\n    const tutorialExperienceStatus = tutorialExperience.status();\n    const tutorialConversation = tutorialExperienceStatus.conversation;\n    const reactionActive = Boolean(lastCharacterReaction?.partnerText);\n    root.hidden = !projection.active && !tutorialStatus.available && !tutorialExperienceStatus.active && !reactionActive && !roleControlActive;\n",
    'include Tutorial conversation in visibility',
)
ui_render = '''    const tutorialConversationNode = root.querySelector('[data-role="tutorial-experience-conversation"]');
    if (tutorialConversationNode) tutorialConversationNode.hidden = !tutorialExperienceStatus.active;
    const tutorialQuestion = root.querySelector('[data-role="tutorial-experience-question"]');
    if (tutorialQuestion) tutorialQuestion.textContent = tutorialExperienceStatus.active ? tutorialConversation.partnerText || '' : '';
    const tutorialChoices = root.querySelector('[data-role="tutorial-experience-choices"]');
    if (tutorialChoices) {
      const options = tutorialExperienceStatus.active && Array.isArray(tutorialConversation.options) ? tutorialConversation.options : [];
      const signature = `${tutorialConversation.stage || 'none'}:${options.map((option) => `${option.id}:${option.label}`).join('|')}`;
      if (tutorialChoices.dataset.tutorialChoicesSignature !== signature) {
        tutorialChoices.dataset.tutorialChoicesSignature = signature;
        tutorialChoices.replaceChildren();
        for (const option of options) {
          const choice = doc.createElement('button');
          choice.type = 'button';
          choice.className = 'partnerAdviceTutorialChoice';
          choice.dataset.tutorialChoiceId = option.id;
          choice.textContent = option.label;
          tutorialChoices.append(choice);
        }
      }
    }
    const tutorialSkip = root.querySelector('[data-role="tutorial-experience-skip"]');
    if (tutorialSkip) tutorialSkip.hidden = !(tutorialExperienceStatus.active && tutorialConversation.stage === 'common-ground-optional' && tutorialConversation.optional === true);
'''
replace_once(partner, "    const button = root.querySelector('.partnerAdviceQuickReply');\n", ui_render + "    const button = root.querySelector('.partnerAdviceQuickReply');\n", 'render Tutorial conversation choices')
event_bind = '''  const tutorialChoices = root.querySelector('[data-role="tutorial-experience-choices"]');
  if (tutorialChoices && tutorialChoices.dataset.tutorialExperienceBound !== 'true') {
    tutorialChoices.dataset.tutorialExperienceBound = 'true';
    tutorialChoices.addEventListener('click', (event) => {
      const choice = event.target?.closest?.('[data-tutorial-choice-id]');
      const choiceId = exactPresentationToken(choice?.dataset?.tutorialChoiceId);
      if (!choiceId) return;
      const stage = tutorialExperience.conversation().stage;
      if (stage === 'experience-opener') tutorialExperience.chooseAudience(choiceId);
      else if (stage === 'source-game-follow-up') tutorialExperience.chooseSourceGame(choiceId);
      else if (stage === 'common-ground-optional') tutorialExperience.chooseSharedInterest(choiceId);
      render();
    });
  }

  const tutorialSkip = root.querySelector('[data-role="tutorial-experience-skip"]');
  if (tutorialSkip && tutorialSkip.dataset.tutorialExperienceSkipBound !== 'true') {
    tutorialSkip.dataset.tutorialExperienceSkipBound = 'true';
    tutorialSkip.addEventListener('click', () => {
      if (tutorialExperience.skipSharedInterest()) render();
    });
  }

'''
replace_once(partner, "  const switchButton = root.querySelector('.partnerAdvicePartnerSwitch');\n", event_bind + "  const switchButton = root.querySelector('.partnerAdvicePartnerSwitch');\n", 'bind Tutorial conversation choices')
replace_once(partner, '  return Object.freeze({ root, render, tutorialReplay, characterReaction });', '  return Object.freeze({ root, render, tutorialReplay, tutorialExperience, characterReaction });', 'return Tutorial conversation control')


tests = 'tests/partner-advice-runtime-mount.test.mjs'
replace_once(tests, '  createBattleContextualTutorialReplayControl,\n', '  createBattleContextualTutorialReplayControl,\n  createBattleTutorialExperienceConversationControl,\n', 'test import visible Tutorial control')
test_block = '''
test('Tutorial experience conversation fails closed until a caller supplies explicit eligibility', () => {
  const control = createBattleTutorialExperienceConversationControl();
  const status = control.status();
  assert.equal(status.eligible, false);
  assert.equal(status.active, false);
  assert.equal(status.reason, 'TUTORIAL_ELIGIBILITY_REQUIRED');
  assert.equal(status.conversation.partnerText, null);
  assert.equal(control.chooseAudience('experienced'), false);
  assert.equal(control.profile(), null);
  const help = control.adaptHelp({ canonicalMessage: '正式GAMEROAD操作', focusRole: 'road' });
  assert.equal(help.message, '正式GAMEROAD操作');
  assert.equal(help.adapted, false);
});

test('eligible Tutorial experience is a natural Saasuna conversation and adapts only after a known game is chosen', () => {
  const control = createBattleTutorialExperienceConversationControl({ isEligible: () => true });
  assert.equal(control.conversation().partnerText, 'そういえば、カードゲームって普段やる？');
  assert.deepEqual(control.conversation().options.map((option) => option.label), ['やるよ', 'ほとんどやらない']);
  assert.equal(control.chooseAudience('experienced'), true);
  assert.equal(control.conversation().stage, 'source-game-follow-up');
  assert.deepEqual(control.conversation().options.map((option) => option.id), ['master-duel', 'duel-masters-plays', 'pokemon-pocket', 'shadowverse', 'other']);
  assert.equal(control.chooseSourceGame('master-duel'), true);
  assert.equal(control.conversation().stage, 'ready');
  const help = control.adaptHelp({ canonicalMessage: '正式GAMEROAD操作', focusRole: 'road' });
  assert.equal(help.adapted, true);
  assert.match(help.message, /遊戯王/);
  assert.match(help.message, /1対1対応/);
  assert.equal(help.canonicalMessage, '正式GAMEROAD操作');
  assert.equal(control.status().saveMutated, false);
  assert.equal(control.status().gameplayAuthorityMutated, false);
});

test('beginner common-ground branch is optional and skip never becomes a gameplay rule mapping', () => {
  const control = createBattleTutorialExperienceConversationControl({ isEligible: () => true });
  assert.equal(control.chooseAudience('beginner'), true);
  assert.equal(control.conversation().stage, 'common-ground-optional');
  assert.equal(control.conversation().optional, true);
  assert.equal(control.conversation().readyForGameplayExplanation, true);
  assert.equal(control.skipSharedInterest(), true);
  assert.equal(control.status().sharedInterestId, 'none');
  assert.equal(control.conversation().stage, 'ready');
  const help = control.adaptHelp({ canonicalMessage: '正式GAMEROAD操作', focusRole: 'ready' });
  assert.equal(help.canonicalMessage, '正式GAMEROAD操作');
  assert.doesNotMatch(help.message, /パチンコ|競馬|麻雀/);
});

test('contextual help keeps canonical text before a profile is ready and uses the selected-game bridge afterward', () => {
  let profile = null;
  const shown = [];
  const control = createBattleContextualTutorialReplayControl({
    getSnapshot: () => ({ screen: 'battle', phase: 'plan', busy: false, roadId: null, battleId: null }),
    getExperienceProfile: () => profile,
    showHelp: (payload) => { shown.push(payload); return true; },
    clearHelp: () => true,
  });
  assert.equal(control.open(), true);
  assert.equal(shown.at(-1).message, '手札からロードカードを1枚選ぶ');
  const experience = createBattleTutorialExperienceConversationControl({ isEligible: () => true });
  experience.chooseAudience('experienced');
  experience.chooseSourceGame('shadowverse');
  profile = experience.profile();
  control.refresh();
  assert.match(shown.at(-1).message, /シャドバ/);
  assert.match(shown.at(-1).message, /PP/);
});

'''
replace_once(tests, "test('Tutorial Battle starts Saasuna auto guide on and disabling it never disables on-demand conversation', () => {", test_block + "test('Tutorial Battle starts Saasuna auto guide on and disabling it never disables on-demand conversation', () => {", 'visible Tutorial control tests')


build = 'deploy/cloudflare/scripts/build.mjs'
spec = "  { option: 'tutorialExperienceProfileCoreSource', expected: 'expectedTutorialExperienceProfileCoreBlob', source: 'browser/tutorial-experience-profile-core.mjs', output: 'tutorial-experience-profile-core.mjs', artifact: 'tutorial_experience_profile_core', label: 'Tutorial experience profile core', sourceFlag: '--tutorial-experience-profile-core-source', expectedFlag: '--expected-tutorial-experience-profile-core-blob' },\n"
replace_once(
    build,
    "  { option: 'partnerAdviceRuntimeMountSource', expected: 'expectedPartnerAdviceRuntimeMountBlob', source: 'browser/partner-advice-runtime-mount.mjs', output: 'partner-advice-runtime-mount.mjs', artifact: 'partner_advice_runtime_mount', label: 'Partner advice runtime mount', sourceFlag: '--partner-advice-runtime-mount-source', expectedFlag: '--expected-partner-advice-runtime-mount-blob' },\n",
    "  { option: 'partnerAdviceRuntimeMountSource', expected: 'expectedPartnerAdviceRuntimeMountBlob', source: 'browser/partner-advice-runtime-mount.mjs', output: 'partner-advice-runtime-mount.mjs', artifact: 'partner_advice_runtime_mount', label: 'Partner advice runtime mount', sourceFlag: '--partner-advice-runtime-mount-source', expectedFlag: '--expected-partner-advice-runtime-mount-blob' },\n" + spec,
    'public Tutorial experience artifact spec',
)


build_test = 'deploy/cloudflare/tests/build.test.mjs'
dep_entry = "  { file: 'tutorial-experience-profile-core.mjs', source: 'browser/tutorial-experience-profile-core.mjs', sourceArg: 'tutorialExperienceProfileCoreSource', expectedArg: 'expectedTutorialExperienceProfileCoreBlob', artifact: 'tutorial_experience_profile_core', fixture: \"export function createTutorialExperienceProfileControl(){ return Object.freeze({}); }\\nexport function createTutorialSharedContextControl(){ return Object.freeze({}); }\\nexport function projectTutorialExperienceConversation(){ return Object.freeze({}); }\\nexport function projectTutorialExperienceHelp({ canonicalMessage }){ return Object.freeze({ active: true, message: canonicalMessage, adapted: false }); }\\n\", currentBlob: 'bed4a3f1fcf252e83373a5327e846c306b2a55b9' },\n"
replace_once(
    build_test,
    "  { file: 'partner-advice-runtime-mount.mjs', source: 'browser/partner-advice-runtime-mount.mjs', sourceArg: 'partnerAdviceRuntimeMountSource', expectedArg: 'expectedPartnerAdviceRuntimeMountBlob', artifact: 'partner_advice_runtime_mount', fixture: \"import './partner-legal-action-adapter.mjs';\\nexport const PARTNER_ADVICE_RUNTIME = Object.freeze({});\\n\", currentBlob: '95567bf94bae3b278578a967a23d769f80d98c28' },\n",
    "  { file: 'partner-advice-runtime-mount.mjs', source: 'browser/partner-advice-runtime-mount.mjs', sourceArg: 'partnerAdviceRuntimeMountSource', expectedArg: 'expectedPartnerAdviceRuntimeMountBlob', artifact: 'partner_advice_runtime_mount', fixture: \"import './partner-legal-action-adapter.mjs';\\nimport './tutorial-experience-profile-core.mjs';\\nexport const PARTNER_ADVICE_RUNTIME = Object.freeze({});\\n\", currentBlob: '__PARTNER_RUNTIME_BLOB__' },\n" + dep_entry,
    'public package test dependency contract',
)
partner_blob = subprocess.check_output(['git', 'hash-object', partner], text=True).strip()
p = Path(build_test)
text = p.read_text(encoding='utf-8')
if text.count('__PARTNER_RUNTIME_BLOB__') != 1:
    raise SystemExit('partner runtime blob placeholder count mismatch')
p.write_text(text.replace('__PARTNER_RUNTIME_BLOB__', partner_blob, 1), encoding='utf-8')
print('partner runtime blob', partner_blob)
