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
exports.registerWorkspaceSource = registerWorkspaceSource;
exports.registerTaskSource = registerTaskSource;
const vscode = __importStar(require("vscode"));
const event_1 = require("../model/event");
function workspaceName() {
    return vscode.workspace.workspaceFolders?.[0]?.name;
}
function registerWorkspaceSource(emit) {
    const d = [];
    d.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        emit((0, event_1.makeEvent)("workspace", "file.saved", {
            file: doc.fileName,
            language: doc.languageId,
            workspace: workspaceName(),
        }));
    }));
    d.push(vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        for (const added of e.added) {
            emit((0, event_1.makeEvent)("workspace", "folder.opened", { folder: added.name, workspace: workspaceName() }));
        }
    }));
    // Fire once on activation.
    emit((0, event_1.makeEvent)("workspace", "workspace.loaded", { workspace: workspaceName() }));
    return d;
}
function registerTaskSource(emit) {
    const d = [];
    const starts = new Map();
    const keyFor = (name) => name ?? "(task)";
    d.push(vscode.tasks.onDidStartTask((e) => {
        const name = e.execution.task.name;
        starts.set(keyFor(name), Date.now());
        emit((0, event_1.makeEvent)("task", "task.started", { taskName: name }));
    }));
    d.push(vscode.tasks.onDidEndTaskProcess((e) => {
        const name = e.execution.task.name;
        const start = starts.get(keyFor(name));
        const duration = start ? Date.now() - start : undefined;
        const exitCode = e.exitCode;
        emit((0, event_1.makeEvent)("task", "task.finished", { taskName: name, exitCode, duration }));
        if (exitCode !== undefined && exitCode !== 0) {
            emit((0, event_1.makeEvent)("task", "task.failed", { taskName: name, exitCode, duration }));
        }
    }));
    return d;
}
//# sourceMappingURL=workspaceSource.js.map