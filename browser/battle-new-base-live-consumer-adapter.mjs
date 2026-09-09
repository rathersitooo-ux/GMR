import {
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
  ensureRoundStartJankenSlotAssignment,
} from './new-base-round-start-janken-slot-assignment-core.mjs';
import {
  clearBattleJankenCompoundAttackStage,
  prepareBattleJankenCompoundAttackCommit,
  stageBattleJankenCompoundAttack,
} from './battle-janken-compound-attack-package-core.mjs';

const JANKEN_HANDS = new Set(['ROCK', 'SCISSORS', 'PAPER']);

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object supplied by authority`);
  }
  return value;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
  return value;
}

function requireJankenHand(value) {
  const hand = requiredString(value, 'jankenHand');
  if (!JANKEN_HANDS.has(hand)) throw new RangeError('jankenHand must be ROCK, SCISSORS, or PAPER');
  return hand;
}

function slotFor(snapshot, jankenHand) {
  const slot = snapshot?.slots?.find((candidate) => candidate?.jankenHand === jankenHand) ?? null;
  if (!slot?.selectable || !slot.cardId) {
    throw new Error(`current round has no selectable ${jankenHand} slot`);
  }
  return slot;
}

function requireCandidateIdentity(candidate, expected) {
  const authoritative = requiredObject(candidate, 'authoritative compound attack candidate');
  if (authoritative.jankenHand !== expected.jankenHand) {
    throw new RangeError('authoritative compound attack candidate changed jankenHand');
  }
  if (authoritative.cardId !== expected.cardId) {
    throw new RangeError('authoritative compound attack candidate changed cardId');
  }
  return authoritative;
}

/**
 * Thin production-consumer boundary for the NEW BASE migration.
 *
 * It deliberately owns no game-rule decisions:
 * - the hand authority supplies the exact three physical cards;
 * - an external policy supplies the card -> ROCK/SCISSORS/PAPER mapping;
 * - public board/legal-target authority supplies the complete compound attack;
 * - the existing Battle transport performs the authoritative commit;
 * - Mana recovery is an opaque caller-owned operation, including its amount.
 *
 * The adapter only validates those boundaries, preserves one immutable round
 * slot snapshot, stages the complete compound package, re-reads it immediately
 * before commit, and forwards the unchanged payload to the existing live path.
 */
export function createBattleNewBaseLiveConsumerAdapter({
  readRoundAuthority,
  readCompoundAttackCandidate,
  sendExistingBattleAction,
  readManaRecoveryOperation = null,
  applyExistingManaRecovery = null,
} = {}) {
  requiredFunction(readRoundAuthority, 'readRoundAuthority');
  requiredFunction(readCompoundAttackCandidate, 'readCompoundAttackCandidate');
  requiredFunction(sendExistingBattleAction, 'sendExistingBattleAction');
  if ((readManaRecoveryOperation === null) !== (applyExistingManaRecovery === null)) {
    throw new TypeError('Mana recovery reader and applier must be supplied together or both omitted');
  }
  if (readManaRecoveryOperation !== null) {
    requiredFunction(readManaRecoveryOperation, 'readManaRecoveryOperation');
    requiredFunction(applyExistingManaRecovery, 'applyExistingManaRecovery');
  }

  let roundSnapshot = null;
  let stagedCompoundAttack = null;
  let commitInFlight = false;

  async function syncRoundStart() {
    const authority = requiredObject(await readRoundAuthority(), 'round authority');
    const roundId = requiredString(authority.roundId, 'roundAuthority.roundId');
    if (!Array.isArray(authority.hand)) {
      throw new TypeError('roundAuthority.hand must be the current hand authority array');
    }
    if (!authority.assignedCardIdsByJankenHand || typeof authority.assignedCardIdsByJankenHand !== 'object') {
      throw new TypeError(
        'roundAuthority.assignedCardIdsByJankenHand must be supplied by the external hand3 mapping authority',
      );
    }

    const next = ensureRoundStartJankenSlotAssignment({
      currentSnapshot: roundSnapshot,
      roundId,
      hand: authority.hand,
      assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
      assignedCardIdsByJankenHand: authority.assignedCardIdsByJankenHand,
    });
    if (roundSnapshot && next !== roundSnapshot) stagedCompoundAttack = null;
    roundSnapshot = next;
    return roundSnapshot;
  }

  async function readCandidateFor(jankenHand, cardId) {
    const candidate = await readCompoundAttackCandidate(Object.freeze({
      roundId: roundSnapshot.roundId,
      jankenHand,
      cardId,
    }));
    return requireCandidateIdentity(candidate, { jankenHand, cardId });
  }

  return Object.freeze({
    async syncRoundStart() {
      return syncRoundStart();
    },

    async stageCompoundAttack(jankenHandValue) {
      const jankenHand = requireJankenHand(jankenHandValue);
      await syncRoundStart();
      const slot = slotFor(roundSnapshot, jankenHand);
      const candidate = await readCandidateFor(jankenHand, slot.cardId);
      stagedCompoundAttack = stageBattleJankenCompoundAttack(candidate);
      return stagedCompoundAttack;
    },

    clearCompoundAttack() {
      const cleared = clearBattleJankenCompoundAttackStage(stagedCompoundAttack);
      stagedCompoundAttack = null;
      return cleared;
    },

    async commitCompoundAttack() {
      if (commitInFlight) {
        return Object.freeze({ ok: false, committed: false, reason: 'COMMIT_IN_FLIGHT' });
      }
      if (!stagedCompoundAttack?.package) {
        return Object.freeze({ ok: false, committed: false, reason: 'STAGE_REQUIRED' });
      }

      commitInFlight = true;
      try {
        const staged = stagedCompoundAttack;
        const fresh = await readCandidateFor(staged.package.jankenHand, staged.package.cardId);
        const prepared = prepareBattleJankenCompoundAttackCommit(staged, fresh);
        const accepted = await sendExistingBattleAction(prepared.payload);
        if (accepted !== true) {
          return Object.freeze({ ok: false, committed: false, reason: 'EXISTING_BATTLE_ACTION_REJECTED' });
        }
        stagedCompoundAttack = null;
        return Object.freeze({
          ok: true,
          committed: true,
          reason: 'EXISTING_BATTLE_ACTION_ACCEPTED',
          payload: prepared.payload,
        });
      } finally {
        commitInFlight = false;
      }
    },

    async forwardTurnStartManaRecovery() {
      if (readManaRecoveryOperation === null) {
        return Object.freeze({ ok: false, applied: false, reason: 'MANA_RECOVERY_NOT_CONNECTED' });
      }
      const operation = requiredObject(
        await readManaRecoveryOperation(),
        'authority-supplied Mana recovery operation',
      );
      const accepted = await applyExistingManaRecovery(operation);
      return Object.freeze({
        ok: accepted === true,
        applied: accepted === true,
        reason: accepted === true
          ? 'EXISTING_MANA_RECOVERY_ACCEPTED'
          : 'EXISTING_MANA_RECOVERY_REJECTED',
        operation,
      });
    },

    status() {
      return Object.freeze({
        roundId: roundSnapshot?.roundId ?? null,
        assignmentMode: roundSnapshot?.assignmentMode ?? null,
        stagedCompoundAttack: stagedCompoundAttack?.preview ?? null,
        commitInFlight,
        manaRecoveryConnected: readManaRecoveryOperation !== null,
      });
    },
  });
}

export const BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT = Object.freeze({
  handSizeAuthority: 'CALLER',
  hand3MappingAuthority: 'CALLER_EXTERNAL_POLICY',
  nativeSuitDeterminesJankenSlot: false,
  targetAuthority: 'CALLER_PUBLIC_BOARD_LEGAL_TARGET_STATE',
  computesTarget: false,
  computesLegality: false,
  computesHand3Mapping: false,
  compoundCommitTransport: 'EXISTING_BATTLE_ACTION_CALLBACK',
  manaRecoveryAmountAuthority: 'CALLER',
  computesManaRecoveryAmount: false,
  schedulesManaRecovery: false,
  hiddenHandSemantics: 'NOT_IMPLEMENTED_UNRESOLVED',
  diceRequiredForCoreBattle: false,
  rouletteRequiredForCoreBattle: false,
  secondBattleEngine: false,
});
