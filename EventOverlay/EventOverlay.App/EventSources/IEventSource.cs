using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

internal interface IEventSource : IDisposable
{
    event EventHandler<IncomingEvent>? EventReceived;
    void Start();
    void Stop();
}
