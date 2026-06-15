using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using EventOverlay.App.Native;
using EventOverlay.Core.Models;
using XamlAnimatedGif;

// Disambiguate types that clash between System.Drawing, System.Windows.Forms and System.Windows
using WpfImage   = System.Windows.Controls.Image;
using WpfColor   = System.Windows.Media.Color;
using WpfPoint   = System.Windows.Point;
using WpfOrient  = System.Windows.Controls.Orientation;
using WpfHAlign  = System.Windows.HorizontalAlignment;
using WpfVAlign  = System.Windows.VerticalAlignment;
using WpfBrushes = System.Windows.Media.Brushes;

namespace EventOverlay.App.Overlay;

/// <summary>
/// Transparent, always-on-top, click-through window covering one screen.
/// Renders all effects natively via WPF — no WebView2 required.
/// </summary>
public partial class OverlayWindow : Window
{
    // Keeps MediaPlayer instances alive until audio finishes
    private readonly List<MediaPlayer> _audioPlayers = [];

    public OverlayWindow()
    {
        InitializeComponent();
        Loaded += (_, _) => MakeClickThrough();
    }

    private void MakeClickThrough()
    {
        var hwnd  = new WindowInteropHelper(this).Handle;
        int style = Win32.GetWindowLong(hwnd, Win32.GWL_EXSTYLE);
        Win32.SetWindowLong(hwnd, Win32.GWL_EXSTYLE,
            style | Win32.WS_EX_TRANSPARENT | Win32.WS_EX_TOOLWINDOW);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public void ShowEffect(ShowCommand cmd)
    {
        if (cmd.SoundPath is not null)
            PlayAudio(cmd.SoundPath);

        if (cmd.MediaPath is null) return;

        var maxSize      = ParseSize(cmd.Size);
        var mediaEl      = CreateMediaElement(cmd.MediaPath, maxSize);
        if (mediaEl is null) return;
        var container    = WrapInContainer(mediaEl, cmd.AppIconDataUrl, cmd.AppName);
        var (sc, tr, ro) = AttachTransforms(container);

        SetPosition(container, cmd.Position);
        container.Opacity = 0;
        Stage.Children.Add(container);

        container.Loaded += (_, _) =>
        {
            ApplyEntry(container, sc, tr, cmd.Entry);
            ApplyMotion(tr, ro, sc, cmd.Motion);
            ScheduleExit(container, sc, tr, cmd.Exit, cmd.DurationMs);
        };
    }

    // ── Media element ─────────────────────────────────────────────────────────

    private static FrameworkElement? CreateMediaElement(string path, double maxSize)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();

        if (ext is ".json" or ".lottie")
        {
            // No .NET 10-compatible WPF Lottie renderer exists yet.
            // Convert the file to GIF via lottiefiles.com or bodymovin.
            System.Diagnostics.Debug.WriteLine($"[Overlay] Lottie not supported: {path}");
            return null;
        }

        if (ext == ".gif")
        {
            var img = new WpfImage { MaxWidth = maxSize, MaxHeight = maxSize, Stretch = Stretch.Uniform };
            AnimationBehavior.SetSourceUri(img, new Uri(path, UriKind.Absolute));
            AnimationBehavior.SetRepeatBehavior(img, RepeatBehavior.Forever);
            return img;
        }

        if (ext is ".mp4" or ".webm" or ".ogv" or ".avi" or ".mov")
        {
            var player = new MediaElement
            {
                Source         = new Uri(path, UriKind.Absolute),
                LoadedBehavior = MediaState.Manual,
                MaxWidth       = maxSize,
                MaxHeight      = maxSize,
                Stretch        = Stretch.Uniform,
            };
            player.MediaOpened += (_, _) => player.Play();
            player.MediaEnded  += (_, _) => player.Stop();
            return player;
        }

        return new WpfImage
        {
            Source    = new BitmapImage(new Uri(path, UriKind.Absolute)),
            MaxWidth  = maxSize,
            MaxHeight = maxSize,
            Stretch   = Stretch.Uniform,
        };
    }

    // ── Container + badge ─────────────────────────────────────────────────────

