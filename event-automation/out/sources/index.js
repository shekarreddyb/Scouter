"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSources = registerSources;
const workspaceSource_1 = require("./workspaceSource");
const terminalSource_1 = require("./terminalSource");
const debugSource_1 = require("./debugSource");
const gitSource_1 = require("./gitSource");
function registerSources(emit) {
    return [
        ...(0, workspaceSource_1.registerWorkspaceSource)(emit),
        ...(0, workspaceSource_1.registerTaskSource)(emit),
        ...(0, terminalSource_1.registerTerminalSource)(emit),
        ...(0, debugSource_1.registerDebugSource)(emit),
        ...(0, gitSource_1.registerGitSource)(emit),
    ];
}
//# sourceMappingURL=index.js.map