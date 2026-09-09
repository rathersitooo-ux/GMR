from pathlib import Path
import subprocess
import sys

RUNTIME = Path('browser/battle-screen-runtime-mount.mjs')
TEST = Path('tests/battle-screen-runtime-mount.test.mjs')
EXPECTED_RUNTIME_BLOB = 'a5bb680aef94ebf4e8f613548f83dccf05cea847'
EXPECTED_TEST_BLOB = 'b9a1ba99fe5b7d7f514f62155c63a36759440cb9'


def blob(path: Path) -> str:
    return subprocess.check_output(['git', 'hash-object', str(path)], text=True).strip()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'ANCHOR_{label}_COUNT={count}')
    return text.replace(old, new, 1)


if blob(RUNTIME) != EXPECTED_RUNTIME_BLOB:
    raise SystemExit(f'RUNTIME_BLOB_DRIFT:{blob(RUNTIME)}')
if blob(TEST) != EXPECTED_TEST_BLOB:
    raise SystemExit(f'TEST_BLOB_DRIFT:{blob(TEST)}')

runtime = RUNTIME.read_text()
runtime = replace_once(
    runtime,
    "import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';\n",
    "import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';\nimport { mountBattleCriticalResourceHud } from './battle-critical-resource-hud-runtime.mjs';\n",
    'IMPORT'
)
runtime = replace_once(
    runtime,
    "function createHud(document, shell) {\n",
    "function resourceSnapshotFromHud(snapshot = {}) {\n  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};\n  return {\n    honey: source.honey,\n    chipCount: source.chipCount,\n    honeyDelta: source.honeyDelta,\n    honeyDeltaSource: source.honeyDeltaSource\n  };\n}\n\nfunction createHud(document, shell) {\n",
    'RESOURCE_PROJECTOR'
)
runtime = replace_once(
    runtime,
    "  left.appendChild(settingsButton);\n  left.appendChild(score);\n\n  const center = createNode(document, 'div', 'grBattleHudCenter');\n",
    "  const resourceHost = createNode(document, 'div', 'grBattleResourceHudHost');\n  resourceHost.dataset.presentationOnly = 'true';\n  resourceHost.dataset.authority = 'caller';\n  left.appendChild(settingsButton);\n  left.appendChild(score);\n  left.appendChild(resourceHost);\n\n  const center = createNode(document, 'div', 'grBattleHudCenter');\n",
    'RESOURCE_HOST'
)
runtime = replace_once(
    runtime,
    "  return { root, settingsButton, scoreValue, chain, loadValue, hateValue, turnValue };\n",
    "  return { root, settingsButton, scoreValue, chain, loadValue, hateValue, turnValue, resourceHost };\n",
    'HUD_RETURN'
)
runtime = replace_once(
    runtime,
    "  const hud = createHud(document, shell);\n  let lastHudSnapshot = writeHud(document, hud, options.hud);\n",
    "  const hud = createHud(document, shell);\n  const resourceHud = mountBattleCriticalResourceHud(global, {\n    host: hud.resourceHost,\n    snapshot: resourceSnapshotFromHud(options.hud)\n  });\n  let lastHudSnapshot = writeHud(document, hud, options.hud);\n",
    'RESOURCE_MOUNT'
)
runtime = replace_once(
    runtime,
    "    lastHudSnapshot = writeHud(document, hud, snapshot);\n    return lastHudSnapshot;\n",
    "    lastHudSnapshot = writeHud(document, hud, snapshot);\n    resourceHud.sync(resourceSnapshotFromHud(snapshot));\n    return lastHudSnapshot;\n",
    'RESOURCE_SYNC'
)
runtime = replace_once(
    runtime,
    "    if (grid?.parentNode && typeof grid.parentNode.removeChild === 'function') grid.parentNode.removeChild(grid);\n    if (hud.root?.parentNode && typeof hud.root.parentNode.removeChild === 'function') hud.root.parentNode.removeChild(hud.root);\n",
    "    if (grid?.parentNode && typeof grid.parentNode.removeChild === 'function') grid.parentNode.removeChild(grid);\n    resourceHud.destroy();\n    if (hud.root?.parentNode && typeof hud.root.parentNode.removeChild === 'function') hud.root.parentNode.removeChild(hud.root);\n",
    'RESOURCE_DESTROY'
)
RUNTIME.write_text(runtime)

