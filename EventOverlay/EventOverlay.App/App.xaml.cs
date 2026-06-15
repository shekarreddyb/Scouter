using System.Windows;
using EventOverlay.App.EventSources;
using EventOverlay.App.Overlay;
using EventOverlay.App.Services;
using EventOverlay.Core;
using EventOverlay.Core.Models;
using WpfApp = System.Windows.Application;

namespace EventOverlay.App;

public partial class App : WpfApp
{
    private AppConfig _config = new();
    private readonly UdpListener _listener = new();
    private readonly RuleEngine  _ruleEngine = new();
    private readonly OsEventBus  _osBus = new();
    private OverlayManager? _overlayManager;
    private TrayIconService? _tray;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Invisible placeholder window required so WPF has a MainWindow for DPI calculations.
        var placeholder = new Window
        {
            Width = 0, Height = 0,
            WindowStyle = WindowStyle.None,
            ShowInTaskbar = false,
            Opacity = 0,
        };
        placeholder.Show();
        MainWindow = placeholder;

        LoadConfig();

        _tray = new TrayIconService(_config, onReload: ReloadConfig, onExit: Quit);

        // UDP events
        _listener.EventReceived += OnEventReceived;
        _listener.ParseError    += (_, msg) => System.Diagnostics.Debug.WriteLine($"UDP parse error: {msg}");
        _listener.Start(_config.Port);

        // OS events — routed through the same handler
        _osBus.EventReceived += OnEventReceived;

        _tray.ShowBalloon("Event Overlay",
            $"Listening on UDP :{_config.Port}{ActiveSourcesSummary()}");
    }

    private void OnEventReceived(object? sender, IncomingEvent evt)
    {
        // Marshal to the UI thread for WPF window operations
        Dispatcher.InvokeAsync(() =>
        {
            var matches = _ruleEngine.Match(evt).ToList();
            foreach (var rule in matches)
                _overlayManager?.Show(rule, evt);
        });
    }

    private void LoadConfig()
    {
        _config = AppConfig.Load();
        _ruleEngine.SetRules(_config.Rules);
        _overlayManager?.Dispose();
        _overlayManager = new OverlayManager(_config.ResolvedMediaFolder);
        _osBus.Configure(_config.Sources);
    }

    private void ReloadConfig()
    {
        LoadConfig();
        _tray?.ShowBalloon("Event Overlay", $"Config reloaded.{ActiveSourcesSummary()}");
    }

    private string ActiveSourcesSummary()
    {
        var active = new List<string>();
        if (_config.Sources.FileWatcher?.Enabled == true) active.Add("files");
        if (_config.Sources.WindowFocus?.Enabled == true) active.Add("window-focus");
        if (_config.Sources.Processes?.Enabled   == true) active.Add("processes");
        if (_config.Sources.System?.Enabled       == true) active.Add("system");
        return active.Count > 0 ? $" + OS: {string.Join(", ", active)}" : "";
    }

    private void Quit()
    {
        _osBus.Dispose();
        _listener.Dispose();
        _overlayManager?.Dispose();
        _tray?.Dispose();
        Shutdown();
    }
}
