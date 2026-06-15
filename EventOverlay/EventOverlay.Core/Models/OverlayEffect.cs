namespace EventOverlay.Core.Models;

/// <summary>
/// One visual (or audio) action produced by a matched rule.
/// A single rule may have many effects that all fire simultaneously.
/// </summary>
public sealed class OverlayEffect
{
    /// <summary>Media file to display (relative to mediaFolder, or absolute path).</summary>
    public string? Media { get; set; }

    /// <summary>Audio file to play (relative to mediaFolder, or absolute path).</summary>
    public string? Sound { get; set; }

    /// <summary>
    /// Where on screen to show the media.
    /// Options: center (default), top, bottom, top-left, top-right, bottom-left, bottom-right.
    /// </summary>
    public string Position { get; set; } = "center";

    /// <summary>Total visible time in ms (including entry and exit animations). Default 5000.</summary>
    public int DurationMs { get; set; } = 5000;

    /// <summary>
    /// Max size of the media element.
    /// Presets: sm (160 px), md (300 px), lg (450 px), xl (600 px).
    /// Or a raw number like 250 (interpreted as pixels).
    /// </summary>
    public string Size { get; set; } = "md";

    /// <summary>Show the source app's icon + name in the corner of the overlay.</summary>
    public bool ShowAppIcon { get; set; } = false;

    /// <summary>How the element appears. Null = use default (zoom-in, elastic-out, 500 ms).</summary>
    public AnimationConfig? Entry { get; set; }

    /// <summary>Looping animation while visible. Null = use default (float, 12 px, 1400 ms).</summary>
    public AnimationConfig? Motion { get; set; }

    /// <summary>How the element disappears. Null = use default (fade-out, cubic-in, 400 ms).</summary>
    public AnimationConfig? Exit { get; set; }
}
