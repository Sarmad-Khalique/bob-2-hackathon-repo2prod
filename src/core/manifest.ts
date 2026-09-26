// Repo2Prod manifest builder, validator, and persistence layer.
//
// This file does three things:
//   1. buildManifest  — pure function that turns Evidence + StackInfo + EnvRequirements
//      into a RuntimeManifest (a PLAN, not proof of execution).
//   2. validateManifest — asserts a RuntimeManifest is structurally sound and safe
//      before it is written to disk or passed to Bob.
//   3. saveManifest  — validates then persists the plan to
//      .repo2prod/runtime-manifest.json.
//
// What this file does NOT do:
//   - No Docker execution, Bob calls, or LLM reasoning.
//   - No env-var VALUES — names and categories only.
//   - No framework-specific logic — stays framework-agnostic (AGENTS.md §7).
//   - No invented Docker image tags, start/build/test commands, or default app ports.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Evidence,
  EnvCategory,
  EnvRequirement,
  RuntimeManifest,
  ServiceInfo,
  ServiceEdge,
  StackInfo,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO2PROD_DIR = '.repo2prod';
const MANIFEST_FILE = 'runtime-manifest.json';

// The five valid categories mirrored from types.ts — kept here as a runtime
// constant so validateManifest can check them without importing type metadata.
const ENV_CATEGORIES: EnvCategory[] = [
  'safe-inferred',
  'generated-local-secret',
  'generated-local-infrastructure',
  'user-secret-required',
  'optional-external',
];

// ---------------------------------------------------------------------------
// Infrastructure service detection table.
//
// Each entry describes one recognisable infrastructure dependency.
// Detection is purely by env-var name — no file-system scanning needed here.
//
// DATABASE_URL → postgres is a warranted assumption: AGENTS.md §5 designates
// PostgreSQL as the primary infrastructure dependency for the golden path.
// ---------------------------------------------------------------------------

interface InfraEntry {
  id: string;
  name: string;
  defaultPort: number;
  /** Returns true when at least one env name in the workspace matches this service. */
  matches: (envNames: string[]) => boolean;
}

const INFRA_TABLE: InfraEntry[] = [
  {
    id: 'db',
    name: 'postgres',
    defaultPort: 5432,
    // DATABASE_URL → postgres (see note above); POSTGRES_* prefix; individual PG* vars.
    matches: (names) =>
      names.some(
        (n) =>
          n === 'DATABASE_URL' ||
          n.startsWith('POSTGRES_') ||
          ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].includes(n),
      ),
  },
  {
    id: 'cache',
    name: 'redis',
    defaultPort: 6379,
    // REDIS_URL, CELERY_BROKER_URL (common Django/Celery pattern), or REDIS_* prefix.
    matches: (names) =>
      names.some(
        (n) =>
          n === 'REDIS_URL' ||
          n === 'CELERY_BROKER_URL' ||
          n.startsWith('REDIS_'),
      ),
  },
];

// ---------------------------------------------------------------------------
// ManifestInput — local to this file; not a shared cross-module contract.
// ---------------------------------------------------------------------------

/** Input bundle for buildManifest. Not exported beyond this module boundary. */
export interface ManifestInput {
  evidence: Evidence;
  stack: StackInfo;
  env: EnvRequirement[];
}

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------

/**
 * Build a RuntimeManifest from deterministic workspace evidence.
 *
 * Pure function — no filesystem access, no I/O, no side effects.
 * The result is a PLAN. It is not proof that anything runs.
 * null means "unknown — Bob or verification decides later".
 *
 * @param input - Evidence, StackInfo, and EnvRequirements collected by the analyzers.
 * @returns A RuntimeManifest with version 1.
 */
