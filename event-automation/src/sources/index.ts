import * as vscode from "vscode";
import { Emit, registerWorkspaceSource, registerTaskSource } from "./workspaceSource";
import { registerTerminalSource } from "./terminalSource";
import { registerDebugSource } from "./debugSource";
import { registerGitSource } from "./gitSource";

export function registerSources(emit: Emit): vscode.Disposable[] {
  return [
    ...registerWorkspaceSource(emit),
    ...registerTaskSource(emit),
    ...registerTerminalSource(emit),
    ...registerDebugSource(emit),
    ...registerGitSource(emit),
  ];
}

export type { Emit };
