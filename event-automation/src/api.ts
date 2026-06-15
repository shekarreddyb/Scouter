import * as vscode from "vscode";
import * as path from "path";
import { EventContext, makeEvent } from "./model/event";
import { Action, PublishAction } from "./model/rule";
import { RuleEngine, ProgrammaticRule } from "./engine/ruleEngine";
import { Services, CustomHandler } from "./actions/dispatcher";
import { log } from "./log";

export interface AutomationApi {
  /** Add a programmatic rule. */
  on(
    events: string | string[],
    predicate: ((ctx: EventContext) => boolean) | undefined,
    actions: Action[]
  ): void;
  /** Register a custom action usable from config as `<name>: ...`. */
  registerAction(name: string, handler: CustomHandler): void;
  /** Register a custom event source. `setup` receives an emit helper. */
  registerEventSource(
    name: string,
    setup: (emit: (event: string, extra?: Partial<EventContext>) => void) => void
  ): void;

  // terse action builders
  publish(event: string, opts?: { to?: string | string[]; payload?: Record<string, unknown> }): PublishAction;
  notify(text: string, level?: "info" | "warning" | "error"): Action;
}

export function createApi(engine: RuleEngine, services: Services): {
  api: AutomationApi;
  programmatic: ProgrammaticRule[];
} {
  const programmatic: ProgrammaticRule[] = [];

  const api: AutomationApi = {
    on(events, predicate, actions) {
      programmatic.push({
        events: Array.isArray(events) ? events : [events],
        predicate,
        actions,
      });
    },
    registerAction(name, handler) {
      services.custom.set(name, handler);
    },
    registerEventSource(name, setup) {
      setup((event, extra) => engine.handle(makeEvent(name, event, extra)));
    },
    publish(event, opts) {
      return { type: "publish", event, to: opts?.to, payload: opts?.payload };
    },
    notify(text, level) {
      return { type: "notify", text, level: level ?? "info" };
    },
  };

  return { api, programmatic };
}

/** Load a trusted workspace hooks file (.vscode/automations.js) if present. */
export function loadHooks(api: AutomationApi): void {
  if (!vscode.workspace.isTrusted) {
    log.warn("Workspace is not trusted; skipping automations.js hooks.");
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) { return; }
  const file = path.join(folder.uri.fsPath, ".vscode", "automations.js");
  try {
    delete require.cache[require.resolve(file)];
    const mod = require(file);
    if (typeof mod.register === "function") {
      mod.register(api);
      log.info(`Loaded hooks from automations.js`);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "MODULE_NOT_FOUND") {
      log.error(`Failed loading automations.js`, e);
    }
  }
}
