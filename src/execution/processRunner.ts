// TODO(Member C): subprocess execution with timeout and cancellation. No Docker orchestration in this scaffold.

export interface ProcessRunOptions {
  cwd: string;
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export interface ProcessRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface ProcessHandle {
  cancel(): void;
}

export type ProcessRunner = (options: ProcessRunOptions) => Promise<ProcessRunResult>;
