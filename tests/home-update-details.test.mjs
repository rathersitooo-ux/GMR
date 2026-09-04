import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_UPDATE_DETAILS_MANIFEST_URL,
  isUpdateBannerMessage,
  parsePublishedReleaseNotes,
} from '../browser/home-shell-presentation-core.mjs';

const publicManifest = () => ({
  schema: 'gameroad.release-comms.v1',
  channel: 'public',
  build_id: 'a'.repeat(40),
  published_at: '2026-09-04T03:00:00Z',
  release_notes: {
    state: 'PUBLISHED',
    items: [
      {
        id: '2026-09-04-cards-partner-quality',
        title: 'カードと相棒まわりを改善',
        changes: [
          'カード画面で、この端末に設定したローカルカードスキンが自分のカード表示に反映されるようになりました。',
          '相棒へのメッセージ送信に失敗したとき、入力内容が戻るようになり、そのまま再送しやすくなりました。',
          '相棒の対戦リアクションが、GAMEROADの結果ルールと食い違わないよう修正しました。',
        ],
      },
    ],
  },
});

test('Home update details consume only the published public release-notes contract', () => {
  const notes = parsePublishedReleaseNotes(publicManifest());
  assert.equal(HOME_UPDATE_DETAILS_MANIFEST_URL, './gameroad-release-comms.json');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'カードと相棒まわりを改善');
  assert.equal(notes[0].changes.length, 3);
  assert.equal(Object.isFrozen(notes), true);
  assert.equal(Object.isFrozen(notes[0].changes), true);
});

test('Home update details fail closed for unpublished, wrong-channel, or malformed release notes', () => {
  const unpublished = publicManifest();
  unpublished.release_notes = { state: 'UNPUBLISHED', items: [] };
  assert.equal(parsePublishedReleaseNotes(unpublished), null);

  const privateChannel = publicManifest();
  privateChannel.channel = 'internal';
  assert.equal(parsePublishedReleaseNotes(privateChannel), null);

  const malformed = publicManifest();
  malformed.release_notes.items[0].changes = [];
  assert.equal(parsePublishedReleaseNotes(malformed), null);
});

test('Home update trigger targets the existing update notice text rather than unrelated copy', () => {
  assert.equal(isUpdateBannerMessage('アップデートがあります'), true);
  assert.equal(isUpdateBannerMessage('  アップデートがあります  '), true);
  assert.equal(isUpdateBannerMessage('カード画面'), false);
  assert.equal(isUpdateBannerMessage(''), false);
});