test = TEST.read_text()
test = replace_once(
    test,
    "assert.equal(runtime.hud.chain.children.length, 0);\n",
    "assert.equal(runtime.hud.chain.children.length, 0);\nassert.equal(runtime.hud.resourceHost.dataset.presentationOnly, 'true');\nassert.equal(runtime.hud.resourceHost.dataset.authority, 'caller');\nconst criticalResourceHud = runtime.hud.resourceHost.children[0];\nassert.ok(criticalResourceHud);\nassert.equal(criticalResourceHud.dataset.presentationOnly, 'true');\nassert.equal(criticalResourceHud.dataset.authority, 'caller_authoritative_resource_snapshot_only');\nassert.equal(criticalResourceHud.children[0].children[1].textContent, '—');\nassert.equal(criticalResourceHud.children[1].children[1].textContent, '—');\n",
    'TEST_INITIAL_RESOURCE'
)
test = replace_once(
    test,
    "  loadJanken: 'rock',\n  playedCards: [\n",
    "  loadJanken: 'rock',\n  honey: 7,\n  chipCount: 3,\n  honeyDelta: 2,\n  honeyDeltaSource: '2位',\n  playedCards: [\n",
    'TEST_ATTACK_INPUT'
)
test = replace_once(
    test,
    "assert.equal(runtime.hud.loadValue.textContent, 'グー');\n",
    "assert.equal(runtime.hud.loadValue.textContent, 'グー');\nassert.equal(criticalResourceHud.children[0].children[1].textContent, '7');\nassert.equal(criticalResourceHud.children[1].children[1].textContent, '3');\nassert.equal(criticalResourceHud.children[0].children[2].textContent, '+2・2位');\nassert.equal(criticalResourceHud.children[0].children[2].hidden, false);\n",
    'TEST_ATTACK_ASSERT'
)
test = replace_once(
    test,
    "runtime.renderHud({ score: '', hate: null, turn: undefined, loadJanken: 'heart' });\n",
    "runtime.renderHud({ score: '', hate: null, turn: undefined, loadJanken: 'heart', honey: -1, chipCount: '2' });\n",
    'TEST_FAILCLOSE_INPUT'
)
test = replace_once(
    test,
    "assert.equal(runtime.hud.root.dataset.loadJankenResolved, 'false');\n",
    "assert.equal(runtime.hud.root.dataset.loadJankenResolved, 'false');\nassert.equal(criticalResourceHud.children[0].children[1].textContent, '—');\nassert.equal(criticalResourceHud.children[1].children[1].textContent, '—');\nassert.equal(criticalResourceHud.children[0].children[2].hidden, true);\n",
    'TEST_FAILCLOSE_ASSERT'
)
test = replace_once(
    test,
    "assert.equal(currentActionCue.parentNode, null);\nassert.equal(root.children.includes(runtime.shell), false);\n",
    "assert.equal(currentActionCue.parentNode, null);\nassert.equal(criticalResourceHud.parentNode, null);\nassert.equal(root.children.includes(runtime.shell), false);\n",
    'TEST_DESTROY_ASSERT'
)
TEST.write_text(test)

subprocess.run(['node', '--check', str(RUNTIME)], check=True)
subprocess.run([
    'node', '--test',
    str(TEST),
    'tests/battle-critical-resource-hud-runtime.test.mjs'
], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
print('BATTLE_RESOURCE_HUD_SCREEN_R4B_PATCH_PASS')
