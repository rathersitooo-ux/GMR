# GAMEROAD Operator

Local/self-hosted execution stack for GAMEROAD. It removes the ordinary work-loop dependency on the hosted Desktop Commander relay and TinyFish browser by composing maintained local MCP servers with existing ChatGPT Drive/GitHub/web capabilities.

## Local capabilities

- **PC/files/terminal/processes:** `@wonderwhy-er/desktop-commander@latest`
- **Full headed browser automation:** `@playwright/mcp@latest --caps=network,storage,testing,vision,pdf,devtools`
- **GAMEROAD execution discipline:** bundled `gameroad-pc-workloop` skill

Public web research, Google Drive authority, GitHub state/actions, and scheduled tasks keep using ChatGPT's existing native/connected capabilities rather than being rebuilt.

## Requirements

- Node.js 20+
- npm/npx
- ChatGPT Desktop/Codex surface that supports local plugin marketplaces
- Existing Google Drive/GitHub connections when those are needed by the GAMEROAD task

## Repo-local use

This repo exposes the plugin through:

```
.agents/plugins/marketplace.json
plugins/gameroad-operator/
```

Restart ChatGPT Desktop, open Plugins Directory, choose **GAMEROAD Local Tools**, and install/enable **GAMEROAD Operator**.

## Personal installation on Windows

From a checked-out GMR repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\plugins\gameroad-operator\install.ps1
```

After this change is on main, a checkout-free bootstrap is available by downloading/running `plugins/gameroad-operator/install-from-github.ps1`.

The installer copies the plugin to `~/.codex/plugins/gameroad-operator` and adds/updates the personal marketplace at `~/.agents/plugins/marketplace.json`.

Run diagnostics:

```powershell
powershell -ExecutionPolicy Bypass -File .\plugins\gameroad-operator\doctor.ps1
```

## Authentication

Playwright uses a local headed browser and persistent profile. Sign into a website inside that browser when the workflow requires authentication. Do not store passwords, tokens, cookies, or API keys in this repository.

## Verification

Repository package structure:

```powershell
node --test .\tests\gameroad-operator-package.test.mjs
```

Target-PC runtime acceptance still requires:

1. plugin loads in ChatGPT Desktop;
2. Desktop MCP reads a harmless file and runs a harmless command;
3. Playwright opens a page, performs an interaction, and reads back resulting state;
4. browser auth/profile persistence survives an MCP restart;
5. one GAMEROAD turn fresh-reads CURRENT and completes a safe PC/browser operation with evidence.

Until those five pass on the actual PC, do not claim the local operator runtime is fully accepted.

## Boundaries

This stack does not bypass ChatGPT plan limits, OS permissions, website authentication, account policy, or external authorization. It replaces avoidable hosted execution dependencies; it does not falsify capabilities the platform or operating system does not grant.
