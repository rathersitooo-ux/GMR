#!/usr/bin/env python3
from pathlib import Path
import re
import sys

REPO = Path(__file__).resolve().parents[1]
BUILD = REPO / 'deploy/cloudflare/scripts/build.mjs'
ROOTS = [
    'browser/battle-camera-live-runtime.mjs',
    'browser/battle-recovery-live-adapter.mjs',
    'browser/battle-recovery-runtime-surface.mjs',
    'browser/battle-janken-focus-runtime-surface.mjs',
    'browser/battle-critical-resource-hud-runtime.mjs',
    'browser/new-base-progression-lane-presentation-core.mjs',
    'browser/battle-new-base-board-live-presentation-composer.mjs',
]

IMPORT_RE = re.compile(r"['\"](\./[^'\"]+\.mjs)['\"]")
SOURCE_RE = re.compile(r"source:\s*'([^']+)'" )
ARTIFACT_RE = re.compile(r"artifact:\s*'([^']+)'" )


def rel_repo(path: Path) -> str:
    resolved = path.resolve()
    try:
        rel = resolved.relative_to(REPO.resolve())
    except ValueError as exc:
        raise RuntimeError(f'path escapes repo: {path}') from exc
    return rel.as_posix()


def dependency_closure(roots):
    pending = list(roots)
    seen = set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        if not source.startswith('browser/') or not source.endswith('.mjs'):
            raise RuntimeError(f'unsupported package source: {source}')
        path = REPO / source
        if not path.is_file():
            raise RuntimeError(f'missing package source: {source}')
        seen.add(source)
        text = path.read_text(encoding='utf-8')
        for spec in IMPORT_RE.findall(text):
            dep = rel_repo(path.parent / spec)
            if dep.startswith('browser/') and dep.endswith('.mjs') and dep not in seen:
                pending.append(dep)
    return seen


def artifact_name(source, used):
    stem = Path(source).stem
    candidate = re.sub(r'[^a-zA-Z0-9]+', '_', stem).strip('_').lower()
    if candidate not in used:
        return candidate
    candidate = 'battle_package_' + re.sub(r'[^a-zA-Z0-9]+', '_', source[:-4]).strip('_').lower()
    if candidate in used:
        raise RuntimeError(f'artifact id collision for {source}: {candidate}')
    return candidate


def main():
    text = BUILD.read_text(encoding='utf-8')
    marker = 'const ARTIFACT_SPECS = Object.freeze(['
    start = text.find(marker)
    if start < 0:
        raise RuntimeError('ARTIFACT_SPECS start marker not found')
    end = text.find('\n]);', start)
    if end < 0:
        raise RuntimeError('ARTIFACT_SPECS end marker not found')
    block = text[start:end]

    existing_sources = set(SOURCE_RE.findall(block))
    used_artifacts = set(ARTIFACT_RE.findall(block))
    closure = dependency_closure(ROOTS)
    missing = sorted(closure - existing_sources)

    entries = []
    for source in missing:
        output = Path(source).name
        artifact = artifact_name(source, used_artifacts)
        used_artifacts.add(artifact)
        label = f'Battle package dependency {output}'
        entries.append(
            "  { source: '%s', output: '%s', artifact: '%s', label: '%s' },"
            % (source, output, artifact, label)
        )

    if not entries:
        print('NO_MISSING_ARTIFACT_SPECS')
        return 2

    insert = '\n' + '\n'.join(entries)
    patched = text[:end] + insert + text[end:]
    BUILD.write_text(patched, encoding='utf-8')

    print('ROOTS=' + ','.join(ROOTS))
    print('CLOSURE_COUNT=' + str(len(closure)))
    print('ADDED_COUNT=' + str(len(missing)))
    for source in missing:
        print('ADDED=' + source)

    # Re-read and prove exactly one source spec per closure member.
    final = BUILD.read_text(encoding='utf-8')
    fstart = final.find(marker)
    fend = final.find('\n]);', fstart)
    fblock = final[fstart:fend]
    for source in closure:
        count = len(re.findall(r"source:\s*'" + re.escape(source) + r"'", fblock))
        if count != 1:
            raise RuntimeError(f'package source count {count} for {source}')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'PACKAGE_WRITER_FAIL: {exc}', file=sys.stderr)
        raise