export function buildManifest(input: ManifestInput): RuntimeManifest {
  const { evidence, stack, env } = input;

  // Detect which infra services are implied by the observed env-var names.
  const detectedInfra = INFRA_TABLE.filter((entry) => entry.matches(evidence.envNames));

  // Collect the default ports belonging to detected infra services so we can
  // subtract them from the app's port list (they are infra ports, not app ports).
  const infraDefaultPorts = new Set(detectedInfra.map((e) => e.defaultPort));

  // Build infra ServiceInfo entries.
  // image is null — Bob chooses the concrete image tag; we must not invent one.
  const infraServices: ServiceInfo[] = detectedInfra.map((entry) => ({
    id: entry.id,
    name: entry.name,
    image: null,
    ports: [entry.defaultPort],
  }));

  // App service — always present.
  // Ports: candidatePorts minus infra default ports, sorted ascending.
  // If none remain, ports is [] — unknown, not a guess.
  const appPorts = evidence.candidatePorts
    .filter((p) => !infraDefaultPorts.has(p))
    .sort((a, b) => a - b);

  const appService: ServiceInfo = {
    id: 'app',
    name: stack.framework ?? 'app',
    image: null, // Bob selects the image; we do not invent a tag.
    ports: appPorts,
  };

  // Service order: app first, then infra in INFRA_TABLE order.
  const services: ServiceInfo[] = [appService, ...infraServices];

  // One depends_on edge per detected infra service.
  const edges: ServiceEdge[] = detectedInfra.map((entry) => ({
    from: 'app',
    to: entry.id,
    relation: 'depends_on',
  }));

  // Commands are all null because:
  //   - Bob creates the runtime files (Dockerfile, compose.yaml) after this plan is written.
  //   - Member C's verification layer owns actual execution.
  //   - We have no observed evidence of these commands yet.
  const commands = {
    build: null,
    start: null,
    test: null,
    healthcheck: null,
  };

  // Env: sorted by name code-point order A→Z (consistent with envAnalyzer.ts).
  const sortedEnv = [...env].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  return {
    version: 1,
    stack,
    services,
    edges,
    commands,
    env: sortedEnv,
  };
}

// ---------------------------------------------------------------------------
// validateManifest — small validation helpers
// ---------------------------------------------------------------------------

/** Returns true for plain objects (not null, not arrays). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns true for string or null. */
function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

/**
 * Pushes errors for any key present in `obj` that is not in `allowed`,
 * and for any key in `required` that is missing from `obj`.
 * The `ctx` prefix is used in error messages (e.g. "services[0]").
 */
function checkExactKeys(
  obj: Record<string, unknown>,
  allowed: string[],
  required: string[],
  ctx: string,
  errs: string[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      errs.push(`${ctx}.${key} is not allowed`);
    }
  }
  for (const key of required) {
    if (!(key in obj)) {
      errs.push(`${ctx}.${key} is required`);
    }
  }
}

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

/**
 * Assert that `value` is a structurally valid RuntimeManifest.
 *
 * Accepts `unknown` input so it can safely validate manifests loaded from disk.
 * Collects ALL problems in one pass and throws a single Error listing them all:
 *
 *   "Runtime manifest is invalid: <problem 1>; <problem 2>; ..."
 *
 * If no problems are found, returns normally.
 *
 * Checks performed:
 * - Top-level object shape; exact allowed keys; version === 1.
 * - stack: exact keys, each string or null.
 * - services: array of objects with exact keys; id/name non-empty strings;
 *   image string-or-null; ports array of integers 1–65535; unique ids;
 *   exactly one service with id 'app'.
 * - edges: array of objects with exact keys; from/to must reference existing
 *   service ids; relation non-empty string.
 * - commands: exact keys, each string or null.
 * - env: array of objects with exact keys; name matches ^[A-Z][A-Z0-9_]*$;
 *   category one of the 5 valid values; required boolean; unique names.
 *   Extra keys are rejected — especially env[n].value, which is a secret guard.
 *
 * Pure function — no I/O.
 */
