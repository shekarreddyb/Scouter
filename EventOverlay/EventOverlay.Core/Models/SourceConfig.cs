namespace EventOverlay.Core.Models;

/// <summary>Root config for all built-in OS event sources.</summary>
public sealed class SourceConfig
{
    public FileWatcherConfig? FileWatcher { get; set; }
    public WindowFocusConfig? WindowFocus { get; set; }
    public ProcessConfig?     Processes   { get; set; }
    public SystemConfig?      System      { get; set; }
}

public sealed class FileWatcherConfig
{
    public bool         Enabled               { get; set; } = false;
    /// <summary>Absolute folder paths to watch.</summary>
    public List<string> Paths                 { get; set; } = [];
    /// <summary>File filter glob, e.g. "*.cs" or "*.*".</summary>
    public string       Filter                { get; set; } = "*.*";
    public bool         IncludeSubdirectories { get; set; } = false;
    /// <summary>Which change types to publish. Values: created, changed, deleted, renamed.</summary>
    public List<string> Events                { get; set; } = ["created", "changed", "deleted", "renamed"];
}

public sealed class WindowFocusConfig
{
    public bool Enabled { get; set; } = false;
}

public sealed class ProcessConfig
{
    public bool         Enabled { get; set; } = false;
    /// <summary>
    /// Process names to watch (e.g. ["code.exe", "chrome.exe"]).
    /// Empty list = watch ALL processes (high-volume — use filters in rules instead).
    /// </summary>
    public List<string> Watch   { get; set; } = [];
}

public sealed class SystemConfig
{
    public bool Enabled { get; set; } = false;
}
