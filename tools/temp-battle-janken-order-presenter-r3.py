from __future__ import annotations

import pathlib
import re
import subprocess

RUNTIME = pathlib.Path('browser/battle-janken-slidepad-runtime-mount.mjs')
TEST = pathlib.Path('tests/battle-janken-slidepad-runtime-mount.test.mjs')
DONOR_BASE = 'a84a3c877be133901dec969a6e67a54deb6da0c9'
DONOR_HEAD = 'c4111748e5fd76c320d91d74cf4b0464d4e891ef'
DONOR_TEST = 'tests/battle-janken-order-slidepad-presenter.test.mjs'
ORDER_ADAPTER_IMPORT = "import { projectBattleJankenOrderSnapshot } from '../browser/battle-janken-order-live-adapter.mjs';\n"
PRESENTER_IMPORTS = [
    'BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA',
    'presentBattleJankenOrderMotionToSlidePad',
    'projectBattleJankenOrderSlidePadPresentation',
]


def run(*args: str, input_text: str | None = None) -> str:
    result = subprocess.run(
        list(args),
        input=input_text,
        text=True,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def apply_runtime_donor() -> None:
    current = RUNTIME.read_text(encoding='utf-8')
    marker = 'BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA'
    if marker in current:
        raise SystemExit('fail-closed: order presenter already exists in current runtime')

    patch = run(
        'git', 'diff', '--binary', DONOR_BASE, DONOR_HEAD, '--', str(RUNTIME)
    )
    if not patch.strip():
        raise SystemExit('fail-closed: donor runtime patch is empty')
    patch_path = pathlib.Path('/tmp/battle-janken-order-presenter-r3.patch')
    patch_path.write_text(patch, encoding='utf-8')
    subprocess.run(['git', 'apply', '--3way', str(patch_path)], check=True)

    updated = RUNTIME.read_text(encoding='utf-8')
    required = [
        marker,
        'projectBattleJankenOrderSlidePadPresentation',
        'presentBattleJankenOrderMotionToSlidePad',
        'presentOrderMotion:',
        'orderPresentationSnapshot:',
        'grJankenOrderPresenter',
    ]
    missing = [value for value in required if value not in updated]
    if missing:
        raise SystemExit(f'fail-closed: runtime donor markers missing after apply: {missing}')


def add_runtime_imports(test_source: str) -> str:
    pattern = re.compile(
        r"import \{(?P<body>[\s\S]*?)\} from '../browser/battle-janken-slidepad-runtime-mount\.mjs';"
    )
    match = pattern.search(test_source)
    if not match:
        raise SystemExit('fail-closed: classified SlidePad runtime import block not found')
    body = match.group('body')
    for name in PRESENTER_IMPORTS:
        if re.search(rf'\b{re.escape(name)}\b', body):
            raise SystemExit(f'fail-closed: presenter import already exists: {name}')
    insertion = ''.join(f'\n  {name},' for name in PRESENTER_IMPORTS)
    new_body = body.rstrip() + insertion + '\n'
    return test_source[:match.start('body')] + new_body + test_source[match.end('body'):]


def donor_test_body() -> str:
    donor = run('git', 'show', f'{DONOR_HEAD}:{DONOR_TEST}')
    start = donor.find('function authoritativeSnapshot() {')
    if start < 0:
        raise SystemExit('fail-closed: donor focused-test body marker not found')
    body = donor[start:]
    replacements = {
        'authoritativeSnapshot': 'orderPresenterAuthoritativeSnapshot',
        'FakeElement': 'OrderPresenterFakeElement',
        'FakeDocument': 'OrderPresenterFakeDocument',
        'makeHost': 'makeOrderPresenterHost',
    }
    for old, new in replacements.items():
        body = re.sub(rf'\b{old}\b', new, body)
    return body.rstrip() + '\n'


def integrate_classified_tests() -> None:
    source = TEST.read_text(encoding='utf-8')
    sentinel = "projects exact authoritative order without sorting or gameplay recalculation"
    if sentinel in source or 'orderPresenterAuthoritativeSnapshot' in source:
        raise SystemExit('fail-closed: order presenter assertions already exist in classified test')
    if 'projectBattleJankenOrderSnapshot' in source:
        raise SystemExit('fail-closed: order adapter import unexpectedly already exists')

    source = add_runtime_imports(source)
    first_import_end = source.find('\n\n', source.find("from '../browser/battle-janken-slidepad-runtime-mount.mjs';"))
    if first_import_end < 0:
        raise SystemExit('fail-closed: import insertion point not found')
    source = source[:first_import_end + 2] + ORDER_ADAPTER_IMPORT + '\n' + source[first_import_end + 2:]
    source = source.rstrip() + '\n\n' + donor_test_body()
    TEST.write_text(source, encoding='utf-8')

    final = TEST.read_text(encoding='utf-8')
    for marker in [*PRESENTER_IMPORTS, 'projectBattleJankenOrderSnapshot', sentinel]:
        if marker not in final:
            raise SystemExit(f'fail-closed: classified test integration missing marker: {marker}')


def main() -> None:
    apply_runtime_donor()
    integrate_classified_tests()
    subprocess.run(['git', 'diff', '--check'], check=True)
    changed = run('git', 'diff', '--name-only').splitlines()
    expected = {str(RUNTIME), str(TEST)}
    actual = {p for p in changed if p}
    if actual != expected:
        raise SystemExit(f'fail-closed: unexpected product paths after patch: {sorted(actual)}')
    print('R3 product patch ready:', ', '.join(sorted(actual)))


if __name__ == '__main__':
    main()
