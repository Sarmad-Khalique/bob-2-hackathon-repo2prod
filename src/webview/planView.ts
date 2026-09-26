// Repo2Prod plan view renderer.
//
// Pure HTML renderer — takes a PlanViewData snapshot and returns a full HTML
// document string.  NO 'vscode' import (not even a type import): this file must
// be testable with plain Node without a VS Code host.
//
// Honesty rules enforced here:
//   - Never shows RunStatus PASS.  Nothing has been verified yet at plan time.
//   - null means unknown → rendered as "Unknown" or "Bob decides", never guessed.
//   - Env names are shown; env values are never passed in and never rendered.
//   - Every dynamic string is escaped through escapeHtml before insertion.

import type { Evidence, RuntimeManifest, EnvCategory, RunState } from '../core/types';
import type { PlanViewData } from './messages';

// ---------------------------------------------------------------------------
// Security helper
// ---------------------------------------------------------------------------

/**
 * Escape the five HTML-sensitive characters so no dynamic value can inject
 * markup.  Applied to EVERY string sourced from user data / workspace state.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Section renderers (private)
// ---------------------------------------------------------------------------

/** Section 1 — header with current state, repair budget, verification status. */
function renderHeader(state: string, used: number, max: number): string {
  return `
<header class="r2p-header">
  <h1>Repo2Prod — Runtime Plan</h1>
  <table class="r2p-meta">
    <tr><th>Current step</th><td>${escapeHtml(state)}</td></tr>
    <tr><th>Repair attempts</th><td>${escapeHtml(String(used))}/${escapeHtml(String(max))}</td></tr>
    <tr><th>Verification</th><td class="r2p-notrun">NOT_RUN</td></tr>
  </table>
</header>`;
}

/** Section 2 — detected facts from Evidence. */
function renderEvidence(ev: Evidence): string {
  const framework = ev.framework ? escapeHtml(ev.framework) : 'Unknown';
  const dockerfile = ev.dockerfilePresent ? 'Found' : 'Not found';
  const compose = ev.composePresent ? 'Found' : 'Not found';
  const ci = ev.ciPresent ? 'Found' : 'Not found';
  const ports =
    ev.candidatePorts.length > 0
      ? ev.candidatePorts.map((p) => escapeHtml(String(p))).join(', ')
      : 'None observed';
  const git =
    ev.gitDirty === null ? 'Unknown' : ev.gitDirty ? 'Dirty' : 'Clean';

  return `
<section>
  <h2>Detected facts</h2>
  <table class="r2p-table">
    <tr><th>Framework</th><td>${framework}</td></tr>
    <tr><th>Dockerfile</th><td>${dockerfile}</td></tr>
    <tr><th>Compose file</th><td>${compose}</td></tr>
    <tr><th>CI workflow</th><td>${ci}</td></tr>
    <tr><th>Candidate ports</th><td>${ports}</td></tr>
    <tr><th>Git working tree</th><td>${git}</td></tr>
  </table>
</section>`;
}

/** Section 3 — runtime graph: service cards + dependency edges. */
function renderGraph(manifest: RuntimeManifest): string {
  const cards = manifest.services
    .map((svc) => {
      const ports =
        svc.ports.length > 0
          ? svc.ports.map((p) => escapeHtml(String(p))).join(', ')
          : 'Unknown';
      const image = svc.image ? escapeHtml(svc.image) : 'Bob decides';
      return `
    <div class="r2p-card">
      <div class="r2p-card-title">${escapeHtml(svc.name)} <span class="r2p-card-id">(${escapeHtml(svc.id)})</span></div>
      <div><span class="r2p-label">Ports:</span> ${ports}</div>
      <div><span class="r2p-label">Image:</span> ${image}</div>
    </div>`;
    })
    .join('');

  const edges = manifest.edges
    .map(
      (e) =>
        `<div class="r2p-edge">${escapeHtml(e.from)} → ${escapeHtml(e.to)}&nbsp;&nbsp;<span class="r2p-badge">${escapeHtml(e.relation)}</span></div>`,
    )
    .join('');

  const edgesBlock =
    manifest.edges.length > 0
      ? `<div class="r2p-edges">${edges}</div>`
      : '';

  return `
<section>
  <h2>Runtime graph</h2>
  <div class="r2p-cards">${cards}</div>
  ${edgesBlock}
</section>`;
}

/** Human-readable label for each EnvCategory group. */
const CATEGORY_LABEL: Record<EnvCategory, string> = {
  'generated-local-infrastructure': 'Generated locally by Repo2Prod',
  'generated-local-secret': 'Generated locally by Repo2Prod (secure random)',
  'safe-inferred': 'Safe default',
  'user-secret-required': 'You must provide',
  'optional-external': 'Optional',
};

/** Canonical display order for env categories. */
const CATEGORY_ORDER: EnvCategory[] = [
  'generated-local-infrastructure',
  'generated-local-secret',
  'safe-inferred',
  'user-secret-required',
  'optional-external',
];

