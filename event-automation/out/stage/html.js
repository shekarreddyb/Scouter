"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageHtml = stageHtml;
/**
 * Generates the stage webview HTML. The embedded script is a self-contained
 * animation engine driven by postMessage. It deliberately avoids template
 * literals so it can be nested safely inside this TS template string.
 */
function stageHtml(cspSource, nonce, background) {
    const bg = background === "dim" ? "rgba(0,0,0,0.35)" : "transparent";
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src ${cspSource} data:; media-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: ${bg}; }
  #stage { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
  .item { position: absolute; left: 0; top: 0; will-change: transform, opacity; }
  .item img, .item video { display: block; }
</style>
</head>
<body>
<div id="stage"></div>
<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  var stage = document.getElementById('stage');
  var active = 0;

  function reportIdleIfDone() {
    if (active <= 0) { active = 0; vscode.postMessage({ type: 'idle' }); }
  }

  function cubicBezier(p1x, p1y, p2x, p2y) {
    function A(a, b) { return 1.0 - 3.0 * b + 3.0 * a; }
    function B(a, b) { return 3.0 * b - 6.0 * a; }
    function C(a) { return 3.0 * a; }
    function calcBezier(t, a, b) { return ((A(a, b) * t + B(a, b)) * t + C(a)) * t; }
    function slope(t, a, b) { return 3.0 * A(a, b) * t * t + 2.0 * B(a, b) * t + C(a); }
    function tForX(x) {
      var t = x;
      for (var i = 0; i < 8; i++) {
        var s = slope(t, p1x, p2x);
        if (s === 0) return t;
        var xx = calcBezier(t, p1x, p2x) - x;
        t -= xx / s;
      }
      return t;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return calcBezier(tForX(x), p1y, p2y);
    };
  }

  var NAMED = {
    'linear': function (t) { return t; },
    'ease': cubicBezier(0.25, 0.1, 0.25, 1),
    'ease-in': cubicBezier(0.42, 0, 1, 1),
    'ease-out': cubicBezier(0, 0, 0.58, 1),
    'ease-in-out': cubicBezier(0.42, 0, 0.58, 1)
  };

  function parseEasing(e) {
    if (!e) return NAMED['ease'];
    var m = String(e).match(/cubic-bezier\\(([^)]+)\\)/);
    if (m) {
      var n = m[1].split(',').map(function (x) { return parseFloat(x.trim()); });
      if (n.length === 4) return cubicBezier(n[0], n[1], n[2], n[3]);
    }
    return NAMED[e] || NAMED['ease'];
  }

  function ms(v, dflt) {
    if (v === undefined || v === null) return dflt;
    var s = String(v).trim();
    var m = s.match(/^(\\d+(?:\\.\\d+)?)\\s*(ms|s)?$/i);
    if (!m) return dflt;
    var val = parseFloat(m[1]);
    return (m[2] && m[2].toLowerCase() === 's') ? val * 1000 : val;
  }

  var XFRAC = { 'left': 0.15, 'center': 0.5, 'right': 0.85 };
  var YFRAC = { 'top': 0.15, 'center': 0.5, 'bottom': 0.85 };

  function anchorToFrac(name) {
    if (!name) return { x: 0.5, y: 0.5 };
    var pct = String(name).match(/^([\\d.]+)%\\s+([\\d.]+)%$/);
    if (pct) return { x: parseFloat(pct[1]) / 100, y: parseFloat(pct[2]) / 100 };
    var parts = String(name).split('-');
    var x = 0.5, y = 0.5;
    parts.forEach(function (p) {
      if (XFRAC[p] !== undefined) x = XFRAC[p];
      if (YFRAC[p] !== undefined) y = YFRAC[p];
    });
    return { x: x, y: y };
  }

  function makePathSampler(d) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    document.body.appendChild(svg);
    var len = path.getTotalLength();
    return {
      at: function (t) { return path.getPointAtLength(t * len); },
      cleanup: function () { document.body.removeChild(svg); }
    };
  }

  function buildElement(payload) {
    var el = document.createElement('div');
    el.className = 'item';
    var media;
    if (payload.mediaType === 'video') {
      media = document.createElement('video');
      media.src = payload.uri;
      media.autoplay = true;
      media.muted = false;
      if (payload.loop) media.loop = true;
    } else {
      media = document.createElement('img');
      media.src = payload.uri;
    }
    if (payload.size) {
      if (typeof payload.size === 'string') { media.style.width = payload.size; }
      else {
        if (payload.size.width) media.style.width = payload.size.width;
        if (payload.size.height) media.style.height = payload.size.height;
      }
    } else {
      media.style.width = '220px';
    }
    el.appendChild(media);
    return el;
  }

  function transformFor(cx, cy, angle, scale) {
    return 'translate(-50%,-50%) translate(' + cx + 'px,' + cy + 'px) rotate(' + angle + 'deg) scale(' + scale + ')';
  }

  function showMedia(payload) {
    active++;
    var el = buildElement(payload);
    stage.appendChild(el);
    var vw = window.innerWidth, vh = window.innerHeight;
    var a = payload.animate;

    function finish() {
      if (el.parentNode) el.parentNode.removeChild(el);
      active--;
      reportIdleIfDone();
    }

    if (!a) {
      var f = anchorToFrac(payload.position || 'center');
      el.style.transform = transformFor(f.x * vw, f.y * vh, 0, 1);
      el.style.opacity = '1';
      var hold = ms(payload.durationMs, 3000);
      setTimeout(finish, hold);
      return;
    }

    var ease = parseEasing(a.easing);
    var dur = ms(a.duration, 1500);
    var delay = ms(a.delay, 0);
    var repeat = (a.repeat === 'infinite') ? Infinity : (typeof a.repeat === 'number' ? a.repeat : 1);
    var alternate = a.direction === 'alternate';
    var spin = a.spin || 0;
    var scaleFrom = (a.scale && a.scale.from !== undefined) ? a.scale.from : 1;
    var scaleTo = (a.scale && a.scale.to !== undefined) ? a.scale.to : 1;
    var fadeIn = a.fade ? ms(a.fade['in'], 0) : 0;
    var fadeOut = a.fade ? ms(a.fade.out, 0) : 0;

    var sampler = a.path ? makePathSampler(a.path) : null;
    var fromF = anchorToFrac(a.from || 'center');
    var toF = anchorToFrac(a.to || 'center');

    function posAt(local) {
      if (sampler) {
        var p = sampler.at(local);
        return { x: (p.x / 100) * vw, y: (p.y / 100) * vh, angle: 0 };
      }
      return {
        x: (fromF.x + (toF.x - fromF.x) * local) * vw,
        y: (fromF.y + (toF.y - fromF.y) * local) * vh,
        angle: 0
      };
    }

    function angleAt(local) {
      if (sampler && a.align) {
        var d = 0.01;
        var p1 = sampler.at(Math.max(0, local - d));
        var p2 = sampler.at(Math.min(1, local + d));
        return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
      }
      return 0;
    }

    var total = dur * (repeat === Infinity ? 1 : repeat);
    var start = null;

    function frame(now) {
      if (start === null) start = now;
      var elapsed = now - start;
      var gp = elapsed / dur; // global progress in iterations
      var iteration = Math.floor(gp);
      var local = gp - iteration;
      if (alternate && (iteration % 2 === 1)) local = 1 - local;
      var done = (repeat !== Infinity) && (elapsed >= total);
      if (done) local = alternate ? ((repeat % 2 === 0) ? 0 : 1) : 1;
      var eased = ease(Math.max(0, Math.min(1, local)));

      var pos = posAt(eased);
      var pathAngle = angleAt(eased);
      var angle = pathAngle + spin * eased;
      var scale = scaleFrom + (scaleTo - scaleFrom) * eased;
      el.style.transform = transformFor(pos.x, pos.y, angle, scale);

      var op = 1;
      if (fadeIn > 0 && elapsed < fadeIn) op = elapsed / fadeIn;
      var rem = total - elapsed;
      if (fadeOut > 0 && repeat !== Infinity && rem < fadeOut) op = Math.max(0, rem / fadeOut);
      el.style.opacity = String(op);

      if (done) {
        if (sampler) sampler.cleanup();
        finish();
        return;
      }
      requestAnimationFrame(frame);
    }

    setTimeout(function () { requestAnimationFrame(frame); }, delay);
  }

  function playSound(payload) {
    active++;
    var audio = new Audio(payload.uri);
    audio.volume = (payload.volume !== undefined) ? payload.volume : 0.6;
    var settled = false;
    function done() { if (settled) return; settled = true; active--; reportIdleIfDone(); }
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    audio.play().catch(done);
  }

  function speak(payload) {
    if (!('speechSynthesis' in window)) return;
    active++;
    var u = new SpeechSynthesisUtterance(payload.text);
    if (payload.rate !== undefined) u.rate = payload.rate;
    if (payload.volume !== undefined) u.volume = payload.volume;
    u.onend = function () { active--; reportIdleIfDone(); };
    u.onerror = function () { active--; reportIdleIfDone(); };
    window.speechSynthesis.speak(u);
  }

  window.addEventListener('message', function (e) {
    var msg = e.data || {};
    if (msg.type === 'media') showMedia(msg.payload);
    else if (msg.type === 'sound') playSound(msg.payload);
    else if (msg.type === 'say') speak(msg.payload);
  });

  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
//# sourceMappingURL=html.js.map