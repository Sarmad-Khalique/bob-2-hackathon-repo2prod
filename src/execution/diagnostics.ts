// TODO(Member C): bounded, redacted failure bundles.

import type { FailureBundle } from '../core/types';
import type { Repo2ProdState } from '../core/state';

export function createFailureBundle(
  attempt: number,
  phase: Repo2ProdState,
  command: string | null,
  exitCode: number | null,
  redactedExcerpt: string,
  truncated: boolean,
): FailureBundle {
  void attempt;
  void phase;
  void command;
  void exitCode;
  void redactedExcerpt;
  void truncated;
  throw new Error('Not implemented');
}
