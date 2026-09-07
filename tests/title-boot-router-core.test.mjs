import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TITLE_BOOT_MATCH_AUTHORITY,
  TITLE_BOOT_ROUTE_KINDS,
  resolveRecoveryCancel,
  resolveTitleBootRoute,
} from '../browser/title-boot-router-core.mjs';
import {
  BOOT_LOADING_PHASES,
  createBootLoadingState,
  projectBootLoadingPresentation,
} from '../browser/boot-loading-presentation-core.mjs';

const match = () => ({
  resumable: true,
  authority: TITLE_BOOT_MATCH_AUTHORITY,
  matchId: 'm-current-42',
  resumeContext: { opaque: true },
});

test('authoritative resumable match starts recovery without a confirmation click', () => {
  const route = resolveTitleBootRoute({ activeMatch: match() });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH);
  assert.equal(route.destination, 'battle');
  assert.equal(route.autoStart, true);
  assert.equal(route.requiresUserConfirmation, false);
  assert.equal(route.cancelAllowedBeforeCommit, true);
  assert.equal(route.audioUserActivationBlocksRecovery, false);
  assert.equal(route.showTitle, false);
});

test('match recovery outranks direct and previous destinations', () => {
  const route = resolveTitleBootRoute({
    activeMatch: match(),
    directDestination: { validated: true, screen: 'cards' },
    previousDestination: { validated: true, screen: 'shop' },
  });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH);
  assert.equal(route.destination, 'battle');
});

test('only an explicit recovery-blocking required gate may delay a resumable match', () => {
  const route = resolveTitleBootRoute({
    activeMatch: match(),
    requiredGate: { required: true, kind: 'CLIENT_COMPATIBILITY', blocksMatchRecovery: true },
  });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.REQUIRED_GATE);
  assert.equal(route.pendingDestination, 'battle');
  assert.equal(route.pendingMatchId, 'm-current-42');
});

test('non-blocking startup work does not delay a resumable match', () => {
  const route = resolveTitleBootRoute({
    activeMatch: match(),
    requiredGate: { required: true, kind: 'HOME_CONTENT', blocksMatchRecovery: false },
  });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH);
});

test('safe current app resume skips Title entirely', () => {
  const route = resolveTitleBootRoute({
    safeCurrentResume: true,
    directDestination: { validated: true, screen: 'cards' },
  });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.RESUME_CURRENT);
  assert.equal(route.showTitle, false);
});

test('validated direct destination goes there without Home transit', () => {
  const route = resolveTitleBootRoute({
    directDestination: { validated: true, screen: 'cards' },
  });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.DIRECT_DESTINATION);
  assert.equal(route.destination, 'cards');
  assert.equal(route.requiresHomeTransit, false);
});

test('safe previous destination is restored only when validated', () => {
  const restored = resolveTitleBootRoute({
    previousDestination: { validated: true, screen: 'partner' },
  });
  assert.equal(restored.kind, TITLE_BOOT_ROUTE_KINDS.RESTORE_PREVIOUS);
  assert.equal(restored.destination, 'partner');

  const stale = resolveTitleBootRoute({
    previousDestination: { validated: false, screen: 'partner' },
  });
  assert.equal(stale.kind, TITLE_BOOT_ROUTE_KINDS.SHOW_TITLE);
});

test('generic last-screen Battle value can never create a Battle recovery', () => {
  for (const candidate of [
    { validated: true, screen: 'battle' },
    { validated: true, screen: 'BATTLE' },
  ]) {
    const route = resolveTitleBootRoute({ previousDestination: candidate });
    assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.SHOW_TITLE);
  }
});

test('untrusted active-match hint fails closed instead of opening Battle', () => {
  const route = resolveTitleBootRoute({
    activeMatch: { resumable: true, authority: 'local-last-screen', matchId: 'm-stale' },
  });
  assert.equal(route.kind, TITLE_BOOT_ROUTE_KINDS.SHOW_TITLE);
});

test('precommit recovery cancel aborts only the client attempt', () => {
  assert.deepEqual(resolveRecoveryCancel({ committed: false }), {
    allowed: true,
    owner: 'boot-recovery',
    effect: 'ABORT_RECOVERY_ATTEMPT_ONLY',
    matchOutcomeMutated: false,
    matchStateReset: false,
  });
});

test('postcommit recovery no longer owns cancellation', () => {
  assert.deepEqual(resolveRecoveryCancel({ committed: true }), {
    allowed: false,
    owner: 'battle',
    effect: 'USE_BATTLE_EXIT_RULES',
  });
});

test('Boot RECOVERY exposes CANCEL only while caller says precommit cancellation is available', () => {
  const recovering = createBootLoadingState({
    phase: BOOT_LOADING_PHASES.RECOVERY,
    progress: 0.2,
    canCancel: true,
    statusCode: 'RECONNECTING',
  });
  assert.deepEqual(projectBootLoadingPresentation({ state: recovering }).actionIds, ['CANCEL']);

  const committed = createBootLoadingState({
    phase: BOOT_LOADING_PHASES.RECOVERY,
    progress: 1,
    canCancel: false,
    statusCode: 'RECONNECTED',
  });
  assert.deepEqual(projectBootLoadingPresentation({ state: committed }).actionIds, []);
});

test('CANCEL cannot be invented on non-recovery phases', () => {
  assert.throws(() => createBootLoadingState({
    phase: BOOT_LOADING_PHASES.LOADING,
    canCancel: true,
  }), /only valid during RECOVERY/);
});
