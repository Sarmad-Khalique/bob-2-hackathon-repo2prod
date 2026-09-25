// TODO(Member A): generate .bob/commands/repo2prod.md, repo2prod-repair.md, and repo2prod-ci.md.

export interface BobCommandContext {
  workspaceRoot: string;
}

export function writeProductionizeCommand(_context: BobCommandContext): void {
  throw new Error('Not implemented');
}

export function writeRepairCommand(_context: BobCommandContext): void {
  throw new Error('Not implemented');
}

export function writeCICommand(_context: BobCommandContext): void {
  throw new Error('Not implemented');
}
