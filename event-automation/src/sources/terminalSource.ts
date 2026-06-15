import * as vscode from "vscode";
import { EventContext, makeEvent } from "../model/event";
import { Emit } from "./workspaceSource";
import { log } from "../log";

const TEST_HINT = /\b(test|jest|vitest|pytest|mocha|dotnet\s+test|go\s+test)\b/i;

export function registerTerminalSource(emit: Emit): vscode.Disposable[] {
  const d: vscode.Disposable[] = [];
  const w = vscode.window as unknown as Record<string, unknown>;

  if (typeof w.onDidStartTerminalShellExecution !== "function") {
    log.warn("Terminal shell integration events unavailable in this VS Code version.");
    return d;
  }

  const starts = new WeakMap<object, number>();

  d.push(
    (vscode.window as any).onDidStartTerminalShellExecution((e: any) => {
      const command: string | undefined = e?.execution?.commandLine?.value;
      starts.set(e.execution, Date.now());
      emit(makeEvent("terminal", "terminal.started", { command }));
    })
  );

  d.push(
    (vscode.window as any).onDidEndTerminalShellExecution((e: any) => {
      const command: string | undefined = e?.execution?.commandLine?.value;
      const exitCode: number | undefined = e?.exitCode;
      const start = starts.get(e.execution);
      const duration = start ? Date.now() - start : undefined;
      emit(makeEvent("terminal", "terminal.finished", { command, exitCode, duration }));

      // Best-effort test mapping from a terminal command.
      if (command && TEST_HINT.test(command)) {
        if (exitCode === 0) {
          emit(makeEvent("test", "test.passed", { command, exitCode }));
        } else if (exitCode !== undefined) {
          emit(makeEvent("test", "test.failed", { command, exitCode }));
        }
        emit(makeEvent("test", "test.finished", { command, exitCode, duration }));
      }
    })
  );

  return d;
}
