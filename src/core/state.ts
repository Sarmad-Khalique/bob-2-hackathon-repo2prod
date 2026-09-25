// TODO(Member A): workflow state. Transition logic is not implemented yet.

import type { RunState } from './types';

export enum Repo2ProdState {
  IDLE = 'IDLE',
  PREFLIGHT = 'PREFLIGHT',
  ANALYZING_LOCAL = 'ANALYZING_LOCAL',
  AWAITING_RUNTIME_PLAN_APPROVAL = 'AWAITING_RUNTIME_PLAN_APPROVAL',
  BOB_PRODUCTIONIZE_COMMAND_READY = 'BOB_PRODUCTIONIZE_COMMAND_READY',
  WAITING_FOR_BOB_PRODUCTIONIZATION = 'WAITING_FOR_BOB_PRODUCTIONIZATION',
  BUILDING = 'BUILDING',
  STARTING = 'STARTING',
  DIAGNOSTIC_READY = 'DIAGNOSTIC_READY',
  BOB_REPAIR_COMMAND_READY = 'BOB_REPAIR_COMMAND_READY',
  WAITING_FOR_BOB_REPAIR = 'WAITING_FOR_BOB_REPAIR',
  VERIFYING_HEALTH = 'VERIFYING_HEALTH',
  RUNNING_TESTS = 'RUNNING_TESTS',
  VERIFIED = 'VERIFIED',
  BOB_CI_COMMAND_READY = 'BOB_CI_COMMAND_READY',
  FINAL_REPORT = 'FINAL_REPORT',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

/** Product cap from the hackathon rules. Not a transition implementation. */
export const MAX_REPAIR_ATTEMPTS = 2;

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
