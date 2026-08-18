from pathlib import Path

path = Path('deploy/cloudflare/tests/build.test.mjs')
text = path.read_text(encoding='utf-8')
old = "const expectedNavigationCoreBlob = '6224a1247cacee07986b6fc31850ffdffb50a103';"
new = "const expectedNavigationCoreBlob = '771798cba911978256976da1275ef3d1e546ce5a';"
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one stale navigation blob anchor, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
