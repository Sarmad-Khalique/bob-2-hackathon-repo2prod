#!/usr/bin/env node
// test-gitignore-helper.cjs
//
// Lightweight deterministic tests for the ensureRepo2ProdGitIgnore helper.
// No test framework required — runs with plain `node scripts/test-gitignore-helper.cjs`.
//
// Exercises the cases defined in the task spec (Parts 6A–6D).
// Uses a temp directory created at runtime; always cleaned up on exit.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Load the compiled helper from the extension output.
// ensureRepo2ProdGitIgnore is a named export from out/core/gitignore.js.
// ---------------------------------------------------------------------------

const { ensureRepo2ProdGitIgnore } = require('../out/core/gitignore');

// ---------------------------------------------------------------------------
// Required Repo2Prod entries (must match the implementation exactly)
// ---------------------------------------------------------------------------

const REQUIRED = [
  '/.repo2prod/',
  '/.bob/skills/repo2prod/',
  '/.bob/skills/repo2prod-repair/',
  '/.bob/skills/repo2prod-ci/',
];

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function readGitignore(dir) {
  const p = path.join(dir, '.gitignore');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function linesOf(content) {
  return content.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Create a fresh temp dir for each test case.
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'r2p-gitignore-test-'));
}

// Clean up all temp dirs at end.
const tmpDirs = [];

// ---------------------------------------------------------------------------
// Case A — no .gitignore exists → created with all four rules
// ---------------------------------------------------------------------------

console.log('\nCase A — no .gitignore exists');
{
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  ensureRepo2ProdGitIgnore(dir);

  const content = readGitignore(dir);
  assert(content !== null, '.gitignore was created');
  const lines = linesOf(content);
  for (const entry of REQUIRED) {
    assert(lines.includes(entry), `contains ${entry}`);
  }
  assert(
    !lines.includes('/.bob/'),
    'does NOT contain blanket /.bob/ entry',
  );
}

// ---------------------------------------------------------------------------
// Case B — existing .gitignore → content preserved, Repo2Prod rules appended
// ---------------------------------------------------------------------------

console.log('\nCase B — existing .gitignore with unrelated content');
{
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  const existing = 'node_modules/\n*.log\ndist/\n';
  fs.writeFileSync(path.join(dir, '.gitignore'), existing, 'utf8');

  ensureRepo2ProdGitIgnore(dir);

  const content = readGitignore(dir);
  assert(content.startsWith(existing), 'existing content is preserved at the start');
  const lines = linesOf(content);
  for (const entry of REQUIRED) {
    assert(lines.includes(entry), `contains ${entry}`);
  }
  assert(lines.includes('node_modules/'), 'existing node_modules/ rule retained');
  assert(lines.includes('*.log'), 'existing *.log rule retained');
}

// ---------------------------------------------------------------------------
// Case C — run twice → no duplicate entries
// ---------------------------------------------------------------------------

console.log('\nCase C — idempotent (run twice)');
{
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  ensureRepo2ProdGitIgnore(dir);
  ensureRepo2ProdGitIgnore(dir); // second call

  const content = readGitignore(dir);
  const lines = linesOf(content);
  for (const entry of REQUIRED) {
    const count = lines.filter((l) => l === entry).length;
    assert(count === 1, `${entry} appears exactly once (count=${count})`);
  }
}

// ---------------------------------------------------------------------------
// Case D — project already has custom Bob content → /.bob/ is NOT ignored
// ---------------------------------------------------------------------------

console.log('\nCase D — custom .bob content is NOT globally ignored');
{
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  // Simulate a project with committed Bob config.
  fs.mkdirSync(path.join(dir, '.bob', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.bob', 'AGENTS.md'), '# Bob rules\n', 'utf8');

  ensureRepo2ProdGitIgnore(dir);

  const content = readGitignore(dir);
  const lines = linesOf(content);

  // The blanket /.bob/ must NOT appear — only the three skill sub-paths.
  assert(!lines.includes('/.bob/'), 'blanket /.bob/ is NOT in .gitignore');
  assert(lines.includes('/.bob/skills/repo2prod/'), 'skill-specific path present');
  assert(lines.includes('/.bob/skills/repo2prod-repair/'), 'skill-specific path present');
  assert(lines.includes('/.bob/skills/repo2prod-ci/'), 'skill-specific path present');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

for (const d of tmpDirs) {
  fs.rmSync(d, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);

if (failed > 0) {
  process.exit(1);
}
