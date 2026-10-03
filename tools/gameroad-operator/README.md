# GAMEROAD Operator

Self-hosted/local execution stack for GAMEROAD. It replaces dependency on the hosted Desktop Commander relay and TinyFish browser for the core PC/browser work loop by composing maintained MCP servers.

## What it provides

### Local PC execution
Bundled `@wonderwhy-er/desktop-commander@latest` provides filesystem, search/edit, terminal, long-running process/session control, file metadata, Excel/PDF/DOCX and related local operations.

### Real browser execution
Bundled `@playwright/mcp@latest` provides a headed browser, accessibility snapshots, navigation, clicks, keyboard/form input, screenshots and persistent browser state. Playwright downloads its browser automatically on first use.

### GAMEROAD work-loop binding
The bundled skill requires fresh CURRENT routing, current owner/lease checks, exact mutable resources, current actual, consumer acceptance, real readback, and correct checkpoint/release handling.

## Why this is not a proprietary clone

The package does not copy Desktop Commander Remote or TinyFish code. It composes maintained open tooling and native ChatGPT capabilities:
- local PC: Desktop Commander MCP;
- browser interaction: Microsoft Playwright MCP;
- public web research: ChatGPT native web search;
- recurring checks: ChatGPT scheduled tasks;
- Drive authority: existing Google Drive connector;
- GitHub actual/mutation: existing GitHub connector.

This avoids rebuilding capabilities that already exist and removes metered browser dependency from ordinary PC/browser execution.

## Requirements

- Windows/macOS/Linux supported by the upstream MCP servers.
- Node.js 20+.
- ChatGPT Desktop or Codex surface that can load a local plugin marketplace.
- Existing Google Drive/GitHub connections for the full GAMEROAD work loop.

## Windows installation

From a checked-out GMR repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\gameroad-operator\install.ps1
```

Then restart ChatGPT Desktop, open the Plugins Directory, select **Personal Local Tools**, and install/enable **GAMEROAD Operator**.

Run diagnostics:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\gameroad-operator\doctor.ps1
```

## Repo-local marketplace

The package also contains:

```
tools/gameroad-operator/.agents/plugins/marketplace.json
```

It can be registered as a local marketplace root with current Codex/plugin tooling if preferred.

## Authentication

Playwright uses its own local browser profile. For a site that requires login, sign in once in the headed Playwright browser; subsequent sessions can reuse browser state according to the upstream profile configuration.

Do not store passwords, tokens, cookies or API keys in this repository.

## Remote mode

The same underlying MCP servers can later be bridged through an authenticated MCP transport or OpenAI Secure MCP Tunnel where the target OpenAI product and account support full MCP actions. Remote mode is intentionally not required for local/Desktop operation.

## Acceptance status

Static package validity can be tested with:

```powershell
node .\tools\gameroad-operator\test.mjs
```

Runtime acceptance requires a real PC with Node 20+, ChatGPT Desktop plugin installation, one Desktop Commander file/terminal operation, and one Playwright browser navigation/interaction/readback. Until those pass on the target PC, do not claim the runtime stack is fully accepted.
