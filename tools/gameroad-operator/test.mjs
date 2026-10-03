import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.join(here, "plugins", "gameroad-operator");
const manifest = JSON.parse(fs.readFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
const mcp = JSON.parse(fs.readFileSync(path.join(plugin, ".mcp.json"), "utf8"));
const market = JSON.parse(fs.readFileSync(path.join(here, ".agents", "plugins", "marketplace.json"), "utf8"));
const skill = fs.readFileSync(path.join(plugin, "skills", "gameroad-pc-workloop", "SKILL.md"), "utf8");

assert.equal(manifest.name, "gameroad-operator");
assert.equal(manifest.mcpServers, "./.mcp.json");
assert.equal(manifest.skills, "./skills/");
assert.equal(mcp.mcp_servers["gameroad-desktop"].command, "npx");
assert.ok(mcp.mcp_servers["gameroad-desktop"].args.includes("@wonderwhy-er/desktop-commander@latest"));
assert.equal(mcp.mcp_servers["gameroad-browser"].command, "npx");
assert.ok(mcp.mcp_servers["gameroad-browser"].args.includes("@playwright/mcp@latest"));
assert.equal(market.plugins[0].source.path, "./plugins/gameroad-operator");
assert.match(skill, /GAMEROAD_Drive総合目次・記録ルーティング_CURRENT/);
assert.match(skill, /owner\/lease/i);
assert.match(skill, /current actual/i);
assert.match(skill, /Browser evidence/);

console.log("GAMEROAD Operator static package tests: PASS");
