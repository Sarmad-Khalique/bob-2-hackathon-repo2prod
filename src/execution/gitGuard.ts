// TODO(Member A): detect Git and a dirty workspace, and warn before edits. Do not commit, push, or reset.

export interface GitStatus {
  isRepository: boolean;
  dirty: boolean;
}

export function readGitStatus(workspaceRoot: string): Promise<GitStatus> {
  void workspaceRoot;
  throw new Error('Not implemented');
}
