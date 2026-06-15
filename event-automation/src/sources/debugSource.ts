import * as vscode from "vscode";
import { makeEvent } from "../model/event";
import { Emit } from "./workspaceSource";

export function registerDebugSource(emit: Emit): vscode.Disposable[] {
  const d: vscode.Disposable[] = [];

  d.push(
    vscode.debug.onDidStartDebugSession((s) => {
      emit(makeEvent("debug", "debug.started", { sessionName: s.name, configType: s.type }));
    })
  );

  d.push(
    vscode.debug.onDidTerminateDebugSession((s) => {
      emit(makeEvent("debug", "debug.stopped", { sessionName: s.name, configType: s.type }));
    })
  );

  // Watch 'stopped' DAP events to distinguish breakpoint vs exception.
  d.push(
    vscode.debug.registerDebugAdapterTrackerFactory("*", {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        return {
          onDidSendMessage(message: any) {
            if (message?.type === "event" && message.event === "stopped") {
              const reason: string | undefined = message.body?.reason;
              if (reason === "exception") {
                emit(makeEvent("debug", "debug.exception", {
                  sessionName: session.name,
                  message: message.body?.text || message.body?.description,
                }));
              } else if (reason === "breakpoint") {
                emit(makeEvent("debug", "debug.breakpoint", { sessionName: session.name }));
              }
            }
          },
        };
      },
    })
  );

  return d;
}
