import * as fs from "fs";
import * as yaml from "js-yaml";
import { parse as parseJsonc } from "jsonc-parser";
import {
  Action, GlobalConfig, ParsedConfig, Rule, DEFAULT_CONFIG,
} from "../model/rule";
import { parseDuration } from "../util";

export interface LoadProblem {
  message: string;
  severity: "error" | "warning";
  rule?: string;
}

export interface LoadResult {
  parsed: ParsedConfig;
  problems: LoadProblem[];
}

// Keys that identify a known action type in a YAML/JSON object.
// "parallel" is handled specially (its value is an array of sub-actions).
const ACTION_TYPE_KEYS = [
  "publish", "parallel", "notify", "run", "command", "webhook", "statusBar",
];

const KNOWN_EVENTS = new Set([
  "test.started", "test.passed", "test.failed", "test.finished",
  "task.started", "task.finished", "task.failed",
  "terminal.started", "terminal.finished",
  "debug.started", "debug.stopped", "debug.breakpoint", "debug.exception",
  "git.commit", "git.push", "git.pull", "git.branchChanged",
  "file.saved", "folder.opened", "workspace.loaded",
]);

export function loadConfigFromString(
  text: string,
  format: "yaml" | "jsonc"
): LoadResult {
  const problems: LoadProblem[] = [];
  let raw: unknown;
  try {
    raw = format === "yaml" ? yaml.load(text) : parseJsonc(text);
  } catch (e) {
    problems.push({
      message: `Failed to parse config: ${e instanceof Error ? e.message : String(e)}`,
      severity: "error",
    });
    return { parsed: { config: DEFAULT_CONFIG, rules: [] }, problems };
  }

  const rawObj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const config = normalizeConfig(rawObj.config, problems);
  const rules = normalizeRules(rawObj.rules, problems);
  return { parsed: { config, rules }, problems };
}

export function loadConfigFromFile(filePath: string): LoadResult {
  if (!fs.existsSync(filePath)) {
    return {
      parsed: { config: DEFAULT_CONFIG, rules: [] },
      problems: [{ message: `Config file not found: ${filePath}`, severity: "warning" }],
    };
  }
  const text = fs.readFileSync(filePath, "utf8");
  const format: "yaml" | "jsonc" = /\.ya?ml$/i.test(filePath) ? "yaml" : "jsonc";
  return loadConfigFromString(text, format);
}

