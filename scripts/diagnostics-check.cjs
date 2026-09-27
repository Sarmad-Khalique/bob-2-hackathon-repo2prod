#!/usr/bin/env node
// Self-check for redaction.ts and diagnostics.ts validation. Uses FAKE secrets only — never reads .env.
// Requires: pnpm compile first. Run: node scripts/diagnostics-check.cjs

'use strict';

const path = require('node:path');

const outDir = path.resolve(__dirname, '..', 'out');
const { redactText, REDACTED } = require(path.join(outDir, 'core', 'redaction.js'));
const { validateFailureBundle, createFailureBundle } = require(path.join(outDir, 'execution', 'diagnostics.js'));

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS  ${label}`);
    passed++;
  } else {
    console.log(`FAIL  ${label}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkContains(label, actual, substring) {
  if (actual.includes(substring)) {
    console.log(`PASS  ${label}`);
    passed++;
  } else {
    console.log(`FAIL  ${label}`);
    console.log(`      expected to contain: ${JSON.stringify(substring)}`);
    console.log(`      actual: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkNotContains(label, actual, substring) {
  if (!actual.includes(substring)) {
    console.log(`PASS  ${label}`);
    passed++;
  } else {
    console.log(`FAIL  ${label}`);
    console.log(`      expected NOT to contain: ${JSON.stringify(substring)}`);
    failed++;
  }
}

// ─── Redaction cases ──────────────────────────────────────────────────────────

// URL credentials
check('URL creds redacted',
  redactText('postgres://inventory:s3cretPass9@db:5432/inventory'),
  'postgres://inventory:[REDACTED]@db:5432/inventory');

// Shell assignment (unquoted)
checkContains('SECRET_KEY= unquoted redacted',
  redactText('SECRET_KEY=abcd1234efgh5678ijkl'),
  'SECRET_KEY=[REDACTED]');

// Shell assignment (single-quoted)
checkContains("SECRET_KEY= single-quoted redacted",
  redactText("SECRET_KEY = 'django-insecure-xyz123'"),
  'SECRET_KEY=[REDACTED]');

// JSON key/value
check('JSON password key redacted',
  redactText('{"password": "hunter22x"}'),
  '{"password": "[REDACTED]"}');

// R1: quoted value after "key:" (Python dict / YAML / mixed quotes)
check('Python dict PASSWORD redacted, HOST kept',
  redactText("{'PASSWORD': 'fakePass123', 'HOST': 'db'}"),
  "{'PASSWORD': '[REDACTED]', 'HOST': 'db'}");
check('YAML double-quoted value redacted',
  redactText('POSTGRES_PASSWORD: "fakePass123"'),
  'POSTGRES_PASSWORD: "[REDACTED]"');
check('YAML single-quoted value redacted',
  redactText("password: 'fakePass123'"),
  "password: '[REDACTED]'");
check('"KEY": \'value\' redacted',
  redactText(`"POSTGRES_PASSWORD": 'fakePass123'`),
  `"POSTGRES_PASSWORD": '[REDACTED]'`);
check("'KEY': \"value\" redacted",
  redactText(`'POSTGRES_PASSWORD': "fakePass123"`),
  `'POSTGRES_PASSWORD': "[REDACTED]"`);

// DSN password=value style
checkContains('DSN password=value redacted',
  redactText('password=hunter22x host=db'),
  'password=[REDACTED]');

// Authorization: Bearer
check('Authorization Bearer redacted',
  redactText('Authorization: Bearer abc.def.ghi'),
  'Authorization: Bearer [REDACTED]');

// PEM private key block
const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAveryLongBase64\ndata\n-----END RSA PRIVATE KEY-----';
const redactedPem = redactText(pem);
checkContains('PEM BEGIN line kept', redactedPem, '-----BEGIN RSA PRIVATE KEY-----');
checkContains('PEM END line kept', redactedPem, '-----END RSA PRIVATE KEY-----');
checkNotContains('PEM body redacted', redactedPem, 'MIIEowIBAAKCAQEAveryLongBase64');

// GitHub token
check('ghp_ token redacted',
  redactText('token: ghp_' + 'A'.repeat(36)),
  'token: ' + REDACTED);

// AWS key ID
check('AKIA key redacted',
  redactText('key: AKIAABCDEFGHIJKLMNOP'),
  'key: ' + REDACTED);

// extraSecrets literal — the secret includes "here", so the full match is replaced.
check('extraSecrets literal redacted',
  redactText('my super literal secret value here', ['super literal secret value here']),
  'my [REDACTED]');

// ─── Survive unchanged ────────────────────────────────────────────────────────

check('POSTGRES_HOST env name survives',
  redactText('POSTGRES_HOST'),
  'POSTGRES_HOST');

check('Connection refused error survives',
  redactText('connection to server at "127.0.0.1", port 5432 failed: Connection refused'),
  'connection to server at "127.0.0.1", port 5432 failed: Connection refused');

check('sqlite3 error survives',
  redactText('sqlite3.OperationalError: unable to open database file'),
  'sqlite3.OperationalError: unable to open database file');

check('prose password message survives',
  redactText('password authentication failed for user "inventory"'),
  'password authentication failed for user "inventory"');

for (const text of [
  "KeyError: 'SECRET_KEY'",
  `'FATAL:  password authentication failed for user "inventory"'`,
  `'connection to server at "127.0.0.1", port 5432 failed: Connection refused'`,
  `'sqlite3.OperationalError: unable to open database file'`,
  "'HOST': 'db'",
]) {
  check(`survives: ${text.slice(0, 40)}`, redactText(text), text);
}

// ─── Idempotence ──────────────────────────────────────────────────────────────

const inputs = [
  'postgres://inventory:s3cretPass9@db:5432/inventory',
  'SECRET_KEY=abcd1234efgh5678ijkl',
  'Authorization: Bearer abc.def.ghi',
  'password authentication failed for user "inventory"',
  "{'PASSWORD': 'fakePass123', 'HOST': 'db'}",
  'POSTGRES_PASSWORD: "fakePass123"',
  "password: 'fakePass123'",
  `"POSTGRES_PASSWORD": 'fakePass123'`,
  `'POSTGRES_PASSWORD': "fakePass123"`,
];
for (const input of inputs) {
  const once = redactText(input);
  const twice = redactText(once);
  check(`idempotent: ${input.slice(0, 40)}`, twice, once);
}

// ─── validateFailureBundle ────────────────────────────────────────────────────

// Reject extra key
let extraKeyError = '';
try {
  validateFailureBundle({ attempt: 0, phase: 'STARTING', command: null, exitCode: null, redactedExcerpt: 'x', truncated: false, extra: 'bad' });
} catch (e) {
  extraKeyError = e.message;
}
checkContains('validateFailureBundle rejects extra key', extraKeyError, 'extra keys not allowed');
console.log(`      error: ${extraKeyError}`);

// Reject string exitCode
let typeError = '';
try {
  validateFailureBundle({ attempt: 0, phase: 'STARTING', command: null, exitCode: 'not-a-number', redactedExcerpt: 'x', truncated: false });
} catch (e) {
  typeError = e.message;
}
checkContains('validateFailureBundle rejects string exitCode', typeError, '"exitCode" must be an integer or null');
console.log(`      error: ${typeError}`);

// ─── Header exitCodeSource null → "n/a" ──────────────────────────────────────

async function headerNullExitCodeCheck() {
  // Build a fake VerificationOutcome with exitCodeSource null.
  const fakeOutcome = {
    result: { checks: [{ id: 'app', status: 'FAIL', observed: true, detail: 'test detail' }] },
    failedPhase: 'STARTING',
    cancelled: false,
    failure: {
      checkId: 'app',
      command: null,
      exitCode: null,
      exitCodeSource: null,
      failedService: 'web',
      rawOutputTail: 'some log line',
      truncated: false,
    },
  };
  // workspaceRoot doesn't need to exist — relevant files will just come back empty.
  const tmpDir = require('node:os').tmpdir();
  const bundle = await createFailureBundle({ attempt: 0, outcome: fakeOutcome, workspaceRoot: tmpDir });
  checkContains('exitCodeSource null → "Exit code: n/a"', bundle.redactedExcerpt, 'Exit code: n/a');
}

headerNullExitCodeCheck()
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
