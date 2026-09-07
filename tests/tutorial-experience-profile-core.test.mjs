import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TUTORIAL_EXPERIENCE_PROFILE_SCHEMA,
  TUTORIAL_EXPERIENCE_SOURCE_GAMES,
  createTutorialExperienceProfileControl,
  projectTutorialExperienceHelp,
} from '../browser/tutorial-experience-profile-core.mjs';

test('beginner path becomes ready without requiring another card-game selection', () => {
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

test('experienced path cannot become ready until a source game is explicitly selected', () => {
  const control = createTutorialExperienceProfileControl();
  assert.equal(control.chooseAudience('experienced'), true);
  assert.equal(control.status().ready, false);
  assert.equal(control.status().requiresSourceGame, true);
  assert.equal(control.profile(), null);

  assert.equal(control.chooseSourceGame('shadowverse'), true);
  const profile = control.profile();
  assert.equal(profile.ready, true);
  assert.equal(profile.requiresSourceGame, false);
  assert.equal(profile.sourceGameId, 'shadowverse');
  assert.equal(profile.sourceGameLabel, 'シャドウバース／シャドウバース ワールズビヨンド');
  assert.equal(profile.translationMode, 'source-game-bridge');
});

test('supported source-game ids are unique and other uses a non-hallucinating general experienced mode', () => {
  const ids = TUTORIAL_EXPERIENCE_SOURCE_GAMES.map((game) => game.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'shadowverse',
    'master-duel',
    'pokemon-pocket',
    'mtg-arena',
    'hearthstone',
    'duel-masters-plays',
    'one-piece-card-game',
    'marvel-snap',
    'other',
  ]);

  const control = createTutorialExperienceProfileControl();
  assert.equal(control.chooseAudience('experienced'), true);
  assert.equal(control.chooseSourceGame('other'), true);
  assert.equal(control.status().translationMode, 'general-experienced');
  assert.equal(control.status().sourceGameLabel, 'その他');
});

test('unsupported or malformed source-game ids never fabricate a ready experienced profile', () => {
  const control = createTutorialExperienceProfileControl();
  assert.equal(control.chooseAudience('experienced'), true);
  for (const id of ['unknown-game', ' shadowverse', 'shadowverse ', '', null]) {
    assert.equal(control.chooseSourceGame(id), false);
    assert.equal(control.status().ready, false);
  }
});

test('changing audience clears stale source-game knowledge instead of leaking it into beginner guidance', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('master-duel');
  assert.equal(control.status().sourceGameId, 'master-duel');

  control.chooseAudience('beginner');
  assert.equal(control.status().sourceGameId, null);
  assert.equal(control.status().translationMode, 'plain-beginner');
});

test('without a ready profile the canonical GAMEROAD help text is preserved exactly', () => {
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '手札からロードカードを1枚選ぶ',
    focusRole: 'road',
  });
  assert.equal(help.message, '手札からロードカードを1枚選ぶ');
  assert.equal(help.canonicalMessage, '手札からロードカードを1枚選ぶ');
  assert.equal(help.focusRole, 'road');
  assert.equal(help.adapted, false);
  assert.equal(help.autoExecute, false);
  assert.equal(help.saveMutated, false);
  assert.equal(help.gameplayAuthorityMutated, false);
});

test('beginner help adds only a local plain-language bridge without changing the canonical action', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('beginner');
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '手札からロードカードを1枚選ぶ',
    focusRole: 'road',
    experienceProfile: control.profile(),
  });
  assert.equal(help.canonicalMessage, '手札からロードカードを1枚選ぶ');
  assert.equal(help.focusRole, 'road');
  assert.equal(help.adapted, true);
  assert.match(help.message, /^手札からロードカードを1枚選ぶ。/);
  assert.match(help.message, /まずは光っている場所から1枚選べばOK/);
  assert.doesNotMatch(help.message, /PP|マナクリスタル|ドン!!/);
});

test('Shadowverse experience bridges from known concepts while explicitly warning against false rule transfer', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('shadowverse');
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '手札からロードカードを1枚選ぶ',
    focusRole: 'road',
    experienceProfile: control.profile(),
  });
  assert.equal(help.sourceGameId, 'shadowverse');
  assert.equal(help.sourceGameLabel, 'シャドウバース／シャドウバース ワールズビヨンド');
  assert.equal(help.canonicalMessage, '手札からロードカードを1枚選ぶ');
  assert.match(help.message, /シャドウバース/);
  assert.match(help.message, /PP/);
  assert.match(help.message, /置き換える操作ではなく/);
  assert.match(help.message, /ロードとバトルを別に決める/);
  assert.equal(help.autoExecute, false);
  assert.equal(help.gameplayAuthorityMutated, false);
});

test('every named supported game produces its own bridge rather than a generic shortened TCG message', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  for (const game of TUTORIAL_EXPERIENCE_SOURCE_GAMES.filter((entry) => entry.id !== 'other')) {
    assert.equal(control.chooseSourceGame(game.id), true);
    const help = projectTutorialExperienceHelp({
      canonicalMessage: '次に、別のバトルカードを1枚選ぶ',
      focusRole: 'battle',
      experienceProfile: control.profile(),
    });
    assert.equal(help.adapted, true, game.id);
    assert.equal(help.sourceGameId, game.id, game.id);
    assert.equal(help.sourceGameLabel, game.label, game.id);
    assert.notEqual(help.message, help.canonicalMessage, game.id);
    assert.ok(help.message.includes(game.bridge), game.id);
    assert.ok(help.message.includes(game.difference), game.id);
  }
});

test('other card-game experience stays general and does not hallucinate a named game rule', () => {
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
  assert.doesNotMatch(help.message, /PP|フォロワー|マナクリスタル|ドン!!|ロケーション/);
});

test('missing canonical GAMEROAD text fails closed and never becomes an alternate rule source', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('mtg-arena');
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

test('profile and help projections are immutable presentation-only values', () => {
  const control = createTutorialExperienceProfileControl();
  control.chooseAudience('experienced');
  control.chooseSourceGame('hearthstone');
  const profile = control.profile();
  const help = projectTutorialExperienceHelp({
    canonicalMessage: '予約内容を確認して準備完了',
    focusRole: 'ready',
    experienceProfile: profile,
  });
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(help), true);
  assert.equal(help.presentationOnly, true);
  assert.equal(help.autoExecute, false);
  assert.equal(help.saveMutated, false);
  assert.equal(help.gameplayAuthorityMutated, false);
});
