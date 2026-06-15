using System.IO;
using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

/// <summary>
/// Publishes file system events for configured paths.
///
/// Event types: file.created  file.changed  file.deleted  file.renamed
/// Payload fields: fullPath, name  (+ oldFullPath, oldName for renamed)
/// </summary>
internal sealed class FileWatcherSource : EventSourceBase
{
    private readonly FileWatcherConfig _config;
    private readonly List<FileSystemWatcher> _watchers = [];

    public FileWatcherSource(FileWatcherConfig config) => _config = config;

    public override void Start()
    {
        foreach (var path in _config.Paths)
        {
            if (!Directory.Exists(path)) continue;
            try { _watchers.Add(CreateWatcher(path)); }
            catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[FileWatcher] {path}: {ex.Message}"); }
        }
    }

    private FileSystemWatcher CreateWatcher(string path)
    {
        var w = new FileSystemWatcher(path)
        {
            Filter                = _config.Filter,
            IncludeSubdirectories = _config.IncludeSubdirectories,
            NotifyFilter          = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.DirectoryName,
        };

        var evts = _config.Events;
        if (evts.Contains("created",  StringComparer.OrdinalIgnoreCase))
            w.Created += (_, e) => Publish("file.created",  0, new { fullPath = e.FullPath, name = e.Name });
        if (evts.Contains("changed",  StringComparer.OrdinalIgnoreCase))
            w.Changed += (_, e) => Publish("file.changed",  0, new { fullPath = e.FullPath, name = e.Name });
        if (evts.Contains("deleted",  StringComparer.OrdinalIgnoreCase))
            w.Deleted += (_, e) => Publish("file.deleted",  0, new { fullPath = e.FullPath, name = e.Name });
        if (evts.Contains("renamed",  StringComparer.OrdinalIgnoreCase))
            w.Renamed += (_, e) => Publish("file.renamed",  0,
                new { fullPath = e.FullPath, name = e.Name, oldFullPath = e.OldFullPath, oldName = e.OldName });

        w.EnableRaisingEvents = true;
        return w;
    }

    public override void Stop()
    {
        foreach (var w in _watchers) { w.EnableRaisingEvents = false; w.Dispose(); }
        _watchers.Clear();
    }

    public override void Dispose() => Stop();
}
