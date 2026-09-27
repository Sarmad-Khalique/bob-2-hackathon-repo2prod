// Bounded, cancellable child-process execution. No Docker logic here.
// Must never import vscode, never throw on non-zero exit, never log env vars.

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

/** Options for a single process invocation. */
export interface ProcessRunOptions {
  cwd: string;
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Max bytes to keep from each stream's tail. Default 65536 (64 KiB). */
  maxOutputBytes?: number;
}

/** Result of a completed process invocation — never throws on non-zero exit. */
export interface ProcessRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  cancelled: boolean;
  /** Set when the OS could not spawn the process (e.g. command not found). */
  spawnError: string | null;
}

/** Shared envelope returned by every docker/compose wrapper. */
export interface CommandOutcome {
  command: string;
  ok: boolean;
  run: ProcessRunResult;
}

/** Function signature for running a subprocess. */
export type ProcessRunner = (options: ProcessRunOptions) => Promise<ProcessRunResult>;

/** Returns a display-friendly command string, quoting args that contain spaces. */
export function formatCommand(command: string, args: readonly string[]): string {
  const parts = [command, ...args].map(a => (a.includes(' ') ? `"${a}"` : a));
  return parts.join(' ');
}

/** Truncates `buf` to at most `maxBytes`, keeping the tail (most recent output). */
function truncateTail(buf: Buffer, maxBytes: number): { text: string; truncated: boolean } {
  if (buf.length <= maxBytes) {
    return { text: buf.toString('utf8'), truncated: false };
  }
  // Keep the last maxBytes; a cut multi-byte character at the boundary is acceptable.
  return { text: buf.subarray(buf.length - maxBytes).toString('utf8'), truncated: true };
}

/**
 * Sends SIGTERM, then SIGKILL after 3 s — handles processes that ignore SIGTERM.
 * Returns the SIGKILL timer so the caller can clear it when the process has exited.
 */
function killProcess(child: ReturnType<typeof spawn>): ReturnType<typeof setTimeout> {
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
  const killTimer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }, 3000);
  // unref() so this timer alone cannot keep Node alive if everything else has settled.
  killTimer.unref();
  return killTimer;
}

/**
 * Runs a command with shell:false, bounded output, optional timeout and AbortSignal.
 * Resolves (never rejects) with the full result including exit code and flags.
 */
export const runProcess: ProcessRunner = async (options) => {
  const {
    cwd,
    command,
    args,
    env,
    timeoutMs,
    signal,
    maxOutputBytes = 65536,
  } = options;

  const start = Date.now();

  // Resolve immediately if the caller already aborted before we start.
  if (signal?.aborted) {
    return {
      exitCode: null, stdout: '', stderr: '',
      timedOut: false, stdoutTruncated: false, stderrTruncated: false,
      cancelled: true, spawnError: null, durationMs: 0,
    };
  }

  // Check the working directory first; Node's ENOENT on a bad cwd looks the
  // same as a missing command, so we disambiguate proactively.
  try {
    const s = await stat(cwd);
    if (!s.isDirectory()) {
      return {
        exitCode: null, stdout: '', stderr: '',
        timedOut: false, stdoutTruncated: false, stderrTruncated: false,
        cancelled: false, spawnError: `Working directory not found: ${cwd}`,
        durationMs: Date.now() - start,
      };
    }
  } catch {
    return {
      exitCode: null, stdout: '', stderr: '',
      timedOut: false, stdoutTruncated: false, stderrTruncated: false,
      cancelled: false, spawnError: `Working directory not found: ${cwd}`,
      durationMs: Date.now() - start,
    };
  }

  return new Promise<ProcessRunResult>(resolve => {
    const child = spawn(command, args as string[], {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Rolling buffers: we track total bytes per stream and drop the oldest
    // chunk once the running total exceeds maxOutputBytes, so long-running
    // processes never accumulate unbounded memory.
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (
      exitCode: number | null,
      spawnError: string | null,
      overrides?: { timedOut?: boolean; cancelled?: boolean }
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      // Clear the SIGKILL timer so it doesn't keep Node alive after close.
      if (killTimer !== undefined) clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      const rawOut = Buffer.concat(stdoutChunks);
      const rawErr = Buffer.concat(stderrChunks);
      const { text: stdout, truncated: stdoutTruncated } = truncateTail(rawOut, maxOutputBytes);
      const { text: stderr, truncated: stderrTruncated } = truncateTail(rawErr, maxOutputBytes);
      resolve({
        exitCode, spawnError,
        stdout, stderr,
        stdoutTruncated, stderrTruncated,
        timedOut: overrides?.timedOut ?? timedOut,
        cancelled: overrides?.cancelled ?? cancelled,
        durationMs: Date.now() - start,
      });
    };

    // Command not found — OS could not exec the binary.
    child.on('error', (err: NodeJS.ErrnoException) => {
      const msg = err.code === 'ENOENT'
        ? `Command not found: ${command}`
        : `Spawn error: ${err.message}`;
      finish(null, msg, { timedOut: false, cancelled: false });
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
      // Drop the oldest chunk once we exceed the budget; the final truncateTail
      // will slice the exact tail we need, so dropping whole chunks here is safe.
      while (stdoutBytes > maxOutputBytes && stdoutChunks.length > 1) {
        stdoutBytes -= stdoutChunks[0].length;
        stdoutChunks.shift();
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > maxOutputBytes && stderrChunks.length > 1) {
        stderrBytes -= stderrChunks[0].length;
        stderrChunks.shift();
      }
    });

    // Use 'close' (not 'exit') so all piped output is fully flushed before resolving.
    child.on('close', (code) => {
      finish(code, null);
    });

    // Timeout: SIGTERM first, then SIGKILL; timedOut flag marks the cause.
    const timeoutHandle = timeoutMs
      ? setTimeout(() => {
        if (settled) return;
        timedOut = true;
        killTimer = killProcess(child);
      }, timeoutMs)
      : undefined;

    // AbortSignal: same kill sequence as timeout, but sets cancelled instead.
    function onAbort(): void {
      if (settled) return;
      cancelled = true;
      killTimer = killProcess(child);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};
