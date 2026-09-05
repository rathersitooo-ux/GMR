from pathlib import Path
import subprocess

DONOR = 'e0ce2a13208237bbeb1a42ce020030551ee5511f'
ADAPTER_OLD_BLOB = '7141b4aeac719e111c9320b51ce330f43bc9aef8'

adapter_path = Path('browser/battle-replay-live-adapter.mjs')
test_path = Path('tests/battle-replay-live-adapter.test.mjs')
build_test_path = Path('deploy/cloudflare/tests/build.test.mjs')


def donor(path: str) -> str:
    return subprocess.check_output(
        ['git', 'show', f'{DONOR}:{path}'],
        text=True,
        encoding='utf-8'
    )


def rep(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old, new, 1)


adapter = donor(str(adapter_path))
tests = donor(str(test_path))
build_test = donor(str(build_test_path))

adapter = rep(
    adapter,
    'function formatPartnerBattleEventLogRow(event) {',
    'function formatPartnerBattleEventLogRow(event, environment = {}) {',
    'formatter signature'
)
adapter = rep(
    adapter,
    '    const publicCards = Array.isArray(data.players)',
    '    const publicCards = environment.partnerBattleLogIncludePublicCards === true && Array.isArray(data.players)',
    'public card explicit opt-in'
)
adapter = rep(
    adapter,
    '  const rows = projection.events.map(formatPartnerBattleEventLogRow);',
    '  const rows = projection.events.map(event => formatPartnerBattleEventLogRow(event, environment));',
    'formatter environment projection'
)
adapter = rep(
    adapter,
    """function applyPartnerBattleEventLogPresentation(host, toggle, environment = {}) {
  const children = partnerBattleEventLogChildren(host);
  if (!host?.dataset || !children || !toggle || typeof toggle.setAttribute !== 'function') return false;
  const recentRows = partnerBattleEventLogRecentRows(environment);
  const hasOlderRows = children.length > recentRows;
""",
    """function applyPartnerBattleEventLogPresentation(host, toggle, environment = {}) {
  const children = partnerBattleEventLogChildren(host);
  if (!host?.dataset || !children) return false;
  const recentRows = partnerBattleEventLogRecentRows(environment);
  if (!toggle || typeof toggle.setAttribute !== 'function') {
    children.forEach(child => { child.hidden = false; });
    host.dataset.partnerBattleEventLogRecentRows = String(recentRows);
    host.dataset.partnerBattleEventLogExpanded = 'false';
    return true;
  }
  const hasOlderRows = children.length > recentRows;
""",
    'toggle fail-soft fallback'
)
adapter = rep(
    adapter,
    'const livePartnerBattleEventLogBridge = createPartnerBattleEventLogPresentationBridge();',
    'const livePartnerBattleEventLogBridge = createPartnerBattleEventLogPresentationBridge({ partnerBattleLogIncludePublicCards: true });',
    'production Battle public-card opt-in'
)

tests = rep(
    tests,
    "const bridge = createPartnerBattleEventLogPresentationBridge({ document: fake.document, partnerBattleLogRecentRows: 2 });",
    "const bridge = createPartnerBattleEventLogPresentationBridge({ document: fake.document, partnerBattleLogRecentRows: 2, partnerBattleLogIncludePublicCards: true });",
    'focused test explicit public-card opt-in'
)

adapter_path.write_text(adapter, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')

adapter_blob = subprocess.check_output(
    ['git', 'hash-object', str(adapter_path)],
    text=True,
    encoding='utf-8'
).strip()

build_test = rep(
    build_test,
    f"currentBlob: '{ADAPTER_OLD_BLOB}'",
    f"currentBlob: '{adapter_blob}'",
    'public package adapter provenance pin'
)
build_test_path.write_text(build_test, encoding='utf-8')

print(f'R3B_ADAPTER_BLOB={adapter_blob}')
