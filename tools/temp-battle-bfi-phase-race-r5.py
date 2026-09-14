from pathlib import Path

TEST = Path('tests/browser-full-interaction.spec.mjs')
text = TEST.read_text(encoding='utf-8')

helper_anchor = "async function satisfyVisibleAbilityChoice(page) {"
helper = """async function isCurrentlyVisibleAndEnabled(locator) {\n  return locator.evaluateAll((nodes) => {\n    const node = nodes[0];\n    return Boolean(\n      node\n      && !node.disabled\n      && node.getClientRects().length > 0\n      && getComputedStyle(node).visibility !== 'hidden'\n    );\n  });\n}\n\n"""

if text.count(helper_anchor) != 1:
    raise SystemExit(f'expected one helper anchor, got {text.count(helper_anchor)}')
if 'async function isCurrentlyVisibleAndEnabled(locator)' in text:
    raise SystemExit('atomic visibility helper already exists; refuse duplicate patch')

old = """    const roadSelect = battle.locator('#roadSelect:visible');\n    if ((await roadSelect.count()) > 0 && (await roadSelect.isEnabled())) {"""
new = """    const roadSelect = battle.locator('#roadSelect');\n    if (await isCurrentlyVisibleAndEnabled(roadSelect)) {"""

if text.count(old) != 2:
    raise SystemExit(f'expected exactly two volatile roadSelect probes, got {text.count(old)}')

patched = text.replace(helper_anchor, helper + helper_anchor, 1).replace(old, new)

if patched.count("battle.locator('#roadSelect:visible')") != 0:
    raise SystemExit('volatile roadSelect :visible locator remains')
if patched.count('if (await isCurrentlyVisibleAndEnabled(roadSelect)) {') != 2:
    raise SystemExit('atomic roadSelect probe count mismatch')
if patched.count('async function isCurrentlyVisibleAndEnabled(locator)') != 1:
    raise SystemExit('atomic helper count mismatch')

TEST.write_text(patched, encoding='utf-8')
print('patched two volatile roadSelect phase probes with one atomic stable-node helper')
