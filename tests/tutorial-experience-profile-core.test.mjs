import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TUTORIAL_EXPERIENCE_CONVERSATION_SCHEMA,
  TUTORIAL_EXPERIENCE_PROFILE_SCHEMA,
  TUTORIAL_EXPERIENCE_PROMPT_SCHEMA,
  TUTORIAL_EXPERIENCE_SOURCE_GAMES,
  TUTORIAL_SHARED_CONTEXT_SCHEMA,
  TUTORIAL_SHARED_INTERESTS,
  createTutorialExperienceProfileControl,
  createTutorialSharedContextControl,
  projectTutorialExperienceConversation,
  projectTutorialExperienceHelp,
  projectTutorialExperiencePrompt,
} from '../browser/tutorial-experience-profile-core.mjs';

test('beginner path becomes ready without requiring card-game or shared-interest selection', () => {
  const control = createTutorialExperienceProfileControl();
  assert.equal(control.status().ready, false);
  assert.equal(control.chooseAudience('beginner'), true);
  assert.deepEqual(control.status(), {
    schema: TUTORIAL_EXPERIENCE_PROFILE_SCHEMA,
    audience: 'beginner',
    sourceGameId: null,
    sourceGameLabel: null,
    ready: true,
    requiresSourceGame: false,
    translationMode: 'plain-beginner',
    persistenceOwned: false,
    tutorialRunOwned: false,
    gameplayAuthorityMutated: false,
  });
  assert.equal(control.chooseSourceGame('shadowverse'), false);
});

test('experienced path cannot become ready until a supported source game is selected', () => {
  const control = createTutorialExperienceProfileControl();
  assert.equal(control.chooseAudience('experienced'), true);
  assert.equal(control.status().ready, false);
  assert.equal(control.status().requiresSourceGame, true);
  assert.equal(control.profile(), null);

  assert.equal(control.chooseSourceGame('master-duel'), true);
  const profile = control.profile();
  assert.equal(profile.ready, true);
  assert.equal(profile.requiresSourceGame, false);
  assert.equal(profile.sourceGameId, 'master-duel');
  assert.equal(profile.sourceGameLabel, '遊戯王／マスターデュエル');
  assert.equal(profile.translationMode, 'source-game-bridge');
});

test('initial named card-game bridges are only Yu-Gi-Oh, Duel Masters, Pokemon, Shadowverse, and other', () => {
  const ids = TUTORIAL_EXPERIENCE_SOURCE_GAMES.map((game) => game.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'master-duel',
    'duel-masters-plays',
    'pokemon-pocket',
    'shadowverse',
    'other',
  ]);
  for (const removed of ['mtg-arena', 'hearthstone', 'one-piece-card-game', 'marvel-snap']) {
    assert.equal(ids.includes(removed), false, removed);
  }
});

test('other card-game experience stays general instead of inventing a named-game rule', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  assert.equal(control.chooseSourceGame('other'), true);
  assert.equal(control.status().translationMode, 'general-experienced');
  assert.equal(control.status().sourceGameLabel, 'その他のカードゲーム');
});

test('unsupported, removed, or malformed source-game ids fail closed', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  for (const id of ['mtg-arena', 'hearthstone', 'marvel-snap', 'unknown-game', ' master-duel', 'master-duel ', '', null]) {
    assert.equal(control.chooseSourceGame(id), false, String(id));
    assert.equal(control.status().ready, false, String(id));
  }
});

test('changing audience clears stale source-game knowledge', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('master-duel');
  assert.equal(control.status().sourceGameId, 'master-duel');

  control.chooseAudience('beginner');
  assert.equal(control.status().sourceGameId, null);
  assert.equal(control.status().translationMode, 'plain-beginner');
});

test('shared interests are common-ground context only and never required for Tutorial progression', () => {
  assert.deepEqual(TUTORIAL_SHARED_INTERESTS.map((interest) => interest.id), [
    'pachinko-slots',
    'horse-racing',
    'mahjong',
    'video-games',
    'other',
    'none',
  ]);
  assert.equal(TUTORIAL_SHARED_INTERESTS.every((interest) => interest.commonGroundOnly === true), true);

  const context = createTutorialSharedContextControl();
  assert.deepEqual(context.status(), {
    schema: TUTORIAL_SHARED_CONTEXT_SCHEMA,
    sharedInterestId: null,
    sharedInterestLabel: null,
    commonGroundOnly: false,
    relationshipFrame: 'familiar-peer',
    relationshipQuestionnaireRequired: false,
    requiredForTutorial: false,
    persistenceOwned: false,
    tutorialRunOwned: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
  });
  assert.equal(context.chooseSharedInterest('pachinko-slots'), true);
  assert.equal(context.status().sharedInterestLabel, 'パチンコ／スロット');
  assert.equal(context.status().commonGroundOnly, true);
  assert.equal(context.status().requiredForTutorial, false);
  assert.equal(context.chooseSharedInterest('unknown-interest'), false);
});

