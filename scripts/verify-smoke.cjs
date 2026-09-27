#!/usr/bin/env node
// Dev-only smoke test for src/execution/verifier.ts.
// Requires: pnpm compile first. Run: node scripts/verify-smoke.cjs <workspaceDir> [--abort-at STARTING]
// Must never print .env values or env-variable contents.

'use strict';

const path = require('node:path');
const fs = require('node:fs');

// ─── Load compiled output ─────────────────────────────────────────────────────

const outDir = path.resolve(__dirname, '..', 'out');
const { runProcess } = require(path.join(outDir, 'execution', 'processRunner.js'));
const { runLocalAnalysis } = require(path.join(outDir, 'analyzers', 'runAnalysis.js'));
const {
  buildVerifyOptions,
  runVerification,
} = require(path.join(outDir, 'execution', 'verifier.js'));

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const workspaceDir = args.find(a => !a.startsWith('--'));
if (!workspaceDir) {
  console.error('Usage: node scripts/verify-smoke.cjs <workspaceDir> [--abort-at STARTING]');
  process.exit(1);
}
const abortAtIdx = args.indexOf('--abort-at');
const abortAtPhase = abortAtIdx >= 0 ? args[abortAtIdx + 1] : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  PASS: '\x1b[32m', FAIL: '\x1b[31m', WARN: '\x1b[33m',
  NOT_RUN: '\x1b[90m', UNKNOWN: '\x1b[35m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function colorStatus(s) {
  return `${STATUS_COLORS[s] ?? ''}${s}${RESET}`;
}

function printCheck(c) {
  const obs = c.observed ? 'observed' : '        ';
  const detail = c.detail ? `  — ${c.detail}` : '';
  console.log(`  ${colorStatus(c.status).padEnd(14)}  ${obs}  ${c.id}${detail}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const root = path.resolve(workspaceDir);
  console.log(`\n${BOLD}verify-smoke${RESET}  workspace: ${root}`);
  if (abortAtPhase) console.log(`  will abort at phase: ${abortAtPhase}`);

  // Step 1: run the local analyzer to produce .repo2prod/runtime-manifest.json.
  // This writes to .repo2prod/ inside the workspace directory — that is expected.
  let manifest;
  try {
    console.log('\n── analyzing workspace…');
    const result = await runLocalAnalysis(root);
    manifest = result.manifest;
    console.log(`  stack: ${manifest.stack.framework ?? '(unknown)'}`);
    console.log(`  services: ${manifest.services.map(s => s.id).join(', ') || '(none)'}`);
  } catch (err) {
    console.error('\nAnalysis failed:', err.message);
    process.exit(1);
  }

  // Step 2: build verify options.
  let options;
  try {
    options = await buildVerifyOptions(root, manifest);
    console.log('\n── verify options');
    console.log(`  projectName:     ${options.projectName}`);
    console.log(`  appService:      ${options.appService}`);
    console.log(`  appContainerPort:${options.appContainerPort ?? ' (none)'}`);
    console.log(`  infraServices:   ${options.infraServices.map(s => `${s.id}(${s.name})`).join(', ') || '(none)'}`);
    console.log(`  testCommand:     ${options.testCommand ? options.testCommand.join(' ') : '(none)'}`);
    console.log(`  healthTargets:   ${options.healthTargets.map(t => `${t.path}[${t.source}]`).join(', ')}`);
  } catch (err) {
    console.error('\nbuildVerifyOptions failed:', err.message);
    process.exit(1);
  }

  // Step 3: run verification, optionally aborting at a specific phase.
  const ac = abortAtPhase ? new AbortController() : null;
  const phases = [];

  function onPhase(phase) {
    phases.push(phase);
    console.log(`\n── phase: ${BOLD}${phase}${RESET}`);
    // Trigger abort after the named phase starts (simulates user cancel).
    if (ac && phase === abortAtPhase) {
      setTimeout(() => ac.abort(), 200);
    }
  }

  let outcome;
  try {
    outcome = await runVerification(options, runProcess, onPhase, ac?.signal);
  } catch (err) {
    console.error('\nrunVerification threw:', err.message);
    process.exit(1);
  }

  // Step 4: print results.
  console.log('\n── checks');
  for (const c of outcome.result.checks) {
    printCheck(c);
  }

  console.log(`\n── summary`);
  console.log(`  phases seen:   ${phases.join(' → ')}`);
  console.log(`  cancelled:     ${outcome.cancelled}`);
  console.log(`  failedPhase:   ${outcome.failedPhase ?? '(none)'}`);

  if (outcome.failure) {
    const f = outcome.failure;
    console.log('\n── failure detail');
    console.log(`  checkId:       ${f.checkId}`);
    console.log(`  command:       ${f.command ?? '(none)'}`);
    console.log(`  exitCode:      ${f.exitCode ?? 'null'}  source: ${f.exitCodeSource ?? 'null'}`);
    console.log(`  failedService: ${f.failedService ?? '(none)'}`);
    console.log(`  truncated:     ${f.truncated}`);
    // Print at most 20 lines of rawOutputTail — never print full logs here.
    const tailLines = f.rawOutputTail.split('\n').slice(0, 20);
    if (tailLines.length > 0 && f.rawOutputTail.trim()) {
      console.log('  rawOutputTail (≤20 lines):');
      for (const line of tailLines) console.log('    ' + line);
    }
  }

  // Overall pass/fail for CI use.
  const allPassed = outcome.result.checks.every(c => c.status !== 'FAIL');
  console.log('');
  if (outcome.cancelled) {
    console.log('\x1b[33m⊘ Verification cancelled\x1b[0m');
    process.exit(0);
  } else if (allPassed) {
    console.log('\x1b[32m✓ Verification completed (no FAIL)\x1b[0m');
    process.exit(0);
  } else {
    console.log('\x1b[31m✗ Verification has FAIL checks\x1b[0m');
    process.exit(1);
  }
})().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
