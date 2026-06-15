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
exports.createApi = createApi;
exports.loadHooks = loadHooks;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const event_1 = require("./model/event");
const log_1 = require("./log");
function createApi(engine, services) {
    const programmatic = [];
    const api = {
        on(events, predicate, actions) {
            programmatic.push({
                events: Array.isArray(events) ? events : [events],
                predicate,
                actions,
            });
        },
        registerAction(name, handler) {
            services.custom.set(name, handler);
        },
        registerEventSource(name, setup) {
            setup((event, extra) => engine.handle((0, event_1.makeEvent)(name, event, extra)));
        },
        publish(event, opts) {
            return { type: "publish", event, to: opts?.to, payload: opts?.payload };
        },
        notify(text, level) {
            return { type: "notify", text, level: level ?? "info" };
        },
    };
    return { api, programmatic };
}
/** Load a trusted workspace hooks file (.vscode/automations.js) if present. */
function loadHooks(api) {
    if (!vscode.workspace.isTrusted) {
        log_1.log.warn("Workspace is not trusted; skipping automations.js hooks.");
        return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        return;
    }
    const file = path.join(folder.uri.fsPath, ".vscode", "automations.js");
    try {
        delete require.cache[require.resolve(file)];
        const mod = require(file);
        if (typeof mod.register === "function") {
            mod.register(api);
            log_1.log.info(`Loaded hooks from automations.js`);
        }
    }
    catch (e) {
        if (e?.code !== "MODULE_NOT_FOUND") {
            log_1.log.error(`Failed loading automations.js`, e);
        }
    }
}
//# sourceMappingURL=api.js.map