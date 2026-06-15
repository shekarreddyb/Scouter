"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGitSource = registerGitSource;
const vscode = __importStar(require("vscode"));
const event_1 = require("../model/event");
const log_1 = require("../log");
/**
 * Uses the built-in `vscode.git` extension API (not an officially stable API).
 * Reliably detects commits and branch switches by diffing repository HEAD on
 * each state change. Push/pull have no clean event and are not auto-detected in
 * this version.
 */
function registerGitSource(emit) {
    const d = [];
    const ext = vscode.extensions.getExtension("vscode.git");
    if (!ext) {
        log_1.log.warn("Git extension not found; git.* events disabled.");
        return d;
    }
    const wireRepo = (repo) => {
        let lastCommit = repo.state?.HEAD?.commit;
        let lastBranch = repo.state?.HEAD?.name;
        d.push(repo.state.onDidChange(() => {
            const head = repo.state?.HEAD;
            const commit = head?.commit;
            const branch = head?.name;
            if (branch && branch !== lastBranch) {
                emit((0, event_1.makeEvent)("git", "git.branchChanged", { branch, previousBranch: lastBranch }));
                lastBranch = branch;
                lastCommit = commit; // avoid double-firing commit on branch switch
                return;
            }
            if (commit && commit !== lastCommit) {
                emit((0, event_1.makeEvent)("git", "git.commit", { branch }));
                lastCommit = commit;
            }
        }));
    };
    const activate = async () => {
        const api = ext.isActive ? ext.exports.getAPI(1) : (await ext.activate()).getAPI(1);
        for (const repo of api.repositories) {
            wireRepo(repo);
        }
        d.push(api.onDidOpenRepository((repo) => wireRepo(repo)));
    };
    activate().catch((e) => log_1.log.error("Failed to wire Git source", e));
    return d;
}
//# sourceMappingURL=gitSource.js.map