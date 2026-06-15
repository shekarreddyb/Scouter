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
exports.dispatch = dispatch;
const vscode = __importStar(require("vscode"));
const dgram = __importStar(require("dgram"));
const crypto = __importStar(require("crypto"));
const interpolate_1 = require("../engine/interpolate");
const log_1 = require("../log");
let runTerminal;
let runTerminalCwd;
async function dispatch(action, ctx, services) {
    try {
        switch (action.type) {
            case "publish":
                await publishEvent(action, ctx, services.getConfig());
                break;
            case "parallel":
                await Promise.all(action.actions.map((a) => dispatch(a, ctx, services)));
                break;
            case "notify":
                await runNotify(action.text, action.level, action.buttons, ctx);
                break;
            case "run":
                runShell((0, interpolate_1.interpolate)(action.command, ctx), action.cwd ? (0, interpolate_1.interpolate)(action.cwd, ctx) : undefined);
                break;
            case "command":
                await vscode.commands.executeCommand(action.command, ...(action.args ?? []));
                break;
            case "webhook":
                await runWebhook(action, ctx);
                break;
            case "statusBar":
                services.statusBar.set((0, interpolate_1.interpolate)(action.text, ctx), action.color, action.tooltip ? (0, interpolate_1.interpolate)(action.tooltip, ctx) : undefined, action.timeout);
                break;
            case "custom": {
                const handler = services.custom.get(action.name);
                if (handler) {
                    await handler(ctx, action.params);
                }
                else {
                    log_1.log.warn(`No custom action registered for '${action.name}'`);
                }
                break;
            }
        }
    }
    catch (e) {
        log_1.log.error(`Action '${action.type}' failed`, e);
    }
}
async function publishEvent(action, ctx, config) {
    const rawTargets = action.to ?? config.publishTo;
    const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];
    if (targets.length === 0 || (targets.length === 1 && !targets[0])) {
        log_1.log.warn("publish: no target configured — set config.publishTo or action.to");
        return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    const event = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: action.event,
        pid: process.pid,
        ppid: process.ppid ?? 0,
        workspace: folder
            ? { name: folder.name, path: folder.uri.fsPath }
            : undefined,
        payload: action.payload ? interpolatePayload(action.payload, ctx) : undefined,
    };
    const data = Buffer.from(JSON.stringify(event), "utf8");
    await Promise.all(targets.map((t) => sendUdp(data, t)));
}
function interpolatePayload(payload, ctx) {
    const result = {};
    for (const [k, v] of Object.entries(payload)) {
        result[k] = typeof v === "string" ? (0, interpolate_1.interpolate)(v, ctx) : v;
    }
    return result;
}
function parseUdpTarget(target) {
    // Accepts "udp://host:port" or "host:port"
    const m = target.match(/^(?:udp:\/\/)?([^:]+):(\d+)$/);
    if (!m) {
        throw new Error(`Invalid publish target: "${target}"`);
    }
    return { host: m[1], port: parseInt(m[2], 10) };
}
function sendUdp(data, target) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = parseUdpTarget(target);
        }
        catch (e) {
            return reject(e);
        }
        const sock = dgram.createSocket("udp4");
        sock.send(data, parsed.port, parsed.host, (err) => {
            sock.close();
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
// ── notify ────────────────────────────────────────────────────────────────────
async function runNotify(text, level, buttons, ctx) {
    const msg = (0, interpolate_1.interpolate)(text, ctx);
    const labels = (buttons ?? []).map((b) => b.label);
    const show = level === "error" ? vscode.window.showErrorMessage
        : level === "warning" ? vscode.window.showWarningMessage
            : vscode.window.showInformationMessage;
    const picked = await show(msg, ...labels);
    if (!picked) {
        return;
    }
    const button = (buttons ?? []).find((b) => b.label === picked);
    if (!button) {
        return;
    }
    if (button.command) {
        await vscode.commands.executeCommand(button.command);
    }
    else if (button.run) {
        runShell((0, interpolate_1.interpolate)(button.run, ctx));
    }
}
// ── run (shell) ───────────────────────────────────────────────────────────────
function runShell(command, cwd) {
    if (!runTerminal || runTerminal.exitStatus !== undefined || cwd !== runTerminalCwd) {
        runTerminal = vscode.window.createTerminal({ name: "Event Automation", cwd });
        runTerminalCwd = cwd;
    }
    runTerminal.show(true);
    runTerminal.sendText(command);
}
// ── webhook ───────────────────────────────────────────────────────────────────
async function runWebhook(action, ctx) {
    const url = (0, interpolate_1.interpolate)(action.url, ctx);
    const body = action.body ? (0, interpolate_1.interpolate)(action.body, ctx) : undefined;
    try {
        await fetch(url, { method: action.method ?? "POST", headers: action.headers ?? {}, body });
    }
    catch (e) {
        log_1.log.error(`Webhook to ${url} failed`, e);
    }
}
//# sourceMappingURL=dispatcher.js.map