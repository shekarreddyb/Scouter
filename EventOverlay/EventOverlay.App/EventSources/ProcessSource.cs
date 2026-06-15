using System.Diagnostics;
using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

/// <summary>
/// Polls every 2 seconds and publishes events when processes start or stop.
///
/// Event types: process.started  process.stopped
/// Payload fields: name, pid
/// </summary>
internal sealed class ProcessSource : EventSourceBase
{
    private readonly ProcessConfig _config;
    private System.Threading.Timer? _timer;
    // Maps pid → process name so we can report names on process.stopped
    private Dictionary<int, string> _known = [];

    public ProcessSource(ProcessConfig config) => _config = config;

    public override void Start()
    {
        _known = Snapshot();
        _timer = new System.Threading.Timer(Poll, null,
            TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2));
    }

    public override void Stop()
    {
        _timer?.Dispose();
        _timer = null;
    }

    private void Poll(object? state)
    {
        try
        {
            var current = Snapshot();
            bool filter = _config.Watch.Count > 0;

            foreach (var (pid, name) in current)
            {
                if (_known.ContainsKey(pid)) continue;
                if (filter && !_config.Watch.Contains(name, StringComparer.OrdinalIgnoreCase)) continue;
                Publish("process.started", pid, new { name, pid });
            }

            foreach (var (pid, name) in _known)
            {
                if (current.ContainsKey(pid)) continue;
                if (filter && !_config.Watch.Contains(name, StringComparer.OrdinalIgnoreCase)) continue;
                Publish("process.stopped", pid, new { name, pid });
            }

            _known = current;
        }
        catch { }
    }

    private static Dictionary<int, string> Snapshot()
    {
        var map = new Dictionary<int, string>();
        foreach (var p in Process.GetProcesses())
        {
            try { map[p.Id] = p.ProcessName; }
            catch { }
            finally { try { p.Dispose(); } catch { } }
        }
        return map;
    }

    public override void Dispose() => Stop();
}
