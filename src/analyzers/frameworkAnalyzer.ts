// Framework analyzer — detects the language, framework, and package manager
// for the repository at a given root path.
//
// Only Django + Python is supported (the chosen golden-path demo stack).
// All detection is deterministic file-system evidence; no LLM calls, no Git
// inspection, no env-file reads, and no recursion beyond the root directory.
//
// If the repository is not Django/Python, fields are null — this analyzer
// never guesses or fabricates a stack.

import { join } from 'node:path';
import type { StackInfo } from '../core/types';
import { fileExists, readTextIfExists } from './fsUtils';

// ---------------------------------------------------------------------------
// Django dependency regex
// ---------------------------------------------------------------------------

// Matches a line where "django" is the entire package name (or version spec),
// not a prefix of another package name.
//
// Must match:
//   Django==5.0
//   django>=4.2
//   "django>=4.2",          (TOML string value)
//   django = "^5.0"         (Pipfile / pyproject.toml)
//
// Must NOT match:
//   django-environ==0.11    (hyphen after "django" → different package)
//   djangorestframework     (word character after "django")
//   description = "a django app"  (not at start of line)
//
// Breakdown:
//   ^\s*       — optional leading whitespace (indented deps in TOML/Pipfile)
//   ["']?      — optional opening quote (TOML array entry like "django>=4.2",)
//   django     — literal, case-insensitive (PyPI normalises to lowercase)
//   (?![\w.-]) — negative lookahead: package name must end here; "django-"
//                and "django." are different packages, "djangoXYZ" is too
const DJANGO_DEP_RE = /^\s*["']?django(?![\w.-])/i;

/** Return true if any line in `text` declares django as a direct dependency. */
function hasDjangoDependency(text: string): boolean {
  for (const line of text.split('\n')) {
    // Strip inline comments before testing; e.g. "# django>=4.0" should not match.
    const stripped = line.replace(/#.*$/, '');
    if (DJANGO_DEP_RE.test(stripped)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse the repository at `root` and return language, framework, and
 * package-manager information.
 *
 * Detection strategy:
 * - Reads only the named manifest files at the root (no recursion, no .env).
 * - Missing files are silently treated as absent.
 * - Any other filesystem error is rethrown with the file path in the message.
 *
 * @param root - Absolute path to the repository root.
 * @returns A `StackInfo` object; unknown fields are `null`, never guessed.
 * @throws If a filesystem error other than ENOENT occurs.
 */
export async function analyzeFramework(root: string): Promise<StackInfo> {
  // -------------------------------------------------------------------------
  // Probe file existence (these are cheap stat-only calls)
  // -------------------------------------------------------------------------

  const [
    hasManagePy,
    hasRequirementsTxt,
    hasPyprojectToml,
    hasPipfile,
    hasSetupPy,
    hasUvLock,
    hasPoetryLock,
  ] = await Promise.all([
    fileExists(join(root, 'manage.py')),
    fileExists(join(root, 'requirements.txt')),
    fileExists(join(root, 'pyproject.toml')),
    fileExists(join(root, 'Pipfile')),
    fileExists(join(root, 'setup.py')),
    fileExists(join(root, 'uv.lock')),
    fileExists(join(root, 'poetry.lock')),
  ]);

  // -------------------------------------------------------------------------
  // language — "python" if any Python manifest is present
  // -------------------------------------------------------------------------

  const isPython =
    hasManagePy ||
    hasRequirementsTxt ||
    hasPyprojectToml ||
    hasPipfile ||
    hasSetupPy;

  const language: string | null = isPython ? 'python' : null;

  // -------------------------------------------------------------------------
  // framework — "django" via manage.py or an explicit dependency declaration
  // -------------------------------------------------------------------------

  let framework: string | null = null;

  if (hasManagePy) {
    // manage.py is Django's project management script — its presence is
    // sufficient evidence without reading any dependency file.
    framework = 'django';
  } else {
    // Check dependency files for an explicit Django declaration.
    // Each is read only if the file was confirmed to exist above.
    const depFiles: string[] = [];
    if (hasRequirementsTxt) depFiles.push(join(root, 'requirements.txt'));
    if (hasPyprojectToml)   depFiles.push(join(root, 'pyproject.toml'));
    if (hasPipfile)         depFiles.push(join(root, 'Pipfile'));

    for (const depFile of depFiles) {
      const content = await readTextIfExists(depFile);
      if (content !== null && hasDjangoDependency(content)) {
        framework = 'django';
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // packageManager — first match in precedence order
  // -------------------------------------------------------------------------

  let packageManager: string | null = null;

  if (hasUvLock) {
    // uv is the fastest modern Python package manager; lock file wins.
    packageManager = 'uv';
  } else if (hasPoetryLock) {
    packageManager = 'poetry';
  } else if (hasPyprojectToml) {
    // A pyproject.toml without a poetry.lock may still be a Poetry project
    // if it carries a [tool.poetry] section.
    const content = await readTextIfExists(join(root, 'pyproject.toml'));
    if (content !== null && content.includes('[tool.poetry]')) {
      packageManager = 'poetry';
    }
  }

  // Fall through to simpler package managers if poetry was not confirmed.
  if (packageManager === null) {
    if (hasPipfile) {
      packageManager = 'pipenv';
    } else if (hasRequirementsTxt) {
      packageManager = 'pip';
    }
  }

  return { language, framework, packageManager };
}
