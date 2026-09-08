from pathlib import Path

html_path = Path('browser/GAMEROAD.html')
test_path = Path('tests/result-presentation-core.test.mjs')
html = html_path.read_text(encoding='utf-8')
old = "r.grade===1?'joy':'defeated'"
count = html.count(old)
if count != 1:
    contexts = []
    needle = 'defeated'
    start = 0
    while len(contexts) < 8:
        idx = html.find(needle, start)
        if idx < 0:
            break
        contexts.append(html[max(0, idx - 120):idx + 160].replace('\n', ' '))
        start = idx + len(needle)
    raise SystemExit(f'expected exactly one Result defeated expression, found {count}; contexts={contexts!r}')
html = html.replace(old, "'joy'", 1)
html_path.write_text(html, encoding='utf-8')

test_source = test_path.read_text(encoding='utf-8')
if "from 'node:fs'" not in test_source:
    test_source = test_source.replace("import assert from 'node:assert/strict';\n", "import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n", 1)
marker = "normal ranked Result character presentation never requests the defeated state"
if marker not in test_source:
    test_source += """\n\ntest('normal ranked Result character presentation never requests the defeated state', () => {\n  const source = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');\n  assert.doesNotMatch(source, /r\\.grade===1\\?'joy':'defeated'/);\n});\n"""
test_path.write_text(test_source, encoding='utf-8')
print('patched exactly one Result character-state expression and added focused regression')
