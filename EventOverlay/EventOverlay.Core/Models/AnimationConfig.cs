namespace EventOverlay.Core.Models;

/// <summary>
/// Animation settings shared by entry, motion, and exit phases.
/// Which fields are relevant depends on the phase:
///   entry/exit: Type, DurationMs, Ease, Path
///   motion:     Type, Amplitude, SpeedMs, Path
/// </summary>
public sealed class AnimationConfig
{
    // ── Shared ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Entry/Exit types: none, fade-in, zoom-in, fly-left, fly-right, fly-top, fly-bottom,
    ///   bounce-in, drop, path
    /// Motion types: none, float, drift, spin, pulse, shake, path
    /// </summary>
    public string Type { get; set; } = "none";

    // ── Entry / Exit ──────────────────────────────────────────────────────────

    /// <summary>Duration of the entry or exit animation in ms.</summary>
    public int DurationMs { get; set; } = 400;

    /// <summary>
    /// Easing function name.
    /// Options: linear, cubic-in, cubic-out, cubic-in-out,
    ///   sine-in, sine-out, sine-in-out,
    ///   elastic-out, bounce-out, back-out,
    ///   expo-in, expo-out, expo-in-out
    /// </summary>
    public string Ease { get; set; } = "cubic-out";

    // ── Motion ────────────────────────────────────────────────────────────────

    /// <summary>Pixels of movement per half-cycle (float, drift, shake).</summary>
    public double Amplitude { get; set; } = 12;

    /// <summary>Duration of one full animation cycle in ms (float, drift, spin, pulse).</summary>
    public int SpeedMs { get; set; } = 1400;

    // ── Path ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// SVG path string for type: path.
    /// Entry/Exit: defines trajectory from start to rest (origin), e.g. "M -500,0 C -200,-200 200,-200 0,0"
    /// Motion: loops along this path, e.g. "M -40,0 C -20,-60 20,-60 40,0 C 20,60 -20,60 -40,0"
    /// All coordinates are relative to the element's placed position (0,0 = at rest).
    /// </summary>
    public string? Path { get; set; }

    // ── Defaults ──────────────────────────────────────────────────────────────

    public static readonly AnimationConfig DefaultEntry = new()
    {
        Type       = "zoom-in",
        DurationMs = 500,
        Ease       = "elastic-out",
    };

    public static readonly AnimationConfig DefaultMotion = new()
    {
        Type      = "float",
        Amplitude = 12,
        SpeedMs   = 1400,
    };

    public static readonly AnimationConfig DefaultExit = new()
    {
        Type       = "fade-out",
        DurationMs = 400,
        Ease       = "cubic-in",
    };
}
