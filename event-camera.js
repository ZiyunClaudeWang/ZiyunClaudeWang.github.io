// Event-camera background: an invisible wall of lab-themed icons (a camera, a
// robot, an eye, a drone, a neuron spike, the SPIKE Lab logo, the letters
// of SPIKE and the word HOPKINS), seen by a camera that moves as the page scrolls. Each sensor
// pixel fires an ON (brighter) or OFF (darker) event when its log brightness
// changes by more than a threshold, and events fade out, so a still page
// shows nothing. The camera moves diagonally, not straight down, so vertical
// edges fire too. Inspired by the shapes sequences of the Event-Camera Dataset
// (Mueggler et al., rpg.ifi.uzh.ch/davis_data.html).
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.className = 'event-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  // Speech bubble from the headshot telling visitors what the background is,
  // and a floating switch in the top-right corner to turn it off.
  var photo = document.querySelector('.headshot');
  if (photo) {
    var bubble = document.createElement('p');
    bubble.className = 'event-bubble';
    bubble.title = 'The background is a simulated event camera: each pixel fires an event when its brightness changes.';
    bubble.textContent = 'Scroll to see events!';
    // Wrap the photo's link so the bubble can hang from the photo itself.
    var anchor = document.createElement('div');
    anchor.className = 'event-bubble-anchor';
    photo.parentNode.parentNode.insertBefore(anchor, photo.parentNode);
    anchor.appendChild(photo.parentNode);
    anchor.appendChild(bubble);
  }
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'event-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.innerHTML = 'Events<span class="event-switch" aria-hidden="true"></span>';
  document.body.appendChild(toggle);

  var CELL = 3;             // CSS px per sensor pixel
  var THRESHOLD = 0.4;      // contrast threshold, in log brightness
  var TAU = 45;             // event fade time constant, ms
  var FADE = 5 * TAU;       // events are gone after this long
  var PEAK = 0.45;          // opacity of a fresh event
  var QUIET = 0.1;          // strength once past the intro
  var ON = [14, 81, 152];   // SPIKE Lab blue
  var OFF = [214, 69, 65];  // red

  // The wall, as one tile in sensor pixels (sizes are powers of two so
  // coordinates wrap with a mask): dark icons on a light wall.
  var TILE = 256, MASK = TILE - 1;
  var WALL = 'rgb(235, 235, 235)', INK = 'rgb(20, 20, 20)';
  // [x, y, angle, icon]; any other text is drawn as a letter or word
  var ITEMS = [
    [32, 36, -0.12, 'camera'],
    [100, 28, 0.15, 'S'],
    [222, 40, 0.08, 'robot'],
    [104, 100, 0.03, 'logo'],
    [166, 92, -0.12, 'K'],
    [30, 160, -0.2, 'P'],
    [170, 168, -0.05, 'eye'],
    [232, 150, 0.1, 'I'],
    [40, 226, 0.3, 'drone'],
    [110, 222, 0, 'spike'],
    [214, 220, -0.15, 'E'],
    [96, 160, -0.06, 'HOPKINS']
  ];
  // Pictures used as icons; recoloured to ink once loaded so their thin
  // lines fire as strongly as the drawn icons. Files must be on this site.
  var PICTURES = { logo: 'images/spike_mark.png' };
  var inked = {};

  function circle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fill();
  }

  function box(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }

  // Draws an icon about 40 wall pixels across, centred on the origin, in ink;
  // holes are painted in the wall colour.
  function icon(g, kind) {
    if (kind === 'camera') {
      box(g, -6, -15, 12, 6, 2);
      box(g, -18, -10, 36, 24, 4);
      g.fillStyle = WALL; circle(g, 0, 2, 8.5);
      g.fillStyle = INK; circle(g, 0, 2, 5);
    } else if (kind === 'robot') {
      g.fillRect(-1.5, -20, 3, 8); circle(g, 0, -21, 3);
      box(g, -15, -13, 30, 24, 5);
      g.fillRect(-19, -5, 4, 9); g.fillRect(15, -5, 4, 9);
      g.fillStyle = WALL;
      circle(g, -6, -3, 3.5); circle(g, 6, -3, 3.5); g.fillRect(-7, 5, 14, 3);
    } else if (kind === 'eye') {
      g.beginPath();
      g.moveTo(-20, 0);
      g.quadraticCurveTo(0, -18, 20, 0);
      g.quadraticCurveTo(0, 18, -20, 0);
      g.fill();
      g.fillStyle = WALL; circle(g, 0, 0, 7);
      g.fillStyle = INK; circle(g, 0, 0, 3.5);
    } else if (kind === 'drone') {
      // Quadrotor from above: crossed arms with a rotor at each end
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-12, -12); g.lineTo(12, 12);
      g.moveTo(12, -12); g.lineTo(-12, 12);
      g.stroke();
      g.lineWidth = 3;
      [[-13, -13], [13, -13], [-13, 13], [13, 13]].forEach(function (p) {
        g.beginPath();
        g.arc(p[0], p[1], 7, 0, 2 * Math.PI);
        g.stroke();
      });
      g.fillRect(-5, -5, 10, 10);
    } else if (kind === 'spike') {
      // A neuron's spike, as on an oscilloscope
      g.lineWidth = 4;
      g.lineJoin = g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-22, 6); g.lineTo(-7, 6); g.lineTo(-2, -16);
      g.lineTo(3, 14); g.lineTo(7, 6); g.lineTo(22, 6);
      g.stroke();
    } else if (kind in PICTURES) {
      var pic = inked[kind];
      if (pic) {
        var w = 52, h = w * pic.height / pic.width;
        g.drawImage(pic, -w / 2, -h / 2, w, h);
      }
    } else {
      g.font = 'bold ' + (kind.length > 1 ? 18 : 32) + 'px Helvetica, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(kind, 0, 1);
    }
  }

  // Log-brightness texture of the wall. Each icon is also drawn shifted by a
  // tile in every direction so icons on the border wrap around.
  function wall() {
    var c = document.createElement('canvas');
    c.width = c.height = TILE;
    var g = c.getContext('2d');
    g.fillStyle = WALL;
    g.fillRect(0, 0, TILE, TILE);
    ITEMS.forEach(function (item) {
      for (var ox = -TILE; ox <= TILE; ox += TILE) {
        for (var oy = -TILE; oy <= TILE; oy += TILE) {
          g.save();
          g.translate(item[0] + ox, item[1] + oy);
          g.rotate(item[2]);
          g.fillStyle = g.strokeStyle = INK;
          icon(g, item[3]);
          g.restore();
        }
      }
    });
    var px = g.getImageData(0, 0, TILE, TILE).data, img = new Float32Array(TILE * TILE);
    for (var i = 0; i < img.length; i++) img[i] = Math.log((px[4 * i] + 1) / 256);
    return img;
  }
  var tex;

  // Camera path: a straight line, in wall pixels per page pixel scrolled.
  // Icons rise at about a third of the page speed and drift right; the wall
  // repeats, so icons leaving one side come back on the other.
  var SPEED_X = -0.2, SPEED_Y = 0.35;

  function color(c, a) {
    return ((Math.round(a * 255) << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  }
  var onFade = new Uint32Array(FADE), offFade = new Uint32Array(FADE);
  for (var age = 0; age < FADE; age++) {
    var a = PEAK * Math.exp(-age / TAU);
    onFade[age] = color(ON, a);
    offFade[age] = color(OFF, a);
  }

  var W = 0, H = 0, N, ref, cur, stamp, pol, image, pixels;
  var lastScroll, lastEvent = -Infinity, running = false, enabled = true;

  // Log brightness each sensor pixel sees at the current scroll position,
  // sampling the wall bilinearly (the sub-pixel offset is the same for every
  // pixel, so the weights are computed once).
  function sense(out) {
    var s = window.scrollY / CELL;
    var ox = SPEED_X * s, oy = SPEED_Y * s;
    var ix = Math.floor(ox), iy = Math.floor(oy), fx = ox - ix, fy = oy - iy;
    var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    for (var y = 0, i = 0; y < H; y++) {
      var r0 = ((y + iy) & MASK) * TILE, r1 = ((y + iy + 1) & MASK) * TILE;
      for (var x = 0; x < W; x++, i++) {
        var c0 = (x + ix) & MASK, c1 = (c0 + 1) & MASK;
        out[i] = w00 * tex[r0 + c0] + w10 * tex[r0 + c1] + w01 * tex[r1 + c0] + w11 * tex[r1 + c1];
      }
    }
  }

  // Events are at full strength while the intro (the profile at the top) is
  // on screen, then fade to QUIET over the next half screen of scrolling, so
  // they don't compete with the rest of the page.
  var intro = document.getElementById('about');
  function strength() {
    if (!intro) return 1;
    var t = -intro.getBoundingClientRect().bottom / (0.5 * window.innerHeight);
    return 1 - (1 - QUIET) * Math.min(1, Math.max(0, t));
  }

  // Size the sensor to the window. Only grow in height, so a phone's
  // collapsing address bar doesn't reset it mid-scroll.
  function setup() {
    var w = Math.ceil(document.documentElement.clientWidth / CELL);
    var h = Math.ceil(window.innerHeight / CELL);
    if (w === W && h <= H) return;
    W = w; H = h; N = W * H;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * CELL + 'px';
    canvas.style.height = H * CELL + 'px';
    ref = new Float32Array(N); cur = new Float32Array(N);
    stamp = new Float64Array(N).fill(-Infinity); pol = new Uint8Array(N);
    image = ctx.createImageData(W, H);
    pixels = new Uint32Array(image.data.buffer);
    sense(ref);
    lastScroll = window.scrollY;
  }

  function step(now) {
    if (!enabled) {
      running = false;
      return;
    }
    var s = window.scrollY;
    if (s !== lastScroll) {
      // A jump of more than a screen (restored scroll, Home/End) isn't motion.
      var jump = Math.abs(s - lastScroll) > window.innerHeight;
      lastScroll = s;
      sense(jump ? ref : cur);
      if (!jump) {
        for (var i = 0; i < N; i++) {
          var d = cur[i] - ref[i];
          if (d >= THRESHOLD) {
            ref[i] += THRESHOLD * Math.floor(d / THRESHOLD);
            stamp[i] = now; pol[i] = 1; lastEvent = now;
          } else if (d <= -THRESHOLD) {
            ref[i] -= THRESHOLD * Math.floor(-d / THRESHOLD);
            stamp[i] = now; pol[i] = 0; lastEvent = now;
          }
        }
      }
    }
    for (var j = 0; j < N; j++) {
      var age = now - stamp[j];
      pixels[j] = age < FADE ? (pol[j] ? onFade[age | 0] : offFade[age | 0]) : 0;
    }
    canvas.style.opacity = strength();
    ctx.putImageData(image, 0, 0);
    if (now - lastEvent < FADE || window.scrollY !== lastScroll) {
      requestAnimationFrame(step);
    } else {
      running = false;
    }
  }

  function wake() {
    if (running || !enabled) return;
    running = true;
    requestAnimationFrame(step);
  }

  // Turning events off hides the canvas and the bubble; turning them back on
  // starts from the current view, so the switch itself fires no events. The
  // choice is remembered in this browser.
  function setEnabled(on) {
    enabled = on;
    toggle.setAttribute('aria-checked', String(on));
    toggle.title = on ? 'Turn off the event background' : 'Turn on the event background';
    document.documentElement.classList.toggle('events-off', !on);
    if (!N) return;
    stamp.fill(-Infinity);
    ctx.clearRect(0, 0, W, H);
    sense(ref);
    lastScroll = window.scrollY;
  }
  toggle.addEventListener('click', function () {
    setEnabled(!enabled);
    try { localStorage.setItem('events', enabled ? 'on' : 'off'); } catch (e) {}
  });
  try { enabled = localStorage.getItem('events') !== 'off'; } catch (e) {}
  setEnabled(enabled);

  // Build the wall once its pictures have loaded or failed. A picture a
  // file:// page can't read back is left out.
  function start() {
    try {
      tex = wall();
    } catch (e) {
      inked = {};
      tex = wall();
    }
    setup();
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', function () { setup(); wake(); });
  }

  var pending = Object.keys(PICTURES).length;
  Object.keys(PICTURES).forEach(function (kind) {
    var pic = new Image();
    pic.onload = function () {
      var c = document.createElement('canvas');
      c.width = pic.naturalWidth;
      c.height = pic.naturalHeight;
      var g = c.getContext('2d');
      g.drawImage(pic, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = INK;
      g.fillRect(0, 0, c.width, c.height);
      inked[kind] = c;
      if (--pending === 0) start();
    };
    pic.onerror = function () {
      if (--pending === 0) start();
    };
    pic.src = PICTURES[kind];
  });
  if (!pending) start();
})();
