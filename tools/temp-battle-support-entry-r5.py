from pathlib import Path
import hashlib


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, got {count}')
    return text.replace(old, new, 1)

adapter_path = Path('browser/battle-replay-live-adapter.mjs')
adapter = adapter_path.read_text()
adapter = replace_once(
    adapter,
    "  registerLiveBattleSupportSurface({ key: 'history', label: '履歴', target: host, document: documentRef });\n  return host;\n}\n\nfunction partnerBattleEventLogChildren(host) {",
    "  return host;\n}\n\nfunction partnerBattleEventLogChildren(host) {",
    'defer history support registration',
)
adapter = replace_once(
    adapter,
    "  root.replaceChildren?.(title, known, unknown);\n  registerLiveBattleSupportSurface({ key: 'deck', label: '山札', target: root, document, hostId });\n  return true;\n}",
    "  root.replaceChildren?.(title, known, unknown);\n  const historyTarget = host.querySelector?.('[data-partner-battle-event-log]') || null;\n  if (historyTarget) {\n    registerLiveBattleSupportSurface({ key: 'history', label: '履歴', target: historyTarget, document, hostId });\n  }\n  registerLiveBattleSupportSurface({ key: 'deck', label: '山札', target: root, document, hostId });\n  return true;\n}",
    'register combined support entry only once deck surface exists',
)
adapter_path.write_text(adapter)
raw = adapter.encode()
new_blob = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
print(f'new_adapter_blob={new_blob}')

build_test_path = Path('deploy/cloudflare/tests/build.test.mjs')
build_test = build_test_path.read_text()
old_blob = '486b522fbb9b77d973bbe79230a213bcad97e9e5'
if build_test.count(old_blob) != 1:
    raise SystemExit(f'expected exactly one old replay-adapter provenance pin, got {build_test.count(old_blob)}')
build_test = build_test.replace(old_blob, new_blob, 1)
build_test_path.write_text(build_test)
