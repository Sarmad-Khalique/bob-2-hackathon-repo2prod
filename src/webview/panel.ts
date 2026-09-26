// Repo2Prod plan view panel — VS Code WebviewPanel host.
//
// Creates and manages the single plan view panel shown to the user after
// workspace analysis.  The panel re-renders its HTML in-place on update rather
// than stacking new tabs (one plan view per window is all that makes sense).
//
// Does NOT call the orchestrator, register commands, or read files from disk.
// Those concerns belong to extension.ts / orchestrator.ts (Task 14).

import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { renderPlanHtml } from './planView';
import type { PlanViewData, WebviewToHostMessage } from './messages';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

// A single panel reference is kept here so openPlanPanel can reveal and
// re-render the same tab instead of spawning a new one on every call.
// Cleared in the onDidDispose listener so stale references are never reused.
let currentPanel: vscode.WebviewPanel | undefined;

// The latest message handler is tracked separately from the panel so that
// a second openPlanPanel call (e.g. after a reset+restart) can replace the
// handler without recreating the panel or re-registering the listener.
let currentHandler: ((msg: WebviewToHostMessage) => void) | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random nonce for the inline script CSP tag. */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Render fresh HTML into (or onto) the webview. */
function applyRender(
  panel: vscode.WebviewPanel,
  data: PlanViewData,
): void {
  const nonce = generateNonce();
  const cspSource = panel.webview.cspSource;
  panel.webview.html = renderPlanHtml(data, { nonce, cspSource });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open (or reveal and update) the Repo2Prod plan panel.
 *
 * Creates the panel on first call.  On subsequent calls with the panel already
 * open it reveals the existing tab and re-renders with fresh data.
 *
 * The onMessage handler is always replaced with the latest value so that
 * callers who open the panel a second time (e.g. after reset) get the
 * correct callback — the listener itself is registered once on panel creation
 * and always delegates to the current handler variable.
 *
 * @param context   - Extension context for disposable registration.
 * @param data      - Plan snapshot to render.
 * @param onMessage - Callback for messages the webview sends back to the host.
 *                    Only 'approvePlan' and 'resetRun' are forwarded; anything
 *                    else is ignored with a console.warn.
 */
export function openPlanPanel(
  context: vscode.ExtensionContext,
  data: PlanViewData,
  onMessage: (msg: WebviewToHostMessage) => void,
): void {
  // Always update the handler so re-opens use the freshest callback.
  currentHandler = onMessage;

  if (currentPanel) {
    // Panel already exists: bring it to the front and push updated data.
    currentPanel.reveal(vscode.ViewColumn.One);
    applyRender(currentPanel, data);
    return;
  }

  // Create a new panel.  localResourceRoots is empty because the plan view
  // is a self-contained HTML string with no external asset references.
  currentPanel = vscode.window.createWebviewPanel(
    'repo2prod.plan',
    'Repo2Prod Plan',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [],
    },
  );

  applyRender(currentPanel, data);

  // Accept only the two known message types; warn loudly on anything else so
  // unexpected messages from the webview are never silently swallowed.
  // Always delegates to currentHandler so re-opens get the latest callback
  // without re-registering a new listener.
  const messageListener = currentPanel.webview.onDidReceiveMessage(
    (raw: unknown) => {
      if (
        raw !== null &&
        typeof raw === 'object' &&
        'type' in raw &&
        (raw as { type: unknown }).type === 'approvePlan'
      ) {
        currentHandler?.({ type: 'approvePlan' });
      } else if (
        raw !== null &&
        typeof raw === 'object' &&
        'type' in raw &&
        (raw as { type: unknown }).type === 'resetRun'
      ) {
        currentHandler?.({ type: 'resetRun' });
      } else {
        console.warn(
          '[Repo2Prod] Received unknown message from plan webview:',
          raw,
        );
      }
    },
  );

  // Clear the module references when the user closes the panel so the next
  // openPlanPanel call creates a fresh one.
  const disposeListener = currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    currentHandler = undefined;
  });

  // Register disposables with the extension context so they are cleaned up
  // when the extension is deactivated, not just when the panel is closed.
  context.subscriptions.push(messageListener, disposeListener);
}

/**
 * Push updated plan data to the currently open panel.
 * No-op if no panel is open — callers do not need to guard against this.
 */
export function updatePlanPanel(data: PlanViewData): void {
  if (!currentPanel) {
    return;
  }
  applyRender(currentPanel, data);
}

/**
 * Close and dispose the plan panel if it is open.
 * No-op if the panel is not open.
 * Used by the resetRun handler to close the panel before triggering reset.
 */
export function closePlanPanel(): void {
  currentPanel?.dispose();
  // dispose() fires onDidDispose, which clears currentPanel and currentHandler.
}
