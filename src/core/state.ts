// Workflow state machine — state enum, transition map, persistence helpers.

import * as fs from 'fs';
import * as path from 'path';
import type { RunState } from './types';

// ---------------------------------------------------------------------------
// State enum
// ---------------------------------------------------------------------------

export enum Repo2ProdState {
  IDLE = 'IDLE',
  PREFLIGHT = 'PREFLIGHT',
  ANALYZING_LOCAL = 'ANALYZING_LOCAL',
  AWAITING_RUNTIME_PLAN_APPROVAL = 'AWAITING_RUNTIME_PLAN_APPROVAL',
  BOB_PRODUCTIONIZE_SKILL_READY = 'BOB_PRODUCTIONIZE_SKILL_READY',
  WAITING_FOR_BOB_PRODUCTIONIZATION = 'WAITING_FOR_BOB_PRODUCTIONIZATION',
  BUILDING = 'BUILDING',
  STARTING = 'STARTING',
  DIAGNOSTIC_READY = 'DIAGNOSTIC_READY',
  BOB_REPAIR_SKILL_READY = 'BOB_REPAIR_SKILL_READY',
  WAITING_FOR_BOB_REPAIR = 'WAITING_FOR_BOB_REPAIR',
  VERIFYING_HEALTH = 'VERIFYING_HEALTH',
  RUNNING_TESTS = 'RUNNING_TESTS',
  VERIFIED = 'VERIFIED',
  BOB_CI_SKILL_READY = 'BOB_CI_SKILL_READY',
  FINAL_REPORT = 'FINAL_REPORT',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

// ---------------------------------------------------------------------------
// Repair-attempt budget (hackathon hard cap — do not increase)
// ---------------------------------------------------------------------------

/** Product-level cap on Bob repair invocations per run. Not a generic retry count. */
export const MAX_REPAIR_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Allowed transitions
// ---------------------------------------------------------------------------

/** Explicit map of valid forward transitions. Any transition not listed here is rejected. */
export const ALLOWED_TRANSITIONS: Record<Repo2ProdState, Repo2ProdState[]> = {
  [Repo2ProdState.IDLE]: [Repo2ProdState.PREFLIGHT],

  [Repo2ProdState.PREFLIGHT]: [
    Repo2ProdState.ANALYZING_LOCAL,
    Repo2ProdState.FAILED,
  ],

  [Repo2ProdState.ANALYZING_LOCAL]: [
    Repo2ProdState.AWAITING_RUNTIME_PLAN_APPROVAL,
    Repo2ProdState.FAILED,
  ],

  [Repo2ProdState.AWAITING_RUNTIME_PLAN_APPROVAL]: [
    Repo2ProdState.BOB_PRODUCTIONIZE_SKILL_READY,
    Repo2ProdState.FAILED,
  ],

  [Repo2ProdState.BOB_PRODUCTIONIZE_SKILL_READY]: [
    Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION,
  ],

  [Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION]: [
    Repo2ProdState.BUILDING,
    Repo2ProdState.FAILED,
  ],

  [Repo2ProdState.BUILDING]: [
    Repo2ProdState.STARTING,
    Repo2ProdState.DIAGNOSTIC_READY,
  ],

  [Repo2ProdState.STARTING]: [
    Repo2ProdState.VERIFYING_HEALTH,
    Repo2ProdState.DIAGNOSTIC_READY,
  ],

  [Repo2ProdState.VERIFYING_HEALTH]: [
    Repo2ProdState.RUNNING_TESTS,
    Repo2ProdState.DIAGNOSTIC_READY,
  ],

  [Repo2ProdState.RUNNING_TESTS]: [
    Repo2ProdState.VERIFIED,
    Repo2ProdState.DIAGNOSTIC_READY,
  ],

  [Repo2ProdState.DIAGNOSTIC_READY]: [
    Repo2ProdState.BOB_REPAIR_SKILL_READY,
    Repo2ProdState.FAILED,
  ],

  [Repo2ProdState.BOB_REPAIR_SKILL_READY]: [
    Repo2ProdState.WAITING_FOR_BOB_REPAIR,
  ],

  [Repo2ProdState.WAITING_FOR_BOB_REPAIR]: [
    Repo2ProdState.BUILDING,
    Repo2ProdState.FAILED,
  ],

  [Repo2ProdState.VERIFIED]: [
    Repo2ProdState.BOB_CI_SKILL_READY,
    Repo2ProdState.FINAL_REPORT,
  ],

  [Repo2ProdState.BOB_CI_SKILL_READY]: [
    Repo2ProdState.FINAL_REPORT,
  ],

  [Repo2ProdState.FINAL_REPORT]: [
    Repo2ProdState.COMPLETE,
  ],

  // Terminal states — no further transitions allowed.
  [Repo2ProdState.COMPLETE]: [],
  [Repo2ProdState.FAILED]: [],
};

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

/**
 * Validate that a state transition is permitted.
 * Throws a descriptive error on invalid transitions.
 */
export function assertTransition(from: Repo2ProdState, to: Repo2ProdState): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Repo2Prod: invalid state transition ${from} → ${to}. ` +
        `Allowed from ${from}: [${allowed.join(', ') || 'none'}].`,
    );
  }
}

// ---------------------------------------------------------------------------
// Initial run state
// ---------------------------------------------------------------------------

export function createInitialRunState(): RunState {
  return {
    phase: Repo2ProdState.IDLE,
    repairAttempts: 0,
    evidence: null,
    manifest: null,
    failure: null,
    verification: null,
    report: null,
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const REPO2PROD_DIR = '.repo2prod';
const RUN_STATE_FILE = 'run-state.json';

function runStateFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REPO2PROD_DIR, RUN_STATE_FILE);
}

/**
 * Persist lightweight run-state metadata to .repo2prod/run-state.json.
 * Never writes secret values — the RunState type guarantees this by design.
 * Throws with a clear message if the file cannot be written.
 */
export function saveRunState(workspaceRoot: string, state: RunState): void {
  const dir = path.join(workspaceRoot, REPO2PROD_DIR);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = runStateFilePath(workspaceRoot);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Repo2Prod: failed to persist run state to ${REPO2PROD_DIR}/${RUN_STATE_FILE}: ${message}`,
    );
  }
}

/**
 * Load the persisted run state from .repo2prod/run-state.json.
 * Returns null if the file does not exist.
 * Throws with a clear message if the file exists but cannot be parsed.
 */
export function loadRunState(workspaceRoot: string): RunState | null {
  const filePath = runStateFilePath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as RunState;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Repo2Prod: run state is invalid or corrupted (${REPO2PROD_DIR}/${RUN_STATE_FILE}): ${message}`,
    );
  }
}

/**
 * Reset run state to IDLE and overwrite the persisted file.
 * Does NOT delete application files, Docker config, .bob skills, or Git changes.
 */
export function resetRunState(workspaceRoot: string): void {
  const initial = createInitialRunState();
  saveRunState(workspaceRoot, initial);
}
