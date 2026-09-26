// Repo2Prod orchestration layer.
//
// The orchestrator owns workflow state transitions and coordinates
// handoff points between deterministic analysis (Member B), Docker
// execution/verification (Member C), and the Bob Agent skill invocations.
//
// It does NOT implement Docker, framework analysis, or any Member B/C logic.
// Those remain stubs until the respective owners wire them in.

import * as vscode from 'vscode';
import {
  Repo2ProdState,
  MAX_REPAIR_ATTEMPTS,
  assertTransition,
  createInitialRunState,
  loadRunState,
  saveRunState,
  resetRunState,
} from './state';
import { bobSkillManager } from './bobSkills';
import type { RunState, FailureBundle, Evidence, RuntimeManifest } from './types';

// ---------------------------------------------------------------------------
// Repo2ProdOrchestrator
// ---------------------------------------------------------------------------

export class Repo2ProdOrchestrator {
  private workspaceRoot: string = '';
  private workspaceUri: vscode.Uri | null = null;
  private state: RunState = createInitialRunState();

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a new Repo2Prod run.
   * Resets any previous state and transitions: IDLE → PREFLIGHT → ANALYZING_LOCAL.
   * Persists initial state to .repo2prod/run-state.json.
   */
  start(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    this.workspaceUri = vscode.Uri.file(workspaceRoot);

    // Always start fresh — reset any prior run state.
    this.state = createInitialRunState();
    saveRunState(this.workspaceRoot, this.state);

    // IDLE → PREFLIGHT
    this.transition(Repo2ProdState.PREFLIGHT);

    // PREFLIGHT → ANALYZING_LOCAL
    // (Preflight completes deterministically; Member B analysis begins.)
    this.transition(Repo2ProdState.ANALYZING_LOCAL);
  }

  /**
   * Called after Member B analysis succeeds.
   * Stores evidence + manifest on the run state and transitions
   * ANALYZING_LOCAL → AWAITING_RUNTIME_PLAN_APPROVAL.
   */
  completeAnalysis(evidence: Evidence, manifest: RuntimeManifest): void {
    this.assertCurrentState(Repo2ProdState.ANALYZING_LOCAL);
    this.state = { ...this.state, evidence, manifest };
    this.transition(Repo2ProdState.AWAITING_RUNTIME_PLAN_APPROVAL);
  }

  /**
   * Called when the user approves the runtime plan produced by Member B analysis.
   * Installs Bob skills and transitions to BOB_PRODUCTIONIZE_SKILL_READY,
   * then immediately to WAITING_FOR_BOB_PRODUCTIONIZATION.
   */
  async approveRuntimePlan(): Promise<void> {
    this.assertCurrentState(Repo2ProdState.AWAITING_RUNTIME_PLAN_APPROVAL);

    if (!this.workspaceUri) {
      throw new Error('Repo2Prod: workspace not initialized. Run Start Productionization first.');
    }

    // Install Bob productionize skill so it is ready for the user.
    await bobSkillManager.installProductionizeSkill(this.workspaceUri);

    this.transition(Repo2ProdState.BOB_PRODUCTIONIZE_SKILL_READY);

    // Immediately indicate we are now waiting for the user to finish in Bob.
    this.transition(Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION);
  }

  /**
   * Called when the user indicates they have finished in Bob Agent mode
   * (i.e., they ran /repo2prod and Bob has produced runtime config).
   * Transitions to BUILDING — Member C execution begins.
   */
  markBobProductionizationComplete(): void {
    this.assertCurrentState(Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION);
    this.transition(Repo2ProdState.BUILDING);
  }

  /**
   * Called by Member C when a Docker build step begins (BUILDING → STARTING).
   */
  beginStarting(): void {
    this.assertCurrentState(Repo2ProdState.BUILDING);
    this.transition(Repo2ProdState.STARTING);
  }

  /**
   * Called by Member C when containers are up and health checks begin.
   */
  beginVerification(): void {
    this.assertCurrentState(Repo2ProdState.STARTING);
    this.transition(Repo2ProdState.VERIFYING_HEALTH);
  }

  /**
   * Called by Member C when health checks pass and test execution begins.
   */
  beginTests(): void {
    this.assertCurrentState(Repo2ProdState.VERIFYING_HEALTH);
    this.transition(Repo2ProdState.RUNNING_TESTS);
  }

  /**
   * Called by Member C to record a build or runtime failure.
   * Persists the failure bundle and transitions to DIAGNOSTIC_READY.
   */
  recordFailure(bundle: FailureBundle): void {
    const validFrom: Repo2ProdState[] = [
      Repo2ProdState.BUILDING,
      Repo2ProdState.STARTING,
      Repo2ProdState.VERIFYING_HEALTH,
      Repo2ProdState.RUNNING_TESTS,
    ];
    if (!validFrom.includes(this.state.phase)) {
      throw new Error(
        `Repo2Prod: recordFailure called from unexpected state ${this.state.phase}.`,
      );
    }
    this.state = { ...this.state, failure: bundle };
    this.transition(Repo2ProdState.DIAGNOSTIC_READY);
  }

