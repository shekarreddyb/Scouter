using Microsoft.Win32;
using EventOverlay.Core.Models;

namespace EventOverlay.App.EventSources;

/// <summary>
/// Publishes OS-level system events via Microsoft.Win32.SystemEvents.
///
/// Event types:
///   system.suspended   system.resumed
///   system.locked      system.unlocked
///   system.logon       system.logoff
///   system.remote-connect  system.remote-disconnect
/// </summary>
internal sealed class SystemEventSource : EventSourceBase
{
    private bool _started;

    public override void Start()
    {
        if (_started) return;
        _started = true;
        SystemEvents.PowerModeChanged += OnPowerMode;
        SystemEvents.SessionSwitch    += OnSessionSwitch;
    }

    public override void Stop()
    {
        if (!_started) return;
        _started = false;
        SystemEvents.PowerModeChanged -= OnPowerMode;
        SystemEvents.SessionSwitch    -= OnSessionSwitch;
    }

    private void OnPowerMode(object sender, PowerModeChangedEventArgs e)
    {
        var type = e.Mode switch
        {
            PowerModes.Suspend => "system.suspended",
            PowerModes.Resume  => "system.resumed",
            _                  => null,
        };
        if (type is not null) Publish(type);
    }

    private void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
    {
        var type = e.Reason switch
        {
            SessionSwitchReason.SessionLock      => "system.locked",
            SessionSwitchReason.SessionUnlock    => "system.unlocked",
            SessionSwitchReason.SessionLogon     => "system.logon",
            SessionSwitchReason.SessionLogoff    => "system.logoff",
            SessionSwitchReason.RemoteConnect    => "system.remote-connect",
            SessionSwitchReason.RemoteDisconnect => "system.remote-disconnect",
            _                                    => null,
        };
        if (type is not null) Publish(type);
    }

    public override void Dispose() => Stop();
}
