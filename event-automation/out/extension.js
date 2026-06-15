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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const log_1 = require("./log");
const rule_1 = require("./model/rule");
const event_1 = require("./model/event");
const loader_1 = require("./config/loader");
const ruleEngine_1 = require("./engine/ruleEngine");
const statusBar_1 = require("./actions/statusBar");
const sources_1 = require("./sources");
const statusBarToggle_1 = require("./ui/statusBarToggle");
const reactionsView_1 = require("./ui/reactionsView");
const api_1 = require("./api");
const STARTER = `# Event Automation rules
# Events are published via UDP to the desktop utility (default port 38471).
config:
  publishTo: udp://127.0.0.1:38471

rules:
  - name: File saved
    on: file.saved
    cooldown: 3s
    do:
      - publish: file.saved
        payload:
          file: "\${file}"
      - statusBar:
          text: "✅ Saved \${file}"
          timeout: 4s
`;
let current = { config: rule_1.DEFAULT_CONFIG, rules: [] };
function activate(context) {
    (0, log_1.initLog)();
    log_1.log.info("Event Automation activating");
    const getConfig = () => current.config;
    const statusBar = new statusBar_1.StatusBarActions();
    const mute = new statusBarToggle_1.MuteToggle();
    const view = new reactionsView_1.ReactionsView();
    const custom = new Map();
    const services = { statusBar, custom, getConfig };
    const settings = () => vscode.workspace.getConfiguration("eventAutomation");
    const isEnabled = () => settings().get("enabled", true) && current.config.enabled && !mute.isMuted();
    const engine = new ruleEngine_1.RuleEngine(services, isEnabled);
    const { api, programmatic } = (0, api_1.createApi)(engine, services);
    const diagnostics = vscode.languages.createDiagnosticCollection("eventAutomation");
    function configPath() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return undefined;
        }
        const rel = settings().get("configFile", ".vscode/automations.yaml");
        return path.join(folder.uri.fsPath, rel);
    }
    function reload() {
        const file = configPath();
        if (!file) {
            log_1.log.warn("No workspace folder open; rules not loaded.");
            view.setRules([]);
            return;
        }
        const { parsed, problems } = (0, loader_1.loadConfigFromFile)(file);
        current = parsed;
        engine.setRules(parsed.rules, parsed.config);
        view.setRules(parsed.rules);
        diagnostics.clear();
        const errors = problems.filter((p) => p.severity === "error");
        for (const p of problems) {
            log_1.log[p.severity === "error" ? "error" : "warn"](p.message);
        }
        if (errors.length > 0) {
            vscode.window.showWarningMessage(`Event Automation: ${errors.length} problem(s) in rules. See the output channel.`);
        }
        log_1.log.info(`Loaded ${parsed.rules.length} rule(s) from ${path.basename(file)}`);
        custom.clear();
        programmatic.length = 0;
        (0, api_1.loadHooks)(api);
        engine.setProgrammatic(programmatic);
    }
    reload();
    const file = configPath();
    if (file) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(file), path.basename(file)));
        watcher.onDidChange(reload);
        watcher.onDidCreate(reload);
        watcher.onDidDelete(reload);
        context.subscriptions.push(watcher);
    }
    const sourceDisposables = (0, sources_1.registerSources)((ctx) => { void engine.handle(ctx); });
    context.subscriptions.push(...sourceDisposables);
    context.subscriptions.push(vscode.commands.registerCommand("eventAutomation.reload", () => {
        reload();
        vscode.window.showInformationMessage("Event Automation: rules reloaded.");
    }), vscode.commands.registerCommand("eventAutomation.toggleMute", () => {
        mute.toggle();
        vscode.window.setStatusBarMessage(mute.isMuted() ? "Event Automation muted" : "Event Automation active", 2000);
    }), vscode.commands.registerCommand("eventAutomation.testFire", async () => {
        const rules = engine.getRules();
        if (rules.length === 0) {
            vscode.window.showInformationMessage("No rules to test.");
            return;
        }
        const pick = await vscode.window.showQuickPick(rules.map((r, i) => ({ label: r.name ?? `Rule ${i + 1}`, description: r.on.join(", "), index: i })), { placeHolder: "Pick a rule to test fire" });
        if (!pick) {
            return;
        }
        const rule = rules[pick.index];
        await engine.fireRule(rule, (0, event_1.makeEvent)(rule.on[0].split(".")[0], rule.on[0]));
    }), vscode.commands.registerCommand("eventAutomation.openConfig", async () => {
        const f = configPath();
        if (!f) {
            vscode.window.showWarningMessage("Open a folder first.");
            return;
        }
        if (!fs.existsSync(f)) {
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, STARTER, "utf8");
        }
        const doc = await vscode.workspace.openTextDocument(f);
        await vscode.window.showTextDocument(doc);
    }), vscode.commands.registerCommand("eventAutomation.emitEvent", async (arg) => {
        const name = arg ?? (await vscode.window.showInputBox({
            prompt: "Event to emit (e.g. command.deploy)",
            value: "command.",
        }));
        if (!name) {
            return;
        }
        const source = name.split(".")[0] || "command";
        await engine.handle((0, event_1.makeEvent)(source, name, { commandId: name }));
    }), diagnostics, { dispose: () => statusBar.dispose() }, { dispose: () => mute.dispose() }, { dispose: () => view.dispose() });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("eventAutomation")) {
            reload();
        }
    }), vscode.window.registerTreeDataProvider("eventAutomation.reactions", view));
    log_1.log.info("Event Automation activated");
}
function deactivate() {
    // disposables handled by context.subscriptions
}
//# sourceMappingURL=extension.js.map