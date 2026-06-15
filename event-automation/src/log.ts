import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function initLog(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Event Automation");
  }
  return channel;
}

function ts(): string {
  return new Date().toISOString().substring(11, 23);
}

export const log = {
  info(msg: string): void {
    initLog().appendLine(`[${ts()}] ${msg}`);
  },
  warn(msg: string): void {
    initLog().appendLine(`[${ts()}] WARN  ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
    initLog().appendLine(`[${ts()}] ERROR ${msg}${detail}`);
  },
};
