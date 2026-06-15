import * as vscode from "vscode";
import * as dgram from "dgram";
import * as crypto from "crypto";
import { Action, GlobalConfig } from "../model/rule";
import { EventContext } from "../model/event";
import { interpolate } from "../engine/interpolate";
import { StatusBarActions } from "./statusBar";
import { log } from "../log";

export type CustomHandler = (
  ctx: EventContext,
  params: Record<string, unknown>
) => void | Promise<void>;

export interface Services {
  statusBar: StatusBarActions;
  custom: Map<string, CustomHandler>;
  getConfig: () => GlobalConfig;
}

let runTerminal: vscode.Terminal | undefined;
let runTerminalCwd: string | undefined;

export async function dispatch(
  action: Action,
  ctx: EventContext,
  services: Services
): Promise<void> {
  try {
    switch (action.type) {
      case "publish":
        await publishEvent(action, ctx, services.getConfig());
        break;

      case "parallel":
        await Promise.all(action.actions.map((a) => dispatch(a, ctx, services)));
        break;

      case "notify":
        await runNotify(action.text, action.level, action.buttons, ctx);
        break;

      case "run":
        runShell(interpolate(action.command, ctx), action.cwd ? interpolate(action.cwd, ctx) : undefined);
        break;

      case "command":
        await vscode.commands.executeCommand(action.command, ...(action.args ?? []));
        break;

      case "webhook":
        await runWebhook(action, ctx);
        break;

      case "statusBar":
        services.statusBar.set(
          interpolate(action.text, ctx),
          action.color,
          action.tooltip ? interpolate(action.tooltip, ctx) : undefined,
          action.timeout
        );
        break;

      case "custom": {
        const handler = services.custom.get(action.name);
        if (handler) {
          await handler(ctx, action.params);
        } else {
          log.warn(`No custom action registered for '${action.name}'`);
        }
        break;
      }
    }
  } catch (e) {
    log.error(`Action '${action.type}' failed`, e);
  }
}

// ── publish ───────────────────────────────────────────────────────────────────

interface PublishedEvent {
  id: string;
  timestamp: number;
  type: string;
  pid: number;
  ppid: number;
  workspace?: { name: string; path: string };
  payload?: Record<string, unknown>;
}

async function publishEvent(
  action: { event: string; to?: string | string[]; payload?: Record<string, unknown> },
  ctx: EventContext,
  config: GlobalConfig
): Promise<void> {
  const rawTargets = action.to ?? config.publishTo;
  const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];

  if (targets.length === 0 || (targets.length === 1 && !targets[0])) {
    log.warn("publish: no target configured — set config.publishTo or action.to");
    return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  const event: PublishedEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: action.event,
    pid: process.pid,
    ppid: process.ppid ?? 0,
    workspace: folder
      ? { name: folder.name, path: folder.uri.fsPath }
      : undefined,
    payload: action.payload ? interpolatePayload(action.payload, ctx) : undefined,
  };

  const data = Buffer.from(JSON.stringify(event), "utf8");
  await Promise.all(targets.map((t) => sendUdp(data, t)));
}

function interpolatePayload(
  payload: Record<string, unknown>,
  ctx: EventContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    result[k] = typeof v === "string" ? interpolate(v, ctx) : v;
  }
  return result;
}

function parseUdpTarget(target: string): { host: string; port: number } {
  // Accepts "udp://host:port" or "host:port"
  const m = target.match(/^(?:udp:\/\/)?([^:]+):(\d+)$/);
  if (!m) { throw new Error(`Invalid publish target: "${target}"`); }
  return { host: m[1], port: parseInt(m[2], 10) };
}

function sendUdp(data: Buffer, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsed: { host: string; port: number };
    try {
      parsed = parseUdpTarget(target);
    } catch (e) {
      return reject(e);
    }
    const sock = dgram.createSocket("udp4");
    sock.send(data, parsed.port, parsed.host, (err) => {
      sock.close();
      if (err) { reject(err); } else { resolve(); }
    });
  });
}

// ── notify ────────────────────────────────────────────────────────────────────

async function runNotify(
  text: string,
  level: "info" | "warning" | "error" | undefined,
  buttons: { label: string; command?: string; run?: string }[] | undefined,
  ctx: EventContext
): Promise<void> {
  const msg = interpolate(text, ctx);
  const labels = (buttons ?? []).map((b) => b.label);
  const show =
    level === "error" ? vscode.window.showErrorMessage
      : level === "warning" ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;
  const picked = await show(msg, ...labels);
  if (!picked) { return; }
  const button = (buttons ?? []).find((b) => b.label === picked);
  if (!button) { return; }
  if (button.command) {
    await vscode.commands.executeCommand(button.command);
  } else if (button.run) {
    runShell(interpolate(button.run, ctx));
  }
}

// ── run (shell) ───────────────────────────────────────────────────────────────

function runShell(command: string, cwd?: string): void {
  if (!runTerminal || runTerminal.exitStatus !== undefined || cwd !== runTerminalCwd) {
    runTerminal = vscode.window.createTerminal({ name: "Event Automation", cwd });
    runTerminalCwd = cwd;
  }
  runTerminal.show(true);
  runTerminal.sendText(command);
}

// ── webhook ───────────────────────────────────────────────────────────────────

async function runWebhook(
  action: { url: string; method?: string; headers?: Record<string, string>; body?: string },
  ctx: EventContext
): Promise<void> {
  const url = interpolate(action.url, ctx);
  const body = action.body ? interpolate(action.body, ctx) : undefined;
  try {
    await fetch(url, { method: action.method ?? "POST", headers: action.headers ?? {}, body });
  } catch (e) {
    log.error(`Webhook to ${url} failed`, e);
  }
}
