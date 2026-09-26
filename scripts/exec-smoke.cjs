#!/usr/bin/env node
// Development smoke test for src/execution/* wrappers.
// Requires: pnpm compile first. Run: node scripts/exec-smoke.cjs <demo-dir>
// Must never print .env values or full logs (at most 20 log lines printed).

'use strict';

const path = require('node:path');
const { execSync } = require('node:child_process');

// ─── Load compiled output ─────────────────────────────────────────────────────

const outDir = path.resolve(__dirname, '..', 'out', 'execution');
const { runProcess, formatCommand } = require(path.join(outDir, 'processRunner.js'));
const { checkDocker } = require(path.join(outDir, 'docker.js'));
const {
  checkCompose,
  deriveComposeProjectName,
  findComposeFile,
  composeBuild,
  composeUp,
  composePs,
  composeLogs,
  composePort,
  composeRun,
  composeDown,
} = require(path.join(outDir, 'compose.js'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let failures = 0;

function check(label, ok, detail) {
  const mark = ok ? PASS : FAIL;
  if (!ok) failures++;
  const extra = detail ? `  — ${detail}` : '';
  console.log(`  ${mark}  ${label}${extra}`);
}

function section(title) {
  console.log(`\n── ${title}`);
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const demoDir = process.argv[2];
if (!demoDir) {
  console.error('Usage: node scripts/exec-smoke.cjs <demo-dir>');
  process.exit(1);
}

const PROJECT_NAME = 'repo2prod-golden-demo';

(async () => {
  // ── a. Docker + Compose availability ─────────────────────────────────────

  section('a. Docker + Compose checks');
  const dockerResult = await checkDocker(runProcess, demoDir);
  check('checkDocker ok', dockerResult.ok, dockerResult.message);

  const composeResult = await checkCompose(runProcess, demoDir);
  check('checkCompose ok', composeResult.ok, composeResult.run.stdout.trim().split('\n')[0]);

  // ── b. Project-name derivation ────────────────────────────────────────────

  section('b. deriveComposeProjectName');
  const cases = [
    ['golden-demo',          'repo2prod-golden-demo'],
    ['My Demo',              'repo2prod-my-demo'],
    ['sandbox-sarmad-work',  'repo2prod-sandbox-sarmad-work'],
    ['a__b--c.',             'repo2prod-a-b-c'],
    ['tmp.1Vi620BYBv',       'repo2prod-tmp-1vi620bybv'],
    ['Demo_2026!',           'repo2prod-demo-2026'],
    ['-lead',                'repo2prod--lead'],
  ];
  for (const [input, expected] of cases) {
    const got = deriveComposeProjectName('/some/path/' + input);
    check(`"${input}" → "${expected}"`, got === expected, got !== expected ? `got "${got}"` : '');
  }
  // Verify the demo dir itself derives to the expected project name.
  const derivedProject = deriveComposeProjectName(demoDir);
  check(`demoDir derives to "${PROJECT_NAME}"`, derivedProject === PROJECT_NAME, derivedProject);

  // ── c. findComposeFile ────────────────────────────────────────────────────

  section('c. findComposeFile');
  const composeFile = await findComposeFile(demoDir);
  check('compose file found', composeFile !== null, composeFile ?? 'null');

  // ── d. composeBuild ───────────────────────────────────────────────────────

  section('d. composeBuild');
  const ctx = { runner: runProcess, cwd: demoDir, projectName: PROJECT_NAME, composeFile: composeFile ?? undefined };
  const t0Build = Date.now();
  const buildResult = await composeBuild(ctx);
  const buildMs = Date.now() - t0Build;
  check(`composeBuild ok (${(buildMs / 1000).toFixed(1)}s)`, buildResult.ok,
    buildResult.ok ? '' : buildResult.run.stderr.slice(-200));

  // ── e. composeUp + composePs ──────────────────────────────────────────────

  section('e. composeUp + composePs');
  const upResult = await composeUp(ctx);
  check(`composeUp exit ${upResult.run.exitCode}`, upResult.run.exitCode === 0);

  // Wait ~10 s for containers to settle.
  await new Promise(r => setTimeout(r, 10_000));

  const psResult = await composePs(ctx);
  check('composePs ok', psResult.ok, `${psResult.services.length} services`);

  const db  = psResult.services.find(s => s.service === 'db');
  const app = psResult.services.find(s => s.service === 'app');
  check('db state running', db?.state?.toLowerCase().includes('running'), db?.state ?? 'not found');
  check('db health healthy', db?.health?.toLowerCase().includes('healthy'), db?.health ?? 'not found');
  check('app state exited', app?.state?.toLowerCase().includes('exit'), app?.state ?? 'not found');
  check('app exitCode 1', app?.exitCode === 1, String(app?.exitCode ?? 'null'));

  // ── f. composeLogs ────────────────────────────────────────────────────────

  section('f. composeLogs app 40 lines');
  const logsResult = await composeLogs(ctx, 'app', 40);
  check('composeLogs ok', logsResult.ok);
  const logText = logsResult.run.stdout;
  const logLines = logText.trim().split('\n');
  // Print at most 20 lines.
  const preview = logLines.slice(0, 20);
  console.log('    (first ≤20 lines):');
  for (const line of preview) console.log('    ' + line);
  const hasPortError = logText.includes('port 5432 failed: Connection refused');
  const hasPrefix = logText.includes('app-1  |') || logText.includes('app-1 |');
  check('logs contain "port 5432 failed"', hasPortError);
  check('logs have no "app-1  |" prefix', !hasPrefix);

  // ── g. composePort ────────────────────────────────────────────────────────

  section('g. composePort app 8000');
  const portResult = await composePort(ctx, 'app', 8000);
  // App has exited — expect null, no throw.
  check('composePort returns null (app exited)', portResult.hostPort === null, String(portResult.hostPort));

  // ── h. composeRun ─────────────────────────────────────────────────────────

  section('h. composeRun python -c "print(\'run-ok\')"');
  const runResult = await composeRun(ctx, 'app', ['python', '-c', "print('run-ok')"]);
  check('composeRun exit 0', runResult.run.exitCode === 0, String(runResult.run.exitCode));
  check('composeRun output "run-ok"', runResult.run.stdout.trim() === 'run-ok', JSON.stringify(runResult.run.stdout.trim()));

  // ── i. composeDown + volume check ────────────────────────────────────────

  section('i. composeDown + volume check');
  const downResult = await composeDown(ctx, { removeVolumes: true });
  check('composeDown ok', downResult.ok, downResult.run.exitCode != null ? `exit ${downResult.run.exitCode}` : downResult.run.spawnError ?? '');

  const psAfter = await composePs(ctx);
  // After down, ps may return ok=false (no containers) or ok=true with empty list.
  check('no services after down', psAfter.services.length === 0, `${psAfter.services.length} services remaining`);

  const volCheck = execSync(
    `docker volume ls -q --filter label=com.docker.compose.project=${PROJECT_NAME}`,
    { encoding: 'utf8' }
  ).trim();
  check('no project volumes remain', volCheck === '', volCheck || '(none)');

  // ── j. runProcess edge cases ──────────────────────────────────────────────

  section('j. runProcess edge cases');

  // j1. timeout
  const j1start = Date.now();
  const j1 = await runProcess({ cwd: demoDir, command: 'sleep', args: ['5'], timeoutMs: 500 });
  const j1elapsed = Date.now() - j1start;
  check('sleep timeout -> timedOut=true', j1.timedOut, `elapsed ${j1elapsed}ms`);
  check('sleep timeout finishes < 4 s', j1elapsed < 4000, `${j1elapsed}ms`);

  // j2. abort signal
  const ac = new AbortController();
  const j2start = Date.now();
  setTimeout(() => ac.abort(), 300);
  const j2 = await runProcess({ cwd: demoDir, command: 'sleep', args: ['5'], signal: ac.signal });
  const j2elapsed = Date.now() - j2start;
  check('abort -> cancelled=true', j2.cancelled, `elapsed ${j2elapsed}ms`);
  check('abort finishes < 4 s', j2elapsed < 4000, `${j2elapsed}ms`);

  // j3. missing command
  const j3 = await runProcess({ cwd: demoDir, command: 'definitely-not-a-command', args: [] });
  check('missing command -> spawnError', j3.spawnError !== null && j3.spawnError.includes('Command not found'), j3.spawnError ?? 'null');

  // j4. missing cwd
  const j4 = await runProcess({ cwd: '/no/such/dir', command: 'echo', args: ['hi'] });
  check('missing cwd -> spawnError', j4.spawnError !== null && j4.spawnError.includes('Working directory not found'), j4.spawnError ?? 'null');

  // j5. output truncation
  const j5 = await runProcess({
    cwd: demoDir,
    command: process.execPath,
    args: ['-e', "process.stdout.write('x'.repeat(200000))"],
    maxOutputBytes: 1024,
  });
  check('truncation: stdout.length === 1024', j5.stdout.length === 1024, String(j5.stdout.length));
  check('truncation: stdoutTruncated=true', j5.stdoutTruncated === true);

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('');
  if (failures === 0) {
    console.log(`\x1b[32m✓ All checks passed\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ ${failures} check(s) failed\x1b[0m`);
    process.exit(1);
  }
})().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
