from pathlib import Path

SRC = Path('browser/battle-janken-slidepad-runtime-mount.mjs')
TEST = Path('tests/battle-janken-slidepad-runtime-mount.test.mjs')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


src = SRC.read_text(encoding='utf-8')
test = TEST.read_text(encoding='utf-8')

src = replace_once(
    src,
    "export const BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA = 'gameroad.battle-janken-slidepad-runtime.v1';\n",
    "export const BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA = 'gameroad.battle-janken-slidepad-runtime.v1';\n"
    "export const BATTLE_JANKEN_FOCUS_LIVE_MOUNT_SCHEMA = 'gameroad.battle-janken-focus-live-mount.v1';\n\n"
    "export function normalizeBattleJankenFocusIntegration(value) {\n"
    "  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;\n"
    "  if (typeof value.mountSurface !== 'function' || typeof value.readContext !== 'function') return null;\n"
    "  const liveInputStack = value.liveInputStack;\n"
    "  if (!liveInputStack || typeof liveInputStack !== 'object') return null;\n"
    "  for (const name of ['focus', 'cancel', 'commit', 'status']) {\n"
    "    if (typeof liveInputStack[name] !== 'function') return null;\n"
    "  }\n"
    "  return Object.freeze({\n"
    "    schema: BATTLE_JANKEN_FOCUS_LIVE_MOUNT_SCHEMA,\n"
    "    mountSurface: value.mountSurface,\n"
    "    readContext: value.readContext,\n"
    "    liveInputStack,\n"
    "  });\n"
    "}\n",
    'focus integration normalizer',
)

src = replace_once(
    src,
    "export function mountBattleJankenSlidePadRuntime(globalRef = globalThis, { battleRoot = null, rouletteEnabled = false } = {}) {\n"
    "  const documentRef = globalRef?.document;\n"
    "  const root = battleRoot ?? documentRef?.querySelector?.('section[data-screen=\"battle\"]');\n"
    "  if (!documentRef || !root) return null;\n",
    "export function mountBattleJankenSlidePadRuntime(globalRef = globalThis, {\n"
    "  battleRoot = null,\n"
    "  rouletteEnabled = false,\n"
    "  focusIntegration = null,\n"
    "} = {}) {\n"
    "  const documentRef = globalRef?.document;\n"
    "  const root = battleRoot ?? documentRef?.querySelector?.('section[data-screen=\"battle\"]');\n"
    "  if (!documentRef || !root) return null;\n"
    "  const dedicatedFocus = normalizeBattleJankenFocusIntegration(focusIntegration);\n",
    'mount signature',
)

