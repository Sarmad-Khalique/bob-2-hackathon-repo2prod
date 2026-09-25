// TODO(Member B): host/webview messages for workflow status and the readiness report.

import type { RunStatus } from '../core/types';

export type HostToWebviewMessage =
  | { readonly type: 'workflowState'; readonly phase: string }
  | { readonly type: 'readiness'; readonly status: RunStatus };

export type WebviewToHostMessage =
  | { readonly type: 'approvePlan' }
  | { readonly type: 'resetRun' };
