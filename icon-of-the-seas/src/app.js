/* Icon of the Seas — assembly console.
   Scene, sea, camera rig, build timeline, sea trial. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (sel) { return document.querySelector(sel); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* --------------------------------------------------------------- app state */

  var state = {
    progress: 0,
    playing: false,
    speed: 1,
    follow: true,
    explode: 0,
    labels: true,
    cutaway: false,
    deckLights: true,
    night: false,
    seaState: 0.3,
    selected: null,
    isolate: false,
    sailing: false,
    throttle: 0,
    steer: 0,
    heading: 0,
    speedMS: 0,
    mode: 'orbit',        // orbit | walk | film
    hideUI: false,
    reel: false,          // 9:16 framing for a vertical cut
    fx: true,
    bloom: 0.42,
    offline: false      // true while an offline render drives frames by time
  };

  var renderer, scene, camera, ship, controls, sun, hemi, ocean, oceanGeo, oceanBase;
  var pmrem, envTex, envRT;
  var deckLightRig = [];
  var allMats = [];
  var waterMats = [];
  var seaUniforms = null;
  var fx, walker, director, recorder, crowdGroup, reel, titanic;
  var BASE_FOV = 42;
  var labelEls = [];
  var wake, wakeData;
  var shipYaw, shipTrim;
  var clock;
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  var BLOCK_COUNT;

  /* ------------------------------------------------------------------- sky */

  var PALETTE = {
    day: { top: '#2f7fc4', mid: '#a8cfe4', horizon: '#dcecf2', sea: 0x1c5f80, sun: 0xfff3dd, sunI: 2.5, hemi: 0.55, fog: 0xcfe2ea, exposure: 1.0 },
    night: { top: '#03080f', mid: '#071426', horizon: '#0f2437', sea: 0x04101c, sun: 0x9ab6d8, sunI: 0.22, hemi: 0.09, fog: 0x050f1a, exposure: 1.2 }
  };

  function mixHex(a, b, t) {
    var ca = new THREE.Color(a), cb = new THREE.Color(b);
    return '#' + ca.lerp(cb, t).getHexString();
  }

  function skyCanvas(night, storm) {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    var g = c.getContext('2d');
    var p = night ? PALETTE.night : PALETTE.day;
    var top = storm ? mixHex(p.top, '#3f4854', 0.75) : p.top;
    var mid = storm ? mixHex(p.mid, '#59636e', 0.7) : p.mid;
    var hor = storm ? mixHex(p.horizon, '#7c848c', 0.6) : p.horizon;

    var grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, top);
    grd.addColorStop(0.42, mid);
    grd.addColorStop(0.52, hor);
    grd.addColorStop(0.53, night ? '#08192a' : '#15506e');
    grd.addColorStop(1, night ? '#03080f' : '#07293c');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);

    // sun or moon, low over the port bow
    var sx = 250, sy = night ? 150 : 190;
    var glow = g.createRadialGradient(sx, sy, 0, sx, sy, night ? 46 : 220);
    glow.addColorStop(0, night ? 'rgba(214,229,255,0.95)' : 'rgba(255,247,225,1)');
    glow.addColorStop(0.15, night ? 'rgba(150,180,225,0.35)' : 'rgba(255,236,197,0.55)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = storm ? 0.35 : 1;
    g.fillStyle = glow;
    g.fillRect(sx - 240, sy - 240, 480, 480);
    g.globalAlpha = 1;

    // banded cloud, deterministic so the sky is the same every load
    var seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    var count = storm ? 46 : 22;
    for (var i = 0; i < count; i++) {
      var cx = rnd() * 1024, cy = 60 + rnd() * 300;
      var rx = 60 + rnd() * 190, ry = 10 + rnd() * 26;
      var a = (storm ? 0.3 : 0.16) * (1 - Math.abs(cy - 180) / 320);
      if (a <= 0) continue;
      g.fillStyle = night ? 'rgba(120,145,180,' + a * 0.7 + ')' : 'rgba(255,255,255,' + a + ')';
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }

    if (night) {
      for (var s = 0; s < 320; s++) {
        var stx = rnd() * 1024, sty = rnd() * 230;
        g.fillStyle = 'rgba(255,255,255,' + (0.15 + rnd() * 0.6) + ')';
        g.fillRect(stx, sty, 1.3, 1.3);
      }
    }
    return c;
  }

  function refreshEnvironment() {
    var storm = state.seaState > 0.62;
    var tex = new THREE.CanvasTexture(skyCanvas(state.night, storm));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    if (envRT) envRT.dispose();
    envRT = pmrem.fromEquirectangular(tex);
    scene.environment = envRT.texture;
    if (envTex) envTex.dispose();
    envTex = tex;
    scene.background = tex;

    var p = state.night ? PALETTE.night : PALETTE.day;
    var fog = new THREE.Color(p.fog);
    if (storm) fog.lerp(new THREE.Color(0x707a84), 0.55);
    scene.fog.color.copy(fog);
    scene.fog.density = storm ? 0.00034 : 0.00016;

    sun.intensity = p.sunI * (storm ? 0.45 : 1);
    sun.color.set(p.sun);
    hemi.intensity = p.hemi * (storm ? 0.8 : 1) * (state.cutaway ? 1.9 : 1);
    renderer.toneMappingExposure = p.exposure;

    // Image-based lighting comes off the sky texture, which stays comparatively
    // bright even at night — pull it down or the hull reads as daylit steel.
    var ibl = state.night ? 0.28 : 1;
    for (var i = 0; i < allMats.length; i++) {
      if (allMats[i].isMeshStandardMaterial) allMats[i].envMapIntensity = ibl;
    }

    var seaCol = new THREE.Color(p.sea);
    if (storm) seaCol.lerp(new THREE.Color(0x3c4a52), 0.5);
    ocean.material.color.copy(seaCol);
    ocean.material.roughness = storm ? 0.32 : 0.12;

    // Water reflects the same sky the scene renders, so it can never disagree
    // with the horizon behind it.
    var sunDir = new THREE.Vector3().copy(sun.position).normalize();
    if (seaUniforms) {
      seaUniforms.uSky.value = envTex;
      seaUniforms.uSunDir.value.copy(sunDir);
      seaUniforms.uSunColour.value.copy(sun.color).multiplyScalar(state.night ? 0.25 : 1);
      seaUniforms.uAmp.value = 0.3 + state.seaState * 0.9;
      seaUniforms.uFoam.value = (0.12 + state.seaState * 0.75) * (state.night ? 0.5 : 1);
      seaUniforms.uSeaTint.value.copy(seaCol);
    }
    waterMats.forEach(function (m) {
      m.uniforms.uSky.value = envTex;
      m.uniforms.uSunDir.value.copy(sunDir);
      m.uniforms.uSunColour.value.copy(sun.color).multiplyScalar(state.night ? 0.3 : 1);
    });

    if (fx) {
      fx.set('exposure', state.night ? 1.5 : (storm ? 0.88 : 0.92));
      fx.set('saturation', storm ? 0.92 : 1.08);
    }
  }

  /* ------------------------------------------------------------------- sea */

  var WAVES = [
    { dx: 1.0, dz: 0.15, len: 190, amp: 1.00, spd: 1.00 },
    { dx: 0.75, dz: -0.66, len: 96, amp: 0.55, spd: 1.35 },
    { dx: 0.2, dz: 0.98, len: 47, amp: 0.30, spd: 1.7 },
    { dx: -0.6, dz: 0.8, len: 23, amp: 0.16, spd: 2.2 }
  ];

  function seaAmp() { return 0.5 + state.seaState * 5.2; }

  // Height and slope of the sea surface at a world point.
  function waveAt(x, z, t, out) {
    var h = 0, dx = 0, dz = 0, amp = seaAmp();
    for (var i = 0; i < WAVES.length; i++) {
      var w = WAVES[i];
      var k = (Math.PI * 2) / w.len;
      var phase = k * (w.dx * x + w.dz * z) + t * w.spd * k * 14;
      var a = w.amp * amp;
      h += Math.sin(phase) * a;
      var c = Math.cos(phase) * a * k;
      dx += c * w.dx;
      dz += c * w.dz;
    }
    if (out) { out.h = h; out.dx = dx; out.dz = dz; }
    return h;
  }

  function buildOcean() {
    oceanGeo = new THREE.PlaneGeometry(6400, 6400, 150, 150);
    oceanGeo.rotateX(-Math.PI / 2);
    oceanBase = oceanGeo.attributes.position.array.slice();
    var m = new THREE.MeshStandardMaterial({ color: 0x1c5f80, roughness: 0.12, metalness: 0.0 });
    // Patched rather than replaced, so the sea keeps shadows, fog and lighting
    // while gaining the fine wave bands, sky reflection and glint.
    seaUniforms = global.IconWater.patchSea(m);
    ocean = new THREE.Mesh(oceanGeo, m);
    ocean.receiveShadow = true;
    scene.add(ocean);
  }

  var _w = { h: 0, dx: 0, dz: 0 };
  function updateOcean(t) {
    var pos = oceanGeo.attributes.position;
    var nrm = oceanGeo.attributes.normal;
    var arr = pos.array, narr = nrm.array;
    var ox = ocean.position.x, oz = ocean.position.z;
    for (var i = 0; i < arr.length; i += 3) {
      var x = oceanBase[i] + ox, z = oceanBase[i + 2] + oz;
      waveAt(x, z, t, _w);
      arr[i + 1] = _w.h;
      var nx = -_w.dx, nz = -_w.dz;
      var inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      narr[i] = nx * inv; narr[i + 1] = inv; narr[i + 2] = nz * inv;
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
  }

  /* ------------------------------------------------------------- camera rig */

  function OrbitRig(cam, dom) {
    this.cam = cam;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 42, 0);
    this.goalTarget = this.target.clone();
    this.radius = 410;
    this.goalRadius = 410;
    this.theta = -0.9;
    this.phi = 1.16;
    this.goalTheta = this.theta;
    this.goalPhi = this.phi;
    this.enabled = true;
    this.minRadius = 60;
    this.maxRadius = 2200;
    var self = this;
    var dragging = 0, lastX = 0, lastY = 0, pinch = 0;

    function down(e) {
      if (!self.enabled) return;
      dom.setPointerCapture && e.pointerId !== undefined && dom.setPointerCapture(e.pointerId);
      dragging = (e.button === 2 || e.shiftKey) ? 2 : 1;
      lastX = e.clientX; lastY = e.clientY;
    }
    function move(e) {
      if (!dragging || !self.enabled) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (dragging === 1) {
        self.goalTheta -= dx * 0.005;
        self.goalPhi = clamp(self.goalPhi - dy * 0.005, 0.12, 1.52);
      } else {
        self.pan(dx, dy);
      }
    }
    function up() { dragging = 0; }

    dom.addEventListener('pointerdown', down);
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dom.addEventListener('wheel', function (e) {
      if (!self.enabled) return;
      e.preventDefault();
      self.goalRadius = clamp(self.goalRadius * (1 + Math.sign(e.deltaY) * 0.12), self.minRadius, self.maxRadius);
    }, { passive: false });

    dom.addEventListener('touchmove', function (e) {
      if (!self.enabled || e.touches.length !== 2) return;
      e.preventDefault();
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) self.goalRadius = clamp(self.goalRadius * (pinch / d), self.minRadius, self.maxRadius);
      pinch = d;
    }, { passive: false });
    dom.addEventListener('touchend', function () { pinch = 0; });
  }

  OrbitRig.prototype.pan = function (dx, dy) {
    var scale = this.radius * 0.0016;
    var right = new THREE.Vector3(Math.sin(this.theta + Math.PI / 2), 0, Math.cos(this.theta + Math.PI / 2));
    var up = new THREE.Vector3(0, 1, 0);
    this.goalTarget.addScaledVector(right, -dx * scale);
    this.goalTarget.addScaledVector(up, dy * scale);
    this.goalTarget.y = clamp(this.goalTarget.y, -20, 260);
  };

  OrbitRig.prototype.frame = function (centre, radius) {
    this.goalTarget.copy(centre);
    this.goalRadius = clamp(radius * 3.4 + 40, this.minRadius, this.maxRadius);
  };

  OrbitRig.prototype.update = function (dt) {
    var k = 1 - Math.pow(0.0008, dt);
    this.theta = lerp(this.theta, this.goalTheta, k);
    this.phi = lerp(this.phi, this.goalPhi, k);
    this.radius = lerp(this.radius, this.goalRadius, k);
    this.target.lerp(this.goalTarget, k);
    var sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    this.cam.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.cam.lookAt(this.target);
  };

  /* ------------------------------------------------------------------- wake */

  function sprite() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.4, 'rgba(230,245,255,0.4)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function buildWake() {
    var N = 420;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(N * 3);
    var size = new Float32Array(N);
    var alpha = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    var mat = new THREE.PointsMaterial({
      map: sprite(), size: 18, sizeAttenuation: true, transparent: true,
      depthWrite: false, opacity: 0.85, blending: THREE.NormalBlending, color: 0xffffff
    });
    wake = new THREE.Points(geo, mat);
    wake.frustumCulled = false;
    scene.add(wake);
    wakeData = { n: N, life: new Float32Array(N), vel: new Float32Array(N * 3), head: 0 };
    for (var i = 0; i < N; i++) { pos[i * 3 + 1] = -9999; }
  }

  function spawnFoam(x, y, z, spread, up) {
    var d = wakeData;
    var i = d.head = (d.head + 1) % d.n;
    var p = wake.geometry.attributes.position.array;
    p[i * 3] = x + (Math.random() - 0.5) * spread;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
    d.vel[i * 3] = (Math.random() - 0.5) * 2;
    d.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.9);
    d.vel[i * 3 + 2] = (Math.random() - 0.5) * 2;
    d.life[i] = 1;
  }

  function updateWake(dt) {
    var d = wakeData;
    var p = wake.geometry.attributes.position.array;
    var s = wake.geometry.attributes.aSize.array;
    for (var i = 0; i < d.n; i++) {
      if (d.life[i] <= 0) continue;
      d.life[i] -= dt * 0.28;
      p[i * 3] += d.vel[i * 3] * dt;
      p[i * 3 + 1] += d.vel[i * 3 + 1] * dt;
      p[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
      d.vel[i * 3 + 1] -= 9.8 * dt * 0.25;
      s[i] = (1 - d.life[i]) * 24 + 6;
      if (d.life[i] <= 0) p[i * 3 + 1] = -9999;
    }
    wake.geometry.attributes.position.needsUpdate = true;
    wake.material.opacity = 0.7;
  }

  /* ------------------------------------------------------------------ setup */

  function init() {
    var canvas = $('#stage');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    // The post pipeline owns tone mapping; the renderer must not also apply it.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xcfe2ea, 0.00016);

    camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 30000);

    hemi = new THREE.HemisphereLight(0xdcecf5, 0x1b4a63, 0.55);
    scene.add(hemi);

    sun = new THREE.DirectionalLight(0xfff3dd, 2.5);
    sun.position.set(-380, 420, 260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -220;
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 1400;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);

    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    buildOcean();
    buildWake();

    ship = global.IconShip.build();
    BLOCK_COUNT = ship.parts.length;
    ship.parts.forEach(function (p) { allMats = allMats.concat(p.materials); });
    waterMats = allMats.filter(function (m) { return m.userData && m.userData.water === 'pool'; });

    // guests, walking their own circuits inside each neighbourhood
    crowdGroup = global.IconVenues.buildCrowd();
    ship.root.add(crowdGroup);

    shipTrim = new THREE.Group();
    shipTrim.add(ship.root);
    shipYaw = new THREE.Group();
    shipYaw.add(shipTrim);
    scene.add(shipYaw);

    // deck floodlights, switched on with the night livery
    [[110, 62, 0], [12, 50, 0], [-110, 82, 0], [-158, 66, 0]].forEach(function (p) {
      var l = new THREE.PointLight(0xffd9a8, 0, 220, 2);
      l.position.set(p[0], p[1], p[2]);
      ship.root.add(l);
      deckLightRig.push(l);
    });


    controls = new OrbitRig(camera, canvas);

    fx = new global.IconFX.Pipeline(renderer);
    titanic = global.IconReel.buildTitanic();
    titanic.position.set(0, 0, -150);          // alongside, for the scale shot
    ship.root.add(titanic);
    reel = new global.IconReel.Reel({
      onScene: function (scene) { enterScene(scene); },
      onEnd: function () { finishReel(); }
    });
    walker = new global.IconWalk.Walker(global.IconVenues);
    director = new global.IconWalk.Director();
    recorder = new global.IconWalk.Recorder(canvas);
    bindWalkInput(canvas);

    refreshEnvironment();

    buildUI();
    clock = new THREE.Clock();

    // She arrives finished. Watching her go up is something you choose.
    setProgress(1);
    state.playing = false;
    syncPlay();

    global.addEventListener('resize', onResize);
    canvas.addEventListener('click', onPick);
    global.addEventListener('keydown', onKey);
    global.addEventListener('keyup', onKeyUp);

    onResize();
    requestAnimationFrame(tick);

    // hold the veil until the first frames have compiled their shaders
    setTimeout(function () { document.body.classList.add('ready'); }, 260);
  }

  function onResize() {
    var w = innerWidth, h = innerHeight, fx0 = 0, fy0 = 0;
    if (state.reel) {
      // 9:16 for a vertical cut — the canvas itself is the frame that records.
      h = Math.min(innerHeight, innerWidth * 16 / 9);
      w = h * 9 / 16;
      var el = renderer.domElement;
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      fx0 = (innerWidth - w) / 2;
      fy0 = (innerHeight - h) / 2;
      el.style.left = fx0 + 'px';
      el.style.top = fy0 + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else {
      var e2 = renderer.domElement;
      e2.style.width = '100%'; e2.style.height = '100%';
      e2.style.left = '0'; e2.style.top = '0';
      e2.style.right = '0'; e2.style.bottom = '0';
    }
    // Overlays read these: captions belong inside the frame that gets exported,
    // and vw units would size them to the window instead.
    var root = document.documentElement;
    root.style.setProperty('--frame-w', w + 'px');
    root.style.setProperty('--frame-h', h + 'px');
    root.style.setProperty('--frame-x', fx0 + 'px');
    root.style.setProperty('--frame-y', fy0 + 'px');

    camera.aspect = w / h;
    // Bias the frustum so the ship centres in the water, not behind the console.
    var rail = (state.mode === 'orbit' && !state.hideUI && !state.reel && innerWidth > 900) ? 344 : 0;
    if (rail) camera.setViewOffset(w, h, -rail / 2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (fx) fx.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  }

  /* -------------------------------------------------------------- timeline */

  function partProgress(i) {
    return clamp(state.progress * BLOCK_COUNT - i, 0, 1);
  }

  function applyProgress() {
    var installing = -1;
    for (var i = 0; i < BLOCK_COUNT; i++) {
      var part = ship.parts[i];
      var t = partProgress(i);
      var e = easeOut(t);
      part.seated = t;
      var visible = t > 0.001;
      if (state.isolate && state.selected && state.selected !== part) visible = false;
      if (state.cutaway && (part.def.cutaway)) visible = false;
      part.group.visible = visible;
      if (!visible) continue;

      part.group.position.copy(part.approach).multiplyScalar(1 - e);
      part.group.position.addScaledVector(part.explode, state.explode);
      part.group.rotation.z = (1 - e) * part.approach.z * 0.0015;
      part.group.rotation.x = (1 - e) * part.approach.y * 0.0009;
      var op = clamp(e * 1.7, 0, 1);
      setPartOpacity(part, op);
      if (t > 0 && t < 1) installing = i;
    }

    updateReadout(installing);
    updateLadder();
    if (state.selected) refreshSelectionBox();
  }

  function setPartOpacity(part, op) {
    for (var i = 0; i < part.materials.length; i++) {
      var m = part.materials[i];
      m.opacity = (m.userData.baseOpacity === undefined ? 1 : m.userData.baseOpacity) * op;
    }
  }

  function updateReadout(installing) {
    var stage = $('#stage-name'), no = $('#stage-no'), verb = $('#stage-verb');
    if (state.progress <= 0) {
      verb.textContent = 'Building dock';
      no.textContent = '00 / 24';
      stage.textContent = 'Keel not yet laid';
    } else if (installing >= 0) {
      var d = ship.parts[installing].def;
      verb.textContent = 'Erecting';
      no.textContent = String(d.no).padStart(2, '0') + ' / 24';
      stage.textContent = d.name;
    } else {
      var last = Math.min(BLOCK_COUNT - 1, Math.floor(state.progress * BLOCK_COUNT) - (state.progress >= 1 ? 1 : 0));
      var dd = ship.parts[Math.max(0, last)].def;
      if (state.progress >= 1) {
        verb.textContent = 'Handover';
        no.textContent = '24 / 24';
        stage.textContent = 'Icon of the Seas — complete';
      } else {
        verb.textContent = 'Seated';
        no.textContent = String(dd.no).padStart(2, '0') + ' / 24';
        stage.textContent = dd.name;
      }
    }
    $('#pct').textContent = Math.round(state.progress * 100) + '%';
  }

  function updateLadder() {
    for (var i = 0; i < BLOCK_COUNT; i++) {
      var t = partProgress(i);
      var el = ladderEls[i];
      el.style.setProperty('--fill', (t * 100).toFixed(1) + '%');
      el.classList.toggle('is-live', t > 0 && t < 1);
      el.classList.toggle('is-done', t >= 1);
    }
    for (var j = 0; j < listEls.length; j++) {
      listEls[j].classList.toggle('is-pending', partProgress(j) <= 0);
    }
  }

  /* ------------------------------------------------------------- selection */

  function selectPart(part, focus) {
    state.selected = part;
    listEls.forEach(function (el, i) { el.classList.toggle('is-active', ship.parts[i] === part); });
    var drawer = $('#dossier');
    if (!part) {
      drawer.classList.remove('open');
      if (state.isolate) { state.isolate = false; syncToggle('isolate', false); }
      applyProgress();
      return;
    }
    var d = part.def;
    $('#dossier-no').textContent = 'Block ' + String(d.no).padStart(2, '0');
    $('#dossier-zone').textContent = d.zone;
    $('#dossier-name').textContent = d.name;
    $('#dossier-note').textContent = d.note;
    var table = $('#dossier-specs');
    table.innerHTML = '';
    d.specs.forEach(function (row) {
      var dt = document.createElement('dt'); dt.textContent = row[0];
      var dd = document.createElement('dd'); dd.textContent = row[1];
      table.appendChild(dt); table.appendChild(dd);
    });
    drawer.classList.add('open');
    refreshSelectionBox();
    if (focus) {
      if (partProgress(part.index) <= 0) {
        setProgress((part.index + 1) / BLOCK_COUNT);
      }
      controls.frame(worldCentre(part), part.radius);
      state.follow = false;
      syncToggle('follow', false);
    }
    applyProgress();
  }

  var _v = new THREE.Vector3();
  function worldCentre(part) {
    return _v.copy(part.centre).applyMatrix4(part.group.matrixWorld).clone();
  }

  // Selection reads through the tag, the dossier and the list row. A wireframe
  // cage around the block only got in the way of looking at it.
  function refreshSelectionBox() {}

  function onPick(e) {
    if (state.sailing) return;
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObject(ship.root, true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o && !o.userData.part) o = o.parent;
      if (o && o.userData.part && o.userData.part.group.visible) {
        selectPart(o.userData.part, false);
        return;
      }
    }
    selectPart(null);
  }

  /* ----------------------------------------------------------------- labels */

  function buildLabels() {
    var host = $('#labels');
    ship.parts.forEach(function (part) {
      var el = document.createElement('div');
      el.className = 'tag';
      el.innerHTML = '<i></i><b>' + String(part.def.no).padStart(2, '0') + '</b><span>' + part.def.name + '</span>';
      el.addEventListener('click', function () { selectPart(part, true); });
      host.appendChild(el);
      labelEls.push(el);
    });
  }

  var _p = new THREE.Vector3();
  var _cand = [], _placed = [];

  // Tags are projected, sorted front-to-back, then dropped where they would
  // collide with one already placed — otherwise the ship disappears behind them.
  function updateLabels() {
    var show = state.labels && !state.sailing;
    _cand.length = 0;
    for (var i = 0; i < BLOCK_COUNT; i++) {
      var part = ship.parts[i], el = labelEls[i];
      if (!show || !part.group.visible || part.seated < 0.35) { el.style.display = 'none'; continue; }
      _p.copy(part.centre).applyMatrix4(part.group.matrixWorld).project(camera);
      if (_p.z > 1) { el.style.display = 'none'; continue; }
      _cand.push({
        el: el, part: part, z: _p.z,
        x: (_p.x * 0.5 + 0.5) * innerWidth,
        y: (-_p.y * 0.5 + 0.5) * innerHeight
      });
    }
    _cand.sort(function (a, b) { return a.z - b.z; });
    _placed.length = 0;
    for (var c = 0; c < _cand.length; c++) {
      var t = _cand[c], hidden = false;
      if (state.selected !== t.part) {
        for (var q = 0; q < _placed.length; q++) {
          if (Math.abs(_placed[q].x - t.x) < 176 && Math.abs(_placed[q].y - t.y) < 26) { hidden = true; break; }
        }
      }
      if (hidden) { t.el.style.display = 'none'; continue; }
      _placed.push(t);
      t.el.style.display = 'flex';
      t.el.style.transform = 'translate3d(' + t.x.toFixed(1) + 'px,' + t.y.toFixed(1) + 'px,0)';
      t.el.style.zIndex = String(1000 - Math.round(t.z * 900));
      t.el.classList.toggle('is-active', state.selected === t.part);
    }
  }

  /* -------------------------------------------------------- walk & film mode */

  var pointerLocked = false, dragLook = false;

  function bindWalkInput(canvas) {
    document.addEventListener('pointerlockchange', function () {
      pointerLocked = document.pointerLockElement === canvas;
      document.body.classList.toggle('locked', pointerLocked);
    });

    // Pointer lock is not always granted inside an embedded frame, so
    // drag-to-look is always available as well.
    global.addEventListener('mousemove', function (e) {
      if (state.mode !== 'walk') return;
      if (pointerLocked || dragLook) {
        walker.look.x += e.movementX || 0;
        walker.look.y += e.movementY || 0;
      }
    });
    canvas.addEventListener('pointerdown', function () {
      if (state.mode !== 'walk') return;
      dragLook = true;
      if (!pointerLocked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (err) { /* drag-look covers it */ }
      }
    });
    global.addEventListener('pointerup', function () { dragLook = false; });

    // touch: left half drives, right half looks
    var sticks = {};
    canvas.addEventListener('touchstart', function (e) {
      if (state.mode !== 'walk') return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        sticks[t.identifier] = { x: t.clientX, y: t.clientY, drive: t.clientX < innerWidth / 2 };
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (state.mode !== 'walk') return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i], s = sticks[t.identifier];
        if (!s) continue;
        var dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (s.drive) {
          walker.move.set(clamp(dx / 60, -1, 1), clamp(-dy / 60, -1, 1));
        } else {
          walker.look.x += dx * 0.6; walker.look.y += dy * 0.6;
          s.x = t.clientX; s.y = t.clientY;
        }
      }
    }, { passive: true });
    var endTouch = function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var s = sticks[e.changedTouches[i].identifier];
        if (s && s.drive) walker.move.set(0, 0);
        delete sticks[e.changedTouches[i].identifier];
      }
    };
    canvas.addEventListener('touchend', endTouch, { passive: true });
    canvas.addEventListener('touchcancel', endTouch, { passive: true });
  }

  function setMode(mode, spawn) {
    var previous = state.mode;
    state.mode = mode;
    document.body.classList.toggle('walking', mode === 'walk');
    document.body.classList.toggle('filming', mode === 'film');
    document.body.classList.toggle('reeling', mode === 'reel');
    if (mode !== 'reel' && reel) { reel.stop(); titanic.visible = false; }
    controls.enabled = mode === 'orbit' && !state.sailing;

    if (mode !== 'orbit') {
      // Anything you walk into or film has to exist first.
      if (state.progress < 1) setProgress(1);
      state.playing = false; syncPlay();
      setExplode(0);
      selectPart(null);
    }
    if (mode === 'walk') {
      walker.spawn(spawn || global.IconVenues.spawns[0]);
      camera.fov = 62;                       // wider inside — rooms read better
      camera.updateProjectionMatrix();
      $('#walk-venue').textContent = walker.venue;
    } else if (mode === 'film') {
      director.start(0);
    } else if (mode === 'reel') {
      camera.fov = 34;
      camera.updateProjectionMatrix();
    } else {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
      director.stop();
      if (document.exitPointerLock && pointerLocked) document.exitPointerLock();
    }
    if (previous !== mode) onResize();
    syncModeButtons();
  }

  // Each cut owns its lighting and its caption. Switching the sky costs one
  // PMREM rebuild, which is why it happens on the cut, where it cannot be seen.
  function enterScene(scene) {
    var wantNight = scene.env === 'night';
    if (wantNight !== state.night) {
      state.night = wantNight;
      syncToggle('night', wantNight);
      if (wantNight && !state.deckLights) { state.deckLights = true; syncToggle('deckLights', true); }
      refreshEnvironment();
      setDeckLights(state.deckLights);
    }
    titanic.visible = !!scene.titanic;
    var cap = $('#reel-caption');
    cap.classList.remove('is-in', 'is-out');
    $('#reel-line').textContent = scene.line;
    $('#reel-sub').textContent = scene.sub || '';
    $('#reel-sub').style.display = scene.sub ? 'block' : 'none';
    void cap.offsetWidth;                       // restart the entry animation
    cap.classList.add('is-in');
    $('#reel-scene').textContent = scene.id;
  }

  function finishReel() {
    if (recorder && recorder.recorder) toggleRecord();
    reel.stop();
    setMode('orbit');
    $('#reel-label').textContent = 'Play the cut';
  }

  function startReel(record) {
    setMode('reel');
    if (record && recorder.supported && !recorder.recorder) {
      if (!state.reel) setToggle('reel', true);
      if (!state.hideUI) setToggle('hideUI', true);
      toggleRecord();
    }
    reel.start(0);
    $('#reel-label').textContent = 'Stop';
  }

  function syncModeButtons() {
    $('#walk-btn').textContent = state.mode === 'walk' ? 'Back to the outside' : 'Walk aboard';
    $('#film-btn').textContent = state.mode === 'film' ? 'Stop the camera' : 'Roll camera';
  }

  function toggleRecord() {
    if (!recorder.supported) {
      $('#rec-label').textContent = 'Recording is not available in this browser';
      return;
    }
    if (recorder.recorder) {
      recorder.stop();
      document.body.classList.remove('recording');
      $('#rec-label').textContent = 'Saved icon-of-the-seas.webm';
    } else if (recorder.start(60)) {
      document.body.classList.add('recording');
      $('#rec-label').textContent = 'Recording';
    }
  }

  /* ------------------------------------------------------------- sea trial */

  var keys = {};
  function onKey(e) {
    keys[e.code] = true;
    if (walker) walker.keys[e.code] = true;
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;

    if (state.mode === 'walk') {
      if (e.code === 'Space') e.preventDefault();               // jump, not play
    } else if (e.code === 'Space') {
      e.preventDefault(); togglePlay();
    }

    switch (e.code) {
      case 'KeyV': setMode(state.mode === 'walk' ? 'orbit' : 'walk', currentSpawn); break;
      case 'KeyF': setMode(state.mode === 'film' ? 'orbit' : 'film'); break;
      case 'KeyH': setToggle('hideUI', !state.hideUI); break;
      case 'KeyB': setToggle('reel', !state.reel); break;
      case 'KeyK': toggleRecord(); break;
      case 'KeyP': if (state.mode === 'reel' && reel.running) finishReel(); else startReel(false); break;
      case 'KeyN': setToggle('night', !state.night); break;
      case 'Escape':
        if (state.mode !== 'orbit') setMode('orbit');
        else if (state.sailing) setSail(false);
        else selectPart(null);
        break;
    }
    if (state.mode !== 'walk') {
      switch (e.code) {
        case 'KeyE': setExplode(state.explode > 0.5 ? 0 : 1); break;
        case 'KeyL': setToggle('labels', !state.labels); break;
        case 'KeyC': setToggle('cutaway', !state.cutaway); break;
        case 'KeyR': setProgress(0); state.playing = false; syncPlay(); break;
      }
    }
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    if (walker) walker.keys[e.code] = false;
  }

  function setSail(on) {
    state.sailing = on;
    document.body.classList.toggle('sailing', on);
    controls.enabled = !on;
    $('#sail-btn').textContent = on ? 'Return to the building dock' : 'Begin sea trial';
    if (on) {
      setProgress(1);
      state.playing = false; syncPlay();
      setExplode(0);
      selectPart(null);
    } else {
      state.throttle = 0; state.steer = 0; state.speedMS = 0;
      shipYaw.position.set(0, 0, 0);
      shipYaw.rotation.y = 0;
      state.heading = 0;
      controls.goalTarget.set(0, 42, 0);
      controls.goalRadius = 410;
    }
  }

  function updateSail(dt, keepCamera) {
    var acc = 0;
    if (keys.KeyW || keys.ArrowUp) acc += 1;
    if (keys.KeyS || keys.ArrowDown) acc -= 1;
    var steerIn = 0;
    if (keys.KeyA || keys.ArrowLeft) steerIn -= 1;
    if (keys.KeyD || keys.ArrowRight) steerIn += 1;
    steerIn += touchSteer;
    acc += touchThrottle;

    state.throttle = clamp(state.throttle + acc * dt * 0.5, -0.35, 1);
    if (acc === 0) state.throttle *= (1 - dt * 0.25);
    state.steer = lerp(state.steer, clamp(steerIn, -1, 1), 1 - Math.pow(0.02, dt));

    var maxMS = 11.3;                                   // 22 knots
    state.speedMS = lerp(state.speedMS, state.throttle * maxMS, 1 - Math.pow(0.3, dt));
    // Turn rate falls away with speed — the pods need water over them to bite.
    state.heading -= state.steer * dt * 0.075 * clamp(Math.abs(state.speedMS) / 4, 0.25, 1);
    shipYaw.rotation.y = state.heading;
    shipYaw.position.x += Math.cos(state.heading) * state.speedMS * dt;
    shipYaw.position.z -= Math.sin(state.heading) * state.speedMS * dt;

    // pods swing with the helm
    ship.parts[3].inner.children.forEach(function (pod) { pod.rotation.y = -state.steer * 0.5; });

    var sp = Math.abs(state.speedMS);
    if (sp > 0.6) {
      var n = Math.min(4, Math.ceil(sp * 0.4));
      for (var i = 0; i < n; i++) {
        var st = new THREE.Vector3(-186, 2, (Math.random() - 0.5) * 40).applyMatrix4(shipYaw.matrixWorld);
        spawnFoam(st.x, st.y + 6, st.z, 14, 0.8);
        var bw = new THREE.Vector3(172, 2, (Math.random() - 0.5) * 16).applyMatrix4(shipYaw.matrixWorld);
        spawnFoam(bw.x, bw.y + 8, bw.z, 10, 1.3);
      }
    }

    $('#kn').textContent = (sp * 1.94384).toFixed(1);
    $('#hdg').textContent = String(Math.round(((-state.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '°';
    $('#pod').textContent = (state.steer * 35).toFixed(0) + '°';
    if (keepCamera) return;     // walking or filming — the camera is not the helm's

    // chase camera, hung off the port quarter
    var back = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.heading);
    var want = new THREE.Vector3().copy(shipYaw.position)
      .addScaledVector(back, 420 + sp * 14)
      .add(new THREE.Vector3(0, 165 + sp * 3, 0));
    camera.position.lerp(want, 1 - Math.pow(0.05, dt));
    var look = new THREE.Vector3().copy(shipYaw.position).add(new THREE.Vector3(0, 62, 0));
    controls.target.lerp(look, 1 - Math.pow(0.02, dt));
    camera.lookAt(controls.target);
  }

  var touchSteer = 0, touchThrottle = 0;

  /* -------------------------------------------------------------------- UI */

  var ladderEls = [], listEls = [], toggleEls = {}, currentSpawn = null;

  function syncToggle(name, on) {
    if (toggleEls[name]) toggleEls[name].setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function setToggle(name, on) {
    state[name] = on;
    syncToggle(name, on);
    if (name === 'night') {
      refreshEnvironment();
      // Nobody sails a dark ship: coming on at night brings the lights up too.
      if (on && !state.deckLights) { state.deckLights = true; syncToggle('deckLights', true); }
      setDeckLights(state.deckLights);
    }
    if (name === 'deckLights') setDeckLights(on);
    if (name === 'cutaway') {
      ship.starboardShells.forEach(function (o) { o.visible = !on; });
      refreshEnvironment();          // lifts the fill light so the cut reads
      applyProgress();
    }
    if (name === 'isolate') applyProgress();
    if (name === 'labels') updateLabels();
    if (name === 'hideUI') document.body.classList.toggle('bare', on);
    if (name === 'reel') { document.body.classList.toggle('reel', on); onResize(); }
    if (name === 'fx') fx.enabled = on;
  }

  function setDeckLights(on) {
    var v = on ? 1 : 0;
    var gain = v * (state.night ? 1.7 : 0.8);
    ship.windowMats.forEach(function (m) {
      var authored = m.userData.authoredEI === undefined ? 1 : m.userData.authoredEI;
      m.emissiveIntensity = authored * gain;
    });
    // Physical units: these are metre-scale distances, so keep the candela low
    // or the floodlights wash straight across the sea.
    deckLightRig.forEach(function (l) { l.intensity = v * (state.night ? 900 : 220); });
  }

  function setProgress(p) {
    state.progress = clamp(p, 0, 1);
    $('#progress').value = String(Math.round(state.progress * 1000));
    applyProgress();
  }

  function setExplode(v) {
    state.explode = clamp(v, 0, 1);
    $('#explode').value = String(Math.round(state.explode * 100));
    applyProgress();
  }

  function togglePlay() {
    if (state.progress >= 1 && !state.playing) state.progress = 0;
    state.playing = !state.playing;
    syncPlay();
  }

  function syncPlay() {
    var b = $('#play');
    b.textContent = state.playing ? 'Pause build'
      : (state.progress >= 1 ? 'Build from scratch' : 'Resume build');
    b.classList.toggle('is-playing', state.playing);
  }

  function buildUI() {
    // erection ladder
    var ladder = $('#ladder');
    ship.parts.forEach(function (part, i) {
      var el = document.createElement('button');
      el.className = 'rung';
      el.type = 'button';
      el.title = String(part.def.no).padStart(2, '0') + ' · ' + part.def.name;
      el.setAttribute('aria-label', 'Block ' + part.def.no + ', ' + part.def.name);
      el.addEventListener('click', function () { selectPart(part, true); });
      ladder.appendChild(el);
      ladderEls.push(el);
    });

    // dossier list
    var list = $('#block-list');
    ship.parts.forEach(function (part, i) {
      var el = document.createElement('button');
      el.className = 'block-row is-pending';
      el.type = 'button';
      el.innerHTML = '<span class="row-no">' + String(part.def.no).padStart(2, '0') + '</span>' +
        '<span class="row-name">' + part.def.name + '</span>' +
        '<span class="row-zone">' + part.def.zone + '</span>';
      el.addEventListener('click', function () { selectPart(part, true); });
      list.appendChild(el);
      listEls.push(el);
    });

    buildLabels();

    $('#progress').addEventListener('input', function (e) {
      state.playing = false; syncPlay();
      setProgress(Number(e.target.value) / 1000);
    });
    $('#explode').addEventListener('input', function (e) { setExplode(Number(e.target.value) / 100); });
    $('#speed').addEventListener('input', function (e) {
      state.speed = Number(e.target.value) / 100;
      $('#speed-val').textContent = '×' + state.speed.toFixed(2);
    });
    $('#sea').addEventListener('input', function (e) {
      state.seaState = Number(e.target.value) / 100;
      $('#sea-val').textContent = seaLabel(state.seaState);
      refreshEnvironment();
    });

    // walk aboard — one button per place worth standing in
    var venueList = $('#venue-list');
    global.IconVenues.spawns.forEach(function (spawn) {
      var el = document.createElement('button');
      el.className = 'venue-row';
      el.type = 'button';
      el.innerHTML = '<span class="venue-name">' + spawn.label + '</span>' +
        '<span class="venue-sub">' + spawn.sub + '</span>';
      el.addEventListener('click', function () {
        currentSpawn = spawn;
        if (state.mode === 'walk') {
          walker.spawn(spawn);
          $('#walk-venue').textContent = spawn.label;
        } else {
          setMode('walk', spawn);
        }
        Array.prototype.forEach.call(venueList.children, function (c) { c.classList.remove('is-active'); });
        el.classList.add('is-active');
      });
      venueList.appendChild(el);
    });

    $('#walk-btn').addEventListener('click', function () {
      setMode(state.mode === 'walk' ? 'orbit' : 'walk', currentSpawn);
    });
    $('#walk-exit').addEventListener('click', function () { setMode('orbit'); });
    $('#film-btn').addEventListener('click', function () {
      setMode(state.mode === 'film' ? 'orbit' : 'film');
    });
    $('#film-next').addEventListener('click', function () {
      director.index = (director.index + 1) % director.shots.length;
      director.t = 0;
    });
    $('#rec-btn').addEventListener('click', toggleRecord);
    $('#reel-play').addEventListener('click', function () {
      if (state.mode === 'reel' && reel.running) { finishReel(); return; }
      startReel(false);
    });
    $('#reel-record').addEventListener('click', function () {
      if (state.mode === 'reel' && reel.running) { finishReel(); return; }
      startReel(true);
    });
    $('#reel-speed').addEventListener('input', function (e) {
      reel.speed = Number(e.target.value) / 100;
      renderMarks();
    });
    renderMarks();
    $('#bloom').addEventListener('input', function (e) {
      state.bloom = Number(e.target.value) / 100;
      fx.set('strength', state.bloom);
      $('#bloom-val').textContent = state.bloom.toFixed(2);
    });

    $('#play').addEventListener('click', togglePlay);
    $('#reset').addEventListener('click', function () {
      state.playing = false; syncPlay(); setProgress(0); selectPart(null); setExplode(0);
    });
    $('#explode-all').addEventListener('click', function () { setProgress(1); setExplode(1); });
    $('#collapse').addEventListener('click', function () { setExplode(0); });
    $('#sail-btn').addEventListener('click', function () { setSail(!state.sailing); });
    $('#helm-exit').addEventListener('click', function () { setSail(false); });
    $('#dossier-close').addEventListener('click', function () { selectPart(null); });
    $('#dossier-focus').addEventListener('click', function () {
      if (state.selected) controls.frame(worldCentre(state.selected), state.selected.radius);
    });
    $('#panel-toggle').addEventListener('click', function () {
      document.body.classList.toggle('panel-open');
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'), function (el) {
      var name = el.getAttribute('data-toggle');
      toggleEls[name] = el;
      el.setAttribute('aria-checked', state[name] ? 'true' : 'false');
      el.addEventListener('click', function () {
        setToggle(name, el.getAttribute('aria-checked') !== 'true');
      });
    });

    // on-screen helm for touch
    bindHelm('#helm-ahead', function (v) { touchThrottle = v; });
    bindHelm('#helm-astern', function (v) { touchThrottle = -v; });
    bindHelm('#helm-port', function (v) { touchSteer = -v; });
    bindHelm('#helm-stbd', function (v) { touchSteer = v; });

    syncPlay();
  }

  // The scene list doubles as the sheet you line a voice track up against.
  function renderMarks() {
    var host = $('#reel-marks');
    if (!host) return;
    host.innerHTML = '';
    reel.marks().forEach(function (m, i) {
      var row = document.createElement('button');
      row.className = 'mark-row';
      row.type = 'button';
      row.innerHTML = '<span class="mark-at">' + m.at.toFixed(1) + '</span>' +
        '<span class="mark-id">' + reel.scenes[i].line + '</span>' +
        '<span class="mark-dur">' + m.dur.toFixed(1) + 's</span>';
      row.addEventListener('click', function () {
        setMode('reel');
        reel.start(i);
      });
      host.appendChild(row);
    });
    $('#reel-total').textContent = reel.total().toFixed(1) + 's';
  }

  function bindHelm(sel, fn) {
    var el = $(sel);
    if (!el) return;
    var press = function (e) { e.preventDefault(); fn(1); el.classList.add('held'); };
    var rel = function () { fn(0); el.classList.remove('held'); };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', rel);
    el.addEventListener('pointerleave', rel);
    el.addEventListener('pointercancel', rel);
  }

  function seaLabel(v) {
    if (v < 0.16) return 'Glassy';
    if (v < 0.34) return 'Slight';
    if (v < 0.52) return 'Moderate';
    if (v < 0.7) return 'Rough';
    return 'Very rough';
  }

  /* ------------------------------------------------------------------ loop */

  var _s1 = { h: 0 }, _acc = 0;

  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;
    // An offline render owns the clock; the live loop must not also advance it.
    if (state.offline) return;

    if (state.playing) {
      state.progress += dt * 0.055 * state.speed;
      if (state.progress >= 1) {
        state.progress = 1;
        state.playing = false;
        syncPlay();
        // Handover: pull back off the last block and show the whole ship.
        if (state.follow) { controls.goalTarget.set(0, 42, 0); controls.goalRadius = 410; }
      }
      $('#progress').value = String(Math.round(state.progress * 1000));
      applyProgress();
      if (state.follow) {
        var live = Math.min(BLOCK_COUNT - 1, Math.floor(state.progress * BLOCK_COUNT));
        var part = ship.parts[live];
        controls.goalTarget.lerp(worldCentre(part), 1 - Math.pow(0.2, dt));
        controls.goalRadius = lerp(controls.goalRadius, clamp(part.radius * 4.6 + 120, 180, 900), 1 - Math.pow(0.5, dt));
      }
    }

    // sea follows the ship so the grid never runs out
    ocean.position.x = shipYaw.position.x;
    ocean.position.z = shipYaw.position.z;
    updateOcean(t);

    // float the hull on the surface it is sitting in
    var wx = shipYaw.position.x, wz = shipYaw.position.z;
    var hMid = waveAt(wx, wz, t, null);
    var hBow = waveAt(wx + Math.cos(state.heading) * 150, wz - Math.sin(state.heading) * 150, t, null);
    var hStern = waveAt(wx - Math.cos(state.heading) * 150, wz + Math.sin(state.heading) * 150, t, null);
    var hPort = waveAt(wx - Math.sin(state.heading) * 24, wz - Math.cos(state.heading) * 24, t, null);
    var hStbd = waveAt(wx + Math.sin(state.heading) * 24, wz + Math.cos(state.heading) * 24, t, null);
    var settle = state.progress;                       // she only floats once there is a hull
    // Exploding lifts the whole assembly clear of the water, so blocks that
    // separate downwards stay in view instead of vanishing under the surface.
    shipTrim.position.y = lerp(-1, hMid - global.IconShip.dims.DRAFT, settle) + state.explode * 48;
    shipTrim.rotation.z = clamp((hPort - hStbd) / 48, -0.05, 0.05) * settle;
    shipTrim.rotation.x = clamp((hStern - hBow) / 300, -0.03, 0.03) * settle;

    // machinery
    var rate = reduceMotion ? 0 : (state.sailing ? 0.4 + Math.abs(state.speedMS) * 0.9 : 0.35);
    ship.spinners.forEach(function (o) {
      var axis = o.userData.axis || 'x';
      var amt = dt * o.userData.spin * rate;
      if (axis === 'y') o.rotation.y += amt; else if (axis === 'z') o.rotation.z += amt; else o.rotation.x += amt;
    });
    ship.waterfalls.forEach(function (f) {
      if (f.material.map) return;
      f.material.opacity = 0.35 + Math.sin(t * 6) * 0.08;
    });

    // water shares one clock with the swell displacement
    if (seaUniforms) seaUniforms.uTime.value = t;
    for (var wi = 0; wi < waterMats.length; wi++) waterMats[wi].uniforms.uTime.value = t;

    var peopleAboard = state.progress > 0.995;
    crowdGroup.visible = peopleAboard;
    if (peopleAboard && !reduceMotion) global.IconVenues.updateCrowd(t);

    shipYaw.updateMatrixWorld(true);

    if (state.mode === 'walk') {
      walker.update(dt, null);
      if (walker.overboard) {
        // over the side — put them back on the deck they left from
        walker.spawn(currentSpawn || global.IconVenues.spawns[0]);
        $('#walk-venue').textContent = 'Man overboard — back aboard';
      }
      walker.applyTo(camera, shipTrim.matrixWorld);
      if (state.sailing) updateSail(dt, true);
    } else if (state.mode === 'reel') {
      reel.update(dt, camera, shipTrim.matrixWorld);
      var ph = reel.phase();
      $('#reel-caption').classList.toggle('is-out', ph.left < 0.45);
      $('#reel-progress').style.setProperty('--k', (ph.k * 100).toFixed(1) + '%');
      if (state.sailing) updateSail(dt, true);
    } else if (state.mode === 'film') {
      director.update(dt, camera, shipTrim.matrixWorld);
      $('#film-shot').textContent = director.shot().label;
      $('#film-bar').style.setProperty('--k', (director.t / director.shot().dur * 100).toFixed(1) + '%');
      if (state.sailing) updateSail(dt, true);
    } else if (state.sailing) {
      updateSail(dt);
    } else {
      controls.update(dt);
    }

    // ambient spray at the bow in a seaway, even at rest
    _acc += dt;
    if (state.progress > 0.75 && state.seaState > 0.45 && _acc > 0.08) {
      _acc = 0;
      var bp = new THREE.Vector3(170, 0, 0).applyMatrix4(shipYaw.matrixWorld);
      spawnFoam(bp.x, bp.y + 10, bp.z, 22, 1.1 * state.seaState);
    }
    updateWake(dt);

    // the light the ship throws onto the water, only after dark
    if (seaUniforms) {
      seaUniforms.uGlowCentre.value.copy(shipYaw.position);
      seaUniforms.uGlowDir.value.set(Math.cos(state.heading), -Math.sin(state.heading));
      var wantGlow = state.night && state.deckLights && state.progress > 0.9 ? 0.5 : 0;
      seaUniforms.uGlowStrength.value += (wantGlow - seaUniforms.uGlowStrength.value) * Math.min(1, dt * 3);
    }

    sun.target.position.copy(shipYaw.position);
    sun.position.set(shipYaw.position.x - 380, 420, shipYaw.position.z + 260);

    updateLabels();
    if (state.selected) refreshSelectionBox();

    if (recorder && recorder.recorder) {
      $('#rec-time').textContent = recorder.elapsed().toFixed(1) + 's';
    }

    fx.render(scene, camera, t);
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    if (!global.WebGLRenderingContext) {
      document.body.classList.add('failed');
      return;
    }
    try {
      init();
    } catch (err) {
      document.body.classList.add('failed');
      var m = $('#veil-msg');
      if (m) m.textContent = 'This browser could not start WebGL: ' + err.message;
      throw err;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* -------------------------------------------------------- offline render */

  // Draw the frame at absolute time `t` on the reel timeline. Nothing here
  // reads a wall clock, so the same t always produces the same frame — which
  // is what lets a 1 fps software rasteriser render a 30 fps film.
  function renderFrameAt(t) {
    var seek = reel.seek(t);
    reel.update(0, camera, shipTrim.matrixWorld);

    // captions: CSS animations run on wall-clock, so drive them from t instead
    var scene = seek.scene;
    var cap = $('#reel-caption');
    var into = seek.local, left = scene.dur - seek.local;
    var appear = Math.min(1, into / 0.42);
    var leave = Math.min(1, Math.max(0, (0.45 - left) / 0.45));
    var ease = function (v) { return v * v * (3 - 2 * v); };
    var op = ease(appear) * (1 - ease(leave));
    var lift = (1 - ease(appear)) * 18 - ease(leave) * 14;
    cap.style.animation = 'none';
    cap.style.opacity = op.toFixed(3);
    cap.style.transform = 'translateY(' + lift.toFixed(2) + 'px)';
    $('#reel-progress').style.setProperty('--k', (seek.local / scene.dur * 100).toFixed(1) + '%');

    // sea, machinery and guests all read the same clock
    if (seaUniforms) seaUniforms.uTime.value = t;
    for (var wi = 0; wi < waterMats.length; wi++) waterMats[wi].uniforms.uTime.value = t;
    ocean.position.x = shipYaw.position.x;
    ocean.position.z = shipYaw.position.z;
    updateOcean(t);
    crowdGroup.visible = true;
    global.IconVenues.updateCrowd(t);

    var hMid = waveAt(0, 0, t, null);
    var hBow = waveAt(150, 0, t, null), hStern = waveAt(-150, 0, t, null);
    var hPort = waveAt(0, -24, t, null), hStbd = waveAt(0, 24, t, null);
    shipTrim.position.y = hMid - global.IconShip.dims.DRAFT;
    shipTrim.rotation.z = clamp((hPort - hStbd) / 48, -0.05, 0.05);
    shipTrim.rotation.x = clamp((hStern - hBow) / 300, -0.03, 0.03);
    shipYaw.updateMatrixWorld(true);

    ship.spinners.forEach(function (o) {
      var axis = o.userData.axis || 'x';
      var amt = t * o.userData.spin * 0.35;
      if (axis === 'y') o.rotation.y = amt; else if (axis === 'z') o.rotation.z = amt; else o.rotation.x = amt;
    });

    // the camera move is set by the reel; re-place it after the trim changed
    reel.update(0, camera, shipTrim.matrixWorld);
    fx.render(scene3d(), camera, t);
    return { scene: scene.id, line: scene.line };
  }

  function scene3d() { return scene; }

  // Handles for the headless checks — and for anyone poking at it in a console.
  global.IconApp = {
    state: state,
    setMode: function (m, s) { setMode(m, s); },
    setToggle: setToggle,
    setProgress: setProgress,
    get walker() { return walker; },
    get director() { return director; },
    get fx() { return fx; },
    cameraPos: function () { return camera.position.toArray(); },
    // Fixed-step hooks so the headless checks can advance the simulation
    // without waiting on the frame loop, which crawls under software raster.
    stepSail: function (dt) { updateSail(dt, true); },
    // Park the orbit rig at an exact eye and target — used by the view tool to
    // shoot the same exterior framings every run.
    freeCam: function (eye, look, fov) {
      var e = new THREE.Vector3().fromArray(eye);
      var t = new THREE.Vector3().fromArray(look);
      var d = new THREE.Vector3().subVectors(e, t);
      controls.goalTarget.copy(t); controls.target.copy(t);
      controls.goalRadius = controls.radius = d.length();
      controls.goalTheta = controls.theta = Math.atan2(d.x, d.z);
      controls.goalPhi = controls.phi = Math.acos(clamp(d.y / d.length(), -1, 1));
      camera.fov = fov || BASE_FOV;
      camera.updateProjectionMatrix();
      controls.update(1);
    },
    stepWalk: function (dt) { walker.update(dt, null); },
    stepFilm: function (dt) { director.update(dt, camera, shipTrim.matrixWorld); },
    stepReel: function (dt) { reel.update(dt, camera, shipTrim.matrixWorld); },
    startReel: startReel,
    get reel() { return reel; },
    // offline render control
    beginOffline: function () {
      state.offline = true;
      setMode('reel');
      reel.stop();
    },
    endOffline: function () { state.offline = false; },
    renderFrameAt: renderFrameAt,
    reelDuration: function () { return reel.total(); }
  };
})(window);
