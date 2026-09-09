from pathlib import Path

path = Path('.github/workflows/cloudflare-public-deploy.yml')
text = path.read_text(encoding='utf-8')
marker = '# GAMEROAD_PR_PREVIEW_R2'
if marker in text:
    raise SystemExit('preview patch already present')

trigger_old = """  workflow_dispatch:\n\npermissions:\n"""
trigger_new = """  workflow_dispatch:\n  pull_request:\n    types: [opened, synchronize, reopened]\n    paths:\n      - .github/workflows/cloudflare-public-deploy.yml\n      - browser/**\n      - deploy/cloudflare/**\n      - assets/**\n      - tools/**\n\npermissions:\n"""
if text.count(trigger_old) != 1:
    raise SystemExit('workflow_dispatch anchor mismatch')
text = text.replace(trigger_old, trigger_new, 1)

concurrency_old = """concurrency:\n  group: gameroad-cloudflare-public-deploy\n  cancel-in-progress: true\n"""
concurrency_new = """concurrency:\n  group: gameroad-cloudflare-public-deploy-${{ github.event.pull_request.number || 'production' }}\n  cancel-in-progress: true\n"""
if text.count(concurrency_old) != 1:
    raise SystemExit('concurrency anchor mismatch')
text = text.replace(concurrency_old, concurrency_new, 1)

deploy_old = """  deploy:\n    name: Deploy public GAMEROAD package\n"""
deploy_new = """  deploy:\n    if: github.event_name != 'pull_request'\n    name: Deploy public GAMEROAD package\n"""
if text.count(deploy_old) != 1:
    raise SystemExit('deploy job anchor mismatch')
text = text.replace(deploy_old, deploy_new, 1)

