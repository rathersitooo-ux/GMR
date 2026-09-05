from pathlib import Path
import re
import subprocess
import urllib.request

# Reuse the exact scoped patch that already passed its focused regression in run 33937555593.
DONOR_URL = 'https://raw.githubusercontent.com/rathersitooo-ux/GMR/c7f13f1afeb30346f067d48415d0774e8791039d/tools/battle-recent-history-r2-patch.py'
with urllib.request.urlopen(DONOR_URL, timeout=30) as response:
    donor = response.read().decode('utf-8')
exec(compile(donor, DONOR_URL, 'exec'), {'__name__': '__main__'})

# The previous PR failed only because its public-package provenance pin was left stale.
adapter_blob = subprocess.check_output(
    ['git', 'hash-object', 'browser/battle-replay-live-adapter.mjs'], text=True
).strip()
expected_blob = '7141b4aeac719e111c9320b51ce330f43bc9aef8'
if adapter_blob != expected_blob:
    raise SystemExit(f'unexpected patched adapter blob: {adapter_blob}')

build_test = Path('deploy/cloudflare/tests/build.test.mjs')
text = build_test.read_text(encoding='utf-8')
pattern = r"(?m)(\{ file: 'battle-replay-live-adapter\.mjs'.*?currentBlob: ')[0-9a-f]{40}(' \},)$"
updated, count = re.subn(pattern, lambda m: m.group(1) + adapter_blob + m.group(2), text)
if count != 1:
    raise SystemExit(f'expected exactly one Battle replay provenance pin, got {count}')
build_test.write_text(updated, encoding='utf-8')

# Prove the packaging contract before the executor is allowed to commit the product patch.
subprocess.run(['node', '--test', 'deploy/cloudflare/tests/build.test.mjs'], check=True)
subprocess.run(['git', 'add', 'deploy/cloudflare/tests/build.test.mjs'], check=True)

# Keep PRE_ACTION in history but remove the transient authorization artifact from the final product diff.
subprocess.run([
    'git', 'rm', '-f',
    'data/preaction-authorizations/BATTLE-RECENT-HISTORY-R3-20260905T1614-SOL-H5K8P3.json'
], check=True)
