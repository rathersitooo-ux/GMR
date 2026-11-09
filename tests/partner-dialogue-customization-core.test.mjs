import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerCustomizationProfile,
  buildPartnerDialogueRewriteProposal,
  clearPartnerCustomLine,
  createPartnerDialogueCustomizationSnapshot,
  listPartnerCustomLines,
  resolvePartnerCustomLine,
  setPartnerCustomLine,
  PARTNER_DIALOGUE_CUSTOMIZATION_SCHEMA,
} from '../browser/partner-dialogue-customization-core.mjs';
import { createPartnerCostumeSnapshot } from '../browser/partner-costume-core.mjs';

const BATTLE_LINE = {
  partnerId: 'partner.saasuna',
  mode: 'battle',
  sourceLineId: 'battle_start',
  originalText: 'ご主人様が心配する事はございません、全て片付けてしまいます',
  customText: 'まかせて。全部わたしが片付けるから、安心して見ていて',
};
const DAILY_LINE = {
  partnerId: 'partner.saasuna',
  mode: 'daily',
  sourceLineId: 'idle_readable',
  originalText: '優秀なんですよ、私。',
  customText: 'ふふ、今日もわたしは優秀なの。そばにいてあげる',
};

test('empty snapshot has the fixed schema and no lines', () => {
  const snapshot = createPartnerDialogueCustomizationSnapshot();
  assert.equal(snapshot.schema, PARTNER_DIALOGUE_CUSTOMIZATION_SCHEMA);
  assert.deepEqual(snapshot.entries, []);
});

test('a custom battle line applies only to my game and only in battle', () => {
  const snapshot = setPartnerCustomLine(createPartnerDialogueCustomizationSnapshot(), BATTLE_LINE);
  const battle = resolvePartnerCustomLine(snapshot, {
    partnerId: 'partner.saasuna', mode: 'battle', sourceLineId: 'battle_start', approvedText: BATTLE_LINE.originalText,
  });
  assert.equal(battle.text, BATTLE_LINE.customText);
  assert.equal(battle.customized, true);
  assert.equal(battle.scope, 'personal_only');
  assert.equal(battle.canonicalWrite, false);
  assert.equal(battle.sharedWithOthers, false);

  // 同じセリフIDでも日常側には漏れない
  const daily = resolvePartnerCustomLine(snapshot, {
    partnerId: 'partner.saasuna', mode: 'daily', sourceLineId: 'battle_start', approvedText: BATTLE_LINE.originalText,
  });
  assert.equal(daily.text, BATTLE_LINE.originalText);
  assert.equal(daily.customized, false);

  // 別のパートナーにも漏れない
  const other = resolvePartnerCustomLine(snapshot, {
    partnerId: 'partner.naki', mode: 'battle', sourceLineId: 'battle_start', approvedText: BATTLE_LINE.originalText,
  });
  assert.equal(other.customized, false);
});

test('battle and daily customs stay separate for the same partner', () => {
  let snapshot = createPartnerDialogueCustomizationSnapshot();
  snapshot = setPartnerCustomLine(snapshot, BATTLE_LINE);
  snapshot = setPartnerCustomLine(snapshot, DAILY_LINE);
  assert.equal(listPartnerCustomLines(snapshot, { partnerId: 'partner.saasuna', mode: 'battle' }).length, 1);
  assert.equal(listPartnerCustomLines(snapshot, { partnerId: 'partner.saasuna', mode: 'daily' }).length, 1);
  assert.equal(listPartnerCustomLines(snapshot).length, 2);
  const daily = resolvePartnerCustomLine(snapshot, {
    partnerId: 'partner.saasuna', mode: 'daily', sourceLineId: 'idle_readable', approvedText: DAILY_LINE.originalText,
  });
  assert.equal(daily.text, DAILY_LINE.customText);
});

test('clearing a custom line restores the approved line', () => {
  let snapshot = setPartnerCustomLine(createPartnerDialogueCustomizationSnapshot(), BATTLE_LINE);
  snapshot = clearPartnerCustomLine(snapshot, {
    partnerId: 'partner.saasuna', mode: 'battle', sourceLineId: 'battle_start',
  });
  const resolved = resolvePartnerCustomLine(snapshot, {
    partnerId: 'partner.saasuna', mode: 'battle', sourceLineId: 'battle_start', approvedText: BATTLE_LINE.originalText,
  });
  assert.equal(resolved.text, BATTLE_LINE.originalText);
  assert.equal(resolved.customized, false);
});

