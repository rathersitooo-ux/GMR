import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`JSON parse failed: ${file}: ${error.message}`);
    return null;
  }
}

function requireFile(file, errors) {
  if (!fs.existsSync(file)) errors.push(`Missing: ${file}`);
}

export function validateGameroadOperatorPackage(repoRoot = process.cwd()) {
  const errors = [];
  const pluginRoot = path.join(repoRoot, 'plugins', 'gameroad-operator');
  const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const mcpPath = path.join(pluginRoot, '.mcp.json');
  const skillPath = path.join(pluginRoot, 'skills', 'gameroad-pc-workloop', 'SKILL.md');
  const marketPath = path.join(repoRoot, '.agents', 'plugins', 'marketplace.json');

  for (const file of [
    manifestPath, mcpPath, skillPath, marketPath,
    path.join(pluginRoot, 'README.md'),
    path.join(pluginRoot, 'THIRD_PARTY.md'),
    path.join(pluginRoot, 'CAPABILITY_MATRIX.md'),
    path.join(pluginRoot, 'install.ps1'),
    path.join(pluginRoot, 'install-from-github.ps1'),
    path.join(pluginRoot, 'doctor.ps1'),
    path.join(pluginRoot, 'uninstall.ps1'),
  ]) requireFile(file, errors);

  if (errors.length) return { ok: false, errors };

  const manifest = parseJson(manifestPath, errors);
  const mcp = parseJson(mcpPath, errors);
  const market = parseJson(marketPath, errors);
  const skill = fs.readFileSync(skillPath, 'utf8');

  if (manifest) {
    if (manifest.name !== 'gameroad-operator') errors.push('manifest name mismatch');
    if (manifest.mcpServers !== './.mcp.json') errors.push('manifest mcpServers mismatch');
    if (manifest.skills !== './skills/') errors.push('manifest skills mismatch');
    if (!manifest.interface?.capabilities?.includes('Read') || !manifest.interface?.capabilities?.includes('Write')) {
      errors.push('manifest must declare Read and Write capabilities');
    }
  }

  if (mcp) {
    const desktop = mcp.mcp_servers?.['gameroad-desktop'];
    const browser = mcp.mcp_servers?.['gameroad-browser'];
    if (desktop?.command !== 'npx' || !desktop?.args?.includes('@wonderwhy-er/desktop-commander@latest')) {
      errors.push('Desktop Commander MCP wiring mismatch');
    }
    if (browser?.command !== 'npx' || !browser?.args?.includes('@playwright/mcp@latest')) {
      errors.push('Playwright MCP wiring mismatch');
    }
    if (!browser?.args?.includes('--caps=network,storage,testing,vision,pdf,devtools')) {
      errors.push('Playwright full capability bundle missing');
    }
  }

  if (market) {
    const entry = market.plugins?.find((item) => item.name === 'gameroad-operator');
    if (entry?.source?.path !== './plugins/gameroad-operator') errors.push('repo marketplace source path mismatch');
    if (entry?.policy?.installation !== 'AVAILABLE') errors.push('repo marketplace installation policy mismatch');
  }

  if (!/GAMEROAD_Drive総合目次・記録ルーティング_CURRENT/.test(skill)) errors.push('skill missing fresh CURRENT route');
  if (!/owner\/lease/i.test(skill)) errors.push('skill missing owner/lease gate');
  if (!/current actual/i.test(skill)) errors.push('skill missing current actual gate');
  if (!/Browser evidence/.test(skill)) errors.push('skill missing browser evidence section');

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateGameroadOperatorPackage(process.cwd());
  if (!result.ok) {
    console.error('GAMEROAD Operator package validation: FAIL');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('GAMEROAD Operator package validation: PASS');
}
