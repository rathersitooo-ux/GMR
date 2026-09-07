import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

test('battle mana is named as the spendable ability resource', () => {
  assert.match(html, /使えるマナ/);
  assert.match(html, /明るい玉は使用可能、暗く斜線の玉は使用済み/);
});

test('hand ability cards expose effective mana cost and shortage without blocking card play', () => {
  assert.match(html, /function battleAbilityManaStatus\(me,c\)/);
  assert.match(html, /effectiveAbilityCost\(me,c\)/);
  assert.match(html, /能力マナ/);
  assert.match(html, /manaAbilityReady/);
  assert.match(html, /manaAbilityShort/);
  assert.match(html, /このまま出すと能力はマナ不足で発動しません/);
  assert.match(html, /b\.disabled=state\.match\.phase!==['"]plan['"]/);
});

test('non-ability legacy cost metadata is not presented as an active mana consumer', () => {
  assert.match(html, /c\.effect_type===['"]none['"]\)return null/);
});

test('mana clarity patch does not add a new refresh rule', () => {
  assert.doesNotMatch(html, /MANA_CLARITY_R1_AUTO_REFRESH/);
  assert.doesNotMatch(html, /manaRoleClarity[^<]{0,120}(?:round|turn)[^<]{0,120}(?:refresh|refill)/i);
});
