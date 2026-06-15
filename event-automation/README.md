# Event Automation (VS Code extension)

React to IDE events — tests, tasks, terminal, debugging, Git, workspace — with
media, animations, sounds, speech, notifications, scripts, and webhooks. Rules
are written in a small YAML file; visuals play on a **stage** (a webview that
opens, plays, and closes).

This is a working v0.1 scaffold: it compiles, the config→rule→action pipeline
and the stage animation engine are fully implemented, and every event source is
wired. A few sources are best-effort by nature (noted below).

## Run it

```bash
npm install      # install deps (one time)
npm run compile  # build to out/ (already built in this package)
```

Then in VS Code: open this folder and press **F5** to launch an Extension
Development Host with the extension loaded.

## Configure

Rules live in `.vscode/automations.yaml` in your **target** workspace (the one
open in the dev host). Run **"Event Automation: Open Config File"** from the
command palette to create a starter file, or copy `examples/automations.yaml`.

The fastest way to see it work: add this rule, then save any file.

```yaml
rules:
  - on: file.saved
    cooldown: 3s
    do:
      - statusBar: "✅ Saved ${file}"
        timeout: 4s
```

A media + animation example (drop a `fail.gif` into `media/` first):

```yaml
rules:
  - on: test.failed
    do:
      - media: fail.gif
        animate:
          from: bottom-right
          to: top-left
          duration: 2s
          easing: cubic-bezier(0.4, 0, 0.2, 1)
          fade: { in: 0.3s, out: 0.5s }
      - sound: sad-trombone.wav
```

See `examples/automations.yaml` for curved motion paths, `when` conditions,
spoken confirmations, and notification buttons. The full action and event
reference is in `automation-extension-spec.md`.

## Commands

- **Reload Rules** — re-read the config file.
- **Open Config File** — open/create `.vscode/automations.yaml`.
- **Test Fire a Rule** — run a rule's actions without waiting for the event.
- **Toggle Mute** — global on/off (also the bell icon in the status bar).
- **Emit Custom Event** — fire a `command.<name>` event manually (bind it to a
  keybinding to trigger reactions from your own commands).

The **Reactions** view (Explorer sidebar) lists parsed rules and their actions.

## What's fully wired vs best-effort

Fully wired and reliable:

- `file.saved`, `folder.opened`, `workspace.loaded`
- `task.started`, `task.finished`, `task.failed` (with exit code + duration)
- `terminal.started`, `terminal.finished` (requires shell integration)
- `debug.started`, `debug.stopped`, `debug.breakpoint`, `debug.exception`
- `git.commit`, `git.branchChanged` (via the built-in Git extension API)

Best-effort / limited (by VS Code platform constraints):

- **`test.*`** — derived from terminal commands that look like test runs
  (jest/vitest/pytest/etc.), mapped pass/fail by exit code. There is no stable
  cross-runner results API, so per-test counts aren't always available.
- **`git.push` / `git.pull`** — no clean event exists; not auto-detected in this
  version. Use a `run`/terminal-based rule or the custom event API if you need them.
- **`command.*`** — fired for commands you emit via **Emit Custom Event** or the
  JS API. VS Code doesn't broadcast arbitrary built-in command executions.

## Notes

- **Sound and speech route through the stage webview** (Web Speech API / audio
  element). A `say`- or `sound`-only rule therefore briefly opens a stage panel.
  Set `config.stage.persist: true` to keep one stage alive and avoid the churn.
- The stage is a bounded editor region, not a desktop overlay — animations play
  within the stage panel, not over your source code.
- JS hooks (`.vscode/automations.js` exporting `register(api)`) only load in a
  **trusted** workspace.

## Project layout

```
src/
  extension.ts        wiring + commands
  config/loader.ts    YAML/JSONC -> typed rules
  engine/             expression eval, interpolation, rule engine
  actions/            dispatcher + status bar
  stage/              webview manager + animation engine (html.ts)
  sources/            workspace, task, terminal, debug, git
  ui/                 reactions view, mute toggle
  api.ts              public hook/extension API
schema/automations.schema.json   validation + autocomplete
examples/automations.yaml        worked example
```
