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
exports.ReactionsView = void 0;
const vscode = __importStar(require("vscode"));
class RuleItem extends vscode.TreeItem {
    constructor(rule, index) {
        super(rule.name ?? `Rule ${index + 1}`, vscode.TreeItemCollapsibleState.Collapsed);
        this.rule = rule;
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
    constructor(label) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("play");
    }
}
class ReactionsView {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
        this.rules = [];
    }
    setRules(rules) {
        this.rules = rules;
        this._onDidChange.fire();
    }
    dispose() {
        this._onDidChange.dispose();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
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
                if (a.type === "publish") {
                    detail = a.event;
                }
                else if (a.type === "notify") {
                    detail = a.text;
                }
                else if (a.type === "parallel") {
                    detail = `${a.actions.length} actions`;
                }
                else if (a.type === "run") {
                    detail = a.command;
                }
                else if (a.type === "statusBar") {
                    detail = a.text;
                }
                return new ActionItem(detail ? `${a.type}: ${detail}` : a.type);
            });
        }
        return [];
    }
}
exports.ReactionsView = ReactionsView;
//# sourceMappingURL=reactionsView.js.map