/** Section 4 — configuration requirements grouped by category. */
function renderEnv(manifest: RuntimeManifest): string {
  if (manifest.env.length === 0) {
    return `
<section>
  <h2>Configuration requirements</h2>
  <p class="r2p-muted">No environment variables detected.</p>
</section>`;
  }

  // Count how many the user must provide — used for the notice above the table.
  const userRequired = manifest.env.filter(
    (e) => e.category === 'user-secret-required',
  );

  // Notice shown only when there are user-required secrets.
  const notice =
    userRequired.length > 0
      ? `<p class="r2p-notice">${escapeHtml(String(userRequired.length))} value(s) must be provided by you before running.</p>`
      : '';

  const groups = CATEGORY_ORDER.map((cat) => {
    const items = manifest.env.filter((e) => e.category === cat);
    if (items.length === 0) return '';

    const rows = items
      .map(
        (e) =>
          `<tr>
            <td class="r2p-env-name">${escapeHtml(e.name)}</td>
            <td>${e.required ? 'required' : 'optional'}</td>
          </tr>`,
      )
      .join('');

    return `
    <div class="r2p-env-group">
      <div class="r2p-env-group-label">${escapeHtml(CATEGORY_LABEL[cat])}</div>
      <table class="r2p-table">
        <thead><tr><th>Name</th><th>Required</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `
<section>
  <h2>Configuration requirements</h2>
  ${notice}
  ${groups}
</section>`;
}

/** Section 5 — unknowns derived from manifest nulls/empties. Nothing invented. */
function renderUnknowns(manifest: RuntimeManifest): string {
  const items: string[] = [];

  // Services with no image
  for (const svc of manifest.services) {
    if (svc.image === null) {
      items.push(`${escapeHtml(svc.id)}: image — Bob decides`);
    }
  }

  // App service (first service, conventionally) with no ports
  const appSvc = manifest.services.find((s) => s.id === 'app');
  if (appSvc && appSvc.ports.length === 0) {
    items.push('app: port — not observed');
  }

  // Commands that are null
  const cmdKeys: Array<keyof typeof manifest.commands> = [
    'build',
    'start',
    'test',
    'healthcheck',
  ];
  for (const key of cmdKeys) {
    if (manifest.commands[key] === null) {
      items.push(`commands.${escapeHtml(key)} — not observed yet`);
    }
  }

  // Stack fields that are null
  const stackKeys: Array<keyof typeof manifest.stack> = [
    'language',
    'framework',
    'packageManager',
  ];
  for (const key of stackKeys) {
    if (manifest.stack[key] === null) {
      items.push(`stack.${escapeHtml(key)} — unknown`);
    }
  }

  const body =
    items.length > 0
      ? `<ul class="r2p-unknowns">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
      : '<p class="r2p-muted">None.</p>';

  return `
<section>
  <h2>Unknowns</h2>
  ${body}
</section>`;
}

/**
 * Section 6 — action buttons.
 * "Approve runtime plan" is shown ONLY when state === 'AWAITING_RUNTIME_PLAN_APPROVAL'.
 * Otherwise a plain-text message is shown so the user understands why the
 * button is absent.
 */
function renderActions(state: string): string {
  // The approve button is only meaningful in the approval-pending state.
  // Button ids (r2p-approve, r2p-reset) are targeted by addEventListener in
  // the nonce'd script — inline onclick attributes are blocked by the CSP.
  const approveBlock =
    state === 'AWAITING_RUNTIME_PLAN_APPROVAL'
      ? `<button id="r2p-approve" class="r2p-btn r2p-btn-primary">Approve runtime plan</button>`
      : `<p class="r2p-muted">Approval available when the plan is ready.</p>`;

  return `
<section class="r2p-actions">
  <h2>Actions</h2>
  ${approveBlock}
  <button id="r2p-reset" class="r2p-btn">Reset run</button>
</section>`;
}

// ---------------------------------------------------------------------------
// Inline CSS
// ---------------------------------------------------------------------------

const STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family, -apple-system, "Segoe UI", system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground, #222);
    background: var(--vscode-editor-background, #fff);
    margin: 0; padding: 16px;
    line-height: 1.6;
  }
  h1 { font-size: 1.3em; margin: 0 0 8px; }
  h2 { font-size: 1.05em; margin: 20px 0 8px; border-bottom: 1px solid var(--vscode-widget-border, #e5e7eb); padding-bottom: 4px; }
  section { margin-bottom: 8px; }
  .r2p-header { margin-bottom: 16px; }
  .r2p-meta { border-collapse: collapse; }
  .r2p-meta th { text-align: left; padding-right: 16px; color: var(--vscode-descriptionForeground, #57606a); font-weight: normal; }
  .r2p-notrun { color: var(--vscode-descriptionForeground, #57606a); font-style: italic; }
  .r2p-table { border-collapse: collapse; width: 100%; max-width: 600px; }
  .r2p-table th, .r2p-table td { padding: 4px 8px; border: 1px solid var(--vscode-widget-border, #e5e7eb); text-align: left; }
  .r2p-table th { background: var(--vscode-sideBar-background, #f7f8fa); font-weight: 600; }
  .r2p-cards { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 10px; }
  .r2p-card { border: 1px solid var(--vscode-widget-border, #e5e7eb); border-radius: 4px; padding: 10px 14px; min-width: 160px; background: var(--vscode-sideBar-background, #f7f8fa); }
  .r2p-card-title { font-weight: 600; margin-bottom: 4px; }
  .r2p-card-id { color: var(--vscode-descriptionForeground, #57606a); font-weight: normal; font-size: 0.9em; }
  .r2p-label { color: var(--vscode-descriptionForeground, #57606a); }
  .r2p-edges { margin-top: 6px; }
  .r2p-edge { margin: 3px 0; font-family: monospace; }
  .r2p-badge { display: inline-block; background: var(--vscode-badge-background, #e8f0fe); color: var(--vscode-badge-foreground, #3b82d4); border-radius: 3px; padding: 0 5px; font-size: 0.85em; }
  .r2p-env-group { margin-bottom: 14px; }
  .r2p-env-group-label { font-weight: 600; margin-bottom: 4px; color: var(--vscode-foreground, #222); }
  .r2p-env-name { font-family: monospace; }
  .r2p-notice { background: var(--vscode-inputValidation-warningBackground, #fff8e1); border: 1px solid var(--vscode-inputValidation-warningBorder, #f5a623); padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; }
  .r2p-unknowns { margin: 0; padding-left: 20px; }
  .r2p-unknowns li { font-family: monospace; }
  .r2p-muted { color: var(--vscode-descriptionForeground, #57606a); margin: 0; }
  .r2p-actions { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .r2p-actions h2 { width: 100%; }
  .r2p-btn { padding: 6px 14px; border: 1px solid var(--vscode-button-border, #ccc); border-radius: 4px; cursor: pointer; background: var(--vscode-button-secondaryBackground, #f0f0f0); color: var(--vscode-button-secondaryForeground, #222); font-size: inherit; }
  .r2p-btn-primary { background: var(--vscode-button-background, #3b82d4); color: var(--vscode-button-foreground, #fff); border-color: transparent; font-weight: 600; }
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a full HTML document for the plan view panel.
 *
 * @param data   - Complete plan snapshot (PlanViewData).
 * @param opts   - nonce for the inline script tag; cspSource from webview.cspSource.
 *
 * Pure function: no side-effects, no vscode import.  Safe to call in tests.
 */
export function renderPlanHtml(
  data: PlanViewData,
  opts: { nonce: string; cspSource: string },
): string {
  const { nonce, cspSource } = opts;
  // Escape opts fields too — even though nonce/cspSource come from VS Code internals,
  // defensive escaping keeps the CSP meta tag and script tag injection-free.
  const safeNonce = escapeHtml(nonce);
  const safeCsp = escapeHtml(cspSource);

  const body = [
    renderHeader(data.state, data.repairAttemptsUsed, data.maxRepairAttempts),
    renderEvidence(data.evidence),
    renderGraph(data.manifest),
    renderEnv(data.manifest),
    renderUnknowns(data.manifest),
    renderActions(data.state),
  ].join('\n');

  // acquireVsCodeApi() must be called exactly once.
  // The nonce attribute is required by the CSP script-src directive.
  // addEventListener is used instead of onclick attributes because the CSP
  // blocks inline event handlers (script-src 'nonce-...' does not cover them).
  // The approve button is disabled after one click to prevent double-approve.
  const script = `
<script nonce="${safeNonce}">
  (function() {
    var vscode = acquireVsCodeApi();
    var approveBtn = document.getElementById('r2p-approve');
    var resetBtn   = document.getElementById('r2p-reset');
    if (approveBtn) {
      approveBtn.addEventListener('click', function() {
        approveBtn.disabled = true;
        vscode.postMessage({ type: 'approvePlan' });
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'resetRun' });
      });
    }
  })();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${safeCsp} 'unsafe-inline'; script-src 'nonce-${safeNonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repo2Prod Plan</title>
  <style>${STYLES}</style>
</head>
<body>
${body}
${script}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Adapter: RunState → PlanViewData
// ---------------------------------------------------------------------------

/**
 * Build a PlanViewData snapshot from the current run state.
 *
 * Returns null if evidence or manifest are not yet available (e.g. analysis
 * has not completed).  Callers must guard on null before opening the panel.
 *
 * @param run               - Current RunState (read-only).
 * @param maxRepairAttempts - Hard cap from state.ts (MAX_REPAIR_ATTEMPTS).
 */
export function toPlanViewData(
  run: Readonly<RunState>,
  maxRepairAttempts: number,
): PlanViewData | null {
  if (run.evidence === null || run.manifest === null) {
    return null;
  }
  return {
    state: run.phase,
    repairAttemptsUsed: run.repairAttempts,
    maxRepairAttempts,
    evidence: run.evidence,
    manifest: run.manifest,
  };
}
