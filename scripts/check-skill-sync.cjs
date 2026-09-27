#!/usr/bin/env node
// check-skill-sync.cjs
// Compares each inline `content` string in src/core/bobSkills.ts (after
// unescaping \` and \${ as used in TypeScript template literals) with the
// corresponding template file under templates/bob-skills/*/SKILL.md.
// Prints "IN SYNC" or "DIFFERENT" per skill and exits 1 if any differ.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SKILLS = [
  { name: 'repo2prod',        template: 'templates/bob-skills/repo2prod/SKILL.md' },
  { name: 'repo2prod-repair', template: 'templates/bob-skills/repo2prod-repair/SKILL.md' },
  { name: 'repo2prod-ci',     template: 'templates/bob-skills/repo2prod-ci/SKILL.md' },
];

// Extract the content string for a named skill from bobSkills.ts.
// The pattern matches the opening backtick after `content: ` up to the
// closing backtick+comma that ends the object literal.
function extractInlineContent(source, skillName) {
  // Match:  name: 'repo2prod',\n  content: `...`,
  const namePattern = `name: '${skillName}'`;
  const nameIdx = source.indexOf(namePattern);
  if (nameIdx === -1) throw new Error(`Skill '${skillName}' not found in bobSkills.ts`);

  const contentLabel = 'content: `';
  const contentStart = source.indexOf(contentLabel, nameIdx);
  if (contentStart === -1) throw new Error(`content block not found for '${skillName}'`);

  const innerStart = contentStart + contentLabel.length;
  // Find the closing backtick that is not escaped (\`)
  let i = innerStart;
  while (i < source.length) {
    if (source[i] === '\\' && (source[i + 1] === '`' || source[i + 1] === '$')) {
      i += 2; // skip escape sequence
    } else if (source[i] === '`') {
      break;
    } else {
      i++;
    }
  }
  const raw = source.slice(innerStart, i);
  // Unescape \` → ` and \${ → ${
  return raw.replace(/\\`/g, '`').replace(/\\\${/g, '${');
}

const bobSkillsSrc = fs.readFileSync(path.join(ROOT, 'src/core/bobSkills.ts'), 'utf8');

let anyDiff = false;

for (const skill of SKILLS) {
  const templatePath = path.join(ROOT, skill.template);
  const templateContent = fs.readFileSync(templatePath, 'utf8');
  const inlineContent = extractInlineContent(bobSkillsSrc, skill.name);

  if (inlineContent === templateContent) {
    console.log(`  ${skill.name}: IN SYNC`);
  } else {
    console.log(`  ${skill.name}: DIFFERENT`);
    anyDiff = true;
  }
}

if (anyDiff) {
  console.error('\nOne or more skills are out of sync. Update both the template and the inline string.');
  process.exit(1);
} else {
  console.log('\nAll skills in sync.');
}
