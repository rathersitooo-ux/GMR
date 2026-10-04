# GAMEROAD Operator

Local/self-hosted execution stack for GAMEROAD. It removes the ordinary work-loop dependency on the hosted Desktop Commander relay and TinyFish browser by composing maintained local MCP servers with existing ChatGPT Drive/GitHub/web capabilities.

## Local capabilities

- **PC/files/terminal/processes:** \`@wonderwhy-er/desktop-commander@latest\`
- **Full headed browser automation:** \`@playwright/mcp@latest --caps=network,storage,testing,vision,pdf,devtools\`
- **GAMEROAD execution discipline:** bundled \`gameroad-pc-workloop\` skill
- **Material-mutation quality preflight:** bundled \`tools/quality-decision-gate.mjs\`

Public web research, Google Drive authority, GitHub state/actions, and scheduled tasks keep using ChatGPT's existing native/connected capabilities rather than being rebuilt.

## Requirements

- Node.js 20+
- npm/npx
- ChatGPT Desktop/Codex surface that supports local plugin marketplaces
- Existing Google Drive/GitHub connections when those are needed by the GAMEROAD task

## Repo-local use

This repo exposes the plugin through:

\`\`\`
.agents/plugins/marketplace.json
plugins/gameroad-operator/
\`\`\`

Restart ChatGPT Desktop, open Plugins Directory, choose **GAMEROAD Local Tools**, and install/enable **GAMEROAD Operator**.

## Personal installation on Windows

From a checked-out GMR repo:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\plugins\gameroad-operator\install.ps1
\`\`\`

After this change is on main, a checkout-free bootstrap is available by downloading/running \`plugins/gameroad-operator/install-from-github.ps1\`.

The installer copies the plugin to \`~/.codex/plugins/gameroad-operator\` and adds/updates the personal marketplace at \`~/.agents/plugins/marketplace.json\`.

Run diagnostics:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\plugins\gameroad-operator\doctor.ps1
\`\`\`

## Quality decision preflight

The operator's work-loop requires a deterministic local preflight before material PC/browser/code/asset mutation.

The preflight does not replace CURRENT, leases, PRE_ACTION, Required Gate, Human/formal acceptance, or player-facing evidence. It is an additional local fail-closed boundary that makes omission explicit before local mutation.

It checks, when applicable:

- external research is causally bound to an actual artifact/decision change rather than merely cited;
- existing/native/official/OSS/asset/composition candidates are evaluated before residual custom BUILD;
- BUILD is rejected while a decision-changing candidate frontier is still open;
- externally reused assets carry source SHA-256, rights/license basis and transformation provenance;
- Human/formal or existing GAMEROAD assets cannot be deleted/replaced without authority and recoverability;
- visual work has current GAMEROAD actual, comparable external real-game actual, comparison dimensions, and actual consumer/use-site evidence before visual completion is claimed.

For deterministic same-semantics work where a gate is not material, the packet must explicitly say why it is not required. Silent omission is rejected.

Run:

\`\`\`powershell
node .\tools\gameroad-operator-package.mjs --quality-input <decision-packet.json>
\`\`\`

A FAIL result means WRITE0 for the proposed material mutation until the missing evidence or packet is repaired.

## Authentication

Playwright uses a local headed browser and persistent profile. Sign into a website inside that browser when the workflow requires authentication. Do not store passwords, tokens, cookies, or API keys in this repository.

## Verification

Repository package structure and quality-gate negative tests:

\`\`\`powershell
node --test .\tests\gameroad-operator-package.test.mjs
\`\`\`

Target-PC runtime acceptance still requires:

1. plugin loads in ChatGPT Desktop;
2. Desktop MCP reads a harmless file and runs a harmless command;
3. Playwright opens a page, performs an interaction, and reads back resulting state;
4. browser auth/profile persistence survives an MCP restart;
5. one GAMEROAD turn fresh-reads CURRENT, passes the local quality preflight when material, and completes a safe PC/browser operation with evidence.

Until those five pass on the actual PC, do not claim the local operator runtime is fully accepted.

## Boundaries

This stack does not bypass ChatGPT plan limits, OS permissions, website authentication, account policy, copyright/license boundaries, or external authorization. It replaces avoidable hosted execution dependencies; it does not falsify capabilities the platform or operating system does not grant.
