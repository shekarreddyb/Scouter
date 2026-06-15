# Event Automation — Technical Summary

## Repository Layout

```
d:\code\vscode\event-automation\
  event-automation\          ← VS Code extension (TypeScript)
    src\
      extension.ts           ← activation entry, wires everything together
      model\
        rule.ts              ← Action + Rule + GlobalConfig interfaces
        event.ts             ← EventContext interface + makeEvent()
      config\
        loader.ts            ← YAML/JSONC parser → ParsedConfig
      engine\
        ruleEngine.ts        ← matching, cooldown, when, execute modes
        expression.ts        ← safe expression evaluator (no eval)
        interpolate.ts       ← ${field} / ${a.b} string templating
      sources\
        index.ts             ← registerSources() aggregator
        workspaceSource.ts   ← file.saved, folder.opened, workspace.loaded, task.*
        terminalSource.ts    ← terminal.started, terminal.finished
        debugSource.ts       ← debug.started, debug.stopped, debug.breakpoint, debug.exception
        gitSource.ts         ← git.commit, git.push, git.pull, git.branchChanged
      actions\
        dispatcher.ts        ← dispatch() switch: publish/notify/run/command/webhook/statusBar
        statusBar.ts         ← status bar text management
      ui\
        statusBarToggle.ts   ← mute toggle button
        reactionsView.ts     ← sidebar tree showing loaded rules
      api.ts                 ← AutomationApi (programmatic rules, registerAction, registerEventSource)
      log.ts                 ← output channel logger
      util.ts                ← parseDuration()

  EventOverlay\              ← WPF desktop utility (C# / .NET 10)
    EventOverlay.Core\       ← shared library, no WPF dependency
      AppConfig.cs           ← YAML config load/save via YamlDotNet
      UdpListener.cs         ← async UDP receive loop
      RuleEngine.cs          ← pattern matching + when-filter
      Models\
        IncomingEvent.cs     ← wire format struct (matches extension publisher)
        OverlayRule.cs       ← On, When, Screen, Effects[]
        OverlayEffect.cs     ← Media, Sound, Position, DurationMs, Size, Entry, Motion, Exit
        AnimationConfig.cs   ← Type, DurationMs, Ease, Amplitude, SpeedMs, Path
        SourceConfig.cs      ← FileWatcherConfig, WindowFocusConfig, ProcessConfig, SystemConfig

    EventOverlay.App\        ← WPF executable
      App.xaml.cs            ← startup, UDP + OS bus wiring, tray, config reload
      Native\
        Win32.cs             ← P/Invoke: window styles, EnumWindows, WinEventHook, MonitorFromWindow
      Overlay\
        OverlayWindow.xaml   ← transparent full-screen Grid (AllowsTransparency=True, no WebView2)
        OverlayWindow.xaml.cs← full native WPF animation engine
        OverlayManager.cs    ← one OverlayWindow per screen, routes effects
        ShowCommand.cs       ← sealed record passed from Manager → Window
      Services\
        TrayIconService.cs   ← NotifyIcon tray with context menu
        PidResolver.cs       ← screen + icon/name extraction from PID/PPID
      EventSources\
        IEventSource.cs      ← interface: Start/Stop/Dispose + EventReceived
        EventSourceBase.cs   ← Publish() helper, JSON payload serialization
        FileWatcherSource.cs ← FileSystemWatcher per path
        WindowFocusSource.cs ← SetWinEventHook(EVENT_SYSTEM_FOREGROUND)
        ProcessSource.cs     ← Timer poll every 2s + Process.GetProcesses() snapshot
        SystemEventSource.cs ← SystemEvents.PowerModeChanged + SessionSwitch
        OsEventBus.cs        ← aggregates all sources, Configure(SourceConfig) on reload
```

---

## 1. VS Code Extension

### Purpose

Listens to VS Code events, evaluates rules from `.vscode/automations.yaml`, and fires
actions — including `publish` which sends a UDP packet to the WPF overlay app.

### Config (`.vscode/automations.yaml`)

