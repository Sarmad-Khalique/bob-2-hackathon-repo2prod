// Existing-ops analyzer — detects whether a Dockerfile, Compose file, or
// GitHub Actions CI workflow already exists in the workspace root.
//
// Checks are file-existence only. File contents are never read or parsed.
// Framework detection, env scanning, and Git state live in other analyzers.
//
// Shared fs helpers (fileExists, isEnoent) now live in fsUtils.ts so other
// analyzers can reuse them without duplication.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Evidence } from '../core/types';
import { fileExists, isEnoent } from './fsUtils';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return true if `workflowsDir` contains at least one `.yml` or `.yaml` file.
 * A missing directory (ENOENT) is treated as no CI present.
 */
async function hasCiWorkflows(workflowsDir: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(workflowsDir);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      // .github/workflows/ not created yet — CI is absent.
      return false;
    }
    throw new Error(`Failed to read CI workflows directory "${workflowsDir}": ${String(err)}`);
  }

  return entries.some(name => name.endsWith('.yml') || name.endsWith('.yaml'));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect which ops files are already present at the repository root.
 *
 * @param root - Absolute path to the repository root.
 * @returns `dockerfilePresent`, `composePresent`, `ciPresent` — all booleans.
 *
 * Checks performed:
 * - `dockerfilePresent`: `<root>/Dockerfile` is a regular file.
 * - `composePresent`:    any of docker-compose.yml/yaml or compose.yml/yaml exists.
 * - `ciPresent`:         `.github/workflows/` contains at least one .yml/.yaml file.
 *
 * @throws If any filesystem error other than ENOENT is encountered.
 */
export async function analyzeExistingOps(
  root: string,
): Promise<Pick<Evidence, 'dockerfilePresent' | 'composePresent' | 'ciPresent'>> {
  const dockerfilePresent = await fileExists(join(root, 'Dockerfile'));

  // Check all recognised Compose filename variants; stop on the first match.
  const composeNames = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ];
  let composePresent = false;
  for (const name of composeNames) {
    if (await fileExists(join(root, name))) {
      composePresent = true;
      break;
    }
  }

  const ciPresent = await hasCiWorkflows(join(root, '.github', 'workflows'));

  return { dockerfilePresent, composePresent, ciPresent };
}
