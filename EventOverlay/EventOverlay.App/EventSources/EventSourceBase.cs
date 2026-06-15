using System.Text.Json;
using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

/// <summary>
/// Shared plumbing for all event sources: payload serialization and IncomingEvent construction.
/// </summary>
internal abstract class EventSourceBase : IEventSource
{
    public event EventHandler<IncomingEvent>? EventReceived;

    public abstract void Start();
    public abstract void Stop();
    public abstract void Dispose();

    protected void Publish(string type, int pid = 0, object? payload = null)
    {
        JsonElement? payloadEl = null;
        if (payload is not null)
        {
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(payload));
            payloadEl = doc.RootElement.Clone();
        }

        EventReceived?.Invoke(this, new IncomingEvent
        {
            Id        = Guid.NewGuid().ToString("N"),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Type      = type,
            Pid       = pid,
            Ppid      = 0,
            Payload   = payloadEl,
        });
    }
}
