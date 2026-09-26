// Repo2Prod webview message contracts.
//
// Defines all messages that flow between the VS Code extension host and the
// webview panel, plus PlanViewData — the complete snapshot the panel needs to
// render the runtime-plan view.
//
// Does NOT implement panel logic, rendering, or orchestrator calls.
// Those live in panel.ts and planView.ts respectively.

import type { Evidence, RuntimeManifest } from '../core/types';
// RunStatus is imported only for the readiness message below.
import type { RunStatus } from '../core/types';

// ---------------------------------------------------------------------------
// Plan view data snapshot
// ---------------------------------------------------------------------------

/**
 * Complete snapshot sent to the plan panel for rendering.
 * Produced by the orchestrator (Task 14) and passed directly to openPlanPanel /
 * updatePlanPanel — never mutated by the webview layer.
 *
 * Env names are safe to include. Env values must never appear here.
 */
export interface PlanViewData {
  /** Current Repo2ProdState string value (e.g. 'AWAITING_RUNTIME_PLAN_APPROVAL'). */
  state: string;
  /** How many repair attempts have been used in the current run. */
  repairAttemptsUsed: number;
  /** Hard cap (MAX_REPAIR_ATTEMPTS from state.ts). */
  maxRepairAttempts: number;
  /** Deterministic evidence collected from the workspace. */
  evidence: Evidence;
  /** Runtime manifest produced by buildManifest / validateManifest. */
  manifest: RuntimeManifest;
}

// ---------------------------------------------------------------------------
// Host → webview
// ---------------------------------------------------------------------------

/** Messages the extension host sends into the webview. */
export type HostToWebviewMessage =
  | { readonly type: 'workflowState'; readonly phase: string }
  | { readonly type: 'readiness'; readonly status: RunStatus };

// ---------------------------------------------------------------------------
// Webview → host
// ---------------------------------------------------------------------------

/** Messages the webview sends back to the extension host. */
export type WebviewToHostMessage =
  | { readonly type: 'approvePlan' }
  | { readonly type: 'resetRun' };