function normalizeConfig(input: unknown, _problems: LoadProblem[]): GlobalConfig {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  let publishTo: string | string[] = DEFAULT_CONFIG.publishTo;
  if (typeof c.publishTo === "string") {
    publishTo = c.publishTo;
  } else if (Array.isArray(c.publishTo)) {
    publishTo = c.publishTo.filter((x): x is string => typeof x === "string");
  }

  return {
    publishTo,
    enabled: typeof c.enabled === "boolean" ? c.enabled : DEFAULT_CONFIG.enabled,
    commands: Array.isArray(c.commands)
      ? c.commands.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function normalizeRules(input: unknown, problems: LoadProblem[]): Rule[] {
  if (!Array.isArray(input)) {
    if (input !== undefined) {
      problems.push({ message: "`rules` must be a list", severity: "error" });
    }
    return [];
  }
  const rules: Rule[] = [];
  input.forEach((item, idx) => {
    const r = item as Record<string, unknown>;
    const label = (r?.name as string) || `rule #${idx + 1}`;
    if (!r || typeof r !== "object") {
      problems.push({ message: `${label}: not an object`, severity: "error" });
      return;
    }
    const on = normalizeOn(r.on);
    if (on.length === 0) {
      problems.push({ message: `${label}: missing or invalid 'on'`, severity: "error", rule: label });
      return;
    }
    for (const ev of on) {
      if (!KNOWN_EVENTS.has(ev) && !ev.startsWith("command.")) {
        problems.push({ message: `${label}: unknown event '${ev}'`, severity: "warning", rule: label });
      }
    }
    const actions = normalizeActions(r.do, label, problems);
    if (actions.length === 0) {
      problems.push({ message: `${label}: 'do' has no valid actions`, severity: "error", rule: label });
      return;
    }

    const execute = r.execute === "parallel" ? "parallel" : "sequential";

    rules.push({
      name: r.name as string | undefined,
      on,
      when: typeof r.when === "string" ? r.when : undefined,
      cooldown: parseDuration(r.cooldown),
      once: r.once === true,
      priority: typeof r.priority === "number" ? r.priority : 0,
      stop: r.stop === true,
      enabled: r.enabled !== false,
      execute,
      do: actions,
    });
  });
  rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return rules;
}

function normalizeOn(on: unknown): string[] {
  if (typeof on === "string") { return [on]; }
  if (Array.isArray(on)) { return on.filter((x): x is string => typeof x === "string"); }
  return [];
}

function normalizeActions(input: unknown, label: string, problems: LoadProblem[]): Action[] {
  if (!Array.isArray(input)) {
    problems.push({ message: `${label}: 'do' must be a list`, severity: "error", rule: label });
    return [];
  }
  const actions: Action[] = [];
  for (const raw of input) {
    const obj = raw as Record<string, unknown>;
    if (!obj || typeof obj !== "object") {
      problems.push({ message: `${label}: invalid action`, severity: "warning", rule: label });
      continue;
    }
    const typeKey = ACTION_TYPE_KEYS.find((k) => k in obj);
    if (typeKey) {
      const a = buildKnownAction(typeKey, obj, label, problems);
      if (a) { actions.push(a); }
      continue;
    }
    // Unknown key → custom action
    const keys = Object.keys(obj);
    if (keys.length >= 1) {
      const name = keys[0];
      const { [name]: value, ...rest } = obj;
      actions.push({ type: "custom", name, params: { value, ...rest } });
    } else {
      problems.push({ message: `${label}: empty action`, severity: "warning", rule: label });
    }
  }
  return actions;
}

function buildKnownAction(
  typeKey: string,
  obj: Record<string, unknown>,
  label: string,
  problems: LoadProblem[]
): Action | undefined {
  const v = obj[typeKey];
  switch (typeKey) {
    case "publish": {
      // publish: "event.type"   OR   publish: { event: "...", payload: {...}, to: "..." }
      if (typeof v === "string") {
        return {
          type: "publish",
          event: v,
          to: obj.to as string | string[] | undefined,
          payload: obj.payload as Record<string, unknown> | undefined,
        };
      }
      if (v && typeof v === "object") {
        const pub = v as Record<string, unknown>;
        if (typeof pub.event !== "string") {
          problems.push({ message: `${label}: publish.event must be a string`, severity: "error", rule: label });
          return undefined;
        }
        return {
          type: "publish",
          event: pub.event,
          to: (pub.to ?? obj.to) as string | string[] | undefined,
          payload: pub.payload as Record<string, unknown> | undefined,
        };
      }
      problems.push({ message: `${label}: 'publish' value must be a string or object`, severity: "error", rule: label });
      return undefined;
    }

    case "parallel":
      return {
        type: "parallel",
        actions: normalizeActions(Array.isArray(v) ? v : [], label, problems),
      };

    case "notify":
      return {
        type: "notify",
        text: String(v),
        level: (obj.level as "info" | "warning" | "error") ?? "info",
        buttons: obj.buttons as never,
      };

    case "run":
      return { type: "run", command: String(v), cwd: obj.cwd as string | undefined };

    case "command":
      return { type: "command", command: String(v), args: obj.args as unknown[] | undefined };

    case "webhook":
      return {
        type: "webhook",
        url: String(v),
        method: (obj.method as string) ?? "POST",
        headers: obj.headers as Record<string, string> | undefined,
        body: obj.body as string | undefined,
      };

    case "statusBar":
      return {
        type: "statusBar",
        text: String(v),
        color: obj.color as string | undefined,
        tooltip: obj.tooltip as string | undefined,
        timeout: obj.timeout as string | undefined,
      };

    default:
      return undefined;
  }
}
