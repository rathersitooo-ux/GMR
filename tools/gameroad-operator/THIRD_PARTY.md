# Third-party components

GAMEROAD Operator composes maintained upstream tools instead of copying their implementations.

## Desktop Commander MCP

- Project: https://github.com/wonderwhy-er/DesktopCommanderMCP
- Package: `@wonderwhy-er/desktop-commander`
- License: MIT
- Role: local filesystem, terminal, process/session control, search/edit, document/data operations, and audit-oriented PC tooling.
- Invocation: `npx -y @wonderwhy-er/desktop-commander@latest`

## Microsoft Playwright MCP

- Project: https://github.com/microsoft/playwright-mcp
- Package: `@playwright/mcp`
- Role: headed browser automation via accessibility snapshots, navigation, clicks, keyboard/form input, screenshots, and persistent browser state.
- Invocation: `npx -y @playwright/mcp@latest`
- Runtime prerequisite: Node.js 20 or newer.
- Browser binaries are downloaded automatically on first use according to the upstream installation documentation.

## OpenAI local plugin packaging

- Documentation: https://developers.openai.com/plugins/build/plugins
- Role: packages the two local MCP servers and the GAMEROAD work-loop skill for ChatGPT Desktop / Codex local plugin surfaces.

No upstream source code is vendored into this directory. Upstream licenses and security guidance remain authoritative for those packages.
