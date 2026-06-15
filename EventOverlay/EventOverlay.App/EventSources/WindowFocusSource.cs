using System.Diagnostics;
using System.Text;
using EventOverlay.App.Native;
using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

/// <summary>
/// Publishes window.focused whenever the foreground window changes.
///
/// Payload fields: title, processName, pid
/// </summary>
internal sealed class WindowFocusSource : EventSourceBase
{
    // Field reference prevents the delegate from being GC'd while the hook is active.
    private Win32.WinEventProc? _proc;
    private IntPtr _hook = IntPtr.Zero;

    public override void Start()
    {
        _proc = OnWinEvent;
        _hook = Win32.SetWinEventHook(
            Win32.EVENT_SYSTEM_FOREGROUND, Win32.EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero, _proc, 0, 0, Win32.WINEVENT_OUTOFCONTEXT);
    }

    public override void Stop()
    {
        if (_hook != IntPtr.Zero) { Win32.UnhookWinEvent(_hook); _hook = IntPtr.Zero; }
        _proc = null;
    }

    private void OnWinEvent(IntPtr hWinEventHook, uint eventType, IntPtr hwnd,
        int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
    {
        if (hwnd == IntPtr.Zero) return;
        Win32.GetWindowThreadProcessId(hwnd, out uint rawPid);
        var pid = (int)rawPid;

        var sb = new StringBuilder(512);
        Win32.GetWindowText(hwnd, sb, sb.Capacity);
        var title = sb.ToString();

        var processName = "";
        try { using var p = Process.GetProcessById(pid); processName = p.ProcessName; }
        catch { }

        Publish("window.focused", pid, new { title, processName, pid });
    }

    public override void Dispose() => Stop();
}
