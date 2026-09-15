import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approvedPartnerAdviceReplyPairSource,
  approvedPartnerDialogueDescriptor,
  createPartnerAdviceReplyPairPresentationControl,
  currentAdvicePartnerId,
  cycleAdvicePartner,
  installPartnerDelegationLabelPresentation,
  normalizePartnerDelegationControlPresentation,
  partnerDisplayName,
  partnerRosterIdsFromRuntime,
  projectApprovedPartnerAdviceReplyPair,
  selectApprovedPartnerBattleUtterance,
  selectApprovedPartnerIdleUtterance,
  setAdvicePartnerId,
  PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT,
} from '../browser/partner-dialogue-source-registry.mjs';

function runtime() {
  const saves = [];
  const state = {
    selectedPartnerId: 'partner.naki',
    partnerProfiles: {
      'partner.naki': {},
      'partner.saasuna': {},
      'partner.mato': {},
      'partner.creator.miku': {},
    },
    settings: {},
  };
  return {
    state,
    saves,
    win: {
      __GAMEROAD_TEST__: {
        state,
        partnerRoles: () => ({ profiles: state.partnerProfiles }),
        save: () => { saves.push(state.settings.advicePartnerId || null); return true; },
      },
    },
  };
}

function presentationButton(text, { forced = false } = {}) {
  return {
    textContent: text,
    dataset: {},
    classList: {
      contains: (name) => name === 'forced' && forced,
    },
  };
}

test('uses the existing runtime partner profiles as the only selectable roster', () => {
  const { win } = runtime();
  assert.deepEqual(partnerRosterIdsFromRuntime(win), [
    'partner.naki',
    'partner.saasuna',
    'partner.mato',
    'partner.creator.miku',
  ]);
  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.rosterAuthority, 'existing-runtime-partnerProfiles');
});

test('advice partner is independently selected and saved through the existing main save settings', () => {
  const { win, state, saves } = runtime();
  assert.equal(currentAdvicePartnerId(win), 'partner.naki');
  assert.equal(setAdvicePartnerId(win, 'partner.saasuna'), true);
  assert.equal(state.selectedPartnerId, 'partner.naki');
  assert.equal(state.settings.advicePartnerId, 'partner.saasuna');
  assert.equal(currentAdvicePartnerId(win), 'partner.saasuna');
  assert.deepEqual(saves, ['partner.saasuna']);
  assert.equal(cycleAdvicePartner(win), 'partner.mato');
  assert.equal(state.selectedPartnerId, 'partner.naki');
  assert.equal(currentAdvicePartnerId(win), 'partner.mato');
});

test('unknown partner ids never become a second identity authority', () => {
  const { win, state } = runtime();
  assert.equal(setAdvicePartnerId(win, 'partner.unknown'), false);
  assert.equal(state.settings.advicePartnerId, undefined);
});

test('only an approved current source can emit character dialogue', () => {
  assert.equal(approvedPartnerDialogueDescriptor('partner.naki'), null);
  assert.equal(approvedPartnerDialogueDescriptor('partner.mato'), null);
  assert.equal(approvedPartnerDialogueDescriptor('partner.creator.miku'), null);
  assert.equal(selectApprovedPartnerBattleUtterance({
    partnerId: 'partner.naki',
    triggerId: 'battle_card_submit',
    seed: 'event-1',
    fields: { cardName: '試験カード' },
  }), null);

  const saasuna = approvedPartnerDialogueDescriptor('partner.saasuna');
  assert.ok(saasuna);
  assert.equal(saasuna.partnerId, 'partner.saasuna');
  assert.equal(saasuna.sourceState, 'approved_current');
  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.saasunaFallbackForOtherCharacters, false);
});

test('current display labels remain Japanese while roster authority remains external', () => {
  assert.equal(partnerDisplayName('partner.naki'), '緋累ナキ');
  assert.equal(partnerDisplayName('partner.saasuna'), 'サースナー');
  assert.equal(partnerDisplayName('partner.mato'), '泊愛まと');
  assert.equal(partnerDisplayName('partner.creator.miku'), '初音ミク');
  assert.equal(partnerDisplayName('partner.future'), 'パートナー');
});

test('idle readable dialogue uses only the approved current source and stays deterministic for one seed', () => {
  assert.equal(selectApprovedPartnerIdleUtterance({ partnerId: 'partner.naki', seed: 'idle-1' }), null);
  const first = selectApprovedPartnerIdleUtterance({ partnerId: 'partner.saasuna', seed: 'idle-1' });
  const same = selectApprovedPartnerIdleUtterance({ partnerId: 'partner.saasuna', seed: 'idle-1' });
  assert.ok(first);
  assert.equal(first.partnerId, 'partner.saasuna');
  assert.equal(first.sourceState, 'approved_current');
  assert.equal(first.triggerId, 'idle_readable');
  assert.equal(first.text, same.text);
  assert.equal(first.presentationOnly, true);
  assert.equal(first.automaticCanonMutationAllowed, false);
  assert.equal(first.automaticRelationshipMutationAllowed, false);
  assert.equal(first.automaticGameMutationAllowed, false);
});

