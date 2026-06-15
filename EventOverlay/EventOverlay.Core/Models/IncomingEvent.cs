using System.Text.Json;
using System.Text.Json.Serialization;

namespace EventOverlay.Core.Models;

/// <summary>
/// The UDP packet published by the VS Code extension (or any other publisher).
/// </summary>
public sealed class IncomingEvent
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public long Timestamp { get; set; }

    /// <summary>Event type, e.g. "test.passed", "build.failed".</summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    /// <summary>Extension host PID. Used to locate the source app's window and screen.</summary>
    [JsonPropertyName("pid")]
    public int Pid { get; set; }

    /// <summary>Parent PID — closer to the VS Code UI process than the extension host PID.</summary>
    [JsonPropertyName("ppid")]
    public int Ppid { get; set; }

    [JsonPropertyName("workspace")]
    public WorkspaceInfo? Workspace { get; set; }

    /// <summary>Arbitrary key/value pairs defined in the publisher's rule payload.</summary>
    [JsonPropertyName("payload")]
    public JsonElement? Payload { get; set; }

    /// <summary>Convenience: get a payload field as a string, or null if missing.</summary>
    public string? GetPayloadString(string key)
    {
        if (Payload is null) return null;
        return Payload.Value.TryGetProperty(key, out var prop) ? prop.ToString() : null;
    }
}

public sealed class WorkspaceInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";
}
