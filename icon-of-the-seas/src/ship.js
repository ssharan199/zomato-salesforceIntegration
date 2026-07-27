/* Icon of the Seas — geometry.
   All dimensions in metres. 1 world unit = 1 m.
   Ship axes: +X forward (bow), +Y up, +Z to starboard. Keel sits at y = 0. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  /* ---------------------------------------------------------------- hull form */

  var LOA = 364.75;          // length overall
  var HALF = LOA / 2;
  var HALF_BEAM = 48.5 / 2;  // moulded beam 48.5 m
  var DRAFT = 9.3;           // design draft — waterline sits here
  var MAIN_DECK = 30;        // top of the steel hull (deck 5 level)

  // Half-beam as a fraction of maximum, sampled along the ship.
  // s runs -1 (transom) .. +1 (stem).
  var BEAM_TABLE = [
    [-1.00, 0.60], [-0.94, 0.74], [-0.86, 0.87], [-0.72, 0.96], [-0.50, 1.00],
    [0.20, 1.00], [0.42, 0.99], [0.58, 0.95], [0.70, 0.86], [0.80, 0.72],
    [0.88, 0.55], [0.94, 0.36], [0.98, 0.17], [1.00, 0.03]
  ];

  function sampleTable(table, s) {
    if (s <= table[0][0]) return table[0][1];
    var n = table.length;
    if (s >= table[n - 1][0]) return table[n - 1][1];
    for (var i = 0; i < n - 1; i++) {
      if (s <= table[i + 1][0]) {
        var a = table[i], b = table[i + 1];
        var t = (s - a[0]) / (b[0] - a[0]);
        t = t * t * (3 - 2 * t);                  // smoothstep between stations
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return table[n - 1][1];
  }

  function halfBeamAt(s) { return HALF_BEAM * sampleTable(BEAM_TABLE, s); }

  // Bottom of the section. Flat keel amidships, raked stem forward, tucked run aft.
  function bottomAt(s) {
    var y = 0;
    if (s > 0.58) { var t = (s - 0.58) / 0.42; y += t * t * 17.5; }
    if (s < -0.88) { var u = (-0.88 - s) / 0.12; y += u * u * 7.0; }
    return y;
  }

  // Sheer line — the deck edge lifts forward, a little aft.
  function deckAt(s) {
    return MAIN_DECK + 5.0 * Math.max(0, s) * Math.max(0, s) + 1.2 * Math.max(0, -s) * Math.max(0, -s);
  }

  var STATIONS = 74;   // sections along the length
  var PROF = 17;       // points per section: 0 = stbd deck edge … 8 = keel … 16 = port deck edge

  // One section, returned as a flat array of PROF points in ship coordinates.
  function section(s) {
    var B = halfBeamAt(s);
    var y0 = bottomAt(s);
    var y1 = deckAt(s);
    var flat = B * (0.60 - 0.34 * Math.abs(s) * Math.abs(s));   // flat-of-bottom half width
    var bilge = Math.max(1.2, B * 0.34);
    var flare = 1 + 0.11 * Math.max(0, s) * Math.max(0, s);     // bow flare at the deck edge
    var half = [
      [B * flare, y1],
      [B * (1 + (flare - 1) * 0.35), y0 + bilge + (y1 - y0 - bilge) * 0.45],
      [B, y0 + bilge],
      [B - bilge * 0.16, y0 + bilge * 0.52],
      [B - bilge * 0.52, y0 + bilge * 0.16],
      [flat + (B - bilge - flat) * 0.55, y0],
      [flat, y0],
      [flat * 0.5, y0],
      [0, y0]
    ];
    var pts = new Array(PROF);
    for (var i = 0; i < 9; i++) pts[i] = [half[i][0], half[i][1]];          // starboard, z > 0
    for (var j = 1; j < 9; j++) pts[8 + j] = [-half[8 - j][0], half[8 - j][1]]; // mirrored to port
    return pts;
  }

  var SECTIONS = (function () {
    var out = [];
    for (var i = 0; i < STATIONS; i++) {
      var s = -1 + 2 * (i / (STATIONS - 1));
      out.push({ s: s, x: s * HALF, pts: section(s) });
    }
    return out;
  })();

  // Hull paint: antifouling below the waterline, a boot-top stripe, white topsides.
  var C_TOPSIDE = new THREE.Color(0xeef1f3);
  var C_BOOT = new THREE.Color(0x0d2f52);
  var C_UNDER = new THREE.Color(0x123a55);

  function hullColor(y, target) {
    if (y < DRAFT - 0.4) return target.copy(C_UNDER);
    if (y < DRAFT + 1.6) return target.copy(C_BOOT);
    return target.copy(C_TOPSIDE);
  }

  // Loft a band of the hull between two profile indices into one mesh.
  function loftBand(i0, i1) {
    var cols = i1 - i0 + 1, rows = STATIONS;
    var pos = [], col = [], idx = [];
    var c = new THREE.Color();
    for (var r = 0; r < rows; r++) {
      var st = SECTIONS[r];
      for (var i = i0; i <= i1; i++) {
        var p = st.pts[i];
        pos.push(st.x, p[1], p[0]);
        hullColor(p[1], c);
        col.push(c.r, c.g, c.b);
      }
    }
    for (var r2 = 0; r2 < rows - 1; r2++) {
      for (var k = 0; k < cols - 1; k++) {
        var a = r2 * cols + k, b = a + 1, d = a + cols, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Flat plating of the main deck, spanning port deck edge to starboard deck edge.
  function mainDeckGeometry() {
    var pos = [], idx = [];
    for (var r = 0; r < STATIONS; r++) {
      var st = SECTIONS[r];
      pos.push(st.x, st.pts[0][1], st.pts[0][0]);
      pos.push(st.x, st.pts[16][1], st.pts[16][0]);
    }
    for (var r2 = 0; r2 < STATIONS - 1; r2++) {
      var a = r2 * 2, b = a + 1, d = a + 2, e = a + 3;
      idx.push(a, b, d, b, e, d);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Transom — a fan closing the aftmost section.
  function transomGeometry() {
    var st = SECTIONS[0];
    var pos = [], idx = [];
    var cx = 0, cy = 0;
    for (var i = 0; i < PROF; i++) { cx += st.pts[i][0]; cy += st.pts[i][1]; }
    pos.push(st.x, cy / PROF, cx / PROF);
    for (var j = 0; j < PROF; j++) pos.push(st.x, st.pts[j][1], st.pts[j][0]);
    for (var k = 1; k < PROF; k++) idx.push(0, k, k + 1);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* -------------------------------------------------------------- materials */

  var windowMats = [];   // collected so night mode can light them from one place

  function mat(color, opts) {
    var o = opts || {};
    var m = new THREE.MeshStandardMaterial({
      color: color,
      roughness: o.rough === undefined ? 0.72 : o.rough,
      metalness: o.metal === undefined ? 0.06 : o.metal,
      transparent: true,          // set once, so fly-in fades never recompile a shader
      opacity: 1,
      side: o.side || THREE.FrontSide,
      flatShading: !!o.flat
    });
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.ei === undefined ? 1 : o.ei;   // 0 must stay 0
    }
    if (o.vertexColors) m.vertexColors = true;
    m.userData.baseOpacity = 1;
    return m;
  }

  function glassMat(color, opacity) {
    var m = mat(color, { rough: 0.12, metal: 0.2, side: THREE.DoubleSide });
    m.opacity = opacity;
    m.userData.baseOpacity = opacity;
    m.depthWrite = false;
    return m;
  }

  var M = {};
  function buildMaterials() {
    M.hull = mat(0xffffff, { vertexColors: true, rough: 0.55, metal: 0.12 });
    M.deck = mat(0xd8dbdd, { rough: 0.9 });
    M.teak = mat(0xc9a97c, { rough: 0.95 });
    M.white = mat(0xf1f3f5, { rough: 0.6 });
    M.superstructure = mat(0xe9edf0, { rough: 0.58 });
    M.steel = mat(0x8d99a6, { rough: 0.45, metal: 0.65 });
    M.darkSteel = mat(0x4a555f, { rough: 0.5, metal: 0.6 });
    M.rcBlue = mat(0x14498c, { rough: 0.5 });
    M.gold = mat(0xd8a94a, { rough: 0.35, metal: 0.8 });
    M.orange = mat(0xe8641f, { rough: 0.6 });
    M.pool = glassMat(0x2fb3d6, 0.82);
    M.glass = glassMat(0x9fc6d8, 0.3);
    M.domeGlass = glassMat(0xbfe0ec, 0.24);
    M.park = mat(0x4e8a48, { rough: 1 });
    M.foliage = mat(0x3f7a3c, { rough: 1, flat: true });
    M.trunk = mat(0x6b5138, { rough: 1 });
    M.slideA = mat(0x18b5d4, { rough: 0.4 });
    M.slideB = mat(0xf0a824, { rough: 0.4 });
    M.slideC = mat(0xd63a6a, { rough: 0.4 });
    M.slideD = mat(0x7fd44f, { rough: 0.4 });
    M.rubber = mat(0x27303a, { rough: 0.9 });
    M.bronze = mat(0xb07a3a, { rough: 0.35, metal: 0.85 });
    M.window = mat(0x1d2c3a, { rough: 0.15, metal: 0.4, emissive: 0xffcf87, ei: 1 });
    M.windowLarge = mat(0x22323f, { rough: 0.12, metal: 0.35, emissive: 0xffd79a, ei: 1 });
    // Night livery. Icon reads as long lines of warm cabin light with cold
    // neon washing the deck edges — these are what make the night shots.
    M.neonCyan = mat(0x0e2a38, { rough: 0.4, emissive: 0x35e0ff, ei: 1.5 });
    M.neonMagenta = mat(0x2a1024, { rough: 0.4, emissive: 0xff3fb0, ei: 1.5 });
    M.neonBlue = mat(0x101c38, { rough: 0.4, emissive: 0x3f6bff, ei: 1.4 });
    M.neonWarm = mat(0x2a2010, { rough: 0.4, emissive: 0xffb64a, ei: 1.3 });
    M.window.userData.window = true;
    M.windowLarge.userData.window = true;
    [M.neonCyan, M.neonMagenta, M.neonBlue, M.neonWarm].forEach(function (m) {
      m.userData.window = true;      // driven by the lights switch with the rest
    });
    windowMats.length = 0;
  }

  /* ------------------------------------------------------------- primitives */

  function box(w, h, d, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function cyl(rt, rb, h, material, x, y, z, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function capsule(r, len, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function mesh(geometry, material) {
    var m = new THREE.Mesh(geometry, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // A pool is a tiled shell plus a water surface, not a solid block of water.
  // Built that way you can stand in it: the surface is a plane at chest height
  // rather than a volume the camera ends up inside of.
  function poolBox(w, h, d, x, y, z) {
    var g = new THREE.Group();
    var shell = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      mat(0x8fd0e4, { rough: 0.22, side: THREE.BackSide })     // seen from within
    );
    shell.position.set(x, y - 0.05, z);
    shell.receiveShadow = true;
    g.add(shell);

    var plane = new THREE.PlaneGeometry(w, d);
    plane.rotateX(-Math.PI / 2);                                // local xz, for edge foam
    var surface = new THREE.Mesh(plane, global.IconWater.pool(new THREE.Vector3(w / 2, 0, d / 2)));
    surface.position.set(x, y + h / 2, z);
    g.add(surface);
    return g;
  }

  function poolTub(r, h, x, y, z) {
    var g = new THREE.Group();
    var shell = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 22),
      mat(0x8fd0e4, { rough: 0.22, side: THREE.BackSide })
    );
    shell.position.set(x, y - 0.05, z);
    g.add(shell);
    var disc = new THREE.CircleGeometry(r, 22);
    disc.rotateX(-Math.PI / 2);
    var surface = new THREE.Mesh(disc, global.IconWater.pool(new THREE.Vector3(r * 1.4, 0, r * 1.4)));
    surface.position.set(x, y + h / 2, z);
    g.add(surface);
    return g;
  }

  // A run of lit windows down one side of the ship.
  function windowStrip(x0, x1, y, z, height, material) {
    var g = new THREE.Group();
    var step = 2.6;                       // cabin pitch, near enough
    for (var x = x0; x <= x1; x += step) {
      g.add(box(step * 0.74, height, 0.5, material, x, y, z));
    }
    return g;
  }

  // Balcony stack: a deck-height band with a recessed rail and a lit slot behind it.
  function balconyBand(x0, x1, y, z, side) {
    var g = new THREE.Group();
    g.add(box(x1 - x0, 2.35, 1.0, M.superstructure, (x0 + x1) / 2, y, z));
    g.add(windowStrip(x0 + 2, x1 - 2, y - 0.15, z - side * 0.55, 1.6, M.window));
    g.add(box(x1 - x0, 0.25, 1.5, M.steel, (x0 + x1) / 2, y - 1.15, z + side * 0.3));
    // the light line under each balcony rail, which is what makes the side of
    // the ship read as stacked ribbons after dark
    g.add(box(x1 - x0, 0.16, 0.24, M.neonWarm, (x0 + x1) / 2, y - 1.35, z + side * 0.9));
    return g;
  }

  function tree(x, z, scale) {
    var g = new THREE.Group();
    g.add(cyl(0.22, 0.3, 2.2 * scale, M.trunk, 0, 1.1 * scale, 0, 6));
    var crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * scale, 0), M.foliage);
    crown.position.y = 3.1 * scale;
    crown.castShadow = true;
    g.add(crown);
    g.position.set(x, 0, z);
    return g;
  }

  // Water slide: a translucent tube swept along a spline.
  function slide(points, radius, material) {
    var curve = new THREE.CatmullRomCurve3(points.map(function (p) {
      return new THREE.Vector3(p[0], p[1], p[2]);
    }));
    var geo = new THREE.TubeGeometry(curve, 90, radius, 10, false);
    var m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    return m;
  }

  // Ship's name and port of registry, painted straight onto a canvas texture.
  function nameplate(lines, width, height, colour) {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * height / width);
    var g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = colour || '#1b3f66';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var step = c.height / (lines.length + 0.4);
    lines.forEach(function (line, i) {
      g.font = (i ? 'italic ' : 'italic 600 ') + Math.round(step * (i ? 0.5 : 0.72)) + 'px Georgia, "Times New Roman", serif';
      g.fillText(line, c.width / 2, step * (i + 0.7));
    });
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    var m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    m.userData.baseOpacity = 1;
    var plate = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m);
    return plate;
  }

  function railing(x0, x1, y, z, material) {
    var g = new THREE.Group();
    var len = x1 - x0;
    g.add(box(len, 0.12, 0.12, material || M.steel, (x0 + x1) / 2, y + 1.1, z));
    g.add(box(len, 0.08, 0.08, material || M.steel, (x0 + x1) / 2, y + 0.6, z));
    for (var x = x0; x <= x1; x += 6) g.add(box(0.12, 1.1, 0.12, material || M.steel, x, y + 0.55, z));
    return g;
  }

  // Central Park is a slot cut clean through the accommodation; the stacks are
  // built around it and the park block fills it.
  var PARK_X0 = -44, PARK_X1 = 52;
  var PARK_FLOOR = 46.4;
  var TOP_DECK = 76;      // open sun deck, on top of the stacks

  /* ------------------------------------------------------ the 24 hull blocks */

  // Each entry: id, name, section, an approach vector for the fly-in, an explode
  // vector, a build() returning the group, and the dossier shown when selected.
  var BLOCKS = [
    {
      id: 'keel', no: 1, name: 'Keel & Double Bottom', zone: 'Hull structure',
      approach: [0, -70, 0], explode: [0, -46, 0],
      specs: [['Block laid', '2 Jun 2021'], ['Structure', 'Double bottom, 2.0 m void'], ['Yard', 'Meyer Turku, Finland']],
      note: 'The first steel of the ship: a flat-keel double bottom that doubles as tankage and as the crash barrier that keeps a grounding out of the machinery spaces. The flat of bottom carries the air lubrication system, which blows a carpet of microscopic bubbles under the hull to cut skin friction.',
      build: function () {
        var g = new THREE.Group();
        g.add(mesh(loftBand(4, 12), M.hull));
        // longitudinal girders, visible in cutaway
        for (var z = -18; z <= 18; z += 9) {
          g.add(box(300, 1.6, 0.5, M.darkSteel, -12, 3.4, z));
        }
        for (var x = -150; x <= 140; x += 20) {
          g.add(box(0.5, 1.6, 40, M.darkSteel, x, 3.4, 0));
        }
        return g;
      }
    },
    {
      id: 'lng', no: 2, name: 'LNG Fuel Tanks', zone: 'Machinery',
      approach: [0, 40, 90], explode: [0, -14, 62],
      specs: [['Fuel', 'Liquefied natural gas'], ['Storage', 'Cryogenic, −162 °C'], ['Backup', 'Marine gas oil']],
      note: 'Icon was the first Royal Caribbean ship designed around LNG rather than heavy fuel oil. The gas is carried as a liquid at −162 °C in vacuum-insulated tanks low in the hull, vaporised on demand and fed to dual-fuel engines that can fall back to marine gas oil.',
      build: function () {
        var g = new THREE.Group();
        [-16, 16].forEach(function (z) {
          var t = capsule(6.2, 26, M.steel, -74, 11, z);
          t.rotation.z = Math.PI / 2;
          g.add(t);
          g.add(box(2, 12, 14, M.darkSteel, -74, 5, z));
        });
        g.add(box(26, 0.6, 40, M.darkSteel, -74, 18.5, 0));
        return g;
      }
    },
    {
      id: 'engines', no: 3, name: 'Engine Room', zone: 'Machinery',
      approach: [0, 44, -80], explode: [0, -16, -60],
      specs: [['Prime movers', 'Six Wärtsilä dual-fuel'], ['Arrangement', 'Diesel-electric'], ['Heat', 'Waste-heat recovery']],
      note: 'Six dual-fuel Wärtsilä engines drive generators, not shafts. Everything aboard — propulsion pods, thrusters, galleys, the ice rink chiller — draws from the same electrical bus, so the plant can run only as many engines as the load of the moment needs.',
      build: function () {
        var g = new THREE.Group();
        for (var i = 0; i < 6; i++) {
          var x = -128 + (i % 3) * 22;
          var z = i < 3 ? -11 : 11;
          g.add(box(16, 7, 6, M.darkSteel, x, 9, z));
          g.add(box(4, 3, 5.4, M.bronze, x + 9.5, 9, z));
          for (var c = 0; c < 4; c++) g.add(cyl(0.7, 0.7, 3, M.steel, x - 5 + c * 3.4, 13.6, z, 8));
        }
        g.add(box(78, 0.6, 40, M.darkSteel, -117, 19, 0));
        return g;
      }
    },
    {
      id: 'pods', no: 4, name: 'Azimuth Propulsion Pods', zone: 'Propulsion',
      approach: [-90, -30, 0], explode: [-78, -22, 0],
      specs: [['Pods', 'Three, 360° steerable'], ['Drive', 'Electric, podded'], ['Service speed', '22 knots']],
      note: 'Three steerable pods hang beneath the stern in place of shafts and rudders. Each swings through a full circle, so the ship steers by vectoring thrust — and can walk sideways onto a berth with the bow thrusters rather than waiting on tugs.',
      spin: true,
      build: function () {
        var g = new THREE.Group();
        [-15, 0, 15].forEach(function (z, i) {
          var pod = new THREE.Group();
          pod.position.set(-142 - (i === 1 ? 8 : 0), 2.5, z);
          var body = capsule(2.6, 9, M.steel, 0, 0, 0);
          body.rotation.z = Math.PI / 2;
          pod.add(body);
          pod.add(box(3.2, 8, 1.6, M.steel, 1.5, 4.5, 0));
          var hub = cyl(1.1, 1.4, 1.6, M.bronze, 7.2, 0, 0, 12);
          hub.rotation.z = Math.PI / 2;
          var prop = new THREE.Group();
          prop.add(hub);
          for (var b = 0; b < 4; b++) {
            var blade = box(0.5, 4.6, 1.9, M.bronze, 7.4, 2.4, 0);
            blade.rotation.x = b * Math.PI / 2;
            blade.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), b * Math.PI / 2);
            prop.add(blade);
          }
          prop.userData.spin = 1;
          pod.add(prop);
          g.add(pod);
        });
        return g;
      }
    },
    {
      id: 'thrusters', no: 5, name: 'Bow Thrusters', zone: 'Propulsion',
      approach: [80, 0, 0], explode: [66, -12, 0],
      specs: [['Type', 'Transverse tunnel'], ['Use', 'Berthing, station keeping'], ['Location', 'Forward of frame 200']],
      note: 'Four tunnels driven athwartships through the forefoot. Working against the aft pods they let a 365-metre hull pivot about its own midpoint — the reason a ship this size can turn in a basin barely longer than she is.',
      spin: true,
      build: function () {
        var g = new THREE.Group();
        [118, 128, 138, 148].forEach(function (x) {
          var s = 1 - (x - 118) / 120;
          var r = 2.2 * s + 0.6;
          var t = cyl(r, r, halfBeamAt(x / HALF) * 2 + 1, M.darkSteel, x, 6.5, 0, 16);
          t.rotation.x = Math.PI / 2;
          g.add(t);
          var imp = new THREE.Group();
          imp.position.set(x, 6.5, 0);
          for (var b = 0; b < 4; b++) {
            var blade = box(1.3, 0.35, r * 1.5, M.steel, 0, 0, 0);
            blade.rotation.x = b * Math.PI / 2;
            blade.position.set(0, Math.sin(b * Math.PI / 2) * r * 0.6, Math.cos(b * Math.PI / 2) * 0);
            imp.add(blade);
          }
          imp.userData.spin = 2.4;
          imp.userData.axis = 'z';
          g.add(imp);
        });
        return g;
      }
    },
    {
      id: 'fins', no: 6, name: 'Stabiliser Fins', zone: 'Hull structure',
      approach: [0, 0, 110], explode: [0, -8, 70],
      specs: [['Pair', 'Retractable, amidships'], ['Effect', 'Roll damping'], ['Deployed', 'Underway only']],
      note: 'A pair of retractable aerofoils amidships, angled in opposition by a controller reading the ship\'s roll rate. They fold into pockets in the hull for harbour work, where they would be a liability against a quay.',
      build: function () {
        var g = new THREE.Group();
        [-1, 1].forEach(function (side) {
          var fin = box(12, 1.1, 13, M.steel, -20, 5.5, side * (halfBeamAt(-0.11) + 5));
          fin.rotation.x = side * 0.22;
          g.add(fin);
          g.add(box(4, 2.4, 4, M.darkSteel, -20, 5.5, side * (halfBeamAt(-0.11) - 1)));
        });
        return g;
      }
    },
    {
      id: 'platePort', no: 7, name: 'Hull Plating — Port', zone: 'Hull structure',
      approach: [0, 20, -120], explode: [0, 6, -74],
      specs: [['Side', 'Port'], ['Assembly', 'Pre-outfitted grand blocks'], ['Erection', 'Gantry, 1,200 t capacity']],
      note: 'The port shell, erected as pre-outfitted grand blocks — cabins, cabling and piping already inside — and welded up in the building dock. Meyer Turku assembles the ship as a small number of very large pieces rather than a large number of small ones.',
      build: function () {
        var g = new THREE.Group();
        g.add(mesh(loftBand(12, 16), M.hull));
        g.add(windowStrip(-150, 140, 24, -halfBeamAt(0) - 0.2, 2.2, M.window));
        var name = nameplate(['Icon of the Seas'], 62, 8);
        name.position.set(112, 25, -halfBeamAt(112 / HALF) - 0.6);
        name.rotation.y = Math.PI;
        g.add(name);
        return g;
      }
    },
    {
      id: 'plateStbd', no: 8, name: 'Hull Plating — Starboard', zone: 'Hull structure',
      approach: [0, 20, 120], explode: [0, 6, 74],
      specs: [['Side', 'Starboard'], ['Shell', 'Welded steel, ice-class bow'], ['Coating', 'Silicone foul release']],
      note: 'The starboard shell closes the box. Hide it with the cutaway control to look straight into the machinery spaces and the decks stacked above them.',
      cutaway: true,
      build: function () {
        var g = new THREE.Group();
        var stbd = new THREE.Group(); stbd.name = 'stbd';
        stbd.add(mesh(loftBand(0, 4), M.hull));
        stbd.add(windowStrip(-150, 140, 24, halfBeamAt(0) + 0.2, 2.2, M.window));
        var name = nameplate(['Icon of the Seas'], 62, 8);
        name.position.set(112, 25, halfBeamAt(112 / HALF) + 0.6);
        stbd.add(name);
        g.add(stbd);
        return g;
      }
    },
    {
      id: 'bulb', no: 9, name: 'Bulbous Bow', zone: 'Hull structure',
      approach: [120, 0, 0], explode: [92, -6, 0],
      specs: [['Form', 'Ram bulb'], ['Purpose', 'Wave cancellation'], ['Immersion', 'Fully submerged']],
      note: 'The bulb throws its own bow wave, timed to arrive out of phase with the wave the stem makes. The two largely cancel, and the hollow they leave behind is worth several percent of the ship\'s fuel bill at service speed.',
      build: function () {
        var g = new THREE.Group();
        var b = new THREE.Mesh(new THREE.SphereGeometry(5.4, 24, 16), M.hull);
        b.scale.set(3.0, 1.0, 1.0);
        b.position.set(174, 5.4, 0);
        b.material = mat(0x123a55, { rough: 0.5 });
        b.castShadow = true;
        g.add(b);
        var anchorPocket = box(3, 4, 1, M.darkSteel, 150, 20, 0);
        g.add(anchorPocket);
        return g;
      }
    },
    {
      id: 'stern', no: 10, name: 'Transom & Stern Block', zone: 'Hull structure',
      approach: [-120, 10, 0], explode: [-88, 4, 0],
      specs: [['Transom', 'Immersed, flat'], ['Aft feature', 'Marina & tender bay'], ['Mooring', 'Aft warping deck']],
      note: 'A wide immersed transom keeps the run clean at speed and gives the aft neighbourhoods a stage over the wake. The shell doors below open onto the tender bay.',
      build: function () {
        var g = new THREE.Group();
        g.add(mesh(transomGeometry(), M.hull));
        g.add(box(10, 6, 26, M.darkSteel, -176, 16, 0));
        g.add(box(1, 5, 10, M.steel, -180, 14, 0));
        g.add(box(18, 1.2, 34, M.teak, -170, 30.4, 0));
        var plate = nameplate(['Icon of the Seas', 'NASSAU'], 34, 11);
        plate.position.set(-181.4, 24, 0);
        plate.rotation.y = -Math.PI / 2;
        g.add(plate);
        return g;
      }
    },
    {
      id: 'maindeck', no: 11, name: 'Main Deck & Mooring Gear', zone: 'Deck outfit',
      approach: [0, 90, 0], explode: [0, 26, 0],
      specs: [['Deck', 'Deck 5, weather deck'], ['Ground tackle', 'Bower anchors, port & stbd'], ['Winches', 'Split-drum mooring']],
      note: 'The weather deck closes the hull and carries the ground tackle: bower anchors, chain stoppers and the split-drum winches that hold 250,000 gross tons against a spring line.',
      build: function () {
        var g = new THREE.Group();
        g.add(mesh(mainDeckGeometry(), M.deck));
        // forecastle gear
        g.add(box(20, 2.4, 26, M.white, 152, 32.4, 0));
        [-8, 8].forEach(function (z) {
          g.add(cyl(2.2, 2.2, 2.6, M.darkSteel, 146, 34.6, z, 14));
          g.add(box(6, 1.2, 3, M.steel, 158, 33.2, z));
        });
        // anchors nested in the shell
        [-1, 1].forEach(function (side) {
          g.add(box(4.5, 5, 1.2, M.darkSteel, 149, 22, side * (halfBeamAt(0.82) + 0.4)));
        });
        // mooring stations aft
        for (var i = 0; i < 4; i++) {
          g.add(cyl(1.6, 1.6, 2.2, M.darkSteel, -160 + i * 8, 31.5, i % 2 ? -14 : 14, 12));
        }
        g.add(railing(-176, 160, 31, halfBeamAt(0) - 1.2));
        g.add(railing(-176, 160, 31, -halfBeamAt(0) + 1.2));
        return g;
      }
    },
    {
      id: 'promenade', no: 12, name: 'Royal Promenade Block', zone: 'Neighbourhood',
      approach: [0, 120, 0], explode: [0, 40, 0],
      specs: [['Decks', '5 – 7'], ['Feature', 'The Pearl'], ['Tiles', '3,600 kinetic']],
      note: 'The interior high street, three decks tall and open through the middle of the ship. At its heart stands The Pearl, a spherical sculpture skinned in some 3,600 kinetic tiles that turn to redraw its surface as you walk past.',
      build: function () {
        var g = new THREE.Group();
        // superstructure core, decks 5-7
        // Hollow: the street runs through the middle of this block, so the
        // structure sits outboard of it and the decks stop either side.
        var stbd = new THREE.Group(); stbd.name = 'stbd';
        stbd.add(box(300, 11, 7, M.superstructure, -10, 36.5, 16.5));
        stbd.add(windowStrip(-152, 138, 36, 20.2, 6, M.windowLarge));
        g.add(stbd);
        g.add(box(300, 11, 7, M.superstructure, -10, 36.5, -16.5));
        g.add(windowStrip(-152, 138, 36, -20.2, 6, M.windowLarge));
        // interior deck slabs port and starboard, revealed by the cutaway
        for (var d = 0; d < 3; d++) {
          stbd.add(box(296, 0.5, 7, M.darkSteel, -10, 32.4 + d * 3.6, 16.5));
          g.add(box(296, 0.5, 7, M.darkSteel, -10, 32.4 + d * 3.6, -16.5));
        }
        // The Pearl
        var pearl = new THREE.Mesh(new THREE.IcosahedronGeometry(5.4, 2), mat(0xdfe6ea, { rough: 0.25, metal: 0.55, flat: true }));
        pearl.position.set(6, 37, 0);
        pearl.userData.spin = 0.12;
        pearl.userData.axis = 'y';
        pearl.castShadow = true;
        g.add(pearl);
        return g;
      }
    },
    {
      id: 'stacks', no: 13, name: 'Stateroom Balcony Stacks', zone: 'Accommodation',
      approach: [0, 150, 0], explode: [0, 54, 0],
      specs: [['Guests', '5,610 double occupancy'], ['Maximum', '7,600'], ['Crew', '2,350']],
      note: 'Nine decks of balcony stacks, tapering fore and aft as the sheer runs out. The infill between them is what makes the ship read as a wall of steel from a mile off and as a village of small verandahs from the pier.',
      build: function () {
        var g = new THREE.Group();
        var stbd = new THREE.Group(); stbd.name = 'stbd';
        g.add(stbd);
        for (var d = 0; d < 9; d++) {
          var y = 45 + d * 3.3;
          var t = d / 8;
          var x0 = -158 + t * 12, x1 = 128 - t * 16;
          var z = 22.2 - t * 0.6;
          stbd.add(balconyBand(x0, x1, y, z, 1));
          g.add(balconyBand(x0, x1, y, -z, -1));
          // inboard structure, stopped either side of the Central Park cut
          [[x0, PARK_X0], [PARK_X1, x1]].forEach(function (seg) {
            var len = seg[1] - seg[0];
            if (len <= 4) return;
            var cx = (seg[0] + seg[1]) / 2;
            stbd.add(box(len, 3.3, 15, M.superstructure, cx, y, 7.5));
            g.add(box(len, 3.3, 15, M.superstructure, cx, y, -7.5));
            g.add(box(len - 3, 0.4, 30, M.darkSteel, cx, y - 1.65, 0));
          });
          // the canyon walls the park looks up through
          stbd.add(box(PARK_X1 - PARK_X0, 3.3, 3, M.superstructure, (PARK_X0 + PARK_X1) / 2, y, 13));
          g.add(box(PARK_X1 - PARK_X0, 3.3, 3, M.superstructure, (PARK_X0 + PARK_X1) / 2, y, -13));
        }
        return g;
      }
    },
    {
      id: 'park', no: 14, name: 'Central Park', zone: 'Neighbourhood',
      approach: [0, 100, 0], explode: [0, 46, 0],
      specs: [['Deck', '8, open to the sky'], ['Planting', 'Live tropical'], ['Frontage', 'Inward-facing balconies']],
      note: 'A slot cut clean through eight decks of accommodation and planted out — the trick Royal Caribbean first pulled on Oasis. Cabins that would have faced a corridor face a garden instead, and the ship gains an outdoor room that never sees spray.',
      build: function () {
        var g = new THREE.Group();
        var len = PARK_X1 - PARK_X0, cx = (PARK_X0 + PARK_X1) / 2;
        g.add(box(len, 0.8, 22, M.park, cx, PARK_FLOOR, 0));
        g.add(box(len, 0.32, 6, M.teak, cx, PARK_FLOOR + 0.5, 0));
        for (var i = 0; i < 34; i++) {
          var x = PARK_X0 + 4 + (i % 17) * 5.4;
          var z = i < 17 ? -7.5 : 7.5;
          var t = tree(x, z + (i % 3) * 1.4, 0.8 + (i % 4) * 0.16);
          t.position.y = PARK_FLOOR + 0.4;
          g.add(t);
        }
        // inward-facing balconies looking down into the cut
        [-11.4, 11.4].forEach(function (z) {
          for (var d = 0; d < 8; d++) {
            var y = 49.4 + d * 3.3;
            g.add(box(len, 0.35, 1.5, M.steel, cx, y, z));
            g.add(windowStrip(PARK_X0 + 4, PARK_X1 - 4, y + 1.3, z + (z > 0 ? 0.7 : -0.7), 1.9, M.window));
          }
        });
        return g;
      }
    },
    {
      id: 'surfside', no: 15, name: 'Surfside Neighbourhood', zone: 'Neighbourhood',
      approach: [90, 60, 0], explode: [70, 20, 0],
      specs: [['Deck', '7, forward'], ['For', 'Families with small children'], ['Includes', 'Beach, carousel, splash pad']],
      note: 'A whole neighbourhood pitched at families whose children are too small for the waterpark: a shallow beach that shelves into a pool, a carousel, and food counters put at the height of a five-year-old.',
      build: function () {
        var g = new THREE.Group();
        g.add(box(52, 1, 34, M.teak, 96, 43.5, 0));
        var pool = poolBox(16, 1.6, 12, 88, 44.2, 0);
        g.add(pool);
        g.add(box(20, 0.5, 16, M.white, 106, 44.2, 0));
        // carousel
        var car = new THREE.Group();
        car.position.set(112, 44, 8);
        car.add(cyl(5, 5, 0.4, M.white, 0, 4.6, 0, 16));
        car.add(cyl(0.5, 0.5, 4.6, M.gold, 0, 2.3, 0, 8));
        for (var i = 0; i < 8; i++) {
          var a = i / 8 * Math.PI * 2;
          car.add(cyl(0.14, 0.14, 3.4, M.gold, Math.cos(a) * 3.6, 2.2, Math.sin(a) * 3.6, 6));
        }
        car.userData.spin = 0.3;
        car.userData.axis = 'y';
        g.add(car);
        g.add(railing(70, 122, 44, 16));
        g.add(railing(70, 122, 44, -16));
        return g;
      }
    },
    {
      id: 'suites', no: 16, name: 'Suite Neighbourhood', zone: 'Accommodation',
      approach: [70, 110, 0], explode: [46, 40, 0],
      specs: [['Signature', 'Ultimate Family Townhouse'], ['Townhouse', 'Three levels, private slide'], ['Access', 'Suite-only sun deck']],
      note: 'Forward and high: the suite enclave, and inside it the Ultimate Family Townhouse — three storeys with its own patio, karaoke room and a slide connecting the levels, because the stairs were apparently insufficient.',
      build: function () {
        var g = new THREE.Group();
        g.add(box(58, 12, 34, M.superstructure, 88, 68, 0));
        g.add(windowStrip(64, 112, 66, 17.4, 8, M.windowLarge));
        g.add(windowStrip(64, 112, 66, -17.4, 8, M.windowLarge));
        // the townhouse: three stepped levels with a slide between them
        g.add(box(16, 9.6, 14, M.white, 106, 78.8, -9));
        g.add(box(14, 0.4, 12, M.teak, 106, 77.4, -9));
        g.add(box(14, 0.4, 12, M.teak, 106, 80.7, -9));
        g.add(slide([[110, 83, -5], [114, 80, -3], [112, 76, 1], [108, 74.6, 3]], 0.7, M.slideC));
        g.add(box(32, 0.6, 26, M.teak, 84, 74.3, 4));
        g.add(poolBox(12, 1.2, 8, 76, 74.9, 4));
        g.add(railing(68, 100, 74.5, 13));
        return g;
      }
    },
    {
      id: 'boats', no: 17, name: 'Lifeboats & Tenders', zone: 'Safety',
      approach: [0, 30, 130], explode: [0, 4, 66],
      specs: [['Stowage', 'Deck 5, both sides'], ['Type', 'Enclosed, davit-launched'], ['Capacity', '100% of persons on board']],
      note: 'Enclosed boats on gravity davits, stowed low so they clear the shell on the way down. In port the outboard pairs work as tenders, running guests ashore where no berth can take a ship of this length.',
      build: function () {
        var g = new THREE.Group();
        var stbd = new THREE.Group(); stbd.name = 'stbd';
        g.add(stbd);
        for (var i = 0; i < 9; i++) {
          var x = -120 + i * 28;
          [-1, 1].forEach(function (side) {
            var host = side > 0 ? stbd : g;
            var z = side * (halfBeamAt(x / HALF) + 2.6);
            var b = capsule(1.9, 8.4, M.orange, x, 40, z);
            b.rotation.z = Math.PI / 2;
            host.add(b);
            host.add(box(9.5, 0.6, 4.4, M.white, x, 42, z));
            host.add(box(1, 4.4, 0.6, M.steel, x - 4, 43.6, z - side * 1.4));
            host.add(box(1, 4.4, 0.6, M.steel, x + 4, 43.6, z - side * 1.4));
          });
        }
        return g;
      }
    },
    {
      id: 'chill', no: 18, name: 'Chill Island Pool Deck', zone: 'Neighbourhood',
      approach: [0, 80, 0], explode: [0, 52, 0],
      specs: [['Pools aboard', 'Seven'], ['Whirlpools', 'Nine'], ['Spread', 'Three decks']],
      note: 'Four pools terraced across three decks amidships, including cantilevered whirlpools that hang outboard of the shell so there is nothing under you but sea.',
      build: function () {
        var g = new THREE.Group();
        var y = TOP_DECK;
        g.add(box(80, 0.8, 40, M.teak, -34, y + 0.4, 0));
        [[-56, 0, 18, 14], [-30, 12, 16, 12], [-8, -12, 16, 12]].forEach(function (p) {
          g.add(poolBox(p[2], 1.6, p[3], p[0], y + 1.2, p[1]));
          g.add(box(p[2] + 2, 0.5, p[3] + 2, M.white, p[0], y + 0.7, p[1]));
        });
        // whirlpools cantilevered outboard
        [-1, 1].forEach(function (side) {
          [-48, -20].forEach(function (x) {
            g.add(poolTub(3.4, 1.4, x, y + 1.4, side * 24));
            g.add(cyl(3.8, 3.8, 1.6, M.white, x, y + 0.6, side * 24));
            g.add(box(6, 0.6, 5, M.steel, x, y - 0.4, side * 22));
          });
        });
        g.add(railing(-74, 6, y, 20));
        g.add(railing(-74, 6, y, -20));
        [-1, 1].forEach(function (side) {
          g.add(box(80, 0.3, 0.34, side > 0 ? M.neonCyan : M.neonMagenta, -34, y + 0.1, side * 20));
        });
        return g;
      }
    },
    {
      id: 'swim', no: 19, name: 'Swim & Tonic', zone: 'Bar',
      approach: [0, 70, 60], explode: [0, 44, 34],
      specs: [['First', 'Swim-up bar at sea'], ['Deck', '15'], ['Seats', 'Submerged stools']],
      note: 'The first swim-up bar built into a cruise ship rather than improvised at a resort: submerged stools, a bar top at waterline height, and a pool shallow enough that the bartender stays dry.',
      build: function () {
        var g = new THREE.Group();
        var y = TOP_DECK;
        g.add(poolBox(26, 1.8, 20, -76, y + 1.2, 0));
        g.add(box(28, 0.6, 22, M.white, -76, y + 0.4, 0));
        g.add(box(12, 2.4, 4, M.teak, -76, y + 2.4, 0));
        g.add(box(13, 0.3, 5, M.white, -76, y + 3.7, 0));
        for (var i = 0; i < 8; i++) {
          var x = -82 + (i % 4) * 4;
          var z = i < 4 ? -4 : 4;
          g.add(cyl(0.7, 0.7, 1.4, M.steel, x, y + 1.6, z, 10));
        }
        // shade canopy
        g.add(box(30, 0.3, 24, M.glass, -76, y + 8, 0));
        [-1, 1].forEach(function (sx) {
          [-1, 1].forEach(function (sz) {
            g.add(cyl(0.4, 0.4, 8, M.steel, -76 + sx * 13, y + 4, sz * 10, 8));
          });
        });
        return g;
      }
    },
    {
      id: 'thrill', no: 20, name: 'Thrill Island — Category 6', zone: 'Waterpark',
      approach: [-80, 90, 0], explode: [-46, 56, 0],
      specs: [['Slides', 'Six'], ['Claim', 'Largest waterpark at sea'], ['Tallest', 'Frightening Bolt']],
      note: 'Six slides braided over the aft decks — Frightening Bolt\'s near-vertical drop, the Storm Chasers duelling pair, and the open funnels of Pressure Drop and Storm Surge. The whole assembly had to be structured for the roll of a ship, not the still footing of a water park ashore.',
      build: function () {
        var g = new THREE.Group();
        var y = TOP_DECK;
        g.add(box(58, 0.8, 40, M.deck, -124, y + 0.4, 0));
        // launch tower
        g.add(box(10, 19, 10, M.white, -104, y + 10, 0));
        g.add(box(12, 0.6, 12, M.deck, -104, y + 19.6, 0));
        g.add(railing(-110, -98, y + 19.6, 5));
        g.add(slide([[-104, y + 18.6, 2], [-112, y + 16, 8], [-124, y + 9, 12], [-134, y + 3, 6], [-138, y + 1.2, -2]], 1.5, M.slideA));
        g.add(slide([[-104, y + 18.6, -2], [-112, y + 14, -9], [-126, y + 7, -12], [-136, y + 2.5, -6], [-140, y + 1.2, 0]], 1.5, M.slideB));
        g.add(slide([[-103, y + 17, 4], [-98, y + 11, 12], [-108, y + 5, 18], [-122, y + 2, 14], [-130, y + 1.2, 8]], 1.3, M.slideC));
        g.add(slide([[-103, y + 17, -4], [-96, y + 10, -12], [-106, y + 4, -18], [-120, y + 1.8, -14], [-128, y + 1.2, -8]], 1.3, M.slideD));
        // Frightening Bolt — the near-vertical drop
        g.add(slide([[-105, y + 19.4, 0], [-113, y + 18.6, 0], [-116, y + 11, -1], [-116, y + 4, -2], [-122, y + 1.4, -2]], 1.7, M.slideC));
        // the open funnels
        var f1 = new THREE.Mesh(new THREE.ConeGeometry(7, 12, 20, 1, true), glassMat(0x18b5d4, 0.7));
        f1.position.set(-140, y + 7, 12); f1.rotation.z = 0.35;
        f1.castShadow = true;
        g.add(f1);
        var f2 = new THREE.Mesh(new THREE.ConeGeometry(6, 11, 20, 1, true), glassMat(0xf0a824, 0.7));
        f2.position.set(-142, y + 6.5, -12); f2.rotation.z = -0.3;
        f2.castShadow = true;
        g.add(f2);
        for (var i = 0; i < 6; i++) g.add(cyl(0.5, 0.5, 14, M.steel, -118 - i * 6, y + 7, i % 2 ? 9 : -9, 8));
        return g;
      }
    },
    {
      id: 'crown', no: 21, name: "Crown's Edge", zone: 'Attraction',
      approach: [0, 40, 130], explode: [0, 22, 88],
      specs: [['Height', '154 ft above the sea'], ['Type', 'Skywalk, ropes course, ride'], ['Side', 'Starboard, outboard']],
      note: 'A walkway cantilevered off the starboard side, 154 feet above the water. Partway across the floor gives way and the harness swings you out beyond the shell — the ship deliberately dropping you off the edge of itself.',
      build: function () {
        var g = new THREE.Group();
        var z0 = 23, y = 66;
        g.add(box(34, 0.5, 3, M.steel, -50, y, z0 + 8));
        g.add(box(3, 0.4, 18, M.steel, -34, y, z0 + 4));
        // truss carrying the walkway outboard of the shell
        for (var i = 0; i < 6; i++) {
          var x = -64 + i * 6;
          g.add(box(0.4, 0.4, 12, M.steel, x, y + 2, z0 + 4));
          var d = box(0.3, 8, 0.3, M.steel, x, y + 4, z0 + 2);
          d.rotation.x = 0.5;
          g.add(d);
        }
        g.add(box(36, 0.35, 0.35, M.orange, -50, y + 4.4, z0 + 8));
        g.add(box(36, 0.35, 0.35, M.orange, -50, y + 4.4, z0 + 6.6));
        // two riders out on the wire
        for (var r = 0; r < 2; r++) {
          var rider = new THREE.Group();
          rider.position.set(-58 + r * 14, y + 2.6, z0 + 8);
          rider.add(capsule(0.4, 1.1, M.orange, 0, 0, 0));
          rider.add(cyl(0.06, 0.06, 1.6, M.steel, 0, 1.2, 0, 6));
          g.add(rider);
        }
        return g;
      }
    },
    {
      id: 'hideaway', no: 22, name: 'The Hideaway', zone: 'Neighbourhood',
      approach: [-70, 60, 0], explode: [-52, 34, 0],
      specs: [['First', 'Suspended infinity pool at sea'], ['Position', 'Aft, overhanging the wake'], ['Decks', '15 – 16']],
      note: 'A horseshoe of terraces cantilevered over the stern with an infinity pool at its centre — the first suspended one built into a ship. The overflow edge sits directly above the wake, which is the entire point.',
      build: function () {
        var g = new THREE.Group();
        var y = 62;
        g.add(box(30, 0.8, 46, M.teak, -158, y, 0));
        g.add(poolBox(18, 1.8, 16, -160, y + 1.2, 0));
        g.add(box(20, 0.4, 18, M.white, -160, y + 0.3, 0));
        for (var d = 0; d < 3; d++) {
          g.add(box(24 - d * 4, 0.5, 44 - d * 8, M.teak, -156 - d * 2, y + 4 + d * 3.3, 0));
          g.add(railing(-168 - d * 2, -146 - d * 2, y + 4 + d * 3.3, (44 - d * 8) / 2));
          g.add(railing(-168 - d * 2, -146 - d * 2, y + 4 + d * 3.3, -(44 - d * 8) / 2));
        }
        // struts carrying the overhang back into the hull
        [-1, 1].forEach(function (side) {
          var s = box(0.8, 14, 0.8, M.steel, -150, y - 7, side * 18);
          s.rotation.z = 0.4;
          g.add(s);
        });

        // The arch over the stern — the single most recognisable thing about
        // this ship's profile, and the frame every aft photograph is taken in.
        var arch = new THREE.Group();
        arch.position.set(-150, y - 16, 0);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(26, 1.5, 12, 48, Math.PI), M.white);
        ring.rotation.y = Math.PI / 2;
        ring.castShadow = true;
        arch.add(ring);
        var inner = new THREE.Mesh(new THREE.TorusGeometry(23.4, 0.7, 8, 48, Math.PI), M.neonBlue);
        inner.rotation.y = Math.PI / 2;
        arch.add(inner);
        // legs down onto the terraces
        [-1, 1].forEach(function (side) {
          arch.add(box(5, 9, 3.4, M.white, 0, -4, side * 25.6));
        });
        g.add(arch);
        // deck-edge neon around the terraces
        for (var d2 = 0; d2 < 3; d2++) {
          var wz = (44 - d2 * 8) / 2;
          [-1, 1].forEach(function (side) {
            g.add(box(24 - d2 * 4, 0.28, 0.3, d2 % 2 ? M.neonMagenta : M.neonCyan,
              -156 - d2 * 2, y + 3.7 + d2 * 3.3, side * wz));
          });
        }
        return g;
      }
    },
    {
      id: 'aquadome', no: 23, name: 'AquaDome', zone: 'Neighbourhood',
      approach: [0, 170, 0], explode: [0, 92, 0],
      specs: [['Lift weight', '363 tonnes'], ['Installed', 'Single lift, 2022'], ['Inside', 'AquaTheater & waterfall']],
      note: 'A 363-tonne steel-and-glass crown lifted onto the ship in one piece. Inside, the largest waterfall at sea falls into an AquaTheater stage; from outside it turns the whole forward end of the ship into a lantern after dark.',
      build: function () {
        var g = new THREE.Group();
        var y = TOP_DECK, R = 25;
        g.add(box(74, 1, 52, M.deck, 54, y + 0.5, 0));
        // The dome sits on an oval collar that overhangs the shell on both
        // sides — that lip is what gives the bow its flying-saucer look.
        var collar = cyl(37, 37, 1.6, M.white, 54, y + 1.6, 0, 44);
        collar.scale.set(1, 1, 0.86);
        g.add(collar);
        var collarLight = cyl(37.6, 37.6, 0.45, M.neonBlue, 54, y + 0.75, 0, 44);
        collarLight.scale.set(1, 1, 0.86);
        g.add(collarLight);

        // Built round at unit radius inside a squashed group, so every rib is
        // deformed by the same transform instead of each one on its own axis.
        var shell = new THREE.Group();
        shell.position.set(54, y + 1, 0);
        shell.scale.set(1.32, 0.86, 1.06);   // taller crown, closer to the real one
        var glass = new THREE.Mesh(new THREE.SphereGeometry(R, 44, 22, 0, Math.PI * 2, 0, Math.PI / 2), M.domeGlass);
        shell.add(glass);
        for (var i = 0; i < 16; i++) {
          var rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 6, 44, Math.PI), M.white);
          rib.rotation.set(0, (i / 16) * Math.PI * 2, Math.PI / 2);
          shell.add(rib);
        }
        for (var r = 1; r <= 3; r++) {
          var a = (r / 4) * (Math.PI / 2);
          var ring = new THREE.Mesh(new THREE.TorusGeometry(R * Math.cos(a), 0.26, 6, 52), M.white);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = R * Math.sin(a);
          shell.add(ring);
        }
        shell.add(cyl(1.4, 1.4, 0.6, M.white, 0, R - 0.4, 0, 16));
        g.add(shell);

        // AquaTheater stage, and the waterfall that falls into it
        g.add(poolBox(22, 2.6, 22, 44, y + 2, 0));
        g.add(box(24, 0.6, 24, M.white, 44, y + 0.9, 0));
        var fall = new THREE.Mesh(new THREE.PlaneGeometry(15, 11), glassMat(0xcfeaf5, 0.5));
        fall.position.set(65, y + 7, 0);
        fall.rotation.y = -Math.PI / 2;
        fall.userData.waterfall = 1;
        g.add(fall);
        g.add(box(2, 11, 17, M.white, 67, y + 7, 0));
        return g;
      }
    },
    {
      id: 'funnel', no: 24, name: 'Funnel, Mast & Bridge', zone: 'Deck outfit',
      approach: [0, 150, 0], explode: [0, 74, 0],
      specs: [['Air draft', '72 m'], ['Bridge', 'Full-width, wing consoles'], ['Mast', 'Radar, comms, whistle']],
      note: 'The last steel up: exhaust casing, mast and navigating bridge. Air draft governs where the ship can go — 72 metres decides which bridges she passes under and which ports she will never see.',
      build: function () {
        var g = new THREE.Group();
        var y = TOP_DECK;
        // Twin funnels, side by side — the pair reads from a mile off and is
        // one of the things that says Icon rather than any other big ship.
        [-8.5, 8.5].forEach(function (fz) {
          var casing = cyl(5.2, 6.0, 13, M.rcBlue, -92, y + 6.5, fz, 20);
          g.add(casing);
          g.add(cyl(5.6, 5.6, 1.6, M.white, -92, y + 13.6, fz, 20));
          g.add(cyl(4.4, 4.4, 1.2, M.darkSteel, -92, y + 14.8, fz, 18));
          // the underlit collar that makes them glow at night
          g.add(cyl(6.2, 6.2, 0.7, M.neonCyan, -92, y + 1.2, fz, 20));
          var crest = cyl(3.2, 3.2, 0.5, M.gold, -86.6, y + 7.5, fz, 20);
          crest.rotation.z = Math.PI / 2;
          g.add(crest);
        });
        g.add(box(26, 1.2, 26, M.deck, -92, y + 0.6, 0));
        // bridge, full width with wings out to the shell
        g.add(box(16, 5, 46, M.white, 118, 56, 0));
        g.add(windowStrip(112, 126, 56.5, 23.2, 3, M.windowLarge));
        [-1, 1].forEach(function (side) {
          g.add(box(9, 4.6, 7, M.white, 118, 56, side * 26));
          g.add(box(9, 0.4, 7, M.steel, 118, 53.5, side * 26));
        });
        g.add(box(18, 0.6, 48, M.deck, 118, 58.8, 0));
        // mast
        g.add(cyl(0.7, 1.1, 17, M.white, 104, y + 6, 0, 12));
        g.add(box(0.5, 0.5, 12, M.white, 104, y + 10, 0));
        g.add(cyl(2.2, 2.2, 0.4, M.white, 104, y + 13, 0, 16));
        var radar = new THREE.Group();
        radar.position.set(104, y + 15.5, 0);
        radar.add(box(6, 0.3, 0.8, M.white, 0, 0, 0));
        radar.userData.spin = 1.1;
        radar.userData.axis = 'y';
        g.add(radar);
        return g;
      }
    }
  ];

  /* ---------------------------------------------------------------- assembly */

  function buildShip() {
    buildMaterials();
    var root = new THREE.Group();
    var parts = [];
    var spinners = [];
    var waterfalls = [];
    var starboardShells = [];

    BLOCKS.forEach(function (def, i) {
      var group = def.build();
      group.name = def.id;

      // Human-scale fit-out rides with the block that carries it, so it appears
      // exactly when that block is erected.
      if (global.IconVenues && global.IconVenues.has(def.id)) {
        var fitOut = global.IconVenues.attach(def.id);
        if (fitOut) { fitOut.name = def.id + '-fitout'; group.add(fitOut); }
      }

      // Each block owns its materials, so fading one in never touches another.
      var cache = new Map();
      var owned = [];
      group.traverse(function (o) {
        if (o.userData && o.userData.spin) spinners.push(o);
        if (o.userData && o.userData.waterfall) waterfalls.push(o);
        if (o.name === 'stbd') starboardShells.push(o);
        if (!o.material) return;
        var clone = cache.get(o.material);
        if (!clone) {
          clone = o.material.clone();
          clone.userData = Object.assign({}, o.material.userData);
          cache.set(o.material, clone);
          owned.push(clone);
          if (clone.userData.window) {
            // Remember what the material was authored at, so the lights switch
            // scales it instead of flattening every fitting to one value.
            clone.userData.authoredEI = clone.emissiveIntensity;
            windowMats.push(clone);
          }
        }
        o.material = clone;
      });
      var bboxBase = new THREE.Box3().setFromObject(group);
      var centre = bboxBase.getCenter(new THREE.Vector3());
      var wrapper = new THREE.Group();
      wrapper.add(group);
      wrapper.name = def.id + '-wrap';
      root.add(wrapper);
      var part = {
        def: def,
        index: i,
        group: wrapper,
        inner: group,
        centre: centre,
        materials: owned,
        radius: bboxBase.getSize(new THREE.Vector3()).length() / 2,
        approach: new THREE.Vector3().fromArray(def.approach),
        explode: new THREE.Vector3().fromArray(def.explode),
        seated: 0
      };
      wrapper.userData.part = part;
      group.userData.part = part;
      parts.push(part);
    });

    return {
      root: root,
      parts: parts,
      spinners: spinners,
      waterfalls: waterfalls,
      starboardShells: starboardShells,
      windowMats: windowMats,
      materials: M,
      dims: { LOA: LOA, HALF: HALF, BEAM: HALF_BEAM * 2, DRAFT: DRAFT, MAIN_DECK: MAIN_DECK }
    };
  }

  global.IconShip = {
    build: buildShip,
    blocks: BLOCKS,
    halfBeamAt: halfBeamAt,
    dims: { LOA: LOA, HALF: HALF, BEAM: HALF_BEAM * 2, DRAFT: DRAFT }
  };
})(window);
