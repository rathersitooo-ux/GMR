from pathlib import Path

SPEC = Path('tests/browser-full-interaction.spec.mjs')
text = SPEC.read_text(encoding='utf-8')

replacements = [
    (
        "  const defaultDeck = await page.evaluate(() => [...window.__DEFAULT_DECK__]);\n  expect(defaultDeck).toHaveLength(26);",
        "  const defaultDeck = await page.evaluate(() => [...window.__DEFAULT_DECK__]);\n  expect(defaultDeck).toHaveLength(40);\n  const legacyDeck = defaultDeck.slice(0, 26);\n  expect(legacyDeck).toHaveLength(26);",
        'fresh starter expectation',
    ),
    (
        "deck: { main: defaultDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 2 },",
        "deck: { main: legacyDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 2 },",
        'legacy fixture isolation',
    ),
    (
        "  expect(afterReset.savedCount).toBe(26);",
        "  expect(afterReset.savedCount).toBe(40);",
        'reset starter expectation',
    ),
    (
        "  expect(writeFailure.savedCount).toBe(26);",
        "  expect(writeFailure.savedCount).toBe(40);",
        'write-failure runtime starter expectation',
    ),
]

for old, new, label in replacements:
    count = text.count(old)
    if count == 1:
        text = text.replace(old, new, 1)
    elif count == 0 and new in text:
        pass
    else:
        raise SystemExit(f'{label}: expected exactly one old anchor or already-applied new anchor; old_count={count}')

required = [
    "expect(defaultDeck).toHaveLength(40);",
    "const legacyDeck = defaultDeck.slice(0, 26);",
    "deck: { main: legacyDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 2 },",
    "expect(observed.savedDeck).toHaveLength(26);",
    "expect(afterReset.savedCount).toBe(40);",
    "expect(writeFailure.savedCount).toBe(40);",
]
for needle in required:
    if needle not in text:
        raise SystemExit(f'missing required postcondition: {needle}')

for forbidden in [
    "expect(defaultDeck).toHaveLength(26);",
    "expect(afterReset.savedCount).toBe(26);",
    "expect(writeFailure.savedCount).toBe(26);",
]:
    if forbidden in text:
        raise SystemExit(f'stale current-starter expectation remains: {forbidden}')

SPEC.write_text(text, encoding='utf-8')
print('starter40 broad-E2E stale expectations repaired; explicit legacy 26 fixture preserved')