    private static Grid WrapInContainer(FrameworkElement media, string? iconDataUrl, string? appName)
    {
        var grid = new Grid();
        grid.Children.Add(media);

        if (iconDataUrl is not null || appName is not null)
        {
            var badge = BuildBadge(iconDataUrl, appName);
            badge.HorizontalAlignment = WpfHAlign.Right;
            badge.VerticalAlignment   = WpfVAlign.Bottom;
            badge.Margin              = new Thickness(0, 0, 6, 6);
            grid.Children.Add(badge);
        }

        return grid;
    }

    private static Border BuildBadge(string? iconDataUrl, string? appName)
    {
        var panel = new StackPanel
        {
            Orientation       = WpfOrient.Horizontal,
            VerticalAlignment = WpfVAlign.Center,
        };

        if (iconDataUrl is not null)
        {
            var src = LoadFromDataUrl(iconDataUrl);
            if (src is not null)
            {
                panel.Children.Add(new WpfImage
                {
                    Source  = src,
                    Width   = 20,
                    Height  = 20,
                    Stretch = Stretch.Uniform,
                    Margin  = new Thickness(0, 0, appName is not null ? 5 : 0, 0),
                });
            }
        }

        if (appName is not null)
        {
            panel.Children.Add(new TextBlock
            {
                Text              = appName,
                Foreground        = WpfBrushes.White,
                FontSize          = 11,
                FontWeight        = FontWeights.Medium,
                VerticalAlignment = WpfVAlign.Center,
            });
        }

        return new Border
        {
            Background   = new SolidColorBrush(WpfColor.FromArgb(180, 0, 0, 0)),
            CornerRadius = new CornerRadius(6),
            Padding      = new Thickness(5, 3, 7, 3),
            Child        = panel,
        };
    }