```yaml
config:
  publishTo: udp://127.0.0.1:38471   # array also supported
  enabled: true
  commands: []                         # custom palette commands → emit command.<id>

rules:
  - name: Tests passed
    on: test.passed                    # string or list of strings
    when: "passedTests > 0"            # optional safe expression
    cooldown: 3s                       # or raw ms: 3000
    once: false                        # fire only once per session
    priority: 0                        # higher = evaluated first
    stop: false                        # stop evaluating further rules if this matches
    execute: sequential                # or "parallel"
    do:
      - publish: test.passed           # → UDP packet to desktop app
        payload:
          count: "${passedTests}"

      - notify: "Tests: ${passedTests}"
        level: info                    # info | warning | error
        buttons:
          - label: Open Report
            command: workbench.action.focusActiveEditorGroup

      - statusBar:
          text: "✅ ${passedTests} passed"
          color: "#00ff00"
          tooltip: "hover text"
          timeout: 5s

      - run: "npm run report"
        cwd: "${workspace}"

      - command: workbench.action.files.save
        args: []

      - webhook: https://hooks.slack.com/...
        method: POST
        headers:
          Content-Type: application/json
        body: '{"text":"${passedTests} tests passed"}'

      - parallel:
          - publish: test.passed
          - notify: "Both fire at once"
```

### Event Sources

| Source | Events | Key payload fields |
|---|---|---|
| `workspaceSource` | `file.saved`, `folder.opened`, `workspace.loaded` | `file`, `language`, `workspace` |
| `workspaceSource` | `task.started`, `task.finished`, `task.failed` | `taskName`, `exitCode`, `duration` |
| `terminalSource` | `terminal.started`, `terminal.finished` | `exitCode`, `duration`, `sessionName` |
| `debugSource` | `debug.started`, `debug.stopped`, `debug.breakpoint`, `debug.exception` | `configType`, `file`, `line`, `message` |
| `gitSource` | `git.commit`, `git.push`, `git.pull`, `git.branchChanged` | `branch`, `previousBranch`, `remote` |

Custom commands emit `command.<id>` when invoked from the palette.

### Rule Engine Details

- **Matching**: `rule.on` is an array; `ctx.event` must be an exact member.
- **when**: tokenizing safe evaluator — supports `==`, `!=`, `>`, `>=`, `<`, `<=`,
  `&&`, `||`, `!`, dotted member access, string methods `startsWith`/`endsWith`/`includes`.
  No `eval`. Parse errors → rule skipped.
- **cooldown**: `parseDuration("3s")` → 3000 ms. Tracked per-rule in `Map<Rule, number>`.
- **once**: tracked in `Set<Rule>`, cleared on every `setRules()` (config reload).
- **execute: parallel** → `Promise.all`; **sequential** → `for-await` loop.
- **stop**: `return` from `handle()` after this rule — no further rules processed.
- **priority**: rules sorted descending before matching loop.

### String Interpolation

`${fieldName}` or `${a.b}` resolved against `EventContext`. Falls back to `metadata.*`.
Unknown token → empty string.

### Wire Format (publish action)

```json
{
  "id": "uuid",
  "timestamp": 1700000000000,
  "type": "test.passed",
  "pid": 12345,
  "ppid": 12300,
  "workspace": { "name": "MyProject", "path": "C:\\Projects\\MyProject" },
  "payload": { "count": "42" }
}
```

Sent as a single UDP datagram, UTF-8 JSON, to `127.0.0.1:38471` (configurable).
Multiple `publishTo` targets → parallel sends.

### Programmatic API (`automations.js`)

`.vscode/automations.js` is loaded on every config reload (trusted workspaces only):

```js
module.exports.register = function(api) {
  api.on("test.failed", undefined, [api.notify("Tests failed!")]);

  api.registerAction("myAction", (ctx, params) => { /* ... */ });

  api.registerEventSource("mySource", (emit) => {
    setInterval(() => emit("mySource.tick"), 5000);
  });
};
```

### VS Code Commands

| Command | Description |
|---|---|
| `eventAutomation.reload` | Reload config from disk |
| `eventAutomation.toggleMute` | Mute / unmute all rule firing |
| `eventAutomation.testFire` | QuickPick to fire a rule manually |
| `eventAutomation.openConfig` | Open / create `automations.yaml` |
| `eventAutomation.emitEvent` | Manually emit a named event |

---

## 2. WPF Desktop Overlay (EventOverlay)

### Purpose

Receives UDP events (and optionally OS events), matches rules from `config.yaml`,
and renders transparent overlay animations natively in WPF — no WebView2.

### Projects

- **EventOverlay.Core** — .NET 10 Windows class library, no WPF. Config, models, UDP, rule engine.
  Can be reused without WPF.
- **EventOverlay.App** — .NET 10 WinExe with `UseWPF=true` and `UseWindowsForms=true`.
  Overlay windows, tray icon, event sources.

### NuGet Packages