test('preferred first-Tutorial surface opens as a natural Saasuna conversation rather than a questionnaire title', () => {
  const conversation = projectTutorialExperienceConversation();
  assert.equal(conversation.schema, TUTORIAL_EXPERIENCE_CONVERSATION_SCHEMA);
  assert.equal(conversation.stage, 'experience-opener');
  assert.equal(conversation.partnerText, 'そういえば、カードゲームって普段やる？');
  assert.deepEqual(conversation.options.map((option) => option.id), ['experienced', 'beginner']);
  assert.deepEqual(conversation.options.map((option) => option.label), ['やるよ', 'ほとんどやらない']);
  assert.equal(conversation.relationshipFrame, 'familiar-peer');
  assert.equal(conversation.relationshipQuestionnaireRequired, false);
  assert.equal(conversation.readyForGameplayExplanation, false);
});

test('experienced conversation naturally asks which of the bounded source games is familiar', () => {
  const profile = createTutorialExperienceProfileControl();
  profile.chooseAudience('experienced');
  const conversation = projectTutorialExperienceConversation({ experienceStatus: profile.status() });
  assert.equal(conversation.stage, 'source-game-follow-up');
  assert.match(conversation.partnerText, /何やってる/);
  assert.match(conversation.partnerText, /話が通じる/);
  assert.deepEqual(
    conversation.options.map((option) => option.id),
    ['master-duel', 'duel-masters-plays', 'pokemon-pocket', 'shadowverse', 'other'],
  );
  assert.equal(conversation.readyForGameplayExplanation, false);
});

test('beginner conversation may ask about shared interests but never blocks gameplay explanation on that answer', () => {
  const profile = createTutorialExperienceProfileControl();
  profile.chooseAudience('beginner');
  const conversation = projectTutorialExperienceConversation({ experienceStatus: profile.status() });
  assert.equal(conversation.stage, 'common-ground-optional');
  assert.equal(conversation.optional, true);
  assert.equal(conversation.readyForGameplayExplanation, true);
  assert.equal(conversation.canContinueWithoutSharedInterest, true);
  assert.match(conversation.partnerText, /普段は何やる/);
  assert.deepEqual(conversation.options, TUTORIAL_SHARED_INTERESTS);
});

test('shared hobby changes conversational common ground without becoming a GAMEROAD rule bridge', () => {
  const profile = createTutorialExperienceProfileControl();
  const context = createTutorialSharedContextControl();
  profile.chooseAudience('beginner');
  context.chooseSharedInterest('horse-racing');
  const conversation = projectTutorialExperienceConversation({
    experienceStatus: profile.status(),
    sharedContext: context.status(),
  });
  assert.equal(conversation.stage, 'ready');
  assert.equal(conversation.sharedInterestId, 'horse-racing');
  assert.equal(conversation.sharedInterestLabel, '競馬');
  assert.equal(conversation.commonGroundOnly, true);
  assert.match(conversation.partnerText, /競馬の話なら通じそう/);
  assert.doesNotMatch(conversation.partnerText, /GAMEROADでは競馬と同じ|馬券|オッズ|的中/);
  assert.equal(conversation.gameplayAuthorityMutated, false);
});

test('named source-game conversation reaches a familiar-peer ready state', () => {
  const profile = createTutorialExperienceProfileControl();
  profile.chooseAudience('experienced');
  profile.chooseSourceGame('shadowverse');
  const conversation = projectTutorialExperienceConversation({ experienceStatus: profile.status() });
  assert.equal(conversation.stage, 'ready');
  assert.equal(conversation.sourceGameId, 'shadowverse');
  assert.match(conversation.partnerText, /シャドウバース/);
  assert.match(conversation.partnerText, /話は早い/);
  assert.equal(conversation.relationshipFrame, 'familiar-peer');
  assert.equal(conversation.autoExecute, false);
});

test('legacy prompt projection remains a compatibility surface for existing callers', () => {
  const prompt = projectTutorialExperiencePrompt();
  assert.equal(prompt.schema, TUTORIAL_EXPERIENCE_PROMPT_SCHEMA);
  assert.equal(prompt.stage, 'audience');
  assert.equal(prompt.question, 'カードゲームの経験は？');
  assert.deepEqual(prompt.options.map((option) => option.id), ['beginner', 'experienced']);
  assert.equal(prompt.ready, false);
  assert.equal(prompt.canShowContextualHelp, false);

  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  const sourcePrompt = projectTutorialExperiencePrompt(control.status());
  assert.equal(sourcePrompt.stage, 'source-game');
  assert.deepEqual(
    sourcePrompt.options.map((option) => option.id),
    ['master-duel', 'duel-masters-plays', 'pokemon-pocket', 'shadowverse', 'other'],
  );
});

