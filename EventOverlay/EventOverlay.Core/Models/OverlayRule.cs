namespace EventOverlay.Core.Models;

/// <summary>
/// Trigger that matches incoming events and fires one or more <see cref="OverlayEffect"/>s.
/// </summary>
public sealed class OverlayRule
{
    /// <summary>
    /// Event type to match. Supports:
    ///   exact   → "test.passed"
    ///   prefix  → "test.*"   (matches any event under the "test" namespace)
    ///   any     → "**"       (matches every event)
    /// </summary>
    public string On { get; set; } = "";

    /// <summary>
    /// Optional payload filter: "fieldName == value" or "fieldName != value".
    /// The field is looked up in the event's payload JSON object.
    /// </summary>
    public string? When { get; set; }

    /// <summary>
    /// Which screen(s) to use.
    /// Options: source (default), primary, secondary, all, or a 1-based index (1, 2, …).
    /// </summary>
    public string Screen { get; set; } = "source";

    /// <summary>
    /// Visual and audio actions to execute when this rule matches.
    /// All effects in the list fire simultaneously.
    /// </summary>
    public List<OverlayEffect> Effects { get; set; } = [];
}
