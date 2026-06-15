using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using EventOverlay.Core.Models;

namespace EventOverlay.Core;

/// <summary>
/// Listens on a UDP port and fires <see cref="EventReceived"/> for every
/// valid JSON packet that deserializes to <see cref="IncomingEvent"/>.
/// </summary>
public sealed class UdpListener : IDisposable
{
    private UdpClient? _udp;
    private CancellationTokenSource? _cts;

    public event EventHandler<IncomingEvent>? EventReceived;
    public event EventHandler<string>? ParseError;

    public int Port { get; private set; }
    public bool IsRunning { get; private set; }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public void Start(int port)
    {
        if (IsRunning) return;
        Port = port;
        _cts = new CancellationTokenSource();
        _udp = new UdpClient(new IPEndPoint(IPAddress.Loopback, port));
        IsRunning = true;
        _ = ReceiveLoopAsync(_cts.Token);
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var result = await _udp!.ReceiveAsync(ct);
                var json = Encoding.UTF8.GetString(result.Buffer);
                var evt = JsonSerializer.Deserialize<IncomingEvent>(json, JsonOpts);
                if (evt is not null && !string.IsNullOrWhiteSpace(evt.Type))
                    EventReceived?.Invoke(this, evt);
            }
            catch (OperationCanceledException) { break; }
            catch (JsonException ex) { ParseError?.Invoke(this, ex.Message); }
            catch { /* ignore transient socket errors */ }
        }
        IsRunning = false;
    }

    public void Dispose()
    {
        _cts?.Cancel();
        _udp?.Dispose();
    }
}
