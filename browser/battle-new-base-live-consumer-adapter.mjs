import {
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
  ensureRoundStartJankenSlotAssignment,
} from './new-base-round-start-janken-slot-assignment-core.mjs';
import {
  createUniformHand3Assignment,
} from './new-base-hand3-uniform-assignment-policy.mjs';
import {
  clearBattleJankenCompoundAttackStage,
  prepareBattleJankenCompoundAttackCommit,
  stageBattleJankenCompoundAttack,
} from './battle-janken-compound-attack-package-core.mjs';
import {
  clearBattlePrecommitSelection,
} from './battle-precommit-clear-core.mjs';
import {
  projectBattleOptionalRuleActivation,
} from './battle-optional-rule-activation-core.mjs';

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

function requireCurrentHandCardIds(hand) {
  if (hand.length !== 3) {
    throw new RangeError('roundAuthority.hand must contain exactly 3 physical cards');
  }
  const ids = hand.map((card, index) => {
    const authoritativeCard = requiredObject(card, `roundAuthority.hand[${index}]`);
    return requiredString(authoritativeCard.id, `roundAuthority.hand[${index}].id`);
  });
  if (new Set(ids).size !== 3) {
    throw new RangeError('roundAuthority.hand must contain 3 distinct physical card ids');
  }
  return ids;
}

function precommitClearResult({
  ok,
  cleared,
  reason,
  existingDraftCleared = false,
  compoundCleared = false,
  existingDraftConnected,
  projection = null,
}) {
  return Object.freeze({
    ok,
    cleared,
    reason,
    existingDraftCleared,
    compoundCleared,
    existingDraftConnected,
    complete: existingDraftConnected === true,
    projection,
    authoritativeRollback: false,
    gameStateWrite: false,
  });
}

/**
 * Thin production-consumer boundary for the NEW BASE migration.
 *
 * It deliberately owns no independent game-rule decisions:
 * - the hand authority supplies the exact three physical cards;
 * - the merged uniform Hand3 policy maps them to ROCK/SCISSORS/PAPER from a
 *   caller-authoritative uint32 source exactly once for a caller-authoritative turn;
 * - public board/legal-target authority supplies the complete compound attack;
 * - the existing Battle transport performs the authoritative commit;
 * - the existing precommit-clear policy projects caller-owned plan/target draft
 *   cancellation while this adapter owns only its local staged compound package;
 * - Mana recovery is an opaque caller-owned operation, including its amount;
 * - optional dice/roulette activation is projected only from a caller-resolved
 *   canonical authority context by the existing optional-rule activation core.
 *
 * The adapter composes those existing authorities, preserves one immutable turn
 * slot snapshot, stages the complete compound package, re-reads it immediately
 * before commit, and forwards the unchanged payload to the existing live path.
 */