export function validateManifest(value: unknown): asserts value is RuntimeManifest {
  const errs: string[] = [];

  // ── top level ──────────────────────────────────────────────────────────────
  if (!isPlainObject(value)) {
    errs.push('manifest must be a plain object');
    throw new Error(`Runtime manifest is invalid: ${errs.join('; ')}`);
  }

  const TOP_KEYS = ['version', 'stack', 'services', 'edges', 'commands', 'env'];
  // Extra keys rejected at top level (secret guard — no place for unknown fields).
  checkExactKeys(value, TOP_KEYS, TOP_KEYS, 'manifest', errs);

  // version ── must be exactly 1
  if ('version' in value) {
    if (value.version !== 1) {
      errs.push(`version must be 1, got ${JSON.stringify(value.version)}`);
    }
  }

  // ── stack ──────────────────────────────────────────────────────────────────
  if ('stack' in value) {
    const stack = value.stack;
    if (!isPlainObject(stack)) {
      errs.push('stack must be an object');
    } else {
      const STACK_KEYS = ['language', 'framework', 'packageManager'];
      checkExactKeys(stack, STACK_KEYS, STACK_KEYS, 'stack', errs);
      for (const k of STACK_KEYS) {
        if (k in stack && !isStringOrNull(stack[k])) {
          errs.push(`stack.${k} must be string or null`);
        }
      }
    }
  }

  // ── services ───────────────────────────────────────────────────────────────
  const serviceIds: string[] = [];

  if ('services' in value) {
    const services = value.services;
    if (!Array.isArray(services)) {
      errs.push('services must be an array');
    } else {
      const SERVICE_KEYS = ['id', 'name', 'image', 'ports'];
      const seenIds = new Map<string, number>(); // id → first index
      let appCount = 0;

      for (let i = 0; i < services.length; i++) {
        const svc = services[i] as unknown;
        const ctx = `services[${i}]`;

        if (!isPlainObject(svc)) {
          errs.push(`${ctx} must be an object`);
          continue;
        }

        checkExactKeys(svc, SERVICE_KEYS, SERVICE_KEYS, ctx, errs);

        // id
        if ('id' in svc) {
          if (typeof svc.id !== 'string' || svc.id.length === 0) {
            errs.push(`${ctx}.id must be a non-empty string`);
          } else {
            if (seenIds.has(svc.id)) {
              errs.push(`${ctx}.id '${svc.id}' is duplicated`);
            } else {
              seenIds.set(svc.id, i);
              serviceIds.push(svc.id);
              if (svc.id === 'app') appCount++;
            }
          }
        }

        // name
        if ('name' in svc) {
          if (typeof svc.name !== 'string' || svc.name.length === 0) {
            errs.push(`${ctx}.name must be a non-empty string`);
          }
        }

        // image
        if ('image' in svc && !isStringOrNull(svc.image)) {
          errs.push(`${ctx}.image must be string or null`);
        }

        // ports
        if ('ports' in svc) {
          if (!Array.isArray(svc.ports)) {
            errs.push(`${ctx}.ports must be an array`);
          } else {
            for (let j = 0; j < svc.ports.length; j++) {
              const p = svc.ports[j] as unknown;
              if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 65535) {
                errs.push(`${ctx}.ports[${j}] must be an integer between 1 and 65535`);
              }
            }
          }
        }
      }

      if (appCount === 0) {
        errs.push("services must contain exactly one service with id 'app'");
      } else if (appCount > 1) {
        errs.push("services must contain exactly one service with id 'app' (found multiple)");
      }
    }
  }

  // ── edges ──────────────────────────────────────────────────────────────────
  if ('edges' in value) {
    const edges = value.edges;
    if (!Array.isArray(edges)) {
      errs.push('edges must be an array');
    } else {
      const EDGE_KEYS = ['from', 'to', 'relation'];

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i] as unknown;
        const ctx = `edges[${i}]`;

        if (!isPlainObject(edge)) {
          errs.push(`${ctx} must be an object`);
          continue;
        }

        checkExactKeys(edge, EDGE_KEYS, EDGE_KEYS, ctx, errs);

        // from / to must reference a known service id
        for (const field of ['from', 'to'] as const) {
          if (field in edge) {
            if (typeof edge[field] !== 'string' || (edge[field] as string).length === 0) {
              errs.push(`${ctx}.${field} must be a non-empty string`);
            } else if (!serviceIds.includes(edge[field] as string)) {
              errs.push(
                `${ctx}.${field} '${edge[field]}' does not match any service id`,
              );
            }
          }
        }

        // relation
        if ('relation' in edge) {
          if (typeof edge.relation !== 'string' || edge.relation.length === 0) {
            errs.push(`${ctx}.relation must be a non-empty string`);
          }
        }
      }
    }
  }

  // ── commands ───────────────────────────────────────────────────────────────
  if ('commands' in value) {
    const commands = value.commands;
    if (!isPlainObject(commands)) {
      errs.push('commands must be an object');
    } else {
      const CMD_KEYS = ['build', 'start', 'test', 'healthcheck'];
      checkExactKeys(commands, CMD_KEYS, CMD_KEYS, 'commands', errs);
      for (const k of CMD_KEYS) {
        if (k in commands && !isStringOrNull(commands[k])) {
          errs.push(`commands.${k} must be string or null`);
        }
      }
    }
  }

  // ── env ────────────────────────────────────────────────────────────────────
  const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

  if ('env' in value) {
    const env = value.env;
    if (!Array.isArray(env)) {
      errs.push('env must be an array');
    } else {
      const ENV_KEYS = ['name', 'category', 'required'];
      const seenNames = new Set<string>();

      for (let i = 0; i < env.length; i++) {
        const entry = env[i] as unknown;
        const ctx = `env[${i}]`;

        if (!isPlainObject(entry)) {
          errs.push(`${ctx} must be an object`);
          continue;
        }

        // Extra keys rejected — manifest must never carry env values.
        // Emit a targeted message when the extra key is 'value' (secret guard).
        for (const key of Object.keys(entry)) {
          if (!ENV_KEYS.includes(key)) {
            if (key === 'value') {
              errs.push(
                `${ctx}.value is not allowed (manifest must never contain env values)`,
              );
            } else {
              errs.push(`${ctx}.${key} is not allowed`);
            }
          }
        }
        for (const key of ENV_KEYS) {
          if (!(key in entry)) {
            errs.push(`${ctx}.${key} is required`);
          }
        }

        // name
        if ('name' in entry) {
          if (typeof entry.name !== 'string' || !ENV_NAME_RE.test(entry.name)) {
            errs.push(`${ctx}.name must match ^[A-Z][A-Z0-9_]*$`);
          } else {
            if (seenNames.has(entry.name)) {
              errs.push(`${ctx}.name '${entry.name}' is duplicated`);
            } else {
              seenNames.add(entry.name);
            }
          }
        }

        // category
        if ('category' in entry) {
          if (!ENV_CATEGORIES.includes(entry.category as EnvCategory)) {
            errs.push(
              `${ctx}.category must be one of ${ENV_CATEGORIES.map((c) => `'${c}'`).join(', ')}`,
            );
          }
        }

        // required
        if ('required' in entry) {
          if (typeof entry.required !== 'boolean') {
            errs.push(`${ctx}.required must be a boolean`);
          }
        }
      }
    }
  }

  if (errs.length > 0) {
    throw new Error(`Runtime manifest is invalid: ${errs.join('; ')}`);
  }
}

