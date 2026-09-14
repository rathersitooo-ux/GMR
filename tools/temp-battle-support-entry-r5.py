from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, got {count}')
    return text.replace(old, new, 1)

adapter_path = Path('browser/battle-replay-live-adapter.mjs')
adapter = adapter_path.read_text()
adapter = replace_once(
    adapter,
    "const PARTNER_BATTLE_LOG_DEFAULT_RECENT_ROWS = 2;\n\nfunction cloneJson(value) {",
    "const PARTNER_BATTLE_LOG_DEFAULT_RECENT_ROWS = 2;\nconst BATTLE_SUPPORT_ENTRY_ATTR = 'data-battle-support-entry';\nconst BATTLE_SUPPORT_ITEM_ATTR = 'data-battle-support-item';\n\nfunction cloneJson(value) {",
    'support constants',
)
support_functions = """function ensureLiveBattleSupportEntryRoot(documentRef, shell) {\n  if (!shell || typeof documentRef?.createElement !== 'function') return null;\n  let root = typeof shell.querySelector === 'function' ? shell.querySelector(`[${BATTLE_SUPPORT_ENTRY_ATTR}]`) : null;\n  if (!root) {\n    root = documentRef.createElement('nav');\n    if (!root || typeof root.setAttribute !== 'function' || typeof shell.appendChild !== 'function') return null;\n    root.setAttribute(BATTLE_SUPPORT_ENTRY_ATTR, '');\n    root.setAttribute('aria-label', '対戦サポート');\n    shell.appendChild(root);\n  }\n  return root;\n}\n\nexport function registerLiveBattleSupportSurface({ key, label, target, document = browserGlobal('document'), hostId = 'battleLog' } = {}) {\n  if (!nonEmptyString(key) || !nonEmptyString(label) || !target) return false;\n  const shell = document?.getElementById?.(hostId);\n  if (!shell || typeof document?.createElement !== 'function') return false;\n  const root = ensureLiveBattleSupportEntryRoot(document, shell);\n  if (!root || typeof root.appendChild !== 'function') return false;\n  const children = root.children ? Array.from(root.children) : [];\n  let control = children.find(child => child?.getAttribute?.(BATTLE_SUPPORT_ITEM_ATTR) === key) || null;\n  if (!control) {\n    control = document.createElement('button');\n    if (!control || typeof control.setAttribute !== 'function') return false;\n    control.setAttribute('type', 'button');\n    control.setAttribute(BATTLE_SUPPORT_ITEM_ATTR, key);\n    root.appendChild(control);\n  }\n  control.textContent = label;\n  control.onclick = () => {\n    target.scrollIntoView?.({ block: 'nearest' });\n    target.focus?.({ preventScroll: true });\n  };\n  return true;\n}\n\n"""
adapter = replace_once(
    adapter,
    "function ensurePartnerBattleEventLogHost(environment = {}) {",
    support_functions + "function ensurePartnerBattleEventLogHost(environment = {}) {",
    'support functions',
)
adapter = replace_once(
    adapter,
    "    shell.appendChild(host);\n  }\n  return host;\n}\n\nfunction partnerBattleEventLogChildren(host) {",
    "    shell.appendChild(host);\n  }\n  registerLiveBattleSupportSurface({ key: 'history', label: '履歴', target: host, document: documentRef });\n  return host;\n}\n\nfunction partnerBattleEventLogChildren(host) {",
    'history registration',
)
adapter = replace_once(
    adapter,
    "  root.replaceChildren?.(title, known, unknown);\n  return true;\n}\n\nexport const BATTLE_REPLAY_LIVE_ADAPTER",
    "  root.replaceChildren?.(title, known, unknown);\n  registerLiveBattleSupportSurface({ key: 'deck', label: '山札', target: root, document, hostId });\n  return true;\n}\n\nexport const BATTLE_REPLAY_LIVE_ADAPTER",
    'deck registration',
)
adapter_path.write_text(adapter)

test_path = Path('tests/battle-replay-live-adapter.test.mjs')
test_text = test_path.read_text()
marker = "test('production session still requires all exact version authorities; capture never invents them', () => {"
new_test = """test('actual History and owner-safe Deck share one support entry while Graveyard stays absent', () => {\n  const { document, shell } = fakeBattleLogDocument();\n  const bridge = createPartnerBattleEventLogPresentationBridge({ document });\n  assert.equal(bridge.begin('M-SUPPORT'), true);\n  assert.equal(renderLiveBattleRemainingDeckPresentation({\n    ok: true, status: 'ready', total: 4, unknownCount: 4, revision: 1, knownCardCounts: []\n  }, { document }), true);\n  const support = shell.querySelector('[data-battle-support-entry]');\n  assert.ok(support);\n  assert.deepEqual(support.children.map(child => child.getAttribute('data-battle-support-item')), ['history', 'deck']);\n  assert.equal(support.children.some(child => child.getAttribute('data-battle-support-item') === 'graveyard'), false);\n  assert.equal(shell.children.filter(child => child.getAttribute?.('data-battle-support-entry') !== null).length, 1);\n});\n\n"""
if new_test in test_text:
    raise SystemExit('classified regression already present unexpectedly')
test_text = replace_once(test_text, marker, new_test + marker, 'classified test insertion')
test_path.write_text(test_text)

build_test_path = Path('deploy/cloudflare/tests/build.test.mjs')
build_test = build_test_path.read_text()
old_pin = "{ file: 'battle-replay-live-adapter.mjs', source: 'browser/battle-replay-live-adapter.mjs', sourceArg: 'replayAdapterSource', expectedArg: 'expectedReplayAdapterBlob', artifact: 'battle_replay_live_adapter', fixture: \"import './battle-replay-core.mjs';\\nimport './card-presentation-core.mjs';\\nimport './battle-self-deck-inspect-core.mjs';\\nimport './battle-conveyor-presentation-core.mjs';\\nimport './partner-battle-event-log-projection.mjs';\\n\", currentBlob: '4047d561436345de7d0382129d35b9de00a805de' }"
new_pin = old_pin.replace("4047d561436345de7d0382129d35b9de00a805de", "486b522fbb9b77d973bbe79230a213bcad97e9e5")
build_test = replace_once(build_test, old_pin, new_pin, 'replay adapter provenance pin')
build_test_path.write_text(build_test)
