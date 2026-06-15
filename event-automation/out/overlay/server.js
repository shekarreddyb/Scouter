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
exports.OverlayServer = void 0;
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const net = __importStar(require("net"));
const vscode = __importStar(require("vscode"));
const log_1 = require("../log");
const MIME = {
    ".gif": "image/gif",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
};
class OverlayServer {
    constructor(getConfig) {
        this.getConfig = getConfig;
        this.clients = new Set();
        this.port = 0;
    }
    async start(preferredPort) {
        this.port = await freePort(preferredPort);
        return new Promise((resolve, reject) => {
            this.srv = http.createServer((req, res) => this.handle(req, res));
            this.srv.on("error", reject);
            this.srv.listen(this.port, "127.0.0.1", () => {
                log_1.log.info(`Overlay server listening on port ${this.port}`);
                resolve();
            });
        });
    }
    handle(req, res) {
        const url = req.url ?? "/";
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (url === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            });
            res.write(":ok\n\n");
            this.clients.add(res);
            req.on("close", () => this.clients.delete(res));
            return;
        }
        if (url.startsWith("/media/")) {
            this.serveMedia(decodeURIComponent(url.slice(7)), res);
            return;
        }
        res.writeHead(404);
        res.end();
    }
    serveMedia(filename, res) {
        const cfg = this.getConfig();
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            res.writeHead(404);
            res.end();
            return;
        }
        const abs = path.isAbsolute(filename)
            ? filename
            : path.join(folder.uri.fsPath, cfg.mediaRoot, filename);
        if (!fs.existsSync(abs)) {
            log_1.log.warn(`Overlay: media file not found: ${abs}`);
            res.writeHead(404);
            res.end();
            return;
        }
        const mime = MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        fs.createReadStream(abs).pipe(res);
    }
    send(msg) {
        const data = `data: ${JSON.stringify(msg)}\n\n`;
        for (const client of this.clients) {
            try {
                client.write(data);
            }
            catch {
                this.clients.delete(client);
            }
        }
    }
    get hasClients() {
        return this.clients.size > 0;
    }
    stop() {
        for (const client of this.clients) {
            try {
                client.destroy();
            }
            catch { /* ignore */ }
        }
        this.clients.clear();
        this.srv?.close();
        this.srv = undefined;
    }
}
exports.OverlayServer = OverlayServer;
function freePort(start) {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.listen(start, "127.0.0.1", () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
        s.on("error", () => resolve(freePort(start + 1)));
    });
}
//# sourceMappingURL=server.js.map