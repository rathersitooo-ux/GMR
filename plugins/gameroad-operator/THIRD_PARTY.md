# Third-party components

GAMEROAD Operator composes maintained upstream tools instead of copying proprietary hosted implementations.

## Desktop Commander MCP

- Project: https://github.com/wonderwhy-er/DesktopCommanderMCP
- Package: `@wonderwhy-er/desktop-commander`
- License: MIT
- Role: local filesystem, terminal, process/session control, search/edit, document/data operations, and local diagnostics.
- Invocation: `npx -y @wonderwhy-er/desktop-commander@latest`

## Microsoft Playwright MCP

- Project: https://github.com/microsoft/playwright-mcp
- Package: `@playwright/mcp`
- Role: headed browser automation via accessibility snapshots plus storage, network, testing, vision, PDF, trace/devtools capabilities.
- Invocation: `npx -y @playwright/mcp@latest --caps=network,storage,testing,vision,pdf,devtools`
- Runtime prerequisite: Node.js 20 or newer.
- Browser binaries are obtained according to upstream Playwright MCP behavior on first use.

## OpenAI local plugin packaging

- Documentation: https://developers.openai.com/plugins/build/plugins
- Role: package bundled local MCP servers and the GAMEROAD work-loop skill for supported local ChatGPT/Codex surfaces.

No upstream source code is vendored here. Upstream licenses, versions, security guidance, and authentication boundaries remain authoritative.