| Package | Version | Purpose |
|---|---|---|
| `YamlDotNet` | 16.3.0 | YAML config serialization (Core) |
| `XamlAnimatedGif` | 2.2.0 | Animated GIF playback (App) |

> **LottieSharp is not used.** It targets .NET Framework and exports `LottieSharp.Path`
> which shadows `System.IO.Path`, causing CS0104 and cascading type errors. Dropped entirely.
> Lottie files are skipped at runtime with a debug log — convert to GIF via lottiefiles.com.

### Config (`%APPDATA%\EventOverlay\config.yaml`)

Created with defaults + full comments on first run:

```yaml
port: 38471
# mediaFolder: C:\path\to\media   # default: %APPDATA%\EventOverlay\media

rules:
  - on: "**"             # "**"=all  "test.*"=prefix  "test.passed"=exact
    when: "field == value"   # optional; field looked up in event payload JSON
    screen: source       # source | primary | secondary | all | 1 | 2 | …
    effects:
      - media: hero.gif            # filename relative to mediaFolder, or absolute path
        sound: cheer.mp3           # optional audio-only or alongside media
        position: center           # center|top|bottom|top-left|top-right|bottom-left|bottom-right
        durationMs: 5000           # total visible time including entry + exit
        size: lg                   # sm=160px  md=300px  lg=450px  xl=600px  or raw px number
        showAppIcon: false         # show source app's icon+name badge

        entry:
          type: zoom-in            # none|fade-in|zoom-in|fly-left|fly-right|fly-top|fly-bottom|bounce-in|drop|path
          durationMs: 500
          ease: elastic-out        # linear|cubic-in|cubic-out|cubic-in-out|
                                   # sine-in|sine-out|sine-in-out|
                                   # elastic-out|bounce-out|back-out|
                                   # expo-in|expo-out|expo-in-out

        motion:
          type: float              # none|float|drift|spin|pulse|shake|path
          amplitude: 12            # pixels of movement per half-cycle
          speedMs: 1400            # ms per full cycle

        exit:
          type: fade-out           # none|fade-out|zoom-out|fly-left|fly-right|fly-top|fly-bottom|path
          durationMs: 400
          ease: cubic-in

# Path animation — SVG path string, coordinates relative to element's placed position:
#   entry:
#     type: path
#     path: "M -600,0 C -300,-300 300,-300 0,0"     # must end at (0,0) = rest position
#     durationMs: 700
#   motion:
#     type: path
#     path: "M -50,0 C -25,-40 25,-40 50,0 C 25,40 -25,40 -50,0"  # closed loop
#     speedMs: 2000
#   exit:
#     type: path
#     path: "M 0,0 L 600,0"                          # flies to the right

sources:
  fileWatcher:
    enabled: false
    paths: [C:\Users\You\Documents]
    filter: "*.*"
    includeSubdirectories: false
    events: [created, changed, deleted, renamed]   # which change types to publish

  windowFocus:
    enabled: false

  processes:
    enabled: false
    watch: []   # empty = all processes; or ["code.exe", "chrome.exe"]

  system:
    enabled: false
```

### Media File Support

| Extension | Renderer | Notes |
|---|---|---|
| `.gif` | `Image` + `XamlAnimatedGif.AnimationBehavior` | `RepeatBehavior.Forever` |
| `.mp4` `.webm` `.ogv` `.avi` `.mov` | `MediaElement` | Auto-plays; no built-in loop |
| `.png` `.jpg` `.bmp` `.tiff` etc | `Image` + `BitmapImage` | Static image |
| `.json` `.lottie` | **Skipped** (debug log) | Convert to GIF via lottiefiles.com |

### WPF Animation Engine (`OverlayWindow.xaml.cs`)

#### Namespace aliases (required in every App file that touches both WPF and WinForms types)

`UseWPF=true` and `UseWindowsForms=true` together cause ambiguity for `Image`, `Color`,
`Point`, `Brushes`, `Orientation`, `HorizontalAlignment`, `VerticalAlignment`. Fix:

```csharp
using WpfImage   = System.Windows.Controls.Image;
using WpfColor   = System.Windows.Media.Color;
using WpfPoint   = System.Windows.Point;
using WpfOrient  = System.Windows.Controls.Orientation;
using WpfHAlign  = System.Windows.HorizontalAlignment;
using WpfVAlign  = System.Windows.VerticalAlignment;
using WpfBrushes = System.Windows.Media.Brushes;
```

#### Transform setup

Every container element gets:

