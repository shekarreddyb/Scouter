using EventOverlay.Core.Models;

namespace EventOverlay.App.Overlay;

/// <summary>All parameters needed to show one effect in an overlay window.</summary>
public sealed record ShowCommand(
    string?         MediaPath,
    string          Position,
    int             DurationMs,
    AnimationConfig Entry,
    AnimationConfig Motion,
    AnimationConfig Exit,
    string          Size,
    string?         AppIconDataUrl,
    string?         AppName,
    string?         SoundPath
);