    private static BitmapImage? LoadFromDataUrl(string dataUrl)
    {
        try
        {
            var comma = dataUrl.IndexOf(',');
            if (comma < 0) return null;
            var bytes = Convert.FromBase64String(dataUrl[(comma + 1)..]);
            using var ms = new MemoryStream(bytes);
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.StreamSource = ms;
            bmp.CacheOption  = BitmapCacheOption.OnLoad;
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
        catch { return null; }
    }

    // ── Positioning ───────────────────────────────────────────────────────────

    private static void SetPosition(FrameworkElement el, string position)
    {
        const double edge = 40;
        switch (position.ToLowerInvariant())
        {
            case "top":
                el.HorizontalAlignment = WpfHAlign.Center; el.VerticalAlignment = WpfVAlign.Top;
                el.Margin = new Thickness(0, edge, 0, 0); break;
            case "bottom":
                el.HorizontalAlignment = WpfHAlign.Center; el.VerticalAlignment = WpfVAlign.Bottom;
                el.Margin = new Thickness(0, 0, 0, edge); break;
            case "top-left":
                el.HorizontalAlignment = WpfHAlign.Left; el.VerticalAlignment = WpfVAlign.Top;
                el.Margin = new Thickness(edge, edge, 0, 0); break;
            case "top-right":
                el.HorizontalAlignment = WpfHAlign.Right; el.VerticalAlignment = WpfVAlign.Top;
                el.Margin = new Thickness(0, edge, edge, 0); break;
            case "bottom-left":
                el.HorizontalAlignment = WpfHAlign.Left; el.VerticalAlignment = WpfVAlign.Bottom;
                el.Margin = new Thickness(edge, 0, 0, edge); break;
            case "bottom-right":
                el.HorizontalAlignment = WpfHAlign.Right; el.VerticalAlignment = WpfVAlign.Bottom;
                el.Margin = new Thickness(0, 0, edge, edge); break;
            default: // "center"
                el.HorizontalAlignment = WpfHAlign.Center; el.VerticalAlignment = WpfVAlign.Center;
                el.Margin = new Thickness(0); break;
        }
    }

    // ── Transform setup ───────────────────────────────────────────────────────

    private static (ScaleTransform sc, TranslateTransform tr, RotateTransform ro)
        AttachTransforms(FrameworkElement el)
    {
        var sc = new ScaleTransform(1, 1);
        var tr = new TranslateTransform(0, 0);
        var ro = new RotateTransform(0);
        el.RenderTransform       = new TransformGroup { Children = { sc, tr, ro } };
        el.RenderTransformOrigin = new WpfPoint(0.5, 0.5);
        return (sc, tr, ro);
    }

    // ── Entry animations ──────────────────────────────────────────────────────

    private static void ApplyEntry(FrameworkElement el, ScaleTransform sc,
        TranslateTransform tr, AnimationConfig cfg)
    {
        var ms   = cfg.DurationMs;
        var ease = ParseEase(cfg.Ease);

        switch (cfg.Type.ToLowerInvariant())
        {
            case "fade-in":
                el.BeginAnimation(OpacityProperty, DA(0, 1, ms, ease));
                break;

            case "zoom-in":
                sc.ScaleX = sc.ScaleY = 0; el.Opacity = 1;
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, DA(0, 1, ms, ease));
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, DA(0, 1, ms, ease));
                break;

            case "fly-left":
                tr.X = -FlyDist(ms); el.Opacity = 1;
                tr.BeginAnimation(TranslateTransform.XProperty, DA(-FlyDist(ms), 0, ms, ease));
                break;

            case "fly-right":
                tr.X = FlyDist(ms); el.Opacity = 1;
                tr.BeginAnimation(TranslateTransform.XProperty, DA(FlyDist(ms), 0, ms, ease));
                break;

            case "fly-top":
                tr.Y = -FlyDist(ms); el.Opacity = 1;
                tr.BeginAnimation(TranslateTransform.YProperty, DA(-FlyDist(ms), 0, ms, ease));
                break;

            case "fly-bottom":
                tr.Y = FlyDist(ms); el.Opacity = 1;
                tr.BeginAnimation(TranslateTransform.YProperty, DA(FlyDist(ms), 0, ms, ease));
                break;

            case "bounce-in":
            case "drop":
                tr.Y = -FlyDist(ms); el.Opacity = 1;
                tr.BeginAnimation(TranslateTransform.YProperty,
                    DA(-FlyDist(ms), 0, ms + 150,
                        new BounceEase { EasingMode = EasingMode.EaseOut, Bounces = 2, Bounciness = 3 }));
                break;

            case "path":
            {
                var pathStr = cfg.Path ?? "M -500,0 L 0,0";
                el.Opacity  = 1;
                ApplyPathAnimation(tr, pathStr, ms, cfg.Ease, loop: false);
                break;
            }

            default: // "none"
                el.Opacity = 1;
                break;
        }
    }

    // ── Motion animations (looping) ───────────────────────────────────────────

    private static void ApplyMotion(TranslateTransform tr, RotateTransform ro,
        ScaleTransform sc, AnimationConfig cfg)
    {
        var amp   = cfg.Amplitude;
        var speed = cfg.SpeedMs;

        switch (cfg.Type.ToLowerInvariant())
        {
            case "float":
                tr.BeginAnimation(TranslateTransform.YProperty,
                    Loop(0, -amp, speed, new SineEase { EasingMode = EasingMode.EaseInOut }));
                break;

            case "drift":
                tr.BeginAnimation(TranslateTransform.XProperty,
                    Loop(0, amp, speed, new SineEase { EasingMode = EasingMode.EaseInOut }));
                tr.BeginAnimation(TranslateTransform.YProperty,
                    Loop(0, -amp * 0.7, (int)(speed * 0.85), new SineEase { EasingMode = EasingMode.EaseInOut }));
                break;

            case "spin":
                ro.BeginAnimation(RotateTransform.AngleProperty,
                    new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(speed))
                        { RepeatBehavior = RepeatBehavior.Forever });
                break;

            case "pulse":
                var pulseEase = new SineEase { EasingMode = EasingMode.EaseInOut };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, Loop(1.0, 1 + amp / 100.0, speed, pulseEase));
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, Loop(1.0, 1 + amp / 100.0, speed, pulseEase));
                break;

            case "shake":
                tr.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(-amp, amp, TimeSpan.FromMilliseconds(Math.Max(speed / 18, 40)))
                        { AutoReverse = true, RepeatBehavior = new RepeatBehavior(9) });
                break;

            case "path":
            {
                var pathStr = cfg.Path ?? "M -40,0 C -20,-60 20,-60 40,0 C 20,60 -20,60 -40,0";
                ApplyPathAnimation(tr, pathStr, speed, "sine-in-out", loop: true);
                break;
            }

            // "none" or unknown → no motion
        }
    }

    // ── Exit scheduling & animation ───────────────────────────────────────────

    private void ScheduleExit(FrameworkElement el, ScaleTransform sc,
        TranslateTransform tr, AnimationConfig cfg, int totalDurationMs)
    {
        var delay = TimeSpan.FromMilliseconds(Math.Max(totalDurationMs - cfg.DurationMs, 100));
        var timer = new DispatcherTimer { Interval = delay };
        timer.Tick += (_, _) => { timer.Stop(); ApplyExit(el, sc, tr, cfg); };
        timer.Start();
    }

    private void ApplyExit(FrameworkElement el, ScaleTransform sc,
        TranslateTransform tr, AnimationConfig cfg)
    {
        var ms   = cfg.DurationMs;
        var ease = ParseEase(cfg.Ease);
        void Remove() { if (Stage.Children.Contains(el)) Stage.Children.Remove(el); }

        switch (cfg.Type.ToLowerInvariant())
        {
            case "zoom-out":
            {
                double cx = sc.ScaleX, cy = sc.ScaleY;
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, null); sc.ScaleX = cx;
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, null); sc.ScaleY = cy;
                var ex = DA(cx, 0, ms, ease); ex.Completed += (_, _) => Remove();
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, ex);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, DA(cy, 0, ms, ease));
                break;
            }
            case "fly-left":
            {
                double cx = tr.X, cy = tr.Y;
                SnapStop(tr, TranslateTransform.XProperty, cx);
                SnapStop(tr, TranslateTransform.YProperty, cy);
                var ex = DA(cx, -FlyDist(ms), ms, ease); ex.Completed += (_, _) => Remove();
                tr.BeginAnimation(TranslateTransform.XProperty, ex);
                break;
            }
            case "fly-right":
            {
                double cx = tr.X, cy = tr.Y;
                SnapStop(tr, TranslateTransform.XProperty, cx);
                SnapStop(tr, TranslateTransform.YProperty, cy);
                var ex = DA(cx, FlyDist(ms), ms, ease); ex.Completed += (_, _) => Remove();
                tr.BeginAnimation(TranslateTransform.XProperty, ex);
                break;
            }
            case "fly-top":
            {
                double cy = tr.Y; SnapStop(tr, TranslateTransform.YProperty, cy);
                var ex = DA(cy, -FlyDist(ms), ms, ease); ex.Completed += (_, _) => Remove();
                tr.BeginAnimation(TranslateTransform.YProperty, ex);
                break;
            }
            case "fly-bottom":
            {
                double cy = tr.Y; SnapStop(tr, TranslateTransform.YProperty, cy);
                var ex = DA(cy, FlyDist(ms), ms, ease); ex.Completed += (_, _) => Remove();
                tr.BeginAnimation(TranslateTransform.YProperty, ex);
                break;
            }
            case "path":
            {
                var pathStr = cfg.Path ?? "M 0,0 L 600,0";
                double cx = tr.X, cy = tr.Y;
                SnapStop(tr, TranslateTransform.XProperty, cx);
                SnapStop(tr, TranslateTransform.YProperty, cy);
                // For exit path, fire animation then clean up on completion
                var axExit = PathAnim(PathGeom(pathStr), PathAnimationSource.X, ms, cfg.Ease, loop: false);
                axExit.Completed += (_, _) => Remove();
                tr.BeginAnimation(TranslateTransform.XProperty, axExit);
                tr.BeginAnimation(TranslateTransform.YProperty,
                    PathAnim(PathGeom(pathStr), PathAnimationSource.Y, ms, cfg.Ease, loop: false));
                break;
            }
            case "none":
                Remove();
                break;

            default: // "fade-out"
            {
                var fo = DA(el.Opacity, 0.0, ms, ease); fo.Completed += (_, _) => Remove();
                el.BeginAnimation(OpacityProperty, fo);
                break;
            }
        }
    }

    // ── Path animation helpers ────────────────────────────────────────────────

    private static void ApplyPathAnimation(TranslateTransform tr, string pathStr,
        int durationMs, string? ease, bool loop)
    {
        var geom = PathGeom(pathStr);
        tr.BeginAnimation(TranslateTransform.XProperty, PathAnim(geom, PathAnimationSource.X, durationMs, ease, loop));
        tr.BeginAnimation(TranslateTransform.YProperty, PathAnim(geom, PathAnimationSource.Y, durationMs, ease, loop));
    }

    private static PathGeometry PathGeom(string pathStr)
    {
        try { return (PathGeometry)Geometry.Parse(pathStr); }
        catch { return new PathGeometry(); }
    }

    private static DoubleAnimationUsingPath PathAnim(PathGeometry geom,
        PathAnimationSource source, int durationMs, string? ease, bool loop)
    {
        var (accel, decel) = PathEaseRatios(ease);
        return new DoubleAnimationUsingPath
        {
            PathGeometry       = geom,
            Source             = source,
            Duration           = TimeSpan.FromMilliseconds(durationMs),
            AccelerationRatio  = accel,
            DecelerationRatio  = decel,
            RepeatBehavior     = loop ? RepeatBehavior.Forever : new RepeatBehavior(1),
            AutoReverse        = loop,
        };
    }

    private static (double accel, double decel) PathEaseRatios(string? ease) =>
        ease?.ToLowerInvariant() switch
        {
            "ease-in"  or "cubic-in"  or "sine-in"  or "expo-in"  => (1.0, 0.0),
            "ease-out" or "cubic-out" or "sine-out" or "expo-out"
                or "elastic-out" or "bounce-out" or "back-out"     => (0.0, 1.0),
            "ease-in-out" or "cubic-in-out" or "sine-in-out"
                or "expo-in-out"                                    => (0.5, 0.5),
            _ => (0.0, 1.0), // default ease-out
        };

    // ── Easing function factory ───────────────────────────────────────────────

    private static IEasingFunction? ParseEase(string? ease) => ease?.ToLowerInvariant() switch
    {
        "linear"       => null,
        "cubic-in"     => new CubicEase    { EasingMode = EasingMode.EaseIn },
        "cubic-out"    => new CubicEase    { EasingMode = EasingMode.EaseOut },
        "cubic-in-out" => new CubicEase    { EasingMode = EasingMode.EaseInOut },
        "sine-in"      => new SineEase     { EasingMode = EasingMode.EaseIn },
        "sine-out"     => new SineEase     { EasingMode = EasingMode.EaseOut },
        "sine-in-out"  => new SineEase     { EasingMode = EasingMode.EaseInOut },
        "elastic-out"  => new ElasticEase  { EasingMode = EasingMode.EaseOut, Oscillations = 1, Springiness = 5 },
        "bounce-out"   => new BounceEase   { EasingMode = EasingMode.EaseOut, Bounces = 2, Bounciness = 3 },
        "back-out"     => new BackEase     { EasingMode = EasingMode.EaseOut },
        "expo-in"      => new ExponentialEase { EasingMode = EasingMode.EaseIn },
        "expo-out"     => new ExponentialEase { EasingMode = EasingMode.EaseOut },
        "expo-in-out"  => new ExponentialEase { EasingMode = EasingMode.EaseInOut },
        _              => new CubicEase    { EasingMode = EasingMode.EaseOut }, // default
    };

    // ── Audio ─────────────────────────────────────────────────────────────────

    private void PlayAudio(string path)
    {
        try
        {
            var player = new MediaPlayer();
            _audioPlayers.Add(player);
            player.Open(new Uri(path, UriKind.Absolute));
            player.MediaOpened += (_, _) => player.Play();
            player.MediaEnded  += (_, _) => { player.Close(); _audioPlayers.Remove(player); };
        }
        catch { }
    }

    // ── Low-level helpers ─────────────────────────────────────────────────────

    // Snap-stop: halt animation and pin the property to the last animated value
    // so the element doesn't jump back to its base value.
    private static void SnapStop(Animatable obj, DependencyProperty prop, double snapshot)
    {
        obj.BeginAnimation(prop, null);
        obj.SetValue(prop, snapshot);
    }

    // Use a large constant fly distance independent of animation speed.
    private static double FlyDist(int _ms) => 1400;

    private static DoubleAnimation DA(double from, double to, int ms, IEasingFunction? ease = null) =>
        new(from, to, TimeSpan.FromMilliseconds(ms)) { EasingFunction = ease };

    private static DoubleAnimation Loop(double from, double to, int ms, IEasingFunction ease) =>
        new(from, to, TimeSpan.FromMilliseconds(ms))
        {
            AutoReverse    = true,
            RepeatBehavior = RepeatBehavior.Forever,
            EasingFunction = ease,
        };

    private static double ParseSize(string? size) => size?.ToLowerInvariant() switch
    {
        "sm" => 160,
        "md" => 300,
        "lg" => 450,
        "xl" => 600,
        _    => double.TryParse(size, out var v) ? v : 300,
    };
}
