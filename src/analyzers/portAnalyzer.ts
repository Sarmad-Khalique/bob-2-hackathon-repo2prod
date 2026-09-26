// Port analyzer — extracts candidate application ports from ops files.
//
// Reads only these files at the repository root:
//   Dockerfile, docker-compose.yml/yaml, compose.yml/yaml, Procfile
//
// This file does NOT:
//   - add default/framework ports (no "Django usually uses 8000" guesses)
//   - read .env or any file that may contain secret values
//   - walk subdirectories
//   - make any LLM calls

import { join } from 'node:path';
import { readTextIfExists } from './fsUtils';

// ---------------------------------------------------------------------------
// Compose filenames (same variants as existingOpsAnalyzer)
// ---------------------------------------------------------------------------

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

// A. Dockerfile EXPOSE — captures the entire argument after "EXPOSE"
//    e.g. "EXPOSE 8000 8001/tcp" → captures "8000 8001/tcp"
const RE_DOCKERFILE_EXPOSE = /^\s*EXPOSE\s+(.+)$/gim;

// B. Compose port mapping "HOST:CONTAINER" — takes the CONTAINER port (group 2).
//    The host part (group 1) is discarded because we care about what the
//    application actually listens on inside the container.
//    Handles optional IP prefix (127.0.0.1:5433:5432) and /tcp|/udp suffix.
const RE_COMPOSE_PORT = /["']?(?:[\d.]+:)?(\d{1,5}):(\d{1,5})(?:\/(?:tcp|udp))?["']?\s*$/gm;

// C. Procfile — Django runserver and gunicorn --bind / -b
const RE_PROCFILE_RUNSERVER = /runserver\s+(?:[\w.]+:)?(\d{1,5})/g;
const RE_PROCFILE_GUNICORN   = /(?:--bind|-b)\s*=?\s*[\w.]*:(\d{1,5})/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse all numeric tokens from a Dockerfile EXPOSE argument string. */
function parseExposeTokens(exposeArg: string): number[] {
  const ports: number[] = [];
  // Each token may be "8000" or "8000/tcp" — extract the numeric part only.
  const tokenRe = /(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(exposeArg)) !== null) {
    ports.push(parseInt(m[1], 10));
  }
  return ports;
}

/** Run a stateful global regex against text, collecting integer matches from `group`. */
function collectFromRegex(text: string, re: RegExp, group: number): number[] {
  re.lastIndex = 0;
  const ports: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ports.push(parseInt(m[group], 10));
  }
  return ports;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract candidate application ports from ops files at the repository root.
 *
 * Sources checked (in order):
 *  - Dockerfile EXPOSE directives
 *  - Compose port mappings (container port only — not the host-side binding)
 *  - Procfile gunicorn/runserver bind addresses
 *
 * Returns unique port numbers in the range 1–65535, sorted ascending.
 * Returns an empty array when no ops files are present or no ports are found.
 *
 * Missing files are silently skipped. Other filesystem errors are rethrown
 * with the file path in the message.
 */
export async function analyzeCandidatePorts(root: string): Promise<number[]> {
  const raw: number[] = [];

  // ---- A. Dockerfile EXPOSE ----
  const dockerfileText = await readTextIfExists(join(root, 'Dockerfile'));
  if (dockerfileText !== null) {
    RE_DOCKERFILE_EXPOSE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_DOCKERFILE_EXPOSE.exec(dockerfileText)) !== null) {
      raw.push(...parseExposeTokens(m[1]));
    }
  }

  // ---- B. Compose port mappings — container port (group 2) ----
  //    Container port is what the app binds to; host port is the external
  //    side of the NAT — not the app's own listen address.
  for (const filename of COMPOSE_FILES) {
    const text = await readTextIfExists(join(root, filename));
    if (text !== null) {
      raw.push(...collectFromRegex(text, RE_COMPOSE_PORT, 2));
      break; // only read the first Compose file found (same precedence as existingOpsAnalyzer)
    }
  }

  // ---- C. Procfile gunicorn / runserver ----
  const procfileText = await readTextIfExists(join(root, 'Procfile'));
  if (procfileText !== null) {
    raw.push(...collectFromRegex(procfileText, RE_PROCFILE_RUNSERVER, 1));
    raw.push(...collectFromRegex(procfileText, RE_PROCFILE_GUNICORN, 1));
  }

  // Deduplicate, filter to valid port range, sort ascending
  const valid = raw.filter(p => p >= 1 && p <= 65535);
  return [...new Set(valid)].sort((a, b) => a - b);
}
