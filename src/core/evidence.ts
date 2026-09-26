// Evidence model helpers — constructors, safe defaults, and persistence for
// Evidence objects.
//
// This file does NOT scan the filesystem for workspace content or call any
// external process. All scanning lives in src/analyzers/. The Evidence type
// itself is owned by src/core/types.ts and must not be redeclared here.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Evidence } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO2PROD_DIR = '.repo2prod';
const EVIDENCE_FILE = 'evidence.json';

/**
 * Return an Evidence object with safe "nothing known yet" defaults.
 *
 * @param workspaceRoot - Absolute path to the workspace being analysed.
 * @returns An Evidence value with all optional fields set to null / false / [].
 *
 * Pure function — no side effects, no filesystem access.
 */
export function createEmptyEvidence(workspaceRoot: string): Evidence {
  return {
    workspaceRoot,
    framework: null,
    dockerfilePresent: false,
    composePresent: false,
    ciPresent: false,
    envNames: [],
    candidatePorts: [],
    gitDirty: null,
  };
}

/**
 * Persist an Evidence object to `<workspaceRoot>/.repo2prod/evidence.json`.
 *
 * Creates `.repo2prod/` if it does not exist.
 * Writes only the Evidence object — no timestamps, no extra fields,
 * no env-var values (the Evidence type guarantees this by design).
 *
 * @param workspaceRoot - Absolute path to the workspace root.
 * @param evidence      - The Evidence object to serialise.
 * @returns The absolute path of the file written.
 * @throws "Repo2Prod: failed to write .repo2prod/evidence.json: <reason>"
 */
export async function saveEvidence(
  workspaceRoot: string,
  evidence: Evidence,
): Promise<string> {
  const dir      = join(workspaceRoot, REPO2PROD_DIR);
  const filePath = join(dir, EVIDENCE_FILE);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify(evidence, null, 2) + '\n', 'utf-8');
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Repo2Prod: failed to write ${REPO2PROD_DIR}/${EVIDENCE_FILE}: ${reason}`,
    );
  }
  return filePath;
}
