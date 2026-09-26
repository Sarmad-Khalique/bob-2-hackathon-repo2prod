// startProductionization command handler.
//
// Wires the full analysis-to-plan-view flow:
//   IDLE → PREFLIGHT → ANALYZING_LOCAL
//        → runLocalAnalysis (progress notification)
//        → AWAITING_RUNTIME_PLAN_APPROVAL
//        → openPlanPanel
//        → user clicks "Approve runtime plan" → approveRuntimePlan()
//          → "Run /repo2prod in Bob Agent mode."
//        → user clicks "Reset run" → closePlanPanel + repo2prod.resetRun
//
// Member A file — narrow cross-boundary change agreed with Member B (Task 14).
// This file does NOT implement analysis, rendering, or Bob skills; those live
// in src/analyzers/, src/webview/, and src/core/bobSkills.ts respectively.

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { MAX_REPAIR_ATTEMPTS } from '../core/state';
import { runLocalAnalysis } from '../analyzers/runAnalysis';
import { openPlanPanel, updatePlanPanel, closePlanPanel } from '../webview/panel';
import { toPlanViewData } from '../webview/planView';
import type { WebviewToHostMessage } from '../webview/messages';

export function registerStartProductionization(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.startProductionization', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder and try again.',
        );
        return;
      }

      const workspaceRoot = folders[0].uri.fsPath;

      try {
        orchestrator.start(workspaceRoot);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: Failed to start — ${message}`);
        return;
      }

      // -----------------------------------------------------------------------
      // Run Member B analysis with a progress notification
      // -----------------------------------------------------------------------

      let result: Awaited<ReturnType<typeof runLocalAnalysis>>;
      try {
        result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Repo2Prod: analyzing workspace…',
            cancellable: false,
          },
          () => runLocalAnalysis(workspaceRoot),
        );
      } catch (err) {
        // Analysis failed: transition to FAILED and surface the real error.
        // Reuse the existing fail() method — no new failure path needed.
        orchestrator.fail();
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: analysis failed — ${message}`);
        return;
      }

      // -----------------------------------------------------------------------
      // Transition to AWAITING_RUNTIME_PLAN_APPROVAL + open plan panel
      // -----------------------------------------------------------------------

      orchestrator.completeAnalysis(result.evidence, result.manifest);

      const data = toPlanViewData(orchestrator.runState(), MAX_REPAIR_ATTEMPTS);
      if (data === null) {
        // Guard: should not happen because completeAnalysis just set both fields.
        orchestrator.fail();
        void vscode.window.showErrorMessage(
          'Repo2Prod: analysis produced no data — run state is inconsistent.',
        );
        return;
      }

      openPlanPanel(context, data, handlePlanMessage);

      void vscode.window.showInformationMessage(
        'Repo2Prod: runtime plan ready. Review it and click Approve.',
      );

      // -----------------------------------------------------------------------
      // Plan message handler (local — captures context and orchestrator)
      // -----------------------------------------------------------------------

      function handlePlanMessage(msg: WebviewToHostMessage): void {
        if (msg.type === 'approvePlan') {
          void (async () => {
            try {
              await orchestrator.approveRuntimePlan();
              // Refresh the panel to reflect the new state.
              const updated = toPlanViewData(orchestrator.runState(), MAX_REPAIR_ATTEMPTS);
              if (updated !== null) {
                updatePlanPanel(updated);
              }
              void vscode.window.showInformationMessage(
                'Run /repo2prod in Bob Agent mode.',
              );
            } catch (err) {
              // Surface the real error — e.g. clicking Approve twice produces a
              // clear state-machine error; never swallow it.
              const message = err instanceof Error ? err.message : String(err);
              void vscode.window.showErrorMessage(`Repo2Prod: ${message}`);
            }
          })();
        } else if (msg.type === 'resetRun') {
          // Close the panel first, then delegate to Member A's reset command.
          // Reusing the existing command avoids duplicating reset logic here.
          closePlanPanel();
          void vscode.commands.executeCommand('repo2prod.resetRun');
        }
      }
    }),
  );
}