src = replace_once(
    src,
    "  let suppressClickTimer = null;\n"
    "  let focusedCardId = null;\n\n"
    "  function currentStagedCardIds() {\n",
    "  let suppressClickTimer = null;\n"
    "  let focusedCardId = null;\n"
    "  let focusSurfaceRuntime = null;\n"
    "  let focusSurfaceVersion = 0;\n\n"
    "  function closeDedicatedFocusSurface() {\n"
    "    focusSurfaceVersion += 1;\n"
    "    const current = focusSurfaceRuntime;\n"
    "    focusSurfaceRuntime = null;\n"
    "    try { current?.destroy?.(); } catch {}\n"
    "    return current !== null;\n"
    "  }\n\n"
    "  async function readDedicatedFocusContext() {\n"
    "    if (!dedicatedFocus || !model) return null;\n"
    "    let context = null;\n"
    "    try {\n"
    "      context = await dedicatedFocus.readContext(Object.freeze({\n"
    "        roundId: model.roundId,\n"
    "        assignment: model.assignment,\n"
    "      }));\n"
    "    } catch {\n"
    "      return null;\n"
    "    }\n"
    "    if (!context || typeof context !== 'object' || !Array.isArray(context.packages)) return null;\n"
    "    return Object.freeze({\n"
    "      packages: context.packages,\n"
    "      generationId: context.generationId ?? model.roundId,\n"
    "    });\n"
    "  }\n\n"
    "  async function openDedicatedFocusSurface() {\n"
    "    if (!dedicatedFocus || destroyed || !model) return false;\n"
    "    if (focusSurfaceRuntime) return true;\n"
    "    const version = ++focusSurfaceVersion;\n"
    "    const context = await readDedicatedFocusContext();\n"
    "    if (!context || destroyed || version !== focusSurfaceVersion || !model) return false;\n"
    "    let runtime = null;\n"
    "    try {\n"
    "      runtime = dedicatedFocus.mountSurface({\n"
    "        documentRef,\n"
    "        mountRoot: root,\n"
    "        liveInputStack: dedicatedFocus.liveInputStack,\n"
    "        packages: context.packages,\n"
    "        generationId: context.generationId,\n"
    "        reducedMotion: globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,\n"
    "        lowPerf: root.dataset?.lowPerf === 'true',\n"
    "        onAccepted: (result, readyPackage) => {\n"
    "          const hand = readyPackage?.jankenHand;\n"
    "          const flight = hand ? captureReleasedJankenCardFlight(globalRef, root, slotNodes, hand) : null;\n"
    "          if (flight) animateReleasedJankenCard(host, flight);\n"
    "          const settle = () => {\n"
    "            if (focusSurfaceRuntime === runtime) closeDedicatedFocusSurface();\n"
    "          };\n"
    "          if (typeof globalRef?.queueMicrotask === 'function') globalRef.queueMicrotask(settle);\n"
    "          else Promise.resolve().then(settle);\n"
    "          return result;\n"
    "        },\n"
    "      });\n"
    "    } catch {\n"
    "      runtime = null;\n"
    "    }\n"
    "    if (destroyed || version !== focusSurfaceVersion || !runtime) {\n"
    "      try { runtime?.destroy?.(); } catch {}\n"
    "      return false;\n"
    "    }\n"
    "    const snapshot = (() => { try { return runtime.snapshot?.(); } catch { return null; } })();\n"
    "    if (snapshot?.presentation?.available !== true) {\n"
    "      try { runtime.destroy?.(); } catch {}\n"
    "      return false;\n"
    "    }\n"
    "    focusSurfaceRuntime = runtime;\n"
    "    return true;\n"
    "  }\n\n"
    "  async function syncDedicatedFocusSurface() {\n"
    "    if (!dedicatedFocus || !focusSurfaceRuntime || destroyed || !model) return null;\n"
    "    const runtime = focusSurfaceRuntime;\n"
    "    const version = ++focusSurfaceVersion;\n"
    "    const context = await readDedicatedFocusContext();\n"
    "    if (!context || destroyed || runtime !== focusSurfaceRuntime || version !== focusSurfaceVersion) {\n"
    "      closeDedicatedFocusSurface();\n"
    "      return null;\n"
    "    }\n"
    "    try {\n"
    "      return runtime.sync?.({ packages: context.packages, generationId: context.generationId }) ?? null;\n"
    "    } catch {\n"
    "      closeDedicatedFocusSurface();\n"
    "      return null;\n"
    "    }\n"
    "  }\n\n"
    "  function currentStagedCardIds() {\n",
    'dedicated focus lifecycle',
)

src = replace_once(
    src,
    "    if (!selectedHand || !model) return;\n"
    "    const currentSourceHandIds = readHand(globalRef, root).map((card) => card.id);\n",
    "    if (!selectedHand || !model) return;\n"
    "    if (dedicatedFocus) {\n"
    "      void openDedicatedFocusSurface();\n"
    "      return;\n"
    "    }\n"
    "    const currentSourceHandIds = readHand(globalRef, root).map((card) => card.id);\n",
    'gesture dedicated focus handoff',
)

src = replace_once(
    src,
    "      node.onclick = () => {\n"
    "        const cardId = resolveBattleJankenSlotCardAction(model, slot.jankenHand, currentSourceHandIds);\n"
    "        if (cardId) clickExistingHandCard(root, cardId);\n"
    "      };\n",
    "      node.onclick = () => {\n"
    "        if (dedicatedFocus) {\n"
    "          void openDedicatedFocusSurface();\n"
    "          return;\n"
    "        }\n"
    "        const cardId = resolveBattleJankenSlotCardAction(model, slot.jankenHand, currentSourceHandIds);\n"
    "        if (cardId) clickExistingHandCard(root, cardId);\n"
    "      };\n",
    'slot click dedicated focus handoff',
)

src = replace_once(
    src,
    "  function openForRound(roundId) {\n"
    "    if (!roundId || roundId === lastRoundId) return;\n"
    "    lastRoundId = roundId;\n",
    "  function openForRound(roundId) {\n"
    "    if (!roundId || roundId === lastRoundId) return;\n"
    "    closeDedicatedFocusSurface();\n"
    "    lastRoundId = roundId;\n",
    'round change focus invalidation',
)

src = replace_once(
    src,
    "    cardFocusSnapshot: () => syncHandCardFocusPresentation(),\n"
    "    presentOrderMotion: (motion, metadata = {}) => destroyed ? false : presentBattleJankenOrderMotionToSlidePad(orderPresenterHost, motion, metadata),\n",
    "    cardFocusSnapshot: () => syncHandCardFocusPresentation(),\n"
    "    dedicatedFocusConnected: () => dedicatedFocus !== null,\n"
    "    focusSurfaceSnapshot: () => focusSurfaceRuntime?.snapshot?.() ?? null,\n"
    "    openFocusSurface: () => openDedicatedFocusSurface(),\n"
    "    syncFocusSurface: () => syncDedicatedFocusSurface(),\n"
    "    presentOrderMotion: (motion, metadata = {}) => destroyed ? false : presentBattleJankenOrderMotionToSlidePad(orderPresenterHost, motion, metadata),\n",
    'runtime focus API',
)

