/**
 * Parsed rule + action shapes. The YAML/JSON is normalized into these.
 *
 * Actions use shorthand in config: the *type key* (publish/notify/run/
 * command/webhook/statusBar) carries the primary value, with modifiers
 * beside it. After parsing every action becomes a discriminated { type, ... }.
 */

// ── Action types ──────────────────────────────────────────────────────────────

export interface PublishAction {
  type: "publish";
  /** Event type string published to the desktop utility (e.g. "test.passed"). */
  event: string;
  /** Override config.publishTo for this action only. */
  to?: string | string[];
  /** Key/value pairs forwarded as event payload. String values are interpolated. */
  payload?: Record<string, unknown>;
}

/** Runs a list of actions concurrently; resolves when all finish. */
export interface ParallelAction {
  type: "parallel";
  actions: Action[];
}

export interface NotifyButton {
  label: string;
  command?: string;
  run?: string;
}

export interface NotifyAction {
  type: "notify";
  text: string;
  level?: "info" | "warning" | "error";
  buttons?: NotifyButton[];
}

export interface RunAction {
  type: "run";
  command: string;
  cwd?: string;
}

export interface CommandAction {
  type: "command";
  command: string;
  args?: unknown[];
}

export interface WebhookAction {
  type: "webhook";
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface StatusBarAction {
  type: "statusBar";
  text: string;
  color?: string;
  tooltip?: string;
  timeout?: string;
}

/** Custom actions registered via the JS API are dispatched generically. */
export interface CustomAction {
  type: "custom";
  name: string;
  params: Record<string, unknown>;
}

export type Action =
  | PublishAction
  | ParallelAction
  | NotifyAction
  | RunAction
  | CommandAction
  | WebhookAction
  | StatusBarAction
  | CustomAction;

// ── Rule ──────────────────────────────────────────────────────────────────────

export interface Rule {
  name?: string;
  on: string[];
  when?: string;
  cooldown?: number;
  once?: boolean;
  priority?: number;
  stop?: boolean;
  enabled?: boolean;
  /** Whether the actions in `do` run sequentially (default) or all in parallel. */
  execute?: "sequential" | "parallel";
  do: Action[];
}

// ── Global config ─────────────────────────────────────────────────────────────

export interface GlobalConfig {
  /** UDP/WebSocket target(s) for publish actions, e.g. "udp://127.0.0.1:38471". */
  publishTo: string | string[];
  enabled: boolean;
  /** custom palette commands that emit command.<id> events when invoked */
  commands: string[];
}

export interface ParsedConfig {
  config: GlobalConfig;
  rules: Rule[];
}

export const DEFAULT_CONFIG: GlobalConfig = {
  publishTo: "udp://127.0.0.1:38471",
  enabled: true,
  commands: [],
};
