using System.IO;
using System.Windows;
using System.Windows.Forms;
using EventOverlay.App.Services;
using EventOverlay.Core;
using EventOverlay.Core.Models;

namespace EventOverlay.App.Overlay;

/// <summary>
/// Creates and positions one <see cref="OverlayWindow"/> per physical screen,
/// and routes each matched rule's effects to the correct window(s).
/// </summary>
internal sealed class OverlayManager : IDisposable
{
    public static string MediaFolder { get; private set; } = AppConfig.DefaultMediaFolder;

    private readonly Dictionary<string, OverlayWindow> _windows = [];

    public OverlayManager(string mediaFolder)
    {
        MediaFolder = mediaFolder;
    }

    public void UpdateMediaFolder(string folder) => MediaFolder = folder;

    // ── Show ──────────────────────────────────────────────────────────────────

    public void Show(OverlayRule rule, IncomingEvent evt)
    {
        if (rule.Effects.Count == 0) return;

        var screens = ResolveScreens(rule.Screen, evt);

        // Cache app info once per event (not per effect)
        AppInfo? cachedAppInfo = null;
        bool appInfoResolved = false;

        foreach (var effect in rule.Effects)
        {
            var mediaPath = BuildFilePath(effect.Media, MediaFolder);
            var soundPath = BuildFilePath(effect.Sound, MediaFolder);
            if (mediaPath is null && soundPath is null) continue;

            if (effect.ShowAppIcon && !appInfoResolved)
            {
                cachedAppInfo  = PidResolver.GetAppInfo(evt.Pid, evt.Ppid);
                appInfoResolved = true;
            }

            var cmd = new ShowCommand(
                MediaPath:      mediaPath,
                Position:       effect.Position,
                DurationMs:     effect.DurationMs,
                Entry:          effect.Entry  ?? AnimationConfig.DefaultEntry,
                Motion:         effect.Motion ?? AnimationConfig.DefaultMotion,
                Exit:           effect.Exit   ?? AnimationConfig.DefaultExit,
                Size:           effect.Size,
                AppIconDataUrl: effect.ShowAppIcon ? cachedAppInfo?.IconDataUrl : null,
                AppName:        effect.ShowAppIcon ? cachedAppInfo?.Name        : null,
                SoundPath:      soundPath
            );

            foreach (var screen in screens)
                GetOrCreateWindow(screen).ShowEffect(cmd);
        }
    }

    // ── Screen resolution ─────────────────────────────────────────────────────

    private static IEnumerable<Screen> ResolveScreens(string screenConfig, IncomingEvent evt)
    {
        var all = Screen.AllScreens;
        return screenConfig.ToLowerInvariant() switch
        {
            "source"    => [PidResolver.ResolveScreen(evt.Pid, evt.Ppid)],
            "primary"   => [Screen.PrimaryScreen ?? all[0]],
            "secondary" => all.Where(s => !s.Primary).Take(1).DefaultIfEmpty(all[0]).ToArray(),
            "all"       => all,
            _           => int.TryParse(screenConfig, out var idx) && idx >= 1 && idx <= all.Length
                           ? [all[idx - 1]]
                           : [Screen.PrimaryScreen ?? all[0]],
        };
    }

    // ── Window management ─────────────────────────────────────────────────────

    private OverlayWindow GetOrCreateWindow(Screen screen)
    {
        var key = $"{screen.Bounds.Left},{screen.Bounds.Top}";
        if (_windows.TryGetValue(key, out var existing)) return existing;

        var win = new OverlayWindow();
        PositionOnScreen(win, screen);
        win.Show();
        _windows[key] = win;
        return win;
    }

    private static void PositionOnScreen(Window win, Screen screen)
    {
        var source = PresentationSource.FromVisual(System.Windows.Application.Current.MainWindow
            ?? throw new InvalidOperationException("No MainWindow"));
        double dpiX = source?.CompositionTarget?.TransformToDevice.M11 ?? 1.0;
        double dpiY = source?.CompositionTarget?.TransformToDevice.M22 ?? 1.0;

        win.Left   = screen.Bounds.Left   / dpiX;
        win.Top    = screen.Bounds.Top    / dpiY;
        win.Width  = screen.Bounds.Width  / dpiX;
        win.Height = screen.Bounds.Height / dpiY;
    }

    // ── Path helpers ──────────────────────────────────────────────────────────

    private static string? BuildFilePath(string? file, string folder)
    {
        if (string.IsNullOrWhiteSpace(file)) return null;
        return Path.IsPathRooted(file) ? file : Path.Combine(folder, file);
    }

    public void Dispose()
    {
        foreach (var w in _windows.Values)
            w.Close();
        _windows.Clear();
    }
}
