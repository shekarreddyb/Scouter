using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using EventOverlay.Core;

namespace EventOverlay.App.Services;

/// <summary>
/// System tray icon with a context menu for common actions.
/// </summary>
internal sealed class TrayIconService : IDisposable
{
    private readonly NotifyIcon _tray;

    public TrayIconService(AppConfig config, Action onReload, Action onExit)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Config File", null, (_, _) => OpenFile(AppConfig.DefaultConfigPath));
        menu.Items.Add("Open Media Folder", null, (_, _) => OpenFolder(config.ResolvedMediaFolder));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Reload Config", null, (_, _) => onReload());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => onExit());

        _tray = new NotifyIcon
        {
            Text = "Event Overlay",
            Icon = LoadIcon(),
            ContextMenuStrip = menu,
            Visible = true,
        };
    }

    public void ShowBalloon(string title, string text, ToolTipIcon icon = ToolTipIcon.Info) =>
        _tray.ShowBalloonTip(3000, title, text, icon);

    public void Dispose()
    {
        _tray.Visible = false;
        _tray.Dispose();
    }

    private static void OpenFile(string path)
    {
        if (!File.Exists(path)) File.WriteAllText(path, "{}");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }

    private static void OpenFolder(string path)
    {
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo("explorer.exe", path) { UseShellExecute = true });
    }

    private static Icon LoadIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "icon.ico");
        return File.Exists(iconPath) ? new Icon(iconPath) : SystemIcons.Application;
    }
}
