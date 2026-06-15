using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

/// <summary>
/// Aggregates all OS event sources into a single EventReceived stream.
/// Call Configure() whenever the config is reloaded.
/// </summary>
internal sealed class OsEventBus : IDisposable
{
    private readonly List<IEventSource> _sources = [];

    public event EventHandler<IncomingEvent>? EventReceived;

    public void Configure(SourceConfig config)
    {
        // Tear down existing sources cleanly before reconfiguring
        foreach (var s in _sources) { s.Stop(); s.Dispose(); }
        _sources.Clear();

        if (config.FileWatcher?.Enabled == true)
            Register(new FileWatcherSource(config.FileWatcher));

        if (config.WindowFocus?.Enabled == true)
            Register(new WindowFocusSource());

        if (config.Processes?.Enabled == true)
            Register(new ProcessSource(config.Processes));

        if (config.System?.Enabled == true)
            Register(new SystemEventSource());

        foreach (var s in _sources) s.Start();
    }

    private void Register(IEventSource source)
    {
        source.EventReceived += (_, e) => EventReceived?.Invoke(this, e);
        _sources.Add(source);
    }

    public void Dispose()
    {
        foreach (var s in _sources) { s.Stop(); s.Dispose(); }
        _sources.Clear();
    }
}
