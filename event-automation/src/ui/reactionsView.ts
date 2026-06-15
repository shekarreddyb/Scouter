import * as vscode from "vscode";
import { Rule } from "../model/rule";

class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: Rule, index: number) {
    super(rule.name ?? `Rule ${index + 1}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = rule.on.join(", ");
    this.tooltip = [
      `on: ${rule.on.join(", ")}`,
      rule.when ? `when: ${rule.when}` : undefined,
      `actions: ${rule.do.map((a) => a.type).join(", ")}`,
      rule.execute === "parallel" ? "execute: parallel" : undefined,
      rule.enabled === false ? "(disabled)" : undefined,
    ].filter(Boolean).join("\n");
    this.iconPath = new vscode.ThemeIcon(rule.enabled === false ? "circle-slash" : "zap");
    this.contextValue = "rule";
  }
}

class ActionItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("play");
  }
}

export class ReactionsView implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private rules: Rule[] = [];

  setRules(rules: Rule[]): void {
    this.rules = rules;
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      if (this.rules.length === 0) {
        const empty = new vscode.TreeItem("No rules loaded");
        empty.iconPath = new vscode.ThemeIcon("info");
        return [empty];
      }
      return this.rules.map((r, i) => new RuleItem(r, i));
    }
    if (element instanceof RuleItem) {
      return element.rule.do.map((a) => {
        let detail = "";
        if (a.type === "publish") { detail = a.event; }
        else if (a.type === "notify") { detail = a.text; }
        else if (a.type === "parallel") { detail = `${a.actions.length} actions`; }
        else if (a.type === "run") { detail = a.command; }
        else if (a.type === "statusBar") { detail = a.text; }
        return new ActionItem(detail ? `${a.type}: ${detail}` : a.type);
      });
    }
    return [];
  }
}
