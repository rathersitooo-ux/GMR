#!/usr/bin/env python3
from pathlib import Path
import json
import shutil
import subprocess

BUILD = Path('deploy/cloudflare/scripts/build.mjs')
SCRIPT = Path('tools/temp-partner-advice-replypair-r2.py')
WORKFLOW = Path('.github/workflows/zz-temp-partner-advice-replypair-r2.yml')
DIST = Path('/tmp/gameroad-partner-advice-replypair-r2-dist')


def run(*args):
    print('+', ' '.join(args), flush=True)
    subprocess.run(args, check=True)


text = BUILD.read_text(encoding='utf-8')
source_line = "  { source: 'browser/partner-saasuna-conversation-source.mjs', output: 'partner-saasuna-conversation-source.mjs', artifact: 'partner_saasuna_conversation_source', label: 'Partner Saasuna conversation source', formalBlob: FORMAL_PARTNER_CONVERSATION_BLOBS.saasunaSource },\n"
registry_line = "  { source: 'browser/partner-dialogue-source-registry.mjs', output: 'partner-dialogue-source-registry.mjs', artifact: 'partner_dialogue_source_registry', label: 'Partner dialogue source registry' },\n"
player_control_line = "  { source: 'browser/partner-advice-player-control-core.mjs', output: 'partner-advice-player-control-core.mjs', artifact: 'partner_advice_player_control_core', label: 'Partner advice player control core' },\n"
anchor = source_line + registry_line
replacement = source_line + player_control_line + registry_line
if player_control_line not in text:
    if text.count(anchor) != 1:
        raise SystemExit('public build anchor mismatch; refusing to patch')
    text = text.replace(anchor, replacement, 1)
    BUILD.write_text(text, encoding='utf-8')
elif text.count(player_control_line) != 1:
    raise SystemExit('player-control public artifact is duplicated')

run('node', '--check', 'browser/partner-dialogue-source-registry.mjs')
run('node', '--check', 'deploy/cloudflare/scripts/build.mjs')
run('node', '--test', 'tests/partner-dialogue-source-registry.test.mjs', 'tests/partner-advice-player-control-core.test.mjs')
run('node', '--test', 'deploy/cloudflare/tests/build.test.mjs')

if DIST.exists():
    shutil.rmtree(DIST)
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
run(
    'node', 'deploy/cloudflare/scripts/build.mjs',
    '--dist', str(DIST),
    '--source-commit', head,
    '--published-at', '2026-09-15T21:40:00+09:00',
)
source_bytes = Path('browser/partner-advice-player-control-core.mjs').read_bytes()
public_bytes = (DIST / 'partner-advice-player-control-core.mjs').read_bytes()
if public_bytes != source_bytes:
    raise SystemExit('public player-control artifact is not byte-identical to source')
manifest = json.loads((DIST / 'manifest.json').read_text(encoding='utf-8'))
artifact = manifest.get('artifacts', {}).get('partner_advice_player_control_core')
if not artifact or artifact.get('source') != 'browser/partner-advice-player-control-core.mjs':
    raise SystemExit('public manifest is missing partner_advice_player_control_core provenance')
run('git', 'diff', '--check')

# Transient executor files must not survive at PR head.
SCRIPT.unlink(missing_ok=True)
WORKFLOW.unlink(missing_ok=True)
print('PARTNER_ADVICE_REPLY_PAIR_R2_REHEARSAL_PASS', flush=True)
