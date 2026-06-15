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
exports.isPatched = isPatched;
exports.patch = patch;
exports.unpatch = unpatch;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const vscode = __importStar(require("vscode"));
const log_1 = require("../log");
const MARKER_S = "/*EA-OVERLAY:START*/";
const MARKER_E = "/*EA-OVERLAY:END*/";
// ── Path resolution ──────────────────────────────────────────────────────────
function wbJsPath() {
    const base = path.join(vscode.env.appRoot, "out", "vs", "workbench");
    for (const name of [
        "workbench.desktop.main.js",
        "workbench.desktop.sandbox.main.js",
    ]) {
        const p = path.join(base, name);
        if (fs.existsSync(p))
            return p;
    }
    return path.join(base, "workbench.desktop.main.js");
}
function productJsonPath() {
    return path.join(vscode.env.appRoot, "product.json");
}
function bootstrapTemplatePath(extensionPath) {
    return path.join(extensionPath, "overlay-dist", "bootstrap.js");
}
// ── Checksum helpers ─────────────────────────────────────────────────────────
function sha256b64(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("base64");
}
function updateChecksum(targetPath) {
    const pjPath = productJsonPath();
    if (!fs.existsSync(pjPath))
        return;
    try {
        const product = JSON.parse(fs.readFileSync(pjPath, "utf8"));
        const checksums = product.checksums;
        if (!checksums)
            return;
        // Key is relative to appRoot with forward slashes
        const key = path.relative(vscode.env.appRoot, targetPath).replace(/\\/g, "/");
        if (key in checksums) {
            checksums[key] = sha256b64(targetPath);
            fs.writeFileSync(pjPath, JSON.stringify(product, null, "\t"), "utf8");
            log_1.log.info(`Updated product.json checksum for ${key}`);
        }
    }
    catch (e) {
        log_1.log.warn(`Could not update product.json checksum: ${e}`);
    }
}
// ── Strip existing injection ─────────────────────────────────────────────────
function strip(src) {
    const s = src.indexOf(MARKER_S);
    const e = src.indexOf(MARKER_E);
    if (s < 0 || e < 0)
        return src;
    return src.slice(0, s) + src.slice(e + MARKER_E.length);
}
// ── Public API ───────────────────────────────────────────────────────────────
function isPatched() {
    const p = wbJsPath();
    return fs.existsSync(p) && fs.readFileSync(p, "utf8").includes(MARKER_S);
}
function patch(extensionPath, port) {
    const jsPath = wbJsPath();
    if (!fs.existsSync(jsPath)) {
        log_1.log.warn(`Workbench JS not found: ${jsPath}`);
        return false;
    }
    const tmplPath = bootstrapTemplatePath(extensionPath);
    if (!fs.existsSync(tmplPath)) {
        log_1.log.warn(`Bootstrap template not found: ${tmplPath}`);
        return false;
    }
    try {
        const bootstrap = fs.readFileSync(tmplPath, "utf8").replace(/__PORT__/g, String(port));
        let src = fs.readFileSync(jsPath, "utf8");
        src = strip(src);
        src += `\n${MARKER_S}\n${bootstrap}\n${MARKER_E}\n`;
        fs.writeFileSync(jsPath, src, "utf8");
        updateChecksum(jsPath);
        log_1.log.info(`Overlay patched into ${path.basename(jsPath)} on port ${port}`);
        return true;
    }
    catch (e) {
        log_1.log.error("Failed to patch workbench JS", e);
        return false;
    }
}
function unpatch() {
    const jsPath = wbJsPath();
    if (!fs.existsSync(jsPath))
        return;
    try {
        const src = strip(fs.readFileSync(jsPath, "utf8"));
        fs.writeFileSync(jsPath, src, "utf8");
        updateChecksum(jsPath);
        log_1.log.info("Overlay removed from workbench JS");
    }
    catch (e) {
        log_1.log.error("Failed to unpatch workbench JS", e);
    }
}
//# sourceMappingURL=patcher.js.map