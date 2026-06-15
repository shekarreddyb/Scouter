import * as vscode from "vscode";

export class MuteToggle {
  private item: vscode.StatusBarItem;
  private muted = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 49);
    this.item.command = "eventAutomation.toggleMute";
    this.render();
    this.item.show();
  }

  private render(): void {
    this.item.text = this.muted ? "$(bell-slash) Reactions" : "$(bell) Reactions";
    this.item.tooltip = this.muted
      ? "Event Automation is muted — click to unmute"
      : "Event Automation is active — click to mute";
  }

  toggle(): void {
    this.muted = !this.muted;
    this.render();
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    this.item.dispose();
  }
}
