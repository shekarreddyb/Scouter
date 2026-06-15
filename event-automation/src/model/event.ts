/**
 * Unified event model. Every source normalizes its events into an EventContext.
 * Source-specific fields are merged onto the common ones and exposed to
 * `when` expressions and `${...}` interpolation.
 */
export interface EventContext {
  /** e.g. "test", "terminal", "git", "workspace", "debug", "task", "command" */
  source: string;
  /** dotted name, e.g. "test.failed", "terminal.finished" */
  event: string;
  /** epoch ms */
  timestamp: number;

  command?: string;
  exitCode?: number;
  /** milliseconds */
  duration?: number;
  workspace?: string;
  branch?: string;

  // Common source-specific fields (all optional; populated when relevant).
  failedTests?: number;
  passedTests?: number;
  total?: number;
  taskName?: string;
  file?: string;
  language?: string;
  folder?: string;
  sessionName?: string;
  configType?: string;
  line?: number;
  message?: string;
  remote?: string;
  previousBranch?: string;
  commandId?: string;
  args?: unknown;

  /** escape hatch for anything not in the typed list */
  metadata?: Record<string, unknown>;
}

export function makeEvent(
  source: string,
  event: string,
  extra: Partial<EventContext> = {}
): EventContext {
  return { source, event, timestamp: Date.now(), ...extra };
}