  /**
   * Prepare a Bob repair invocation.
   *
   * - Enforces the MAX_REPAIR_ATTEMPTS cap.
   * - Attempt 2 requires explicit user confirmation (VS Code modal).
   * - Installs the repair skill.
   * - Transitions: DIAGNOSTIC_READY → BOB_REPAIR_SKILL_READY → WAITING_FOR_BOB_REPAIR.
   *
   * Returns false if the user declined attempt 2 confirmation.
   */
  async prepareRepair(): Promise<boolean> {
    this.assertCurrentState(Repo2ProdState.DIAGNOSTIC_READY);

    if (!this.workspaceUri) {
      throw new Error('Repo2Prod: workspace not initialized.');
    }

    const nextAttempt = this.state.repairAttempts + 1;

    if (nextAttempt > MAX_REPAIR_ATTEMPTS) {
      throw new Error(
        `Repair limit reached (${this.state.repairAttempts}/${MAX_REPAIR_ATTEMPTS}). ` +
          'Start a new Repo2Prod run to continue.',
      );
    }

    // Attempt 2 requires explicit confirmation.
    if (nextAttempt === MAX_REPAIR_ATTEMPTS) {
      const answer = await vscode.window.showWarningMessage(
        `Repo2Prod: This is repair attempt ${nextAttempt} of ${MAX_REPAIR_ATTEMPTS} (the last allowed). ` +
          'Continue and run /repo2prod-repair in Bob Agent mode?',
        { modal: true },
        'Continue',
        'Cancel',
      );
      if (answer !== 'Continue') {
        return false;
      }
    }

    // Consume one repair attempt only after confirmation.
    this.state = { ...this.state, repairAttempts: nextAttempt };

    // Install the repair skill so it is ready in Bob.
    await bobSkillManager.installRepairSkill(this.workspaceUri);

    this.transition(Repo2ProdState.BOB_REPAIR_SKILL_READY);
    this.transition(Repo2ProdState.WAITING_FOR_BOB_REPAIR);

    return true;
  }

  /**
   * Called when the user indicates they have finished running /repo2prod-repair in Bob.
   * Transitions back to BUILDING so Member C can retry.
   */
  markBobRepairComplete(): void {
    this.assertCurrentState(Repo2ProdState.WAITING_FOR_BOB_REPAIR);
    this.transition(Repo2ProdState.BUILDING);
  }

  /**
   * Called by Member C when all health checks and tests pass.
   */
  markVerified(): void {
    this.assertCurrentState(Repo2ProdState.RUNNING_TESTS);
    this.transition(Repo2ProdState.VERIFIED);
  }

  /**
   * Prepare Bob CI generation.
   * Installs the CI skill and transitions to BOB_CI_SKILL_READY.
   */
  async prepareCI(): Promise<void> {
    this.assertCurrentState(Repo2ProdState.VERIFIED);

    if (!this.workspaceUri) {
      throw new Error('Repo2Prod: workspace not initialized.');
    }

    await bobSkillManager.installCISkill(this.workspaceUri);

    this.transition(Repo2ProdState.BOB_CI_SKILL_READY);
  }

  /**
   * Move to FINAL_REPORT from either VERIFIED (skip CI) or BOB_CI_SKILL_READY.
   */
  beginFinalReport(): void {
    const validFrom: Repo2ProdState[] = [
      Repo2ProdState.VERIFIED,
      Repo2ProdState.BOB_CI_SKILL_READY,
    ];
    if (!validFrom.includes(this.state.phase)) {
      throw new Error(
        `Repo2Prod: cannot start final report from state ${this.state.phase}.`,
      );
    }
    this.transition(Repo2ProdState.FINAL_REPORT);
  }

  /** Transition to COMPLETE — the run is fully done. */
  complete(): void {
    this.assertCurrentState(Repo2ProdState.FINAL_REPORT);
    this.transition(Repo2ProdState.COMPLETE);
  }

  /**
   * Transition to FAILED explicitly (e.g. on preflight error, analysis error, or
   * after the repair limit is exhausted).
   */
  fail(): void {
    // FAILED is reachable from several states; use assertTransition to validate.
    assertTransition(this.state.phase, Repo2ProdState.FAILED);
    this.applyTransition(Repo2ProdState.FAILED);
  }

  /**
   * Reset the run entirely back to IDLE.
   * Clears workflow metadata only — does NOT delete application files,
   * Docker config, .bob skills, or Git changes.
   */
  reset(): void {
    if (!this.workspaceRoot) {
      // If workspaceRoot was never set (e.g., early reset), create a clean in-memory state only.
      this.state = createInitialRunState();
      return;
    }
    this.state = createInitialRunState();
    resetRunState(this.workspaceRoot);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  currentState(): Repo2ProdState {
    return this.state.phase;
  }

  runState(): Readonly<RunState> {
    return this.state;
  }

  repairAttemptsUsed(): number {
    return this.state.repairAttempts;
  }

  repairAttemptsRemaining(): number {
    return MAX_REPAIR_ATTEMPTS - this.state.repairAttempts;
  }

  /**
   * Load persisted run state from disk (e.g., on extension activation after restart).
   * Returns false if no persisted state exists.
   */
  loadPersistedState(workspaceRoot: string): boolean {
    this.workspaceRoot = workspaceRoot;
    this.workspaceUri = vscode.Uri.file(workspaceRoot);
    const persisted = loadRunState(workspaceRoot);
    if (persisted === null) {
      return false;
    }
    this.state = persisted;
    return true;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private transition(to: Repo2ProdState): void {
    assertTransition(this.state.phase, to);
    this.applyTransition(to);
  }

  private applyTransition(to: Repo2ProdState): void {
    this.state = { ...this.state, phase: to };
    if (this.workspaceRoot) {
      try {
        saveRunState(this.workspaceRoot, this.state);
      } catch (err) {
        // Non-fatal: warn but do not abort the transition.
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showWarningMessage(message);
      }
    }
  }

  private assertCurrentState(expected: Repo2ProdState): void {
    if (this.state.phase !== expected) {
      throw new Error(
        `Repo2Prod: cannot perform this action while state is ${this.state.phase}. ` +
          `Expected state: ${expected}.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared singleton — command handlers import this instance.
// ---------------------------------------------------------------------------

export const orchestrator = new Repo2ProdOrchestrator();
