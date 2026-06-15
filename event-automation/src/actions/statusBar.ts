import * as vscode from "vscode";
import { parseDuration } from "../util";

/** Manages a single reusable status bar item driven by `statusBar` actions. */
export class StatusBarActions {
  private item: vscode.StatusBarItem;
  private clearTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  }

  set(text: string, color?: string, tooltip?: string, timeout?: string): void {
    if (this.clearTimer) { clearTimeout(this.clearTimer); this.clearTimer = undefined; }
    this.item.text = text;
    this.item.color = color;
    this.item.tooltip = tooltip;
    this.item.show();
    const ms = parseDuration(timeout);
    if (ms !== undefined) {
      this.clearTimer = setTimeout(() => this.item.hide(), ms);
    }
  }

  dispose(): void {
    if (this.clearTimer) { clearTimeout(this.clearTimer); }
    this.item.dispose();
  }
}
