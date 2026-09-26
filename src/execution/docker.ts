// Docker availability checks for Repo2Prod. No build/push/prune logic here.
// Must never import vscode, never prune global Docker resources, never log env values.

import { formatCommand } from './processRunner.js';
import type { ProcessRunner, CommandOutcome } from './processRunner.js';

/** Checks whether the Docker CLI and daemon are available, returns version or error message. */
export async function checkDocker(
  runner: ProcessRunner,
  cwd: string,
): Promise<CommandOutcome & { serverVersion: string | null; message: string }> {
  const args = ['version', '--format', '{{.Server.Version}}'];
  const command = formatCommand('docker', args);
  const run = await runner({ cwd, command: 'docker', args, timeoutMs: 15_000 });

  if (run.spawnError) {
    return { command, ok: false, run, serverVersion: null, message: 'Docker CLI not found. Install Docker Desktop and retry.' };
  }

  if (run.exitCode !== 0) {
    // Non-zero exit typically means the daemon is not running.
    return { command, ok: false, run, serverVersion: null, message: 'Docker is not running. Start Docker and retry.' };
  }

  const serverVersion = run.stdout.trim() || null;
  return { command, ok: true, run, serverVersion, message: `Docker ${serverVersion ?? '(version unknown)'}` };
}