export function createBattleNewBaseLiveConsumerAdapter({
  readRoundAuthority,
  readAuthoritativeHand3Uint32,
  readCompoundAttackCandidate,
  sendExistingBattleAction,
  readExistingPrecommitState = null,
  applyExistingPrecommitDraft = null,
  readManaRecoveryOperation = null,
  applyExistingManaRecovery = null,
  readResolvedOptionalRuleAuthority = null,
} = {}) {
  requiredFunction(readRoundAuthority, 'readRoundAuthority');
  requiredFunction(readAuthoritativeHand3Uint32, 'readAuthoritativeHand3Uint32');
  requiredFunction(readCompoundAttackCandidate, 'readCompoundAttackCandidate');
  requiredFunction(sendExistingBattleAction, 'sendExistingBattleAction');
  if ((readExistingPrecommitState === null) !== (applyExistingPrecommitDraft === null)) {
    throw new TypeError('Precommit state reader and draft applier must be supplied together or both omitted');
  }
  if (readExistingPrecommitState !== null) {
    requiredFunction(readExistingPrecommitState, 'readExistingPrecommitState');
    requiredFunction(applyExistingPrecommitDraft, 'applyExistingPrecommitDraft');
  }
  if ((readManaRecoveryOperation === null) !== (applyExistingManaRecovery === null)) {
    throw new TypeError('Mana recovery reader and applier must be supplied together or both omitted');
  }
  if (readManaRecoveryOperation !== null) {
    requiredFunction(readManaRecoveryOperation, 'readManaRecoveryOperation');
    requiredFunction(applyExistingManaRecovery, 'applyExistingManaRecovery');
  }
  if (readResolvedOptionalRuleAuthority !== null) {
    requiredFunction(readResolvedOptionalRuleAuthority, 'readResolvedOptionalRuleAuthority');
  }

  let roundSnapshot = null;
  let assignmentTurnId = null;
  let stagedCompoundAttack = null;
  let commitInFlight = false;

  async function syncRoundStart() {
    const authority = requiredObject(await readRoundAuthority(), 'round authority');
    const roundId = requiredString(authority.roundId, 'roundAuthority.roundId');
    const turnId = requiredString(authority.turnId, 'roundAuthority.turnId');
    if (!Array.isArray(authority.hand)) {
      throw new TypeError('roundAuthority.hand must be the current hand authority array');
    }

    // Same-turn render/reconnect/retry reuses one immutable reservation.
    if (roundSnapshot !== null && assignmentTurnId === turnId) {
      if (roundSnapshot.roundId !== roundId) {
        throw new RangeError('roundAuthority.turnId cannot move between rounds');
      }
      return roundSnapshot;
    }

    // A new turn drops only the prior uncommitted local package.
    if (roundSnapshot !== null) stagedCompoundAttack = null;

    // Membership is caller authority. Reject anything other than an already-resolved
    // exact physical trio before touching authoritative entropy; never derive 7 -> 3 here.
    const handCardIds = requireCurrentHandCardIds(authority.hand);
    const entropyRequest = Object.freeze({
      assignmentEpochId: turnId,
      sampleKind: 'HAND3_UNIFORM_PERMUTATION_UINT32',
    });
    const uniformAssignment = createUniformHand3Assignment({
      assignmentEpochId: turnId,
      handCardIds,
      readUint32: () => readAuthoritativeHand3Uint32(entropyRequest),
    });

    const next = ensureRoundStartJankenSlotAssignment({
      currentSnapshot: null,
      roundId,
      hand: authority.hand,
      assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
      assignedCardIdsByJankenHand: uniformAssignment.assignedCardIdsByJankenHand,
    });
    roundSnapshot = next;
    assignmentTurnId = turnId;
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

    async clearPrecommitSelection() {
      if (commitInFlight) {
        return precommitClearResult({
          ok: false,
          cleared: false,
          reason: 'COMMIT_IN_FLIGHT',
          existingDraftConnected: readExistingPrecommitState !== null,
        });
      }
      if (readExistingPrecommitState === null) {
        return precommitClearResult({
          ok: false,
          cleared: false,
          reason: 'PRECOMMIT_CLEAR_NOT_CONNECTED',
          existingDraftConnected: false,
        });
      }

      const state = requiredObject(
        await readExistingPrecommitState(),
        'authority-supplied existing precommit state',
      );
      const projection = clearBattlePrecommitSelection(state);
      const hasCompoundStage = Boolean(stagedCompoundAttack?.package);

      if (!projection.cleared && projection.reason !== 'NOTHING_TO_CLEAR') {
        return precommitClearResult({
          ok: false,
          cleared: false,
          reason: projection.reason,
          existingDraftConnected: true,
          projection,
        });
      }

      if (projection.cleared) {
        const accepted = await applyExistingPrecommitDraft(projection.next);
        if (accepted !== true) {
          return precommitClearResult({
            ok: false,
            cleared: false,
            reason: 'EXISTING_PRECOMMIT_CLEAR_REJECTED',
            existingDraftConnected: true,
            projection,
          });
        }
      }

      let compoundCleared = false;
      if (hasCompoundStage) {
        const clearedCompound = clearBattleJankenCompoundAttackStage(stagedCompoundAttack);
        compoundCleared = clearedCompound.cleared === true;
        stagedCompoundAttack = null;
      }

      const existingDraftCleared = projection.cleared === true;
      const cleared = existingDraftCleared || compoundCleared;
      return precommitClearResult({
        ok: cleared,
        cleared,
        reason: cleared ? 'CLEARED_PRECOMMIT_SELECTION' : 'NOTHING_TO_CLEAR',
        existingDraftCleared,
        compoundCleared,
        existingDraftConnected: true,
        projection,
      });
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
        await syncRoundStart();
        if (stagedCompoundAttack !== staged) {
          return Object.freeze({
            ok: false,
            committed: false,
            reason: 'TURN_CHANGED_RESTAGE_REQUIRED',
          });
        }
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

    async projectOptionalRuleActivation() {
      const resolvedAuthorityContext = readResolvedOptionalRuleAuthority === null
        ? null
        : await readResolvedOptionalRuleAuthority();
      return projectBattleOptionalRuleActivation(resolvedAuthorityContext);
    },

    status() {
      return Object.freeze({
        roundId: roundSnapshot?.roundId ?? null,
        turnId: assignmentTurnId,
        assignmentMode: roundSnapshot?.assignmentMode ?? null,
        stagedCompoundAttack: stagedCompoundAttack?.preview ?? null,
        commitInFlight,
        precommitClearConnected: readExistingPrecommitState !== null,
        manaRecoveryConnected: readManaRecoveryOperation !== null,
        optionalRuleAuthorityConnected: readResolvedOptionalRuleAuthority !== null,
      });
    },
  });
}

export const BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT = Object.freeze({
  handSizeAuthority: 'CALLER',
  hand3MappingAuthority: 'CANONICAL_UNIFORM_SIX_PERMUTATION_POLICY',
  hand3EntropyAuthority: 'CALLER_UINT32',
  hand3AssignmentEpoch: 'CALLER_TURN_ID',
  hand3RerollWithinTurn: false,
  hand3MayReassignOnNewTurnInSameRound: true,
  nativeSuitDeterminesJankenSlot: false,
  targetAuthority: 'CALLER_PUBLIC_BOARD_LEGAL_TARGET_STATE',
  computesTarget: false,
  computesLegality: false,
  computesHand3Mapping: false,
  compoundCommitTransport: 'EXISTING_BATTLE_ACTION_CALLBACK',
  precommitClearPolicy: 'EXISTING_BATTLE_PRECOMMIT_CLEAR_CORE',
  precommitClearDraftAuthority: 'CALLER',
  precommitClearAuthoritativeRollback: false,
  precommitClearGameStateWrite: false,
  manaRecoveryAmountAuthority: 'CALLER',
  computesManaRecoveryAmount: false,
  schedulesManaRecovery: false,
  optionalRuleActivationPolicy: 'EXISTING_BATTLE_OPTIONAL_RULE_ACTIVATION_CORE',
  optionalRuleAuthority: 'CALLER_RESOLVED_CONTEXT',
  basicDiceEnabled: false,
  basicRouletteEnabled: false,
  resolvesOptionalRulePrecedence: false,
  executesDice: false,
  executesRoulette: false,
  computesMovementFromOptionalRules: false,
  computesRouletteMembership: false,
  optionalRuleGameStateWrite: false,
  optionalRuleUiWrite: false,
  hiddenHandSemantics: 'NOT_IMPLEMENTED_UNRESOLVED',
  diceRequiredForCoreBattle: false,
  rouletteRequiredForCoreBattle: false,
  secondBattleEngine: false,
});
