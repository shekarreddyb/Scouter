using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using EventOverlay.App.Native;

namespace EventOverlay.App.Services;

/// <summary>App metadata extracted from a running process.</summary>
public sealed record AppInfo(string Name, string? ExePath, string? IconDataUrl);

/// <summary>
/// Resolves the screen and app metadata (name, icon) from the PID/PPID
/// included in every incoming UDP event.
/// </summary>
internal static class PidResolver
{
    // Cache keyed by PID — cleared on config reload to avoid stale data
    // if a new process reuses the same PID between app restarts.
    private static readonly ConcurrentDictionary<int, AppInfo> _cache = new();

    public static void ClearCache() => _cache.Clear();

    // ── Screen resolution ─────────────────────────────────────────────────────

    /// <summary>
    /// Finds the physical screen the source app is running on.
    /// Tries <paramref name="pid"/> first (extension host), then
    /// <paramref name="ppid"/> (VS Code main window — the one with a visible UI).
    /// Falls back to the primary screen.
    /// </summary>
    public static Screen ResolveScreen(int pid, int ppid)
    {
        // ppid is usually the VS Code UI process and has a visible window
        var hwnd = FindVisibleWindow(ppid) ?? FindVisibleWindow(pid);
        if (hwnd is null) return Screen.PrimaryScreen ?? Screen.AllScreens[0];

        var hMonitor = Win32.MonitorFromWindow(hwnd.Value, Win32.MONITOR_DEFAULTTONEAREST);
        return Screen.AllScreens
            .FirstOrDefault(s => MonitorHandleMatches(s, hMonitor))
            ?? Screen.PrimaryScreen
            ?? Screen.AllScreens[0];
    }

    // ── App info ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the human-readable name and icon for the source process.
    /// Prefers <paramref name="ppid"/> (VS Code main process) over
    /// <paramref name="pid"/> (extension host subprocess).
    /// Results are cached for the session; call <see cref="ClearCache"/> on
    /// config reload.
    /// </summary>
    public static AppInfo GetAppInfo(int pid, int ppid)
    {
        // Use ppid as cache key: it's the stable VS Code window process
        int cacheKey = ppid > 0 ? ppid : pid;
        return _cache.GetOrAdd(cacheKey, _ =>
            TryGetAppInfo(ppid) ?? TryGetAppInfo(pid) ?? new AppInfo("Unknown App", null, null));
    }

    private static AppInfo? TryGetAppInfo(int pid)
    {
        if (pid <= 0) return null;
        try
        {
            using var process = Process.GetProcessById(pid);
            var exePath = process.MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath)) return null;

            var name = ResolveAppName(exePath);
            var iconDataUrl = ExtractIconDataUrl(exePath);
            return new AppInfo(name, exePath, iconDataUrl);
        }
        catch { return null; }
    }

    // ── Name extraction ───────────────────────────────────────────────────────

    private static string ResolveAppName(string exePath)
    {
        try
        {
            var info = FileVersionInfo.GetVersionInfo(exePath);
            // Prefer ProductName, then FileDescription, then filename
            if (!string.IsNullOrWhiteSpace(info.ProductName))
                return info.ProductName.Trim();
            if (!string.IsNullOrWhiteSpace(info.FileDescription))
                return info.FileDescription.Trim();
        }
        catch { /* fall through */ }

        return Path.GetFileNameWithoutExtension(exePath);
    }

    // ── Icon extraction ───────────────────────────────────────────────────────

    /// <summary>
    /// Extracts the executable's associated icon and returns it as a
    /// base64-encoded PNG data URL suitable for use in WebView2.
    /// Returns null if the icon cannot be read.
    /// </summary>
    private static string? ExtractIconDataUrl(string exePath)
    {
        try
        {
            using var icon = Icon.ExtractAssociatedIcon(exePath);
            if (icon is null) return null;

            // Scale to 48×48 for a crisp badge; the native icon may be 16×16 or 32×32
            using var bmp = new Bitmap(48, 48, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.DrawIcon(icon, new Rectangle(0, 0, 48, 48));
            }

            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
        }
        catch { return null; }
    }

    // ── Win32 helpers ─────────────────────────────────────────────────────────

    private static IntPtr? FindVisibleWindow(int pid)
    {
        if (pid <= 0) return null;
        IntPtr? found = null;
        Win32.EnumWindows((hwnd, _) =>
        {
            Win32.GetWindowThreadProcessId(hwnd, out var winPid);
            if (winPid == (uint)pid && Win32.IsWindowVisible(hwnd))
            {
                found = hwnd;
                return false; // stop enumeration
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static bool MonitorHandleMatches(Screen screen, IntPtr hMonitor)
    {
        var mi = new Win32.MONITORINFO { cbSize = Marshal.SizeOf<Win32.MONITORINFO>() };
        if (!Win32.GetMonitorInfo(hMonitor, ref mi)) return false;
        var r = mi.rcMonitor;
        return screen.Bounds.Left == r.Left && screen.Bounds.Top == r.Top
            && screen.Bounds.Right == r.Right && screen.Bounds.Bottom == r.Bottom;
    }
}
