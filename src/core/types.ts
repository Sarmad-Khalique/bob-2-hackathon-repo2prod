// TODO(Member B): shared evidence, manifest, and readiness models live with the analyzers.
// The contracts below are framework-neutral and owned jointly as the cross-module interface.

import type { Repo2ProdState } from './state';

export type RunStatus = 'PASS' | 'FAIL' | 'WARN' | 'NOT_RUN' | 'UNKNOWN';

export type EnvCategory =
  | 'safe-inferred'
  | 'generated-local-secret'
  | 'generated-local-infrastructure'
  | 'user-secret-required'
  | 'optional-external';

/** Deterministic facts collected from the workspace. Values of secrets are never stored. */
export interface Evidence {
  workspaceRoot: string;
  framework: string | null;
  dockerfilePresent: boolean;
  composePresent: boolean;
  ciPresent: boolean;
  envNames: string[];
  candidatePorts: number[];
  gitDirty: boolean | null;
}

export interface StackInfo {
  language: string | null;
  framework: string | null;
  packageManager: string | null;
}

export interface ServiceInfo {
  id: string;
  name: string;
  image: string | null;
  ports: number[];
}

export interface ServiceEdge {
  from: string;
  to: string;
  relation: string;
}

export interface RuntimeCommands {
  build: string | null;
  start: string | null;
  test: string | null;
  healthcheck: string | null;
}

/** Name and classification only. Do not put secret values on this type. */
export interface EnvRequirement {
  name: string;
  category: EnvCategory;
  required: boolean;
}

export interface RuntimeManifest {
  version: 1;
  stack: StackInfo;
  services: ServiceInfo[];
  edges: ServiceEdge[];
  commands: RuntimeCommands;
  env: EnvRequirement[];
}

export interface FailureBundle {
  attempt: number;
  phase: Repo2ProdState;
  command: string | null;
  exitCode: number | null;
  redactedExcerpt: string;
  truncated: boolean;
}

export interface CheckResult {
  id: string;
  status: RunStatus;
  observed: boolean;
  detail: string | null;
}

export interface VerificationResult {
  checks: CheckResult[];
}

export interface ReadinessReport {
  overall: RunStatus;
  checks: CheckResult[];
  repairAttemptsUsed: number;
  summary: string;
}

export interface RunState {
  phase: Repo2ProdState;
  repairAttempts: number;
  evidence: Evidence | null;
  manifest: RuntimeManifest | null;
  failure: FailureBundle | null;
  verification: VerificationResult | null;
  report: ReadinessReport | null;
}
