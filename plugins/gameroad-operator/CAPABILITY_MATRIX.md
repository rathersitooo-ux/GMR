# Capability matrix

This maps functional outcomes, not proprietary API compatibility.

| Capability | Replacement | Metered browser dependency |
|---|---|---:|
| Local file read/write/move | Desktop Commander MCP | None |
| Recursive file/content search | Desktop Commander MCP | None |
| Terminal commands | Desktop Commander MCP | None |
| Long-running processes/sessions | Desktop Commander MCP | None |
| Process inspection/termination | Desktop Commander MCP | None |
| Local Python/Node/R execution where installed | Desktop Commander MCP | None |
| Excel/PDF/DOCX operations | Desktop Commander MCP | None |
| File metadata/directory operations | Desktop Commander MCP | None |
| Browser navigate/snapshot/click/type/forms | Playwright MCP | None |
| Browser screenshots | Playwright MCP | None |
| Cookies/localStorage/sessionStorage | Playwright MCP storage capability | None |
| Persistent authenticated browser profile | Playwright MCP | None |
| Save/restore browser auth state | Playwright MCP storage capability | None |
| Network/offline/mock controls | Playwright MCP network capability | None |
| Browser assertions/testing | Playwright MCP testing capability | None |
| Browser vision/PDF/devtools/tracing | Playwright MCP capability bundle | None |
| Public web research | ChatGPT native web | No TinyFish wallet |
| Authenticated web workflows | Local Playwright browser | None |
| Recurring reasoning/monitoring | ChatGPT scheduled tasks | No TinyFish wallet |
| Deterministic local recurring scripts | OS scheduler invoked through local PC tooling | None |
| Drive CURRENT work loop | Drive/GitHub connectors + GAMEROAD skill + local MCPs | None beyond existing account/tool access |

## Deliberate non-clones

- TinyFish wallet/billing APIs are not reproduced because local browser operation does not need them.
- Hosted Desktop Commander account/device relay is not reproduced for local operation; the local open-source MCP runs directly on the PC.
- Native ChatGPT search, Google Drive, GitHub, and scheduled-task capabilities are reused rather than duplicated.
- Product plan limits, OS permissions, website authentication, and external authorization boundaries are not bypassed.

## Runtime acceptance

Do not claim runtime completion until the target PC proves all of these:

1. GAMEROAD Operator loads from the local marketplace.
2. Desktop MCP reads a harmless local file and runs a harmless command with readback.
3. Browser MCP opens a page, performs an interaction, and reads back resulting state.
4. Browser authentication/profile persistence survives one MCP restart.
5. A GAMEROAD turn fresh-reads CURRENT, resolves a non-conflicting slice, performs one safe PC/browser operation, and records/verifies evidence.
