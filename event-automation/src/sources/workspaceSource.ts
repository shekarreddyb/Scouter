import * as vscode from "vscode";
import { EventContext, makeEvent } from "../model/event";

export type Emit = (ctx: EventContext) => void;

function workspaceName(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.name;
}

export function registerWorkspaceSource(emit: Emit): vscode.Disposable[] {
  const d: vscode.Disposable[] = [];

  d.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      emit(makeEvent("workspace", "file.saved", {
        file: doc.fileName,
        language: doc.languageId,
        workspace: workspaceName(),
      }));
    })
  );

  d.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      for (const added of e.added) {
        emit(makeEvent("workspace", "folder.opened", { folder: added.name, workspace: workspaceName() }));
      }
    })
  );

  // Fire once on activation.
  emit(makeEvent("workspace", "workspace.loaded", { workspace: workspaceName() }));

  return d;
}

export function registerTaskSource(emit: Emit): vscode.Disposable[] {
  const d: vscode.Disposable[] = [];
  const starts = new Map<string, number>();

  const keyFor = (name: string | undefined) => name ?? "(task)";

  d.push(
    vscode.tasks.onDidStartTask((e) => {
      const name = e.execution.task.name;
      starts.set(keyFor(name), Date.now());
      emit(makeEvent("task", "task.started", { taskName: name }));
    })
  );

  d.push(
    vscode.tasks.onDidEndTaskProcess((e) => {
      const name = e.execution.task.name;
      const start = starts.get(keyFor(name));
      const duration = start ? Date.now() - start : undefined;
      const exitCode = e.exitCode;
      emit(makeEvent("task", "task.finished", { taskName: name, exitCode, duration }));
      if (exitCode !== undefined && exitCode !== 0) {
        emit(makeEvent("task", "task.failed", { taskName: name, exitCode, duration }));
      }
    })
  );

  return d;
}