test('malformed prompt state fails closed instead of inventing a profile', () => {
  for (const malformed of [
    { audience: ' experienced', sourceGameId: 'shadowverse' },
    { audience: 'experienced', sourceGameId: 'unknown-game' },
    [],
    'experienced',
  ]) {
    const prompt = projectTutorialExperiencePrompt(malformed);
    if (malformed?.audience === 'experienced') {
      assert.equal(prompt.stage, 'source-game');
      assert.equal(prompt.sourceGameId, null);
    } else {
      assert.equal(prompt.stage, 'audience');
      assert.equal(prompt.audience, null);
    }
    assert.equal(prompt.ready, false);
    assert.equal(prompt.canShowContextualHelp, false);
  }
});

test('without a ready profile canonical GAMEROAD help is preserved exactly', () => {
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '手札からロードカードを1枚選ぶ',
    focusRole: 'road',
  });
  assert.equal(help.message, '手札からロードカードを1枚選ぶ');
  assert.equal(help.canonicalMessage, '手札からロードカードを1枚選ぶ');
  assert.equal(help.adapted, false);
  assert.equal(help.autoExecute, false);
  assert.equal(help.saveMutated, false);
  assert.equal(help.gameplayAuthorityMutated, false);
});

test('beginner help stays local and plain-language', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('beginner');
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '手札からロードカードを1枚選ぶ',
    focusRole: 'road',
    experienceProfile: control.profile(),
  });
  assert.equal(help.canonicalMessage, '手札からロードカードを1枚選ぶ');
  assert.match(help.message, /まずは光っている場所から1枚選べばOK/);
  assert.doesNotMatch(help.message, /PP|マナゾーン|エネルギー/);
});

test('each named supported card game contributes its own bridge and explicit difference warning', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  for (const game of TUTORIAL_EXPERIENCE_SOURCE_GAMES.filter((entry) => entry.id !== 'other')) {
    assert.equal(control.chooseSourceGame(game.id), true, game.id);
    const help = projectTutorialExperienceHelp({
      canonicalMessage: '次に、別のバトルカードを1枚選ぶ',
      focusRole: 'battle',
      experienceProfile: control.profile(),
    });
    assert.equal(help.adapted, true, game.id);
    assert.equal(help.sourceGameId, game.id, game.id);
    assert.ok(help.message.includes(game.bridge), game.id);
    assert.ok(help.message.includes(game.difference), game.id);
    assert.equal(help.canonicalMessage, '次に、別のバトルカードを1枚選ぶ', game.id);
  }
});

test('other card-game help remains general and non-hallucinating', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('other');
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '予約内容を確認して準備完了',
    focusRole: 'ready',
    experienceProfile: control.profile(),
  });
  assert.equal(help.sourceGameId, 'other');
  assert.match(help.message, /別作品のルールへ無理に置き換えず/);
  assert.doesNotMatch(help.message, /PP|マナゾーン|エネルギー|召喚/);
});

test('missing canonical GAMEROAD text fails closed and never becomes an alternate rule source', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('duel-masters-plays');
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '',
    focusRole: 'road',
    experienceProfile: control.profile(),
  });
  assert.equal(help.active, false);
  assert.equal(help.reason, 'CANONICAL_MESSAGE_REQUIRED');
  assert.equal(help.message, null);
  assert.equal(help.autoExecute, false);
  assert.equal(help.saveMutated, false);
  assert.equal(help.gameplayAuthorityMutated, false);
});

test('profile, shared context, conversation, prompt and help stay immutable presentation-only values', () => {
  const profileControl = createTutorialExperienceProfileControl();
  const contextControl = createTutorialSharedContextControl();
  profileControl.chooseAudience('experienced');
  profileControl.chooseSourceGame('pokemon-pocket');
  contextControl.chooseSharedInterest('video-games');
  const profile = profileControl.profile();
  const context = contextControl.status();
  const conversation = projectTutorialExperienceConversation({ experienceStatus: profileControl.status(), sharedContext: context });
  const prompt = projectTutorialExperiencePrompt(profileControl.status());
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '予約内容を確認して準備完了',
    focusRole: 'ready',
    experienceProfile: profile,
  });
  for (const value of [profile, context, conversation, prompt, help]) assert.equal(Object.isFrozen(value), true);
  assert.equal(conversation.presentationOnly, true);
  assert.equal(conversation.persistenceOwned, false);
  assert.equal(conversation.tutorialRunOwned, false);
  assert.equal(conversation.saveMutated, false);
  assert.equal(conversation.gameplayAuthorityMutated, false);
  assert.equal(conversation.autoExecute, false);
  assert.equal(prompt.presentationOnly, true);
  assert.equal(prompt.persistenceOwned, false);
  assert.equal(help.presentationOnly, true);
  assert.equal(help.autoExecute, false);
});
