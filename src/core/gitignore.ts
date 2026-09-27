// gitignore.ts — deterministic .gitignore hygiene for Repo2Prod.
//
// Ensures the four Repo2Prod-local patterns are present in the target
// workspace's .gitignore without touching any other content.
//
// This is a Member A / core utility — called during Repo2Prod startup,
// before Bob productionization begins.

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// The exact patterns Repo2Prod requires in .gitignore.
// Root-anchored so they only match top-level directories.
// NOTE: /.bob/ is intentionally NOT included — a target project may have
// legitimate committed Bob configuration, rules, or skills.
// ---------------------------------------------------------------------------

const REPO2PROD_GITIGNORE_COMMENT = '# Repo2Prod local state';

const REPO2PROD_GITIGNORE_ENTRIES: readonly string[] = [
  '/.repo2prod/',
  '/.bob/skills/repo2prod/',
  '/.bob/skills/repo2prod-repair/',
  '/.bob/skills/repo2prod-ci/',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the Repo2Prod-specific entries are present in `<workspaceRoot>/.gitignore`.
 *
 * Behaviour:
 * - Creates `.gitignore` if it does not exist.
 * - Preserves all existing content exactly.
 * - Appends only the entries that are not already present (idempotent).
 * - Never duplicates entries.
 * - Never adds `/.bob/` as a blanket ignore — only the three skill sub-paths.
 *
 * Throws with a clear message if the file cannot be written (caller should
 * surface this as a Repo2Prod error, not swallow it silently).
 */
export function ensureRepo2ProdGitIgnore(workspaceRoot: string): void {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');

  // Read existing content, or start from empty string.
  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }

  // Split into lines for membership checks.
  // We trim each line for comparison only — we do NOT trim the stored content.
  const existingLines = existing.split('\n').map((l) => l.trim());

  // Collect entries that are not yet present.
  const missing = REPO2PROD_GITIGNORE_ENTRIES.filter(
    (entry) => !existingLines.includes(entry),
  );

  // Nothing to do — every entry is already present.
  if (missing.length === 0) {
    return;
  }

  // Build the block to append.
  // Ensure there is a trailing newline before the new block.
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const block = [REPO2PROD_GITIGNORE_COMMENT, ...missing, ''].join('\n');

  try {
    fs.writeFileSync(gitignorePath, existing + separator + block, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Repo2Prod: failed to write .gitignore hygiene entries — ${message}. ` +
        'Repo2Prod local state may be accidentally committed.',
    );
  }
}