test('unchanged, empty, over-long or bad-mode customs are rejected', () => {
  const empty = createPartnerDialogueCustomizationSnapshot();
  assert.throws(() => setPartnerCustomLine(empty, { ...BATTLE_LINE, customText: BATTLE_LINE.originalText }), TypeError);
  assert.throws(() => setPartnerCustomLine(empty, { ...BATTLE_LINE, customText: '  ' }), TypeError);
  assert.throws(() => setPartnerCustomLine(empty, { ...BATTLE_LINE, customText: 'あ'.repeat(601) }), TypeError);
  assert.throws(() => setPartnerCustomLine(empty, { ...BATTLE_LINE, mode: 'tea' }), TypeError);
  assert.throws(() => createPartnerDialogueCustomizationSnapshot({ schema: 'other-v9' }), TypeError);
});

test('snapshot survives a save/load round trip', () => {
  let snapshot = setPartnerCustomLine(createPartnerDialogueCustomizationSnapshot(), BATTLE_LINE);
  snapshot = setPartnerCustomLine(snapshot, DAILY_LINE);
  const revived = createPartnerDialogueCustomizationSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(revived, snapshot);
});

test('rewrite proposal carries only the user-selected partner line and its edit', () => {
  const proposal = buildPartnerDialogueRewriteProposal({
    partnerId: 'partner.saasuna',
    mode: 'daily',
    sourceLineId: 'idle_readable',
    originalText: DAILY_LINE.originalText,
    proposedText: DAILY_LINE.customText,
    selected: true,
  });
  assert.equal(proposal.kind, 'dialogue_rewrite_proposal');
  assert.equal(proposal.mode, 'daily');
  assert.equal(proposal.proposedText, DAILY_LINE.customText);
  assert.equal(proposal.userSelected, true);
  assert.equal(proposal.containsRawConversation, false);
  assert.equal(proposal.rawConversationSent, false);
  assert.equal(proposal.candidateOnly, true);
  assert.equal(proposal.canonicalWrite, false);
  assert.equal('originalText' in proposal, false);
  assert.equal(JSON.stringify(proposal).includes('userMessage'), false);
});

test('rewrite proposal refuses unselected lines and any raw conversation input', () => {
  const base = {
    partnerId: 'partner.saasuna',
    mode: 'battle',
    sourceLineId: 'battle_start',
    originalText: BATTLE_LINE.originalText,
    proposedText: BATTLE_LINE.customText,
  };
  assert.equal(buildPartnerDialogueRewriteProposal({ ...base, selected: false }), null);
  assert.equal(buildPartnerDialogueRewriteProposal({ ...base }), null);
  assert.equal(buildPartnerDialogueRewriteProposal({ ...base, selected: true, userMessage: 'わたしの秘密の話' }), null);
  assert.equal(buildPartnerDialogueRewriteProposal({ ...base, selected: true, conversationHistory: [] }), null);
  assert.equal(buildPartnerDialogueRewriteProposal({ ...base, selected: true, proposedText: BATTLE_LINE.originalText }), null);
  assert.equal(buildPartnerDialogueRewriteProposal({ ...base, selected: true, mode: 'tea' }), null);
});

test('customization profile combines costume and dialogue for one partner', () => {
  const costumeSnapshot = createPartnerCostumeSnapshot({
    selectedPartnerId: 'partner.saasuna',
    partners: {
      'partner.saasuna': {
        ownedItemIds: ['coord-1', 'shoes-1'],
        savedSelection: { coord: 'coord-1', shoes: 'shoes-1', accessory: null },
      },
    },
  });
  let dialogueSnapshot = setPartnerCustomLine(createPartnerDialogueCustomizationSnapshot(), BATTLE_LINE);
  dialogueSnapshot = setPartnerCustomLine(dialogueSnapshot, DAILY_LINE);
  dialogueSnapshot = setPartnerCustomLine(dialogueSnapshot, { ...DAILY_LINE, partnerId: 'partner.naki', sourceLineId: 'naki-1' });

  const profile = buildPartnerCustomizationProfile({
    partnerId: 'partner.saasuna', costumeSnapshot, dialogueSnapshot,
  });
  assert.equal(profile.schema, 'partner-customization-profile-v1');
  assert.equal(profile.personalOnly, true);
  assert.equal(profile.canonicalWrite, false);
  assert.deepEqual(profile.costume.savedSelection, { shoes: 'shoes-1', coord: 'coord-1', accessory: null });
  assert.equal(profile.costume.ownedCount, 2);
  assert.equal(profile.dialogue.customCount, 2);
  assert.equal(profile.dialogue.battle.length, 1);
  assert.equal(profile.dialogue.daily.length, 1);
});

test('customization profile fails closed on wrong costume schema or missing partner', () => {
  assert.equal(buildPartnerCustomizationProfile({
    partnerId: 'partner.saasuna',
    costumeSnapshot: { schema: 'something-else', partners: {} },
  }), null);
  assert.equal(buildPartnerCustomizationProfile({
    partnerId: 'partner.saasuna',
    costumeSnapshot: createPartnerCostumeSnapshot({ partners: {} }),
  }), null);
  assert.equal(buildPartnerCustomizationProfile({ partnerId: 'partner.saasuna' }), null);
});