// ---------------------------------------------------------------------------
// saveManifest
// ---------------------------------------------------------------------------

/**
 * Validate then persist a RuntimeManifest to
 * `<workspaceRoot>/.repo2prod/runtime-manifest.json`.
 *
 * Validates before writing — an invalid manifest never reaches disk.
 * Validation errors are re-thrown as-is (not wrapped in the write-error message).
 * Creates `.repo2prod/` if it does not exist.
 * Member A's Bob skills read this file to give Bob context before any edits.
 *
 * @param workspaceRoot - Absolute path to the workspace root.
 * @param manifest      - The RuntimeManifest to serialise.
 * @returns The absolute path of the file written.
 * @throws Validation error (if manifest is invalid), or
 *         "Repo2Prod: failed to write .repo2prod/runtime-manifest.json: <reason>"
 */
export async function saveManifest(
  workspaceRoot: string,
  manifest: RuntimeManifest,
): Promise<string> {
  // Validate before writing — a broken manifest must never reach disk or Bob.
  validateManifest(manifest);

  const dir      = join(workspaceRoot, REPO2PROD_DIR);
  const filePath = join(dir, MANIFEST_FILE);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Repo2Prod: failed to write ${REPO2PROD_DIR}/${MANIFEST_FILE}: ${reason}`,
    );
  }
  return filePath;
}
