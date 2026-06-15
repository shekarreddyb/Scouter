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
exports.registerDebugSource = registerDebugSource;
const vscode = __importStar(require("vscode"));
const event_1 = require("../model/event");
function registerDebugSource(emit) {
    const d = [];
    d.push(vscode.debug.onDidStartDebugSession((s) => {
        emit((0, event_1.makeEvent)("debug", "debug.started", { sessionName: s.name, configType: s.type }));
    }));
    d.push(vscode.debug.onDidTerminateDebugSession((s) => {
        emit((0, event_1.makeEvent)("debug", "debug.stopped", { sessionName: s.name, configType: s.type }));
    }));
    // Watch 'stopped' DAP events to distinguish breakpoint vs exception.
    d.push(vscode.debug.registerDebugAdapterTrackerFactory("*", {
        createDebugAdapterTracker(session) {
            return {
                onDidSendMessage(message) {
                    if (message?.type === "event" && message.event === "stopped") {
                        const reason = message.body?.reason;
                        if (reason === "exception") {
                            emit((0, event_1.makeEvent)("debug", "debug.exception", {
                                sessionName: session.name,
                                message: message.body?.text || message.body?.description,
                            }));
                        }
                        else if (reason === "breakpoint") {
                            emit((0, event_1.makeEvent)("debug", "debug.breakpoint", { sessionName: session.name }));
                        }
                    }
                },
            };
        },
    }));
    return d;
}
//# sourceMappingURL=debugSource.js.map