preview_job = r'''

  # GAMEROAD_PR_PREVIEW_R2
  preview:
    name: Deploy PR preview GAMEROAD package
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      PAGES_PROJECT: gameroad-browser-r5
      SOURCE_SHA: ${{ github.event.pull_request.head.sha }}
      PREVIEW_BRANCH: pr-${{ github.event.pull_request.number }}
    steps:
      - name: Checkout exact PR head
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Require Cloudflare preview credentials
        shell: bash
        run: |
          set -euo pipefail
          if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
            echo "::error::Missing repository secret CLOUDFLARE_API_TOKEN"
            exit 1
          fi
          if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
            echo "::error::Missing repository secret CLOUDFLARE_ACCOUNT_ID"
            exit 1
          fi

      - name: Run preview package checks
        shell: bash
        run: |
          set -euo pipefail
          node --test \
            deploy/cloudflare/tests/build.test.mjs \
            deploy/cloudflare/tests/version-manifest.test.mjs

      - name: Build exact PR preview package
        shell: bash
        run: |
          set -euo pipefail
          BROWSER_BLOB="$(git hash-object browser/GAMEROAD.html)"
          PUBLISHED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
          node deploy/cloudflare/scripts/build.mjs \
            --expected-blob "$BROWSER_BLOB" \
            --source-commit "$SOURCE_SHA" \
            --published-at "$PUBLISHED_AT"
          SOURCE_SHA="$SOURCE_SHA" PUBLISHED_AT="$PUBLISHED_AT" node <<'NODE'
          const fs = require('node:fs');
          const sourcePath = 'deploy/cloudflare/release-comms-source.json';
          const outputPath = 'deploy/cloudflare/dist/gameroad-release-comms.json';
          const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

          if (source.schema !== 'gameroad.release-comms.source.v1') {
            throw new Error(`Unexpected release comms source schema: ${source.schema}`);
          }
          if (source.channel !== 'public') {
            throw new Error(`Unexpected release comms channel: ${source.channel}`);
          }

          const hiddenStates = {
            calendar: 'UNPUBLISHED',
            roadmap: 'UNPUBLISHED',
            release_notes: 'UNPUBLISHED',
            known_issues: 'NOT_ASSERTED',
            service_status: 'NOT_ASSERTED',
          };
          function validateReleaseCommsSection(key, section, hiddenState) {
            if (!section || !Array.isArray(section.items)) {
              throw new Error(`Release comms ${key} must have an items array`);
            }
            if (section.state === hiddenState) {
              if (section.items.length !== 0) {
                throw new Error(`Release comms ${key} ${hiddenState} state must have an empty items array`);
              }
              return;
            }
            if (section.state !== 'PUBLISHED') {
              throw new Error(`Release comms ${key} state is unsupported: ${section.state}`);
            }
            if (section.items.length < 1 || section.items.length > 20) {
              throw new Error(`Release comms ${key} PUBLISHED state must contain 1..20 items`);
            }
            const seenIds = new Set();
            for (const [index, item] of section.items.entries()) {
              if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`Release comms ${key} item ${index} must be an object`);
              }
              const keys = Object.keys(item).sort();
              if (JSON.stringify(keys) !== JSON.stringify(['changes', 'id', 'title'])) {
                throw new Error(`Release comms ${key} item ${index} has unsupported fields`);
              }
              if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id) || seenIds.has(item.id)) {
                throw new Error(`Release comms ${key} item ${index} has an invalid or duplicate id`);
              }
              seenIds.add(item.id);
              if (typeof item.title !== 'string' || item.title.length < 1 || item.title.length > 120 || item.title.trim() !== item.title) {
                throw new Error(`Release comms ${key} item ${index} has an invalid title`);
              }
              if (!Array.isArray(item.changes) || item.changes.length < 1 || item.changes.length > 20) {
                throw new Error(`Release comms ${key} item ${index} must contain 1..20 changes`);
              }
              for (const [changeIndex, change] of item.changes.entries()) {
                if (typeof change !== 'string' || change.length < 1 || change.length > 300 || change.trim() !== change) {
                  throw new Error(`Release comms ${key} item ${index} change ${changeIndex} is invalid`);
                }
              }
            }
          }
          for (const [key, hiddenState] of Object.entries(hiddenStates)) {
            validateReleaseCommsSection(key, source[key], hiddenState);
          }

          const manifest = {
            schema: 'gameroad.release-comms.v1',
            channel: source.channel,
            build_id: process.env.SOURCE_SHA,
            published_at: process.env.PUBLISHED_AT,
            calendar: source.calendar,
            roadmap: source.roadmap,
            release_notes: source.release_notes,
            known_issues: source.known_issues,
            service_status: source.service_status,
          };
          fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          const headersPath = 'deploy/cloudflare/dist/_headers';
          const headers = fs.readFileSync(headersPath, 'utf8');
          const stanza = '/gameroad-release-comms.json\n  Cache-Control: no-store\n\n';
          if (!headers.includes('/gameroad-release-comms.json')) {
            const marker = '\n/*\n';
            if (!headers.includes(marker)) {
              throw new Error('dist/_headers generic marker is missing');
            }
            fs.writeFileSync(headersPath, headers.replace(marker, `\n${stanza}/*\n`), 'utf8');
          }
          NODE

      - name: Deploy Pages PR preview
        id: preview_pages
        shell: bash
        working-directory: deploy/cloudflare
        run: |
          set -euo pipefail
          cp wrangler.pages.toml wrangler.toml
          trap 'rm -f wrangler.toml' EXIT
          set +e
          OUTPUT="$(npx --yes wrangler@4 pages deploy dist \
            --project-name "$PAGES_PROJECT" \
            --branch "$PREVIEW_BRANCH" \
            --commit-hash "$SOURCE_SHA" 2>&1)"
          STATUS=$?
          set -e
          printf '%s\n' "$OUTPUT"
          if [[ "$STATUS" -ne 0 ]]; then
            exit "$STATUS"
          fi
          URL="$(printf '%s\n' "$OUTPUT" | grep -Eo 'https://[^[:space:]]+\.pages\.dev' | tail -n 1 || true)"
          if [[ -z "$URL" ]]; then
            echo "::error::Preview deployment did not expose a pages.dev URL"
            exit 1
          fi
          ALIAS_URL="https://${PREVIEW_BRANCH}.${PAGES_PROJECT}.pages.dev"
          echo "url=$URL" >> "$GITHUB_OUTPUT"
          echo "alias_url=$ALIAS_URL" >> "$GITHUB_OUTPUT"

      - name: Read back PR preview deployment
        shell: bash
        run: |
          set -euo pipefail
          npx --yes wrangler@4 pages deployment list \
            --project-name "$PAGES_PROJECT" \
            --environment preview \
            --json

      - name: Probe exact PR preview bytes and build identity
        shell: bash
        env:
          PREVIEW_URL: ${{ steps.preview_pages.outputs.url }}
          PREVIEW_ALIAS_URL: ${{ steps.preview_pages.outputs.alias_url }}
        run: |
          set -euo pipefail

          verify_preview() {
            local base_url="$1"
            local label="$2"
            local root_body="$RUNNER_TEMP/gameroad-preview-${label}.html"
            local manifest_body="$RUNNER_TEMP/gameroad-preview-${label}-version.json"

            for attempt in 1 2 3 4 5 6 7 8 9 10; do
              rm -f "$root_body" "$manifest_body"
              root_code="$(curl --silent --show-error --location \
                --header 'Accept-Encoding: identity' \
                --header 'Cache-Control: no-cache' \
                --connect-timeout 10 --max-time 30 \
                --output "$root_body" \
                --write-out '%{http_code}' \
                "${base_url}/" || true)"
              manifest_code="$(curl --silent --show-error --location \
                --header 'Accept-Encoding: identity' \
                --header 'Cache-Control: no-cache' \
                --connect-timeout 10 --max-time 30 \
                --output "$manifest_body" \
                --write-out '%{http_code}' \
                "${base_url}/gameroad-version.json" || true)"
              build_id=""
              if [[ -s "$manifest_body" ]]; then
                build_id="$(node -e 'const fs=require("node:fs"); try { const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(m.build_id || ""); } catch {}' "$manifest_body")"
              fi
              if [[ "$root_code" == "200" ]] \
                && [[ "$manifest_code" == "200" ]] \
                && cmp --silent deploy/cloudflare/dist/index.html "$root_body" \
                && cmp --silent deploy/cloudflare/dist/gameroad-version.json "$manifest_body" \
                && [[ "$build_id" == "$SOURCE_SHA" ]]; then
                echo "PR preview ${label} exact-byte/build verification succeeded for ${SOURCE_SHA}."
                return 0
              fi
              echo "preview mismatch: label=${label} attempt=${attempt} root_http=${root_code:-none} manifest_http=${manifest_code:-none} build_id=${build_id:-none} expected=${SOURCE_SHA}"
              if [[ "$attempt" -lt 10 ]]; then
                sleep 5
              fi
            done
            return 1
          }

          verify_preview "$PREVIEW_URL" atomic
          verify_preview "$PREVIEW_ALIAS_URL" alias

      - name: Publish or refresh PR preview link
        uses: actions/github-script@v7
        env:
          PREVIEW_URL: ${{ steps.preview_pages.outputs.url }}
          PREVIEW_ALIAS_URL: ${{ steps.preview_pages.outputs.alias_url }}
          SOURCE_SHA: ${{ github.event.pull_request.head.sha }}
        with:
          script: |
            const marker = '<!-- gameroad-cloudflare-pr-preview -->';
            const body = [
              marker,
              '### GAMEROAD PRプレビュー',
              '',
              `- 共有URL: ${process.env.PREVIEW_ALIAS_URL}`,
              `- このcommit固有URL: ${process.env.PREVIEW_URL}`,
              `- source SHA: \`${process.env.SOURCE_SHA}\``,
              '',
              'Codex・ChatGPT・スマホで同じPRの盤面を確認するためのpreviewです。main本番URLは変更していません。',
            ].join('\n');
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              per_page: 100,
            });
            const existing = comments.find((comment) => comment.body?.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }
'''

if not text.endswith('\n'):
    text += '\n'
text += preview_job.lstrip('\n')
path.write_text(text, encoding='utf-8')
