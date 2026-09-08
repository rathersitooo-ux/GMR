import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  approvedPartnerDialogueDescriptor,
  currentAdvicePartnerId,
  cycleAdvicePartner,
  partnerDisplayName,
  partnerRosterIdsFromRuntime,
  selectApprovedPartnerBattleUtterance,
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

test('Battle switch consumer and public package stay wired to the existing Advice selection authority', () => {
  const runtimeSource = readFileSync(new URL('../browser/partner-advice-runtime-mount.mjs', import.meta.url), 'utf8');
  const buildSource = readFileSync(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');

  assert.match(runtimeSource, /aria-label="アドバイスパートナーを変更"/);
  assert.match(
    runtimeSource,
    /switchButton\.addEventListener\('click', \(\) => \{[\s\S]*?const before = currentAdvicePartnerId\(win\);[\s\S]*?const next = cycleAdvicePartner\(win, 1\);[\s\S]*?if \(!next \|\| next === before\) return;[\s\S]*?lastReceipt = null;[\s\S]*?lastCharacterReaction = null;[\s\S]*?render\(\);[\s\S]*?\}\);/,
  );
  assert.match(
    buildSource,
    /source: 'browser\/partner-dialogue-source-registry\.mjs', output: 'partner-dialogue-source-registry\.mjs'/,
  );
  assert.match(
    buildSource,
    /source: 'browser\/partner-advice-runtime-mount\.mjs', output: 'partner-advice-runtime-mount\.mjs'/,
  );
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
