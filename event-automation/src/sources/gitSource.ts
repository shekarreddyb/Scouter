import * as vscode from "vscode";
import { makeEvent } from "../model/event";
import { Emit } from "./workspaceSource";
import { log } from "../log";

/**
 * Uses the built-in `vscode.git` extension API (not an officially stable API).
 * Reliably detects commits and branch switches by diffing repository HEAD on
 * each state change. Push/pull have no clean event and are not auto-detected in
 * this version.
 */
export function registerGitSource(emit: Emit): vscode.Disposable[] {
  const d: vscode.Disposable[] = [];
  const ext = vscode.extensions.getExtension<any>("vscode.git");
  if (!ext) {
    log.warn("Git extension not found; git.* events disabled.");
    return d;
  }

  const wireRepo = (repo: any) => {
    let lastCommit: string | undefined = repo.state?.HEAD?.commit;
    let lastBranch: string | undefined = repo.state?.HEAD?.name;
    d.push(
      repo.state.onDidChange(() => {
        const head = repo.state?.HEAD;
        const commit: string | undefined = head?.commit;
        const branch: string | undefined = head?.name;

        if (branch && branch !== lastBranch) {
          emit(makeEvent("git", "git.branchChanged", { branch, previousBranch: lastBranch }));
          lastBranch = branch;
          lastCommit = commit; // avoid double-firing commit on branch switch
          return;
        }
        if (commit && commit !== lastCommit) {
          emit(makeEvent("git", "git.commit", { branch }));
          lastCommit = commit;
        }
      })
    );
  };

  const activate = async () => {
    const api = ext.isActive ? ext.exports.getAPI(1) : (await ext.activate()).getAPI(1);
    for (const repo of api.repositories) { wireRepo(repo); }
    d.push(api.onDidOpenRepository((repo: any) => wireRepo(repo)));
  };

  activate().catch((e) => log.error("Failed to wire Git source", e));
  return d;
}
