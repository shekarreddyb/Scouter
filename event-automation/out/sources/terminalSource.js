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
exports.registerTerminalSource = registerTerminalSource;
const vscode = __importStar(require("vscode"));
const event_1 = require("../model/event");
const log_1 = require("../log");
const TEST_HINT = /\b(test|jest|vitest|pytest|mocha|dotnet\s+test|go\s+test)\b/i;
function registerTerminalSource(emit) {
    const d = [];
    const w = vscode.window;
    if (typeof w.onDidStartTerminalShellExecution !== "function") {
        log_1.log.warn("Terminal shell integration events unavailable in this VS Code version.");
        return d;
    }
    const starts = new WeakMap();
    d.push(vscode.window.onDidStartTerminalShellExecution((e) => {
        const command = e?.execution?.commandLine?.value;
        starts.set(e.execution, Date.now());
        emit((0, event_1.makeEvent)("terminal", "terminal.started", { command }));
    }));
    d.push(vscode.window.onDidEndTerminalShellExecution((e) => {
        const command = e?.execution?.commandLine?.value;
        const exitCode = e?.exitCode;
        const start = starts.get(e.execution);
        const duration = start ? Date.now() - start : undefined;
        emit((0, event_1.makeEvent)("terminal", "terminal.finished", { command, exitCode, duration }));
        // Best-effort test mapping from a terminal command.
        if (command && TEST_HINT.test(command)) {
            if (exitCode === 0) {
                emit((0, event_1.makeEvent)("test", "test.passed", { command, exitCode }));
            }
            else if (exitCode !== undefined) {
                emit((0, event_1.makeEvent)("test", "test.failed", { command, exitCode }));
            }
            emit((0, event_1.makeEvent)("test", "test.finished", { command, exitCode, duration }));
        }
    }));
    return d;
}
//# sourceMappingURL=terminalSource.js.map