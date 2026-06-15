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
exports.Stage = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const html_1 = require("./html");
const log_1 = require("../log");
function nonce() {
    let s = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 24; i++)
        s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}
function columnFor(name) {
    switch (name) {
        case "active": return vscode.ViewColumn.Active;
        case "one": return vscode.ViewColumn.One;
        case "two": return vscode.ViewColumn.Two;
        case "three": return vscode.ViewColumn.Three;
        default: return vscode.ViewColumn.Beside;
    }
}
class Stage {
    constructor(context, getConfig) {
        this.context = context;
        this.getConfig = getConfig;
        this.ready = false;
        this.pending = [];
    }
    localRoots() {
        const roots = [this.context.extensionUri];
        for (const f of vscode.workspace.workspaceFolders ?? []) {
            roots.push(f.uri);
        }
        return roots;
    }
    ensurePanel() {
        if (this.disposeTimer) {
            clearTimeout(this.disposeTimer);
            this.disposeTimer = undefined;
        }
        if (this.panel) {
            return this.panel;
        }
        const cfg = this.getConfig();
        const panel = vscode.window.createWebviewPanel("eventAutomation.stage", "Reactions", { viewColumn: columnFor(cfg.stage.column), preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: this.localRoots() });
        const n = nonce();
        panel.webview.html = (0, html_1.stageHtml)(panel.webview.cspSource, n, cfg.stage.background);
        panel.webview.onDidReceiveMessage((msg) => {
            if (msg?.type === "ready") {
                this.ready = true;
                for (const m of this.pending) {
                    panel.webview.postMessage(m);
                }
                this.pending = [];
            }
            else if (msg?.type === "idle") {
                this.onIdle();
            }
        });
        panel.onDidDispose(() => {
            this.panel = undefined;
            this.ready = false;
            this.pending = [];
        });
        this.panel = panel;
        return panel;
    }
    onIdle() {
        const cfg = this.getConfig();
        if (cfg.stage.persist) {
            return;
        }
        if (this.disposeTimer) {
            clearTimeout(this.disposeTimer);
        }
        // small grace period so rapid follow-up events reuse the same panel
        this.disposeTimer = setTimeout(() => {
            this.panel?.dispose();
        }, 800);
    }
    post(message) {
        const panel = this.ensurePanel();
        if (this.ready) {
            panel.webview.postMessage(message);
        }
        else {
            this.pending.push(message);
        }
    }
    /** Resolve a config media path to a webview-usable URI string. */
    resolveUri(file) {
        const cfg = this.getConfig();
        const folder = vscode.workspace.workspaceFolders?.[0];
        let abs;
        if (path.isAbsolute(file)) {
            abs = file;
        }
        else if (folder) {
            abs = path.join(folder.uri.fsPath, cfg.mediaRoot, file);
        }
        else {
            log_1.log.warn(`No workspace folder to resolve media '${file}'`);
            return undefined;
        }
        if (!fs.existsSync(abs)) {
            log_1.log.warn(`Media file not found: ${abs}`);
            return undefined;
        }
        const panel = this.ensurePanel();
        const uri = panel.webview.asWebviewUri(vscode.Uri.file(abs)).toString();
        const ext = path.extname(abs).toLowerCase();
        const mediaType = ext === ".mp4" || ext === ".webm" || ext === ".ogv" ? "video" : "image";
        return { uri, mediaType };
    }
    showMedia(payload) {
        const resolved = this.resolveUri(payload.file);
        if (!resolved) {
            return;
        }
        this.post({
            type: "media",
            payload: {
                uri: resolved.uri,
                mediaType: resolved.mediaType,
                size: payload.size,
                position: payload.position,
                loop: payload.loop,
                durationMs: payload.durationMs,
                animate: payload.animate,
            },
        });
    }
    playSound(file, volume) {
        const resolved = this.resolveUri(file);
        if (!resolved) {
            return;
        }
        this.post({ type: "sound", payload: { uri: resolved.uri, volume } });
    }
    speak(text, rate, volume) {
        this.post({ type: "say", payload: { text, rate, volume } });
    }
    dispose() {
        this.panel?.dispose();
    }
}
exports.Stage = Stage;
//# sourceMappingURL=stage.js.map