test('approved Saasuna Advice emits exactly two reversible player replies', () => {
  const input = {
    partnerId: 'partner.saasuna',
    matchId: 'match-replypair-r2',
    round: 3,
    adviceText: 'ここは中央を守って。',
  };
  const source = approvedPartnerAdviceReplyPairSource(input);
  assert.ok(source);
  assert.equal(source.approvedCurrent, true);
  assert.equal(source.wordingAuthority, 'ai-delegated-reversible');
  assert.equal(source.userDirectRaw, false);
  assert.deepEqual(source.options, [
    { id: 'hint-only', label: 'ヒントだけ教えて' },
    { id: 'answer-through', label: '答えまで教えて' },
  ]);

  const projection = projectApprovedPartnerAdviceReplyPair(input);
  assert.equal(projection.visible, true);
  assert.equal(projection.options.length, 2);
  assert.deepEqual(projection.options.map((option) => option.label), ['ヒントだけ教えて', '答えまで教えて']);
  assert.equal(projection.options.some((option) => option.label === 'まかせた！' || option.label === 'まかせろ！'), false);
  assert.equal(projection.presentationOnly, true);
  assert.equal(projection.autoExecute, false);
  assert.equal(projection.emits2v2Ping, false);
  assert.equal(projection.gameplayAuthorityMutated, false);
});

test('unapproved or stale reply context fails closed instead of borrowing Saasuna text', () => {
  assert.equal(approvedPartnerAdviceReplyPairSource({
    partnerId: 'partner.naki',
    matchId: 'match-replypair-r2',
    round: 3,
    adviceText: 'ここは中央を守って。',
  }), null);
  assert.equal(projectApprovedPartnerAdviceReplyPair({
    partnerId: 'partner.saasuna',
    matchId: '',
    round: 3,
    adviceText: 'ここは中央を守って。',
  }).visible, false);
  assert.equal(projectApprovedPartnerAdviceReplyPair({
    partnerId: 'partner.saasuna',
    matchId: 'match-replypair-r2',
    round: 3,
    adviceText: '',
  }).visible, false);
  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.saasunaFallbackForOtherCharacters, false);
});

test('reply selection remains presentation-only and resets for the next conversation', () => {
  const control = createPartnerAdviceReplyPairPresentationControl();
  const first = {
    partnerId: 'partner.saasuna',
    matchId: 'match-replypair-r2',
    round: 3,
    adviceText: 'ここは中央を守って。',
  };
  assert.equal(control.status(first).visible, true);
  const receipt = control.choose({ ...first, optionId: 'hint-only' });
  assert.ok(receipt);
  assert.equal(receipt.playerText, 'ヒントだけ教えて');
  assert.equal(receipt.presentationOnly, true);
  assert.equal(receipt.autoExecute, false);
  assert.equal(receipt.emits2v2Ping, false);
  assert.equal(receipt.gameplayAuthorityMutated, false);
  assert.equal(control.status(first).visible, false);
  assert.equal(control.status(first).selectedOption.id, 'hint-only');
  assert.equal(control.choose({ ...first, optionId: 'answer-through' }), null);

  const next = { ...first, round: 4 };
  assert.equal(control.status(next).visible, true);
  assert.equal(control.status(next).selectedOption, null);
});

test('real delegation control gets the approved manual and delegated display labels only', () => {
  const manual = presentationButton('まかせた');
  assert.equal(normalizePartnerDelegationControlPresentation(manual), true);
  assert.equal(manual.textContent, 'まかせた！');
  assert.equal(manual.dataset.partnerDelegationLabelPresentationOnly, 'true');

  const delegated = presentationButton('まかせろ');
  assert.equal(normalizePartnerDelegationControlPresentation(delegated), true);
  assert.equal(delegated.textContent, 'まかせろ！');
  assert.equal(normalizePartnerDelegationControlPresentation(delegated), true);
  assert.equal(delegated.textContent, 'まかせろ！');

  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.delegationLabelPresentation, 'existing-real-button-text-only');
  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.delegationGameplayAuthority, 'existing-gameplay-runtime');
  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.adviceReplyPairAutoExecute, false);
  assert.equal(PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT.adviceReplyPairEmits2v2Ping, false);
});

test('forced or unknown delegation presentation fails closed without rewriting text', () => {
  const forced = presentationButton('強制委任', { forced: true });
  assert.equal(normalizePartnerDelegationControlPresentation(forced), false);
  assert.equal(forced.textContent, '強制委任');
  assert.deepEqual(forced.dataset, {});

  const unknown = presentationButton('別の状態');
  assert.equal(normalizePartnerDelegationControlPresentation(unknown), false);
  assert.equal(unknown.textContent, '別の状態');
  assert.deepEqual(unknown.dataset, {});
});

test('live presentation observes the existing button without installing gameplay handlers', () => {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observations = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target, options) {
      this.observations.push({ target, options });
    }
    disconnect() {
      this.disconnected = true;
    }
  }

  const button = presentationButton('まかせた');
  const documentElement = {};
  const doc = {
    documentElement,
    getElementById: (id) => id === 'partnerDelegateBtn' ? button : null,
  };
  const control = installPartnerDelegationLabelPresentation({ document: doc, MutationObserver: FakeMutationObserver });
  assert.ok(control);
  assert.equal(control.presentationOnly, true);
  assert.equal(control.gameplayAuthorityMutated, false);
  assert.equal(button.textContent, 'まかせた！');
  assert.equal(observers.length, 1);
  assert.equal(observers[0].observations.length, 1);
  assert.equal(observers[0].observations[0].target, button);
  assert.deepEqual(observers[0].observations[0].options.attributeFilter, ['class']);

  button.textContent = 'まかせろ';
  observers[0].callback();
  assert.equal(button.textContent, 'まかせろ！');

  control.disconnect();
  assert.equal(observers[0].disconnected, true);
});
