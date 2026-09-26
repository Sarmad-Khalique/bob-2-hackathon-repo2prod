// Shared filesystem helpers for the analyzer layer.
//
// Provides small, focused utilities for probing files without throwing on the
// common "file does not exist" case. All other errors are rethrown with
// context so callers know which path failed.
//
// This file does NOT perform framework detection, env scanning, or any
// application-level logic — those live in the individual analyzers.

import { stat, readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrow type-guard for ENOENT filesystem errors. */
export function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * Return true if `filePath` exists as a regular file.
 *
 * @param filePath - Absolute path to check.
 * @returns `true` when the path exists and is a regular file; `false` on ENOENT.
 * @throws If any filesystem error other than ENOENT is encountered.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch (err: unknown) {
    if (isEnoent(err)) {
      // Missing file is the normal "not present" case — not an error.
      return false;
    }
    throw new Error(`Failed to stat "${filePath}": ${String(err)}`);
  }
}

/**
 * Read `filePath` as UTF-8 text, returning `null` when the file does not exist.
 *
 * @param filePath - Absolute path to read.
 * @returns File contents as a string, or `null` on ENOENT.
 * @throws If any filesystem error other than ENOENT is encountered (includes path in message).
 */
export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if (isEnoent(err)) {
      // Caller treats absence as "no content" — normal case.
      return null;
    }
    throw new Error(`Failed to read "${filePath}": ${String(err)}`);
  }
}
