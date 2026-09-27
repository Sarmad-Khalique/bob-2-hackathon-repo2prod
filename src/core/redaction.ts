// Secret redaction for diagnostics. Pure functions — no I/O, no vscode import.
// Rules are applied in strict priority order: extraSecrets first, patterns last.

export const REDACTED = '[REDACTED]';

// Non-capturing pattern fragment for embedding inside larger key/value patterns.
const SK = '(?:SECRET|PASSWORD|PASSWD|PWD|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)';

/**
 * Replaces secrets in `input` with [REDACTED].
 * Pure and idempotent: redactText(redactText(x)) === redactText(x).
 * Env var NAMES, hostnames, ports, file paths, and error class names are kept
 * visible because Bob needs them to diagnose the failure.
 */
export function redactText(input: string, extraSecrets?: readonly string[]): string {
  let s = input;

  // 1. Caller-supplied literal secret values (≥6 chars), longest first to avoid partial overlaps.
  if (extraSecrets && extraSecrets.length > 0) {
    const sorted = [...extraSecrets]
      .filter(v => v.length >= 6)
      .sort((a, b) => b.length - a.length);
    for (const secret of sorted) {
      s = s.split(secret).join(REDACTED);
    }
  }

  // 2. PEM private-key blocks — keep the BEGIN/END header lines, redact the body.
  s = s.replace(
    /(-----BEGIN [A-Z ]+PRIVATE KEY-----\r?\n?)[\s\S]*?(-----END [A-Z ]+PRIVATE KEY-----)/g,
    (_, begin, end) => `${begin}${REDACTED}\n${end}`,
  );

  // 3. URL credentials: scheme://user:pass@host — keep scheme://user:[REDACTED]@host.
  s = s.replace(
    /([a-z][a-z0-9+\-.]*:\/\/[^:@/\s]+):([^@\s]+)@/gi,
    `$1:${REDACTED}@`,
  );

  // 4. Authorization header values (Bearer / Basic token).
  //    Exclude [ so already-redacted [REDACTED] values are not double-processed (idempotence).
  s = s.replace(
    /\b(Bearer|Basic)\s+[^\s,\]}\["]+/gi,
    `$1 ${REDACTED}`,
  );

  // 5. Key/value pairs whose KEY matches the secret-key pattern.
  //    Covers: KEY=value, KEY = 'value', KEY: value, "key": "value", DSN password=value.
  //    Prose without a separator (e.g. "password authentication failed") must survive.

  // 5a. Shell / ini / YAML / DSN: KEY=value or KEY = value (unquoted/single/double-quoted value).
  //     Using non-capturing SK so group indices stay predictable: group 1 = key, rest = value alternatives.
  s = s.replace(
    new RegExp(
      `(?<![\\w])([\\w-]*${SK}[\\w-]*)\\s*=\\s*(?:'([^']*)'|"([^"]*)"|([^\\s,;'"]+))`,
      'gi',
    ),
    (_, key) => `${key}=[REDACTED]`,
  );

  // 5b. JSON/YAML "key": "value" (double-quoted both sides).
  s = s.replace(
    new RegExp(
      `"([^"]*${SK}[^"]*)"\\s*:\\s*"([^"]*)"`,
      'gi',
    ),
    (_, key) => `"${key}": "${REDACTED}"`,
  );

  // 5c. YAML/config key: value (unquoted value on same line, colon-separated).
  //     Skip if value already starts with [REDACTED] or an HTTP auth scheme (handled by rule 4).
  s = s.replace(
    new RegExp(
      `(?<![\\w/])([\\w-]*${SK}[\\w-]*):\\s+([^\\s'"{][^\\n]*)`,
      'gi',
    ),
    (_, key, value) => {
      if (value.startsWith(REDACTED) || /^(Bearer|Basic)\s/i.test(value)) return `${key}: ${value}`;
      return `${key}: ${REDACTED}`;
    },
  );

  // 6. Well-known token shapes anywhere in the text.
  //    GitHub personal-access tokens.
  s = s.replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, REDACTED);
  s = s.replace(/\bgho_[A-Za-z0-9_]{10,}\b/g, REDACTED);
  s = s.replace(/\bghu_[A-Za-z0-9_]{10,}\b/g, REDACTED);
  s = s.replace(/\bghs_[A-Za-z0-9_]{10,}\b/g, REDACTED);
  s = s.replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, REDACTED);
  //    OpenAI / generic sk- keys (≥20 chars total after prefix).
  s = s.replace(/\bsk-[A-Za-z0-9]{20,}\b/g, REDACTED);
  //    AWS access key IDs.
  s = s.replace(/\bAKIA[0-9A-Z]{16}\b/g, REDACTED);
  //    Slack tokens.
  s = s.replace(/\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g, REDACTED);
  //    JWTs: three base64url segments separated by dots.
  s = s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);

  return s;
}