```csharp
el.RenderTransform = new TransformGroup { Children = { sc, tr, ro } };
el.RenderTransformOrigin = new WpfPoint(0.5, 0.5);
// sc = ScaleTransform, tr = TranslateTransform, ro = RotateTransform
```

#### Entry animation implementations

| Type | WPF implementation |
|---|---|
| `zoom-in` | `sc.ScaleX/Y: 0 → 1` via `DoubleAnimation` |
| `fade-in` | `el.Opacity: 0 → 1` |
| `fly-left/right/top/bottom` | `tr.X` or `tr.Y` from ±1400 → 0 |
| `bounce-in` / `drop` | `tr.Y: -1400 → 0` with `BounceEase(Bounces=2, Bounciness=3)` |
| `path` | `DoubleAnimationUsingPath` on both `tr.X` and `tr.Y` from `PathGeometry` |
| `none` | `el.Opacity = 1` immediately |

#### Motion animation implementations (looping)

| Type | WPF implementation |
|---|---|
| `float` | `tr.Y: 0 ↔ -amplitude`, `SineEase`, `AutoReverse=true`, `RepeatBehavior.Forever` |
| `drift` | Float on both X and Y with different speeds |
| `spin` | `ro.Angle: 0 → 360`, `RepeatBehavior.Forever` |
| `pulse` | `sc.ScaleX/Y: 1 ↔ 1 + amplitude/100`, `SineEase` |
| `shake` | `tr.X: -amplitude ↔ +amplitude`, fixed 9 repeats |
| `path` | `DoubleAnimationUsingPath`, `AutoReverse=true`, `RepeatBehavior.Forever` |

#### Exit scheduling

Triggered by a `DispatcherTimer` set at `(durationMs - exitDurationMs)` after entry. Uses
the **SnapStop pattern** to prevent visual snap when a motion animation is active:

```csharp
// 1. Read the current animated value BEFORE cancelling
double snapshot = tr.Y;
// 2. Cancel animation — without step 3 this would snap back to the base value
tr.BeginAnimation(TranslateTransform.YProperty, null);
// 3. Re-pin to the live value so there is no visual jump
tr.SetValue(TranslateTransform.YProperty, snapshot);
// 4. Now start the exit animation from that position
var anim = new DoubleAnimation(snapshot, targetValue, duration);
tr.BeginAnimation(TranslateTransform.YProperty, anim);
```

#### Path animation

SVG path string → `Geometry.Parse()` → `PathGeometry`. Easing approximated via
`AccelerationRatio` / `DecelerationRatio` on `DoubleAnimationUsingPath` (WPF does not
support `IEasingFunction` on path animations).

```csharp
var geom = (PathGeometry)Geometry.Parse("M -600,0 C -300,-300 300,-300 0,0");
new DoubleAnimationUsingPath {
    PathGeometry      = geom,
    Source            = PathAnimationSource.X,  // separate anim for .Y
    Duration          = TimeSpan.FromMilliseconds(durationMs),
    AccelerationRatio = accel,
    DecelerationRatio = decel,
    RepeatBehavior    = loop ? RepeatBehavior.Forever : new RepeatBehavior(1),
    AutoReverse       = loop,
}
```

#### Click-through window

```csharp
int style = Win32.GetWindowLong(hwnd, GWL_EXSTYLE);
Win32.SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW);
```

Applied in the `Loaded` event via `WindowInteropHelper`.

#### Audio

One `MediaPlayer` created per sound file, held in `_audioPlayers` list until `MediaEnded`
fires and it is closed and removed.

### OS Event Sources

All implement `IEventSource : IDisposable` with `EventReceived` event plus `Start()`/`Stop()`.
`EventSourceBase.Publish()` serializes an anonymous object to a `JsonElement` payload and
raises `EventReceived` with an `IncomingEvent`.

| Class | Mechanism | Events published | Payload fields |
|---|---|---|---|
| `FileWatcherSource` | `FileSystemWatcher` per configured path | `file.created` `file.changed` `file.deleted` `file.renamed` | `fullPath`, `name` (+ `oldFullPath`, `oldName` for renamed) |
| `WindowFocusSource` | `SetWinEventHook(EVENT_SYSTEM_FOREGROUND, ...)` | `window.focused` | `title`, `processName`, `pid` |
| `ProcessSource` | `System.Threading.Timer` every 2 s + `Process.GetProcesses()` diff | `process.started` `process.stopped` | `name`, `pid` |
| `SystemEventSource` | `SystemEvents.PowerModeChanged` + `SessionSwitch` | `system.suspended` `system.resumed` `system.locked` `system.unlocked` `system.logon` `system.logoff` `system.remote-connect` `system.remote-disconnect` | none |

