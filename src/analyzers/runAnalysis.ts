// Repo2Prod local analysis pipeline.
//
// Runs all deterministic analyzers in sequence, validates the result, and
// persists evidence + manifest to .repo2prod/.
//
// This file does NOT:
//   - import 'vscode' (stays testable with plain Node)
//   - call Bob or any LLM
//   - run Docker or any child process
//   - read .env or any env-var values
//   - catch and hide errors (all failures propagate to the caller)
//
// Note: analyzeFramework and analyzeEnv are called here directly, and are
// also called internally by analyzeWorkspace.  This is intentional duplication
// accepted for the hackathon: small repos make the extra work negligible, and
// having explicit inputs to buildManifest keeps the code simple to follow.

import type { Evidence, RuntimeManifest } from '../core/types';
import { analyzeWorkspace } from './workspaceAnalyzer';
import { analyzeFramework } from './frameworkAnalyzer';
import { analyzeEnv } from './envAnalyzer';
import { buildManifest, validateManifest } from '../core/manifest';
import { saveEvidence } from '../core/evidence';
import { saveManifest } from '../core/manifest';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The full output of a successful local analysis run.
 * Both paths are inside `<root>/.repo2prod/`.
 */
export interface AnalysisResult {
  /** Deterministic evidence collected from the workspace. */
  evidence: Evidence;
  /** Validated runtime manifest built from evidence + stack + env. */
  manifest: RuntimeManifest;
  /** Absolute path of the written evidence.json file. */
  evidencePath: string;
  /** Absolute path of the written runtime-manifest.json file. */
  manifestPath: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full local analysis pipeline for the repository at `root`.
 *
 * Steps:
 * 1. analyzeWorkspace(root)              — validates root, collects Evidence
 * 2. analyzeFramework + analyzeEnv       — parallel; produce stack + env inputs
 * 3. buildManifest({ evidence, stack, env }) — constructs RuntimeManifest
 * 4. validateManifest(manifest)          — asserts shape is correct
 * 5. saveEvidence / saveManifest         — persist to .repo2prod/
 *
 * All errors propagate unchanged to the caller — no catch-and-hide here.
 * The caller (startProductionization.ts) is responsible for showing the error
 * and transitioning the orchestrator to FAILED.
 *
 * @param root - Absolute path to the repository root.
 * @returns Resolved AnalysisResult with paths to the written files.
 */
export async function runLocalAnalysis(root: string): Promise<AnalysisResult> {
  // Step 1: collect Evidence (also validates root — throws if missing/not dir)
  const evidence = await analyzeWorkspace(root);

  // Step 2: analyzeFramework and analyzeEnv in parallel.
  // analyzeWorkspace already ran these internally, but we need the typed
  // StackInfo and EnvRequirement[] shapes separately as buildManifest inputs.
  const [stack, env] = await Promise.all([
    analyzeFramework(root),
    analyzeEnv(root),
  ]);

  // Step 3: build the manifest
  const manifest = buildManifest({ evidence, stack, env });

  // Step 4: validate shape (throws on schema violations)
  validateManifest(manifest);

  // Step 5: persist both artefacts
  const evidencePath = await saveEvidence(root, evidence);
  const manifestPath = await saveManifest(root, manifest);

  return { evidence, manifest, evidencePath, manifestPath };
}
