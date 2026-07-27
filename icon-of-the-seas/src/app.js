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
    deckLights: false,
    night: false,
    seaState: 0.3,
    selected: null,
    isolate: false,
    sailing: false,
    throttle: 0,
    steer: 0,
    heading: 0,
    speedMS: 0
  };

  var renderer, scene, camera, ship, controls, sun, hemi, ocean, oceanGeo, oceanBase;
  var pmrem, envTex, envRT;
  var deckLightRig = [];
  var allMats = [];
  var labelEls = [];
  var selectionBox, selectionHelper;
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

    selectionBox = new THREE.Box3();
    selectionHelper = new THREE.Box3Helper(selectionBox, 0xff6b2c);
    selectionHelper.visible = false;
    if (selectionHelper.material) {
      selectionHelper.material.depthTest = false;
      selectionHelper.material.transparent = true;
    }
    scene.add(selectionHelper);

    controls = new OrbitRig(camera, canvas);
    refreshEnvironment();

    buildUI();
    clock = new THREE.Clock();

    // The build is the point of the page, so it runs on arrival rather than
    // opening on an empty stretch of sea. Reduced motion gets the finished ship.
    if (reduceMotion) {
      setProgress(1);
    } else {
      setProgress(0);
      state.playing = true;
      syncPlay();
    }

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
    camera.aspect = innerWidth / innerHeight;
    // Bias the frustum so the ship centres in the water, not behind the console.
    var rail = innerWidth > 900 ? 344 : 0;
    camera.setViewOffset(innerWidth, innerHeight, -rail / 2, 0, innerWidth, innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
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
      selectionHelper.visible = false;
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
    selectionHelper.visible = true;
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

  function refreshSelectionBox() {
    if (!state.selected || !state.selected.group.visible) { selectionHelper.visible = false; return; }
    selectionHelper.visible = true;
    selectionBox.setFromObject(state.selected.inner);
    selectionBox.expandByScalar(1.5);
  }

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

  /* ------------------------------------------------------------- sea trial */

  var keys = {};
  function onKey(e) {
    keys[e.code] = true;
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlay(); break;
      case 'KeyE': setExplode(state.explode > 0.5 ? 0 : 1); break;
      case 'KeyL': setToggle('labels', !state.labels); break;
      case 'KeyN': setToggle('night', !state.night); break;
      case 'KeyC': setToggle('cutaway', !state.cutaway); break;
      case 'KeyR': setProgress(0); state.playing = false; syncPlay(); break;
      case 'Escape': if (state.sailing) setSail(false); else selectPart(null); break;
    }
  }
  function onKeyUp(e) { keys[e.code] = false; }

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

  function updateSail(dt) {
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

    // chase camera, hung off the port quarter
    var back = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.heading);
    var want = new THREE.Vector3().copy(shipYaw.position)
      .addScaledVector(back, 420 + sp * 14)
      .add(new THREE.Vector3(0, 165 + sp * 3, 0));
    camera.position.lerp(want, 1 - Math.pow(0.05, dt));
    var look = new THREE.Vector3().copy(shipYaw.position).add(new THREE.Vector3(0, 62, 0));
    controls.target.lerp(look, 1 - Math.pow(0.02, dt));
    camera.lookAt(controls.target);

    $('#kn').textContent = (sp * 1.94384).toFixed(1);
    $('#hdg').textContent = String(Math.round(((-state.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '°';
    $('#pod').textContent = (state.steer * 35).toFixed(0) + '°';
  }

  var touchSteer = 0, touchThrottle = 0;

  /* -------------------------------------------------------------------- UI */

  var ladderEls = [], listEls = [], toggleEls = {};

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
  }

  function setDeckLights(on) {
    var v = on ? 1 : 0;
    ship.windowMats.forEach(function (m) { m.emissiveIntensity = v * (state.night ? 2.6 : 0.5); });
    // Physical units: these are metre-scale distances, so keep the candela low
    // or the floodlights wash straight across the sea.
    deckLightRig.forEach(function (l) { l.intensity = v * (state.night ? 5200 : 1400); });
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
    b.textContent = state.playing ? 'Pause build' : (state.progress >= 1 ? 'Replay build' : 'Run build');
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

    if (state.sailing) updateSail(dt);
    else controls.update(dt);

    // ambient spray at the bow in a seaway, even at rest
    _acc += dt;
    if (state.progress > 0.75 && state.seaState > 0.45 && _acc > 0.08) {
      _acc = 0;
      var bp = new THREE.Vector3(170, 0, 0).applyMatrix4(shipYaw.matrixWorld);
      spawnFoam(bp.x, bp.y + 10, bp.z, 22, 1.1 * state.seaState);
    }
    updateWake(dt);

    sun.target.position.copy(shipYaw.position);
    sun.position.set(shipYaw.position.x - 380, 420, shipYaw.position.z + 260);

    updateLabels();
    if (state.selected) refreshSelectionBox();
    renderer.render(scene, camera);
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

  global.IconApp = { state: state };
})(window);