src = replace_once(
    src,
    "      if (suppressClickTimer !== null) globalRef.clearTimeout?.(suppressClickTimer);\n"
    "      if (handDrag) cleanupHandDrag(handDrag);\n",
    "      if (suppressClickTimer !== null) globalRef.clearTimeout?.(suppressClickTimer);\n"
    "      closeDedicatedFocusSurface();\n"
    "      if (handDrag) cleanupHandDrag(handDrag);\n",
    'destroy focus cleanup',
)

test = replace_once(
    test,
    "  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,\n",
    "  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,\n"
    "  BATTLE_JANKEN_FOCUS_LIVE_MOUNT_SCHEMA,\n"
    "  normalizeBattleJankenFocusIntegration,\n",
    'test imports',
)

focus_tests = r'''
// BATTLE_JANKEN_FOCUS_SLIDEPAD_LIVE_MOUNT_R1_BEGIN

test('dedicated janken focus integration requires the existing surface and live-stack contract', () => {
  const stack = {
    focus() {},
    cancel() {},
    commit() {},
    status() {},
  };
  const mountSurface = () => null;
  const readContext = () => ({ packages: [] });
  const normalized = normalizeBattleJankenFocusIntegration({ mountSurface, readContext, liveInputStack: stack });
  assert.equal(normalized.schema, BATTLE_JANKEN_FOCUS_LIVE_MOUNT_SCHEMA);
  assert.equal(normalized.mountSurface, mountSurface);
  assert.equal(normalized.readContext, readContext);
  assert.equal(normalized.liveInputStack, stack);
  assert.equal(normalizeBattleJankenFocusIntegration(null), null);
  assert.equal(normalizeBattleJankenFocusIntegration({ mountSurface, readContext, liveInputStack: { focus() {} } }), null);
});

test('configured dedicated focus blocks legacy direct hand-card commit and delegates exact packages to the existing surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /focusIntegration = null/);
  assert.match(source, /const dedicatedFocus = normalizeBattleJankenFocusIntegration\(focusIntegration\);/);
  assert.equal((source.match(/if \(dedicatedFocus\) \{\s*void openDedicatedFocusSurface\(\);\s*return;\s*\}/g) ?? []).length, 2,
    'both gesture release and direct slot click must enter the same dedicated focus surface');
  assert.match(source, /context = await dedicatedFocus\.readContext\(Object\.freeze\(\{[\s\S]*roundId: model\.roundId,[\s\S]*assignment: model\.assignment/);
  assert.match(source, /runtime = dedicatedFocus\.mountSurface\(\{[\s\S]*liveInputStack: dedicatedFocus\.liveInputStack,[\s\S]*packages: context\.packages,[\s\S]*generationId: context\.generationId/);
  assert.doesNotMatch(source, /from '\.\/battle-janken-focus-runtime-surface\.mjs'/,
    'SlidePad must not invent a second static mount authority; the current caller supplies the merged surface');
});

test('dedicated focus commit keeps release flight presentation-only and invalidates on round or explicit sync failure', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  const acceptedStart = source.indexOf('onAccepted: (result, readyPackage) => {');
  const acceptedEnd = source.indexOf('\n        },\n      });', acceptedStart);
  assert.ok(acceptedStart >= 0 && acceptedEnd > acceptedStart);
  const accepted = source.slice(acceptedStart, acceptedEnd);
  assert.match(accepted, /captureReleasedJankenCardFlight\(globalRef, root, slotNodes, hand\)/);
  assert.match(accepted, /animateReleasedJankenCard\(host, flight\)/);
  assert.equal(accepted.includes('clickExistingHandCard'), false,
    'authoritative compound commit already happened inside the existing live stack');
  assert.match(source, /function openForRound\(roundId\) \{[\s\S]*closeDedicatedFocusSurface\(\);[\s\S]*lastRoundId = roundId;/);
  assert.match(source, /syncFocusSurface: \(\) => syncDedicatedFocusSurface\(\)/);
  assert.match(source, /if \(!context \|\| destroyed[\s\S]*closeDedicatedFocusSurface\(\);\s*return null;/);
});

// BATTLE_JANKEN_FOCUS_SLIDEPAD_LIVE_MOUNT_R1_END

'''

test = replace_once(
    test,
    "// BATTLE_CARD_FOCUS_PRESENTATION_R3_BEGIN\n",
    focus_tests + "// BATTLE_CARD_FOCUS_PRESENTATION_R3_BEGIN\n",
    'focus live tests anchor',
)

SRC.write_text(src, encoding='utf-8')
TEST.write_text(test, encoding='utf-8')
print('patched SlidePad dedicated janken focus live mount')
