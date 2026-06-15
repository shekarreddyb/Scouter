using EventOverlay.Core.Models;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace EventOverlay.Core;

public sealed class AppConfig
{
    /// <summary>UDP port to listen on. Must match the publisher's target port.</summary>
    public int Port { get; set; } = 38471;

    /// <summary>
    /// Folder containing media files (GIFs, images, videos, sounds).
    /// Leave null to use the default: %APPDATA%\EventOverlay\media.
    /// </summary>
    public string? MediaFolder { get; set; }

    /// <summary>Rules that decide what to render for each incoming event.</summary>
    public List<OverlayRule> Rules { get; set; } = [];

    /// <summary>Built-in OS event sources (file system, window focus, processes, system).</summary>
    public SourceConfig Sources { get; set; } = new();

    /// <summary>MediaFolder resolved to an absolute path (never null).</summary>
    [YamlIgnore]
    public string ResolvedMediaFolder =>
        string.IsNullOrWhiteSpace(MediaFolder) ? DefaultMediaFolder : MediaFolder;

    // ── Paths ─────────────────────────────────────────────────────────────────

    public static string AppDataFolder =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "EventOverlay");

    public static string DefaultConfigPath =>
        Path.Combine(AppDataFolder, "config.yaml");

    public static string DefaultMediaFolder =>
        Path.Combine(AppDataFolder, "media");

    // ── Serializer setup ──────────────────────────────────────────────────────

    private static readonly IDeserializer Deserializer = new DeserializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .IgnoreUnmatchedProperties()
        .Build();

    private static readonly ISerializer Serializer = new SerializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .ConfigureDefaultValuesHandling(DefaultValuesHandling.OmitNull)
        .Build();

    // ── Load / Save ───────────────────────────────────────────────────────────

    public static AppConfig Load(string? path = null)
    {
        path ??= DefaultConfigPath;
        if (!File.Exists(path))
            return CreateDefault(path);

        try
        {
            var yaml = File.ReadAllText(path);
            var cfg  = Deserializer.Deserialize<AppConfig>(yaml) ?? new AppConfig();
            return cfg;
        }
        catch
        {
            return CreateDefault(path);
        }
    }

    public void Save(string? path = null)
    {
        path ??= DefaultConfigPath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, DefaultYamlHeader + Serializer.Serialize(this));
    }

    private static AppConfig CreateDefault(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, DefaultYamlTemplate);
        var cfg = new AppConfig();
        Directory.CreateDirectory(cfg.ResolvedMediaFolder);
        return cfg;
    }

    // ── Default template ──────────────────────────────────────────────────────

    private const string DefaultYamlHeader = "# EventOverlay configuration — edit and reload via the tray icon\n\n";

    private const string DefaultYamlTemplate = """
# EventOverlay configuration
# Reload via the system tray icon after editing.
# Place media files in %APPDATA%\EventOverlay\media\ (or set mediaFolder below).

port: 38471
# mediaFolder: C:\path\to\media   # omit to use default %APPDATA%\EventOverlay\media

# ── Rules ────────────────────────────────────────────────────────────────────
# Each rule matches incoming events (UDP or OS) and fires one or more effects.
rules:
  - on: "**"         # match every event; use "test.passed", "window.focused", etc. to narrow
    screen: source   # source | primary | secondary | all | 1 | 2 | …
    effects:
      - media: example.gif          # file name from mediaFolder (.gif .png .jpg .mp4 .json/.lottie)
        position: center            # center | top | bottom | top-left | top-right | bottom-left | bottom-right
        durationMs: 5000
        size: lg                    # sm (160px) | md (300px) | lg (450px) | xl (600px) | 250 (custom px)
        showAppIcon: false
        entry:
          type: zoom-in             # zoom-in | fade-in | fly-left | fly-right | fly-top | fly-bottom | bounce-in | drop | path | none
          durationMs: 500
          ease: elastic-out         # linear | cubic-in/out | sine-in/out/in-out | elastic-out | bounce-out | back-out | expo-in/out
        motion:
          type: float               # float | drift | spin | pulse | shake | path | none
          amplitude: 12             # pixels of movement (float / drift / shake)
          speedMs: 1400             # ms per cycle
        exit:
          type: fade-out            # fade-out | zoom-out | fly-left | fly-right | fly-top | fly-bottom | path | none
          durationMs: 400
          ease: cubic-in
      # - sound: success.mp3        # audio-only effect (no media required)

# Path animation example:
#   entry:
#     type: path
#     path: "M -600,0 C -300,-300 300,-300 0,0"   # SVG cubic bezier, ends at (0,0) = rest position
#     durationMs: 700
#   motion:
#     type: path
#     path: "M -50,0 C -25,-40 25,-40 50,0 C 25,40 -25,40 -50,0"   # closed loop
#     speedMs: 2000

# ── OS Event Sources ──────────────────────────────────────────────────────────
# Enable any of these to generate events from the OS in addition to UDP events.
# Then add matching rules above.
#
# Event types by source:
#   fileWatcher  →  file.created  file.changed  file.deleted  file.renamed
#   windowFocus  →  window.focused         (payload: title, processName, pid)
#   processes    →  process.started  process.stopped  (payload: name, pid)
#   system       →  system.suspended  system.resumed
#                   system.locked  system.unlocked
#                   system.logon  system.logoff
#                   system.remote-connect  system.remote-disconnect

sources:
  fileWatcher:
    enabled: false
    paths:
      - C:\Users\YourName\Documents
    filter: "*.*"
    includeSubdirectories: false
    events: [created, changed, deleted, renamed]

  windowFocus:
    enabled: false

  processes:
    enabled: false
    watch: []          # empty = all processes; or ["code.exe", "chrome.exe"]

  system:
    enabled: false
""";
}
