// Environment-variable name collector and classifier for Repo2Prod.
//
// Scans Python source files and standard env-example files to collect the
// NAMES of environment variables referenced in the repository, then
// classifies each name via envClassifier.ts into one of the 5 EnvCategory
// buckets.
//
// This file does NOT:
//   - read values  (safety: values may be secrets)
//   - open .env    (that file may contain real secrets)
//   - make any LLM calls

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvRequirement } from '../core/types';
import { isEnoent } from './fsUtils';
import { classifyEnvName } from './envClassifier';

// ---------------------------------------------------------------------------
// Scan limits — prevent runaway I/O on very large repos
// ---------------------------------------------------------------------------

const MAX_FILES = 2000;      // stop walking after this many .py files seen
const MAX_FILE_SIZE = 512 * 1024; // skip files larger than 512 KB

// ---------------------------------------------------------------------------
// Directories to skip during recursive walk
// Symlinked directories are also skipped (to avoid cycles — see walker below)
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  'site-packages',
  'dist',
  'build',
  '.repo2prod',
  '.bob',
]);

// ---------------------------------------------------------------------------
// Exact env-example filenames read at the repository root.
// .env itself is never opened — it may contain real secrets.
// ---------------------------------------------------------------------------

const ENV_EXAMPLE_FILES = [
  '.env.example',
  '.env.sample',
  '.env.template',
  'example.env',
];

// ---------------------------------------------------------------------------
// Regex patterns for Python source scanning
// Only UPPER_SNAKE_CASE names are captured — lowercase names are almost
// certainly not real env-var references (Python uses lowercase variables).
// ---------------------------------------------------------------------------

// A. os.environ["X"] / os.environ.get("X") / os.environ.setdefault("X", ...)
const RE_ENVIRON = /\benviron(?:\.get\(|\.setdefault\(|\[)\s*["']([A-Z][A-Z0-9_]*)["']/g;

// B. os.getenv("X")
const RE_GETENV = /\bgetenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g;

// C. django-environ: env("X"), env.str("X"), env.bool("X"), env.db("X"), etc.
const RE_DJANGO_ENV = /\benv(?:\.[a-z_]+)?\(\s*["']([A-Z][A-Z0-9_]*)["']/g;

// D. .env example files: lines like `KEY=...` or `export KEY=...`
const RE_ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Result of a repository-wide env-name scan.
 * Intentionally local to this file — it is not a shared contract type.
 */
export interface EnvNameScan {
  /** Unique env-var names found, sorted A→Z. */
  names: string[];
  /** How many .py files were actually read (i.e. not skipped or excluded). */
  scannedFiles: number;
  /** True if a scan limit (MAX_FILES or MAX_FILE_SIZE) was hit. */
  truncated: boolean;
}

/**
 * Collect environment variable NAMES from a repository rooted at `root`.
 *
 * Sources:
 *  1. Python (.py) files — scanned with three regex patterns.
 *  2. Env-example files at the repo root (.env.example, .env.sample, etc.).
 *
 * Returns unique, sorted names. Never reads or returns values.
 */
export async function collectEnvNames(root: string): Promise<EnvNameScan> {
  const nameSet = new Set<string>();
  let scannedFiles = 0;
  let truncated = false;

  // ---- Source 1: Python files ----
  const pyFiles: string[] = [];
  const stopped = { value: false };
  await walkPyFiles(root, pyFiles, { count: 0 }, stopped, truncationState => {
    if (truncationState) truncated = true;
  });
  // pyFiles already respects MAX_FILES via the shared stopped flag;
  // no slice needed — the walker never pushes the file that trips the cap.

  for (const filePath of pyFiles) {
    let text: string;
    try {
      const s = await stat(filePath);
      if (s.size > MAX_FILE_SIZE) {
        // File too large — skip it but flag truncation
        truncated = true;
        continue;
      }
      text = await readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      if (isEnoent(err)) continue; // file disappeared between walk and read
      throw new Error(`Failed to read "${filePath}": ${String(err)}`);
    }

    scannedFiles++;
    extractMatches(text, RE_ENVIRON, nameSet);
    extractMatches(text, RE_GETENV, nameSet);
    extractMatches(text, RE_DJANGO_ENV, nameSet);
  }

  // ---- Source 2: Env-example / template files at root ----
  for (const filename of ENV_EXAMPLE_FILES) {
    const filePath = join(root, filename);
    let text: string | null;
    try {
      text = await readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      if (isEnoent(err)) continue; // absent files are normal
      throw new Error(`Failed to read "${filePath}": ${String(err)}`);
    }

    for (const line of text.split('\n')) {
      // Skip blank lines and comments
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      const m = RE_ENV_LINE.exec(line);
      if (m) {
        nameSet.add(m[1]);
        // Value is intentionally discarded — everything after "=" is ignored
      }
    }
  }

  return {
    names: [...nameSet].sort(),
    scannedFiles,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// analyzeEnv — env-name collection + classification
// ---------------------------------------------------------------------------

/**
 * Collect all environment variable names from `root` and classify each one
 * into an EnvRequirement using envClassifier.ts.
 *
 * Returns one EnvRequirement per unique name, sorted A→Z.
 * Never reads env-var values; never opens .env.
 */
export async function analyzeEnv(root: string): Promise<EnvRequirement[]> {
  const scan = await collectEnvNames(root);

  return scan.names.map(name => {
    const { category, required } = classifyEnvName(name);
    // "rule" is intentionally dropped — EnvRequirement has no such field
    return { name, category, required };
  });
  // names is already sorted A→Z by collectEnvNames, so order is preserved
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .py file paths under `dir`, skipping excluded
 * directories and symbolic links (symlinks are skipped to avoid cycles).
 *
 * `stopped` is a shared flag: once the cap is hit any directory that has
 * already started iterating will also exit early, so the walk truly stops
 * globally rather than only in the current branch.
 * Entries are sorted by name before iteration so truncation is deterministic.
 */
async function walkPyFiles(
  dir: string,
  results: string[],
  counter: { count: number },
  stopped: { value: boolean },
  onTruncated: (t: boolean) => void,
): Promise<void> {
  // Check the shared stop flag at the start of every directory visit
  if (stopped.value) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if (isEnoent(err)) return; // directory vanished — ignore
    throw new Error(`Failed to read directory "${dir}": ${String(err)}`);
  }

  // Sort by Unicode code point (not localeCompare) so the order is fully
  // deterministic regardless of the machine's locale setting.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    // Re-check at every iteration — a sibling subdirectory may have tripped the cap
    if (stopped.value) return;

    // Skip symbolic links to avoid cycles and to stay deterministic
    if (entry.isSymbolicLink()) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip well-known non-application directories
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkPyFiles(fullPath, results, counter, stopped, onTruncated);
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      counter.count++;
      if (counter.count > MAX_FILES) {
        // Set the shared flag so all active directory walks exit on next check
        stopped.value = true;
        onTruncated(true);
        return;
      }
      results.push(fullPath);
    }
  }
}

/**
 * Run a stateful regex against `text`, adding all captured group 1 matches
 * to `nameSet`. Resets lastIndex before each use.
 */
function extractMatches(text: string, re: RegExp, nameSet: Set<string>): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    nameSet.add(m[1]);
  }
}
