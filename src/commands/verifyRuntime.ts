// verifyRuntime command handler.
//
// Signals that the user has finished in Bob Agent mode (ran /repo2prod or
// /repo2prod-repair) and Repo2Prod should now build, start, health-check,
// and test the application inside Docker/Compose.
//
// Valid from:
//   WAITING_FOR_BOB_PRODUCTIONIZATION  →  BUILDING  →  …  →  VERIFIED
//   WAITING_FOR_BOB_REPAIR             →  BUILDING  →  …  →  VERIFIED
//
// On failure: writes .repo2prod/diagnostics/latest.json and transitions to
// DIAGNOSTIC_READY. After MAX_REPAIR_ATTEMPTS the run is marked FAILED.
//
// On internal error (null manifest, unexpected exception): transitions to
// FAILED directly; does NOT write latest.json (Bob must not repair a
// Repo2Prod bug).

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState, MAX_REPAIR_ATTEMPTS } from '../core/state';
import { redactText } from '../core/redaction';
import {
  buildVerifyOptions,
  runVerification,
  type ExecutionPhase,
} from '../execution/verifier';
import { runProcess } from '../execution/processRunner';
import {
  createFailureBundle,
  writeFailureBundle,
  clearDiagnostics,
} from '../execution/diagnostics';

// Output channel is created lazily and reused for the lifetime of the extension.
let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Repo2Prod');
  }
  return outputChannel;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerVerifyRuntime(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.verifyRuntime', async () => {
      // ── Step 1: resolve workspace root ──────────────────────────────────
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder and try again.',
        );
        return;
      }
      const root = folders[0].uri.fsPath;

      // ── Step 2: restore state after Bob window reload if needed ─────────
      // IDLE means the extension was reloaded (e.g. for skill discovery) and
      // lost its in-memory state. Restore from disk before checking validity.
      if (orchestrator.currentState() === Repo2ProdState.IDLE) {
        orchestrator.loadPersistedState(root);
      }

      const current = orchestrator.currentState();
      const validFrom: Repo2ProdState[] = [
        Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION,
        Repo2ProdState.WAITING_FOR_BOB_REPAIR,
      ];

      if (!validFrom.includes(current)) {
        void vscode.window.showErrorMessage(
          `Repo2Prod: cannot verify runtime while state is ${current}. ` +
            `Run this command after Bob has finished (state must be ` +
            `WAITING_FOR_BOB_PRODUCTIONIZATION or WAITING_FOR_BOB_REPAIR).`,
        );
        return;
      }

      // ── Step 3: capture pre-transition context ───────────────────────────
      // Read previous bundle BEFORE recordFailure() overwrites state.failure.
      const firstRun =
        current === Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION &&
        orchestrator.repairAttemptsUsed() === 0;
      const previous = orchestrator.runState().failure;

      if (firstRun) {
        // Remove diagnostics from any prior run so Bob sees only fresh output.
        await clearDiagnostics(root);
      }

      // ── Step 4: advance to BUILDING ──────────────────────────────────────
      try {
        if (current === Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION) {
          orchestrator.markBobProductionizationComplete();
        } else {
          orchestrator.markBobRepairComplete();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: ${message}`);
        return;
      }

      // ── Step 5: resolve manifest ─────────────────────────────────────────
      const manifest = orchestrator.runState().manifest;
      if (manifest === null) {
        // Manifest should always be present here — treat as internal error.
        await handleInternalError(root, 'manifest is null — run Start Productionization first');
        return;
      }

      // ── Steps 6–9: run verification inside progress notification ─────────
      // Not cancellable: the state machine has no cancel route; per-command
      // timeouts already bound the run.
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Repo2Prod: verifying runtime',
          cancellable: false,
        },
        async (progress) => {
          const channel = getChannel();
          channel.show(true);

          try {
            const options = await buildVerifyOptions(root, manifest);

            const onPhase = (phase: ExecutionPhase): void => {
              const labels: Record<ExecutionPhase, string> = {
                BUILDING: 'Building Docker image…',
                STARTING: 'Starting containers…',
                VERIFYING_HEALTH: 'Checking health…',
                RUNNING_TESTS: 'Running tests…',
              };
              const label = labels[phase];
              progress.report({ message: label });
              channel.appendLine(`[phase] ${phase}`);

              // BUILDING is already the current state; only advance for later phases.
              if (phase === 'STARTING') orchestrator.beginStarting();
              else if (phase === 'VERIFYING_HEALTH') orchestrator.beginVerification();
              else if (phase === 'RUNNING_TESTS') orchestrator.beginTests();
            };

            const outcome = await runVerification(options, runProcess, onPhase);

            // ── Step 8: always record the verification result ──────────────
            orchestrator.recordVerification(outcome.result);

            // Log each check result to the output channel.
            for (const check of outcome.result.checks) {
              const detail = check.detail ? ` — ${redactText(check.detail)}` : '';
              channel.appendLine(`[check] ${check.id}: ${check.status}${detail}`);
            }

            if (outcome.cancelled) {
              // Should not happen (no AbortSignal passed), treat as internal error.
              await handleInternalError(root, 'verification was unexpectedly cancelled');
              return;
            }

            if (outcome.failure === null) {
              // ── Step 9a: success ──────────────────────────────────────────
              orchestrator.markVerified();
              const healthCheck = outcome.result.checks.find(c => c.id === 'health');
              const testsCheck  = outcome.result.checks.find(c => c.id === 'tests');
              const healthStatus = healthCheck?.status ?? 'UNKNOWN';
              const testsStatus  = testsCheck?.status  ?? 'UNKNOWN';
              void vscode.window.showInformationMessage(
                `Repo2Prod: runtime VERIFIED (health ${healthStatus}, tests ${testsStatus}). ` +
                  `Next: Repo2Prod: Prepare CI.`,
              );
            } else {
              // ── Step 9b: failure ──────────────────────────────────────────
              const bundle = await createFailureBundle({
                attempt: orchestrator.repairAttemptsUsed(),
                outcome,
                workspaceRoot: root,
                // Only include previous-run context if a repair has already been attempted.
                previous:
                  previous && orchestrator.repairAttemptsUsed() > 0
                    ? { attempt: previous.attempt, phase: String(previous.phase) }
                    : null,
              });
              const latestPath = await writeFailureBundle(root, bundle);
              orchestrator.recordFailure(bundle);

              channel.appendLine(`[diagnostics] ${redactText(latestPath)}`);

              if (orchestrator.repairAttemptsUsed() >= MAX_REPAIR_ATTEMPTS) {
                orchestrator.fail();
                void vscode.window.showErrorMessage(
                  `Repair limit reached (2/2). Repo2Prod stopped to avoid further ` +
                    `Bobcoin usage. See .repo2prod/diagnostics/latest.json.`,
                );
              } else {
                const failedPhase = outcome.failedPhase ?? 'UNKNOWN';
                const failedCheck = outcome.result.checks.find(
                  c => c.id === outcome.failure?.checkId,
                );
                const detail = failedCheck?.detail ?? outcome.failure?.checkId ?? 'unknown';
                void vscode.window.showErrorMessage(
                  `Repo2Prod: verification failed at ${failedPhase} - ${redactText(detail)}. ` +
                    `Run 'Repo2Prod: Prepare Repair', then /repo2prod-repair in Bob Agent mode.`,
                  'Open diagnostics',
                ).then(selection => {
                  if (selection === 'Open diagnostics') {
                    void vscode.commands.executeCommand(
                      'vscode.open',
                      vscode.Uri.file(latestPath),
                    );
                  }
                });
              }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await handleInternalError(root, message);
          }
        },
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Internal-error helper
// ---------------------------------------------------------------------------

// Skips writing latest.json — Bob must not attempt to repair a Repo2Prod bug.
async function handleInternalError(root: string, rawMessage: string): Promise<void> {
  const message = redactText(rawMessage);
  const channel = getChannel();
  channel.appendLine(`[internal error] ${message}`);

  const execStates: Repo2ProdState[] = [
    Repo2ProdState.BUILDING,
    Repo2ProdState.STARTING,
    Repo2ProdState.VERIFYING_HEALTH,
    Repo2ProdState.RUNNING_TESTS,
  ];

  if (execStates.includes(orchestrator.currentState())) {
    const bundle = {
      attempt: orchestrator.repairAttemptsUsed(),
      phase: orchestrator.currentState(),
      command: null,
      exitCode: null,
      redactedExcerpt: `Repo2Prod internal error: ${message}`,
      truncated: false,
    };
    orchestrator.recordFailure(bundle);
    orchestrator.fail();
  }

  void vscode.window.showErrorMessage(
    `Repo2Prod internal error during verification: ${message}. ` +
      `Run 'Repo2Prod: Reset Run' to start over.`,
  );
}