**GC trap on WinEventHook**: the `WinEventProc` delegate must be stored in a `private` field,
not a local variable. If stored locally the GC collects it while the hook is active → crash.

```csharp
private Win32.WinEventProc? _proc;   // field keeps it alive
public override void Start() {
    _proc = OnWinEvent;
    _hook = Win32.SetWinEventHook(..., _proc, ...);
}
```

**OsEventBus**: `Configure(SourceConfig)` tears down all active sources, rebuilds them from
the new config, and calls `Start()` on each. Called by `App.xaml.cs` on every config reload.
All sources route to a single `EventReceived` event on the bus.

### Screen Resolution

`OverlayManager.ResolveScreens(rule.Screen, evt)`:

| Value | Behaviour |
|---|---|
| `"source"` | `PidResolver.ResolveScreen(pid, ppid)` — finds source app's monitor |
| `"primary"` | `Screen.PrimaryScreen` |
| `"secondary"` | First non-primary screen |
| `"all"` | Every screen |
| `"1"`, `"2"`, … | `Screen.AllScreens[idx - 1]` |

`PidResolver.ResolveScreen` tries `ppid` first (VS Code UI process, has a visible window),
then `pid` (extension host, usually no window). Uses `EnumWindows` + `MonitorFromWindow`
+ `MONITORINFO` comparison against `Screen.AllScreens`.

### App Icon Badge (`showAppIcon: true`)

`PidResolver.GetAppInfo(pid, ppid)` — reads `Process.MainModule.FileName`,
extracts display name from `FileVersionInfo` (ProductName → FileDescription → filename),
extracts icon via `Icon.ExtractAssociatedIcon()`, scales to 48×48 PNG,
encodes as base64 data URL. Results cached in `ConcurrentDictionary<int, AppInfo>`;
cleared on config reload.

### YAML Serialization (YamlDotNet 16.3.0)

```csharp
new DeserializerBuilder()
    .WithNamingConvention(CamelCaseNamingConvention.Instance)
    .IgnoreUnmatchedProperties()
    .Build()
```

YAML keys are **camelCase** (`durationMs`, `showAppIcon`, `mediaFolder`).
C# properties are **PascalCase** (`DurationMs`, `ShowAppIcon`, `MediaFolder`).
`[YamlIgnore]` is required on computed properties like `ResolvedMediaFolder`.

### C# Rule Engine (`RuleEngine.cs`)

Simpler than the TypeScript version — no cooldown, priority, once, or stop:

- `"**"` → matches any event type.
- `"test.*"` → matches any event starting with `test.`.
- `"test.passed"` → exact string match.
- `when: "field == value"` or `"field != value"` — field looked up in `IncomingEvent.Payload`
  (a `JsonElement?`).

---

## 3. Communication Protocol

```
VS Code extension                       WPF Desktop App
       │                                        │
       │   UDP datagram — UTF-8 JSON            │
       │ ──────────────────────────────────►    │
       │   default: 127.0.0.1:38471             │
```

The port must match on both ends:
`config.publishTo` in `automations.yaml` ↔ `port` in `config.yaml`.

---

## 4. Known Gotchas and Patterns

| Problem | Correct approach |
|---|---|
| `LottieSharp.Path` shadows `System.IO.Path` | Drop LottieSharp; `.json/.lottie` files are skipped with a debug log |
| WPF + WinForms ambiguous types (`Image`, `Color`, etc.) | `using WpfX = System.Windows...` aliases at the top of every affected file |
| Exit animation snaps element back to origin | SnapStop: snapshot value → `BeginAnimation(prop, null)` → `SetValue(snapshot)` → start exit |
| WinEventHook delegate collected by GC → crash | Store the `WinEventProc` delegate as a `private` field, never a local |
| `Process.GetProcesses()` handle leak | `.Dispose()` each `Process` in a `finally` block |
| DPI scaling on multi-monitor overlays | Divide `screen.Bounds` by `CompositionTarget.TransformToDevice.M11/M22` |

---

## 5. Build and Run

```bash
# VS Code extension
cd event-automation
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host

# WPF app
cd EventOverlay
dotnet build      # expect: 0 Error(s), 0 Warning(s)
dotnet run --project EventOverlay.App
```

Config files are created automatically on first run:
- Extension: `.vscode/automations.yaml` (starter template via `openConfig` command)
- WPF app: `%APPDATA%\EventOverlay\config.yaml` (fully annotated default on startup)
