import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { initLog, log } from "./log";
import { DEFAULT_CONFIG, GlobalConfig, ParsedConfig } from "./model/rule";
import { makeEvent } from "./model/event";
import { loadConfigFromFile } from "./config/loader";
import { RuleEngine } from "./engine/ruleEngine";
import { StatusBarActions } from "./actions/statusBar";
import { Services, CustomHandler } from "./actions/dispatcher";
import { registerSources } from "./sources";
import { MuteToggle } from "./ui/statusBarToggle";
import { ReactionsView } from "./ui/reactionsView";
import { createApi, loadHooks } from "./api";

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

let current: ParsedConfig = { config: DEFAULT_CONFIG, rules: [] };

export function activate(context: vscode.ExtensionContext): void {
  initLog();
  log.info("Event Automation activating");

  const getConfig = (): GlobalConfig => current.config;

  const statusBar = new StatusBarActions();
  const mute = new MuteToggle();
  const view = new ReactionsView();
  const custom = new Map<string, CustomHandler>();

  const services: Services = { statusBar, custom, getConfig };

  const settings = () => vscode.workspace.getConfiguration("eventAutomation");
  const isEnabled = () =>
    settings().get<boolean>("enabled", true) && current.config.enabled && !mute.isMuted();

  const engine = new RuleEngine(services, isEnabled);
  const { api, programmatic } = createApi(engine, services);

  const diagnostics = vscode.languages.createDiagnosticCollection("eventAutomation");

  function configPath(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { return undefined; }
    const rel = settings().get<string>("configFile", ".vscode/automations.yaml");
    return path.join(folder.uri.fsPath, rel);
  }

  function reload(): void {
    const file = configPath();
    if (!file) {
      log.warn("No workspace folder open; rules not loaded.");
      view.setRules([]);
      return;
    }
    const { parsed, problems } = loadConfigFromFile(file);
    current = parsed;
    engine.setRules(parsed.rules, parsed.config);
    view.setRules(parsed.rules);

    diagnostics.clear();
    const errors = problems.filter((p) => p.severity === "error");
    for (const p of problems) {
      log[p.severity === "error" ? "error" : "warn"](p.message);
    }
    if (errors.length > 0) {
      vscode.window.showWarningMessage(
        `Event Automation: ${errors.length} problem(s) in rules. See the output channel.`
      );
    }
    log.info(`Loaded ${parsed.rules.length} rule(s) from ${path.basename(file)}`);

    custom.clear();
    programmatic.length = 0;
    loadHooks(api);
    engine.setProgrammatic(programmatic);
  }

  reload();

  const file = configPath();
  if (file) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(file), path.basename(file))
    );
    watcher.onDidChange(reload);
    watcher.onDidCreate(reload);
    watcher.onDidDelete(reload);
    context.subscriptions.push(watcher);
  }

  const sourceDisposables = registerSources((ctx) => { void engine.handle(ctx); });
  context.subscriptions.push(...sourceDisposables);

  context.subscriptions.push(
    vscode.commands.registerCommand("eventAutomation.reload", () => {
      reload();
      vscode.window.showInformationMessage("Event Automation: rules reloaded.");
    }),

    vscode.commands.registerCommand("eventAutomation.toggleMute", () => {
      mute.toggle();
      vscode.window.setStatusBarMessage(
        mute.isMuted() ? "Event Automation muted" : "Event Automation active",
        2000
      );
    }),

    vscode.commands.registerCommand("eventAutomation.testFire", async () => {
      const rules = engine.getRules();
      if (rules.length === 0) {
        vscode.window.showInformationMessage("No rules to test.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        rules.map((r, i) => ({ label: r.name ?? `Rule ${i + 1}`, description: r.on.join(", "), index: i })),
        { placeHolder: "Pick a rule to test fire" }
      );
      if (!pick) { return; }
      const rule = rules[pick.index];
      await engine.fireRule(rule, makeEvent(rule.on[0].split(".")[0], rule.on[0]));
    }),

    vscode.commands.registerCommand("eventAutomation.openConfig", async () => {
      const f = configPath();
      if (!f) { vscode.window.showWarningMessage("Open a folder first."); return; }
      if (!fs.existsSync(f)) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, STARTER, "utf8");
      }
      const doc = await vscode.workspace.openTextDocument(f);
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand("eventAutomation.emitEvent", async (arg?: string) => {
      const name = arg ?? (await vscode.window.showInputBox({
        prompt: "Event to emit (e.g. command.deploy)",
        value: "command.",
      }));
      if (!name) { return; }
      const source = name.split(".")[0] || "command";
      await engine.handle(makeEvent(source, name, { commandId: name }));
    }),

    diagnostics,
    { dispose: () => statusBar.dispose() },
    { dispose: () => mute.dispose() },
    { dispose: () => view.dispose() }
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("eventAutomation")) { reload(); }
    }),
    vscode.window.registerTreeDataProvider("eventAutomation.reactions", view)
  );

  log.info("Event Automation activated");
}

export function deactivate(): void {
  // disposables handled by context.subscriptions
}
