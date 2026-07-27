/* Icon of the Seas — the places you can actually stand in.
   Human-scale fit-out for each neighbourhood, plus the walkable floors,
   colliders and spawn points the first-person controller reads.
   Ship axes: +X forward, +Y up, +Z starboard. 1 unit = 1 m. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  // Deck levels shared with ship.js, so the fit-out never drifts from the hull.
  var L = {
    MAIN_DECK: 30,
    PROMENADE: 32.7,     // interior street floor, deck 5
    PARK_FLOOR: 46.4,
    PARK_X0: -44,
    PARK_X1: 52,
    SURFSIDE: 44,
    HIDEAWAY: 62,
    CROWN: 66,
    SUITE_SUN: 74.6,
    TOP_DECK: 76
  };

  /* --------------------------------------------------------------- materials */

  var M = {};
  function mat(color, o) {
    o = o || {};
    var m = new THREE.MeshStandardMaterial({
      color: color,
      roughness: o.rough === undefined ? 0.75 : o.rough,
      metalness: o.metal === undefined ? 0.05 : o.metal,
      transparent: true,
      opacity: 1,
      side: o.side || THREE.FrontSide,
      flatShading: !!o.flat
    });
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.ei === undefined ? 1 : o.ei;
    }
    m.userData.baseOpacity = 1;
    if (o.lit) m.userData.window = true;      // picked up by the lights switch
    return m;
  }

  function buildMaterials() {
    // A touch of self-illumination on the big interior surfaces stands in for
    // bounced light, which a forward renderer will not give us.
    M.marble = mat(0xe8e4dc, { rough: 0.28, metal: 0.05, emissive: 0x2a3038, ei: 0.3 });
    M.marbleDark = mat(0x9aa4ad, { rough: 0.32 });
    M.teak = mat(0xc7a274, { rough: 0.85 });
    M.deck = mat(0xd9dcde, { rough: 0.9 });
    M.concrete = mat(0xc8ccd0, { rough: 0.92 });
    M.white = mat(0xf3f5f7, { rough: 0.55 });
    M.ceiling = mat(0xdde2e6, { rough: 0.92, emissive: 0x39424d, ei: 0.85 });
    M.skylight = mat(0xcfe4f2, { rough: 0.1, emissive: 0xbcdcf2, ei: 2.4, lit: true });
    M.cream = mat(0xece2d2, { rough: 0.7, emissive: 0x241f18, ei: 0.35 });
    M.brass = mat(0xc79a4e, { rough: 0.3, metal: 0.85 });
    M.steel = mat(0x97a3ae, { rough: 0.4, metal: 0.7 });
    M.dark = mat(0x36414c, { rough: 0.6, metal: 0.3 });
    M.glassClear = mat(0xbcd8e6, { rough: 0.06, metal: 0.1, side: THREE.DoubleSide });
    M.shopGlass = mat(0x2a3a48, { rough: 0.1, metal: 0.3, emissive: 0xffcb82, ei: 0.55, lit: true });
    M.signWarm = mat(0x1c2630, { rough: 0.4, emissive: 0xffb347, ei: 1.6, lit: true });
    M.signCool = mat(0x1c2630, { rough: 0.4, emissive: 0x7fe3ff, ei: 1.4, lit: true });
    M.lamp = mat(0xfff0d0, { rough: 0.3, emissive: 0xffe7bd, ei: 2.2, lit: true });
    M.leaf = mat(0x4a8a45, { rough: 1, flat: true });
    M.leafDeep = mat(0x36703a, { rough: 1, flat: true });
    M.trunk = mat(0x6a5138, { rough: 1 });
    M.soil = mat(0x4a3f33, { rough: 1 });
    M.towel = mat(0xf5f7f8, { rough: 0.9 });
    M.canvasRed = mat(0xd8503f, { rough: 0.85 });
    M.canvasBlue = mat(0x2f6fa8, { rough: 0.85 });
    M.canvasCream = mat(0xf0e6d2, { rough: 0.85 });
    M.tile = mat(0x9fd8ea, { rough: 0.25 });
    M.seatFabric = mat(0x27455f, { rough: 0.95 });
    M.rubber = mat(0x2b3238, { rough: 0.95 });
    M.glassRail = mat(0xa9cfdd, { rough: 0.05, metal: 0.1, side: THREE.DoubleSide });
    M.glassRail.opacity = 0.24;
    M.glassRail.userData.baseOpacity = 0.24;
    M.glassClear.opacity = 0.2;
    M.glassClear.userData.baseOpacity = 0.2;
    M.skin = mat(0xd9a882, { rough: 0.85 });
    // Tinted per instance. Cloth is rough, skin slightly less so.
    M.crowd = mat(0xffffff, { rough: 0.88 });
    M.crowdLeg = mat(0xffffff, { rough: 0.9 });
    M.crowdSkin = mat(0xffffff, { rough: 0.62 });
  }

  /* -------------------------------------------------------------- primitives */

  function box(w, h, d, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function cyl(rt, rb, h, material, x, y, z, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // One draw call for a repeated prop. `place` fills each instance matrix.
  function scatter(geometry, material, count, place) {
    var im = new THREE.InstancedMesh(geometry, material, count);
    im.castShadow = true; im.receiveShadow = true;
    var d = new THREE.Object3D();
    for (var i = 0; i < count; i++) {
      d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
      place(d, i);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }

  function railing(g, x0, x1, y, z, material) {
    var len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
    g.add(box(len, 0.09, 0.09, material || M.steel, cx, y + 1.08, z));
    g.add(box(len, 0.06, 0.06, material || M.steel, cx, y + 0.62, z));
    for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 2.6) {
      g.add(box(0.07, 1.08, 0.07, material || M.steel, x, y + 0.54, z));
    }
  }

  function glassBalustrade(g, x0, x1, y, z) {
    var len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
    g.add(box(len, 1.05, 0.05, M.glassRail, cx, y + 0.55, z));
    g.add(box(len, 0.08, 0.14, M.brass, cx, y + 1.1, z));
  }

  // A flight of steps between two levels, walkable by the step-up rule.
  function stairs(g, x0, y0, x1, y1, z, width, steps) {
    var n = steps || 12;
    for (var i = 0; i < n; i++) {
      var t = i / n;
      var x = x0 + (x1 - x0) * t;
      var y = y0 + (y1 - y0) * t;
      g.add(box(Math.abs(x1 - x0) / n + 0.1, 0.18, width, M.concrete, x, y, z));
      g.add(box(Math.abs(x1 - x0) / n + 0.1, (y1 - y0) / n, width, M.concrete,
        x, y - (y1 - y0) / n / 2 - 0.09, z));
    }
  }

  function palm(x, y, z, h, seed) {
    var g = new THREE.Group();
    var trunk = cyl(0.16, 0.28, h, M.trunk, 0, h / 2, 0, 8);
    trunk.rotation.z = 0.05 + (seed % 3) * 0.03;
    g.add(trunk);
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2 + seed;
      var frond = box(3.4, 0.09, 0.7, i % 2 ? M.leaf : M.leafDeep,
        Math.cos(a) * 1.5, h + 0.1 - (i % 3) * 0.12, Math.sin(a) * 1.5);
      frond.rotation.y = -a;
      frond.rotation.z = -0.34 - (i % 3) * 0.08;
      g.add(frond);
    }
    g.position.set(x, y, z);
    return g;
  }

  function leafyTree(x, y, z, scale, seed) {
    var g = new THREE.Group();
    g.add(cyl(0.2 * scale, 0.3 * scale, 2.4 * scale, M.trunk, 0, 1.2 * scale, 0, 7));
    for (var i = 0; i < 3; i++) {
      var crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry((1.5 - i * 0.28) * scale, 0),
        i % 2 ? M.leaf : M.leafDeep
      );
      crown.position.set(
        Math.cos(seed + i * 2.1) * 0.5 * scale,
        (2.7 + i * 0.85) * scale,
        Math.sin(seed + i * 2.1) * 0.5 * scale
      );
      crown.castShadow = true;
      g.add(crown);
    }
    g.position.set(x, y, z);
    return g;
  }

  /* ------------------------------------------------------------------ crowd */

  // Guests. Eight instanced meshes — legs, arms, hips, torso, neck, head —
  // sharing one walk cycle, each person on their own circuit inside a venue.
  var crowd = null;
  var _limb = new THREE.Object3D();

  function buildCrowd() {
    var beats = [];
    // venue rect, count — kept inside the walkable bounds so nobody walks off
    var groups = [
      { x: [-130, 110], z: [-11, 11], y: L.PROMENADE, n: 46 },
      { x: [-40, 48], z: [-8, 8], y: L.PARK_FLOOR + 0.4, n: 22 },
      { x: [-70, 2], z: [-17, 17], y: L.TOP_DECK + 0.8, n: 30 },
      { x: [-150, -100], z: [-16, 16], y: L.TOP_DECK + 0.8, n: 18 },
      { x: [22, 86], z: [-22, 22], y: L.TOP_DECK + 1, n: 26 },
      { x: [-170, -146], z: [-20, 20], y: L.HIDEAWAY + 0.4, n: 12 },
      { x: [74, 118], z: [-15, 15], y: L.SURFSIDE, n: 14 },
      { x: [-140, 110], z: [-22, 22], y: L.MAIN_DECK + 0.4, n: 20 }
    ];
    // Muted resort colours rather than primaries — a crowd of saturated blocks
    // is the thing that reads as toy-like from a distance.
    var TOPS = [
      0xe6e8ea, 0x46617d, 0xb75a48, 0xe0b96a, 0x4e7a63, 0x7c5f86,
      0xc98da3, 0x3f4650, 0xd9cdb8, 0x6d8fa8
    ];
    var LEGWEAR = [0x35404d, 0x5b6673, 0x2c333c, 0xa8a094, 0x46505c, 0x7d8794];
    var SKIN = [0xf0c8a4, 0xdaa87c, 0xb4794f, 0x8a5a35, 0xefd3b3, 0x6f4526];

    groups.forEach(function (grp) {
      for (var i = 0; i < grp.n; i++) {
        var seed = beats.length * 2.399963;
        beats.push({
          cx: grp.x[0] + Math.abs(Math.sin(seed)) * (grp.x[1] - grp.x[0]),
          cz: grp.z[0] + Math.abs(Math.cos(seed * 1.7)) * (grp.z[1] - grp.z[0]),
          y: grp.y,
          r: 1.5 + (i % 5) * 1.4,
          phase: seed % 6.283,
          speed: 0.18 + (i % 7) * 0.035,
          // adult heights cluster near 1.7 m; a few children run smaller
          height: (i % 9 === 0) ? 0.72 + (i % 3) * 0.04 : 0.94 + (i % 5) * 0.035,
          top: TOPS[i % TOPS.length],
          legs: LEGWEAR[(i + 2) % LEGWEAR.length],
          skin: SKIN[(i + 1) % SKIN.length]
        });
      }
    });

    var n = beats.length;

    // Limbs pivot at hip and shoulder, so each geometry is shifted down to put
    // its joint at the origin and the instance matrix just rotates it.
    var legGeo = new THREE.CapsuleGeometry(0.085, 0.60, 3, 8);
    legGeo.translate(0, -0.385, 0);
    var armGeo = new THREE.CapsuleGeometry(0.05, 0.44, 3, 8);
    armGeo.translate(0, -0.28, 0);
    var torsoGeo = new THREE.CapsuleGeometry(0.155, 0.34, 4, 12);
    var hipGeo = new THREE.CapsuleGeometry(0.145, 0.12, 3, 10);
    var headGeo = new THREE.SphereGeometry(0.108, 12, 10);
    headGeo.scale(0.92, 1.12, 0.96);          // a head is not a ball
    var neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8);

    function inst(geo, material) {
      var m = new THREE.InstancedMesh(geo, material, n);
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    }

    var legL = inst(legGeo, M.crowdLeg), legR = inst(legGeo, M.crowdLeg);
    var armL = inst(armGeo, M.crowdSkin), armR = inst(armGeo, M.crowdSkin);
    var torso = inst(torsoGeo, M.crowd), hips = inst(hipGeo, M.crowdLeg);
    var head = inst(headGeo, M.crowdSkin), neck = inst(neckGeo, M.crowdSkin);

    var col = new THREE.Color();
    for (var i = 0; i < n; i++) {
      torso.setColorAt(i, col.setHex(beats[i].top));
      legL.setColorAt(i, col.setHex(beats[i].legs));
      legR.setColorAt(i, col.setHex(beats[i].legs));
      hips.setColorAt(i, col.setHex(beats[i].legs));
      head.setColorAt(i, col.setHex(beats[i].skin));
      neck.setColorAt(i, col.setHex(beats[i].skin));
      armL.setColorAt(i, col.setHex(beats[i].skin));
      armR.setColorAt(i, col.setHex(beats[i].skin));
    }
    var parts = [legL, legR, armL, armR, torso, hips, head, neck];
    parts.forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });

    var group = new THREE.Group();
    parts.forEach(function (m) { group.add(m); });
    crowd = { group: group, beats: beats, parts: parts,
      legL: legL, legR: legR, armL: armL, armR: armR,
      torso: torso, hips: hips, head: head, neck: neck,
      dummy: new THREE.Object3D() };
    return group;
  }

  // One step of the walk cycle for everybody. Limbs swing in opposition, the
  // body rises and falls twice per stride, and the torso leans into the turn.
  // Place one limb of one person. Heights are in body units, scaled by the
  // person's own height, so a child's stride matches a child's legs.
  function limb(mesh, p, px, py, pz, rx, rz) {
    _limb.position.set(p.x + px, p.y + py * p.h + p.bob, p.z + pz);
    _limb.rotation.set(rx, p.facing, rz);
    _limb.scale.setScalar(p.h);
    _limb.updateMatrix();
    mesh.setMatrixAt(p.i, _limb.matrix);
  }

  function updateCrowd(t) {
    if (!crowd) return;
    for (var i = 0; i < crowd.beats.length; i++) {
      var b = crowd.beats[i];
      var a = b.phase + t * b.speed;
      var x = b.cx + Math.cos(a) * b.r;
      var z = b.cz + Math.sin(a) * b.r * 0.7;
      var facing = -a - Math.PI / 2;
      var h = b.height;

      var stride = a * 9;                       // cadence
      var swing = Math.sin(stride);
      var bob = Math.abs(Math.cos(stride)) * 0.03 * h;
      var lean = 0.05 + Math.abs(swing) * 0.02;

      // legs swing about the hip, arms about the shoulder, opposed
      var hipOff = 0.085 * h, shoulder = 0.155 * h;
      var sinF = Math.sin(facing), cosF = Math.cos(facing);
      var P = { x: x, y: b.y, z: z, h: h, bob: bob, facing: facing, i: i };
      limb(crowd.legL, P, cosF * hipOff, 0.86, -sinF * hipOff, swing * 0.62, 0);
      limb(crowd.legR, P, -cosF * hipOff, 0.86, sinF * hipOff, -swing * 0.62, 0);
      limb(crowd.hips, P, 0, 0.92, 0, 0, 0);
      limb(crowd.torso, P, 0, 1.20, 0, lean, 0);
      limb(crowd.armL, P, cosF * shoulder, 1.38, -sinF * shoulder, -swing * 0.5, 0.05);
      limb(crowd.armR, P, -cosF * shoulder, 1.38, sinF * shoulder, swing * 0.5, -0.05);
      limb(crowd.neck, P, 0, 1.50, 0, 0, 0);
      limb(crowd.head, P, 0, 1.61, 0, Math.sin(stride * 0.5) * 0.04, 0);
    }
    crowd.parts.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
  }

  /* ----------------------------------------------------------------- venues */

  var VENUE = {};

  // Royal Promenade — the interior street, three decks tall.
  VENUE.promenade = function () {
    var g = new THREE.Group();
    var y = L.PROMENADE;
    g.add(box(268, 0.3, 26, M.marble, -10, y - 0.15, 0));
    for (var s = -128; s < 116; s += 8) {
      g.add(box(3.4, 0.32, 26, M.marbleDark, s, y - 0.13, 0));
    }

    // An interior needs its own shell. The hull around it is single-sided, so
    // from in here those faces are culled and you would see straight out to sea.
    [-1, 1].forEach(function (side) {
      g.add(box(268, 9.4, 0.5, M.cream, -10, y + 4.4, side * 13.2));
    });
    g.add(box(0.5, 9.4, 26.4, M.cream, -142, y + 4.4, 0));
    g.add(box(0.5, 9.4, 26.4, M.cream, 120, y + 4.4, 0));

    var lounge = [];
    // shopfronts down both sides
    for (var x = -128; x <= 108; x += 12) {
      [-1, 1].forEach(function (side) {
        var z = side * 12.4;
        g.add(box(11, 4.6, 1.2, M.cream, x, y + 2.3, z));
        g.add(box(8.6, 3, 0.4, M.shopGlass, x, y + 1.9, z - side * 0.6));
        g.add(box(6, 0.7, 0.3, ((x / 12) % 2) ? M.signWarm : M.signCool, x, y + 4.1, z - side * 0.75));
        // awning
        var aw = box(9.4, 0.16, 2.4, ((x / 12) % 3) ? M.canvasRed : M.canvasCream,
          x, y + 3.5, z - side * 1.7);
        aw.rotation.x = side * 0.22;
        g.add(aw);
        for (var p = -1; p <= 1; p += 2) {
          g.add(cyl(0.05, 0.05, 3.3, M.steel, x + p * 4.4, y + 1.65, z - side * 2.7, 6));
        }
      });
      lounge.push(x);
    }

    // two balcony levels overlooking the street
    [36.1, 39.5].forEach(function (by) {
      [-1, 1].forEach(function (side) {
        var z = side * 11.6;
        g.add(box(262, 0.34, 2.4, M.marble, -10, by, z));
        glassBalustrade(g, -140, 112, by + 0.17, z - side * 1.1);
        for (var x2 = -130; x2 <= 108; x2 += 10) {
          g.add(box(7, 2.6, 0.3, M.shopGlass, x2, by + 1.5, z + side * 1.1));
        }
      });
    });

    // ceiling with skylights over the atrium
    g.add(box(268, 0.4, 26, M.ceiling, -10, 41.4, 0));
    for (var sx = -120; sx <= 100; sx += 16) {
      g.add(box(9, 0.16, 9, M.skylight, sx, 41.15, 0));
    }

    // pendant lights down the centre line
    var bulb = new THREE.SphereGeometry(0.22, 8, 6);
    g.add(scatter(bulb, M.lamp, 44, function (d, i) {
      d.position.set(-130 + i * 6, 38.4 + (i % 3) * 0.5, ((i % 2) ? 1 : -1) * 3.6);
    }));

    // café clusters — tables and chairs down the middle
    var tableTop = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12);
    var chairSeat = new THREE.BoxGeometry(0.44, 0.06, 0.44);
    var pods = 16;
    g.add(scatter(tableTop, M.white, pods, function (d, i) {
      d.position.set(-118 + i * 14, y + 0.74, (i % 2 ? 1 : -1) * 5.4);
    }));
    g.add(scatter(new THREE.CylinderGeometry(0.05, 0.07, 0.72, 8), M.steel, pods, function (d, i) {
      d.position.set(-118 + i * 14, y + 0.36, (i % 2 ? 1 : -1) * 5.4);
    }));
    g.add(scatter(chairSeat, M.seatFabric, pods * 3, function (d, i) {
      var pod = Math.floor(i / 3), k = i % 3;
      var a = k * 2.1;
      d.position.set(
        -118 + pod * 14 + Math.cos(a) * 1.05,
        y + 0.46,
        (pod % 2 ? 1 : -1) * 5.4 + Math.sin(a) * 1.05
      );
      d.rotation.y = -a;
    }));

    // planters
    g.add(scatter(new THREE.CylinderGeometry(0.8, 0.7, 0.7, 10), M.marbleDark, 18, function (d, i) {
      d.position.set(-124 + i * 14, y + 0.35, (i % 2 ? -1 : 1) * 8.6);
    }));
    for (var t = 0; t < 18; t++) {
      g.add(leafyTree(-124 + t * 14, y + 0.6, (t % 2 ? -1 : 1) * 8.6, 0.5, t));
    }

    // Enclosed space, so it needs real light of its own rather than the sky's.
    // Physical units: irradiance falls as 1/d². At ~7 m these want to land
    // near 3–5, so a couple of hundred candela, not a few thousand.
    for (var lx = -100; lx <= 90; lx += 64) {
      var lamp = new THREE.PointLight(0xffd9a8, 260, 120, 2);
      lamp.position.set(lx, y + 6.5, 0);
      g.add(lamp);
    }
    return g;
  };

  // Central Park — the open-air cut, eight decks down.
  VENUE.park = function () {
    var g = new THREE.Group();
    var y = L.PARK_FLOOR + 0.4;
    // winding path
    for (var i = 0; i < 28; i++) {
      var x = L.PARK_X0 + 2 + i * 3.4;
      var z = Math.sin(i * 0.36) * 3.4;
      g.add(box(3.6, 0.12, 4.4, M.concrete, x, y + 0.06, z));
    }
    // planting beds either side
    [-7.4, 7.4].forEach(function (bz) {
      g.add(box(92, 0.5, 5, M.soil, 4, y + 0.25, bz));
      g.add(box(92, 0.3, 5.4, M.leafDeep, 4, y + 0.42, bz));
    });
    for (var t = 0; t < 16; t++) {
      g.add(leafyTree(L.PARK_X0 + 5 + t * 6, y + 0.4, t % 2 ? -7 : 7, 0.85, t * 1.7));
    }
    for (var p = 0; p < 7; p++) {
      g.add(palm(L.PARK_X0 + 9 + p * 14, y + 0.4, p % 2 ? 5.4 : -5.4, 5.5 + (p % 3), p * 2.1));
    }
    // benches and lamps along the path
    g.add(scatter(new THREE.BoxGeometry(1.9, 0.1, 0.55), M.teak, 14, function (d, i) {
      d.position.set(L.PARK_X0 + 6 + i * 6.6, y + 0.48, (i % 2 ? 1 : -1) * 4.6);
      d.rotation.y = i % 2 ? 0 : Math.PI;
    }));
    g.add(scatter(new THREE.BoxGeometry(1.9, 0.5, 0.1), M.teak, 14, function (d, i) {
      d.position.set(L.PARK_X0 + 6 + i * 6.6, y + 0.74, (i % 2 ? 1.25 : -1.25) * 4.6 * 0.9);
    }));
    g.add(scatter(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8), M.dark, 12, function (d, i) {
      d.position.set(L.PARK_X0 + 8 + i * 7.6, y + 1.8, (i % 2 ? -1 : 1) * 8.4);
    }));
    g.add(scatter(new THREE.SphereGeometry(0.26, 10, 8), M.lamp, 12, function (d, i) {
      d.position.set(L.PARK_X0 + 8 + i * 7.6, y + 3.7, (i % 2 ? -1 : 1) * 8.4);
    }));
    // pergola over the middle of the walk
    for (var k = 0; k < 9; k++) {
      var px = 2 + k * 2.2;
      g.add(box(0.16, 3.2, 0.16, M.teak, px, y + 1.6, -3.4));
      g.add(box(0.16, 3.2, 0.16, M.teak, px, y + 1.6, 3.4));
      g.add(box(0.2, 0.14, 7.2, M.teak, px, y + 3.2, 0));
    }
    // garden bar
    g.add(box(7, 1.1, 3, M.teak, 40, y + 0.55, 0));
    g.add(box(7.6, 0.12, 3.6, M.marble, 40, y + 1.16, 0));
    g.add(box(7.6, 0.2, 3.6, M.canvasCream, 40, y + 3.2, 0));
    for (var c = -1; c <= 1; c += 2) g.add(cyl(0.07, 0.07, 3, M.steel, 40 + c * 3.4, y + 1.6, c * 1.6, 6));
    return g;
  };

  // Chill Island — the main pool terrace.
  VENUE.chill = function () {
    var g = new THREE.Group();
    var y = L.TOP_DECK + 0.8;
    // loungers in ranks
    var seat = new THREE.BoxGeometry(2.0, 0.12, 0.72);
    var backGeo = new THREE.BoxGeometry(0.75, 0.1, 0.7);
    var place = function (d, i) {
      var row = Math.floor(i / 10), k = i % 10;
      d.position.set(-72 + k * 7.2, y + 0.42, (row < 2 ? -1 : 1) * (12.5 + (row % 2) * 4));
      d.rotation.y = row < 2 ? 0.06 : Math.PI - 0.06;
    };
    g.add(scatter(seat, M.towel, 40, place));
    g.add(scatter(backGeo, M.towel, 40, function (d, i) {
      place(d, i);
      d.position.x += (i % 10 < 5 ? -0.7 : 0.7);
      d.position.y += 0.28;
      d.rotation.z = (i % 10 < 5 ? 1 : -1) * 0.9;
    }));
    g.add(scatter(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), M.steel, 80, function (d, i) {
      var l = Math.floor(i / 2);
      place(d, l);
      d.position.x += (i % 2 ? 0.8 : -0.8);
      d.position.y = y + 0.2;
    }));
    // umbrellas
    g.add(scatter(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), M.steel, 10, function (d, i) {
      d.position.set(-70 + i * 7.6, y + 1.3, (i % 2 ? -1 : 1) * 16.5);
    }));
    g.add(scatter(new THREE.ConeGeometry(1.9, 0.5, 10), M.canvasCream, 10, function (d, i) {
      d.position.set(-70 + i * 7.6, y + 2.75, (i % 2 ? -1 : 1) * 16.5);
    }));
    // pool bar with stools
    g.add(box(9, 1.15, 3.2, M.teak, 2, y + 0.58, 0));
    g.add(box(9.6, 0.12, 3.8, M.marble, 2, y + 1.2, 0));
    g.add(box(10, 0.24, 4.6, M.canvasBlue, 2, y + 3.4, 0));
    for (var c = -1; c <= 1; c += 2) g.add(cyl(0.08, 0.08, 3.3, M.steel, 2 + c * 4.6, y + 1.75, c * 2, 6));
    g.add(scatter(new THREE.CylinderGeometry(0.22, 0.2, 0.1, 10), M.seatFabric, 6, function (d, i) {
      d.position.set(-2 + i * 1.6, y + 0.78, 2.6);
    }));
    g.add(scatter(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 6), M.steel, 6, function (d, i) {
      d.position.set(-2 + i * 1.6, y + 0.39, 2.6);
    }));
    // glass balustrades along the terrace edge
    glassBalustrade(g, -74, 6, y, 19.4);
    glassBalustrade(g, -74, 6, y, -19.4);
    // pool steps
    stairs(g, -60, y, -57, y - 1.3, 0, 4, 4);
    return g;
  };

  // Thrill Island — the base of the waterpark.
  VENUE.thrill = function () {
    var g = new THREE.Group();
    var y = L.TOP_DECK + 0.8;
    // splash runouts under the slide exits
    [[-138, -2], [-140, 0], [-130, 8], [-128, -8]].forEach(function (p) {
      g.add(box(9, 0.5, 5, M.tile, p[0], y + 0.2, p[1]));
    });
    // queue platform and the climb to the launch deck
    g.add(box(12, 0.3, 10, M.deck, -104, y + 0.15, 8));
    for (var f = 0; f < 5; f++) {
      var fy = y + f * 3.8;
      stairs(g, -98 - (f % 2 ? 0 : 6), fy, -92 - (f % 2 ? 0 : 6), fy + 3.8, 8 + (f % 2 ? 3 : -3), 2.4, 10);
      g.add(box(8, 0.24, 3, M.deck, -95, fy + 3.9, 8 + (f % 2 ? 3 : -3)));
      railing(g, -99, -91, fy + 3.9, 9.6 + (f % 2 ? 3 : -3), M.steel);
    }
    // lifeguard chairs and signage
    [[-120, 15], [-134, -15]].forEach(function (p) {
      g.add(cyl(0.09, 0.09, 3, M.steel, p[0], y + 1.5, p[1], 6));
      g.add(box(1.2, 0.12, 1.2, M.canvasRed, p[0], y + 3.05, p[1]));
      g.add(box(1.2, 0.9, 0.1, M.canvasRed, p[0], y + 3.5, p[1] + 0.55));
    });
    g.add(box(4, 2, 0.2, M.signWarm, -110, y + 2.4, 17));
    railing(g, -152, -96, y, 19.2, M.steel);
    railing(g, -152, -96, y, -19.2, M.steel);
    return g;
  };

  // AquaDome — the amphitheatre under the glass crown.
  VENUE.aquadome = function () {
    var g = new THREE.Group();
    var y = L.TOP_DECK + 1;
    // curved seating banks facing the stage pool
    var rows = 7;
    for (var r = 0; r < rows; r++) {
      var radius = 17 + r * 2.6;
      var ry = y + r * 0.55;
      for (var s = 0; s < 22; s++) {
        var a = -1.0 + (s / 21) * 2.0;
        var sx = 44 + Math.cos(a) * radius;
        var sz = Math.sin(a) * radius;
        if (sx < 30) continue;
        var seat = box(1.0, 0.12, 0.85, M.seatFabric, sx, ry + 0.45, sz);
        seat.rotation.y = -a;
        g.add(seat);
        var back = box(1.0, 0.55, 0.1, M.seatFabric, sx + Math.cos(a) * 0.4, ry + 0.72, sz + Math.sin(a) * 0.4);
        back.rotation.y = -a;
        g.add(back);
      }
      var step = new THREE.Mesh(new THREE.RingGeometry(radius - 1.3, radius + 1.3, 40, 1, -1.05, 2.1), M.concrete);
      step.rotation.x = -Math.PI / 2;
      step.position.set(44, ry + 0.02, 0);
      step.receiveShadow = true;
      g.add(step);
    }
    // stage apron and a rig of lights over it
    g.add(box(20, 0.4, 20, M.dark, 44, y + 0.2, 0));
    g.add(scatter(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 8), M.lamp, 14, function (d, i) {
      var a = (i / 14) * Math.PI * 2;
      d.position.set(44 + Math.cos(a) * 12, y + 13, Math.sin(a) * 12);
      d.rotation.x = Math.PI;
    }));
    // bar pods around the back
    [[74, -14], [74, 14]].forEach(function (p) {
      g.add(cyl(2.6, 2.8, 1.15, M.teak, p[0], y + 0.58, p[1], 14));
      g.add(cyl(3, 3, 0.1, M.marble, p[0], y + 1.2, p[1], 14));
    });
    railing(g, 18, 90, y, 25, M.steel);
    railing(g, 18, 90, y, -25, M.steel);
    return g;
  };

  // The Hideaway — terraces over the wake.
  VENUE.hideaway = function () {
    var g = new THREE.Group();
    var y = L.HIDEAWAY + 0.4;
    g.add(scatter(new THREE.BoxGeometry(2.1, 0.35, 1.9), M.towel, 12, function (d, i) {
      var row = Math.floor(i / 6);
      d.position.set(-150 - row * 4.5, y + 0.32, -18 + (i % 6) * 7.2);
      d.rotation.y = Math.PI / 2;
    }));
    g.add(scatter(new THREE.BoxGeometry(2.1, 1.3, 0.14), M.canvasCream, 12, function (d, i) {
      var row = Math.floor(i / 6);
      d.position.set(-150 - row * 4.5, y + 1.1, -18 + (i % 6) * 7.2 - 0.9);
      d.rotation.y = Math.PI / 2;
    }));
    // DJ booth
    g.add(box(4.4, 1.2, 2.2, M.dark, -146, y + 0.6, 0));
    g.add(box(4.8, 0.1, 2.6, M.signCool, -146, y + 1.24, 0));
    glassBalustrade(g, -174, -142, y, 22.6);
    glassBalustrade(g, -174, -142, y, -22.6);
    return g;
  };

  // Surfside — the family beach, forward on deck 7.
  VENUE.surfside = function () {
    var g = new THREE.Group();
    var y = L.SURFSIDE;
    g.add(box(18, 0.24, 14, M.cream, 104, y + 0.12, -6));   // sand pad
    g.add(scatter(new THREE.BoxGeometry(1.7, 0.1, 0.6), M.canvasBlue, 10, function (d, i) {
      d.position.set(84 + (i % 5) * 3.6, y + 0.4, i < 5 ? -12 : 12);
      d.rotation.y = i < 5 ? 0 : Math.PI;
    }));
    g.add(box(6, 1.1, 2.6, M.teak, 74, y + 0.55, 10));
    g.add(box(6.4, 0.3, 3, M.canvasRed, 74, y + 2.9, 10));
    for (var c = -1; c <= 1; c += 2) g.add(cyl(0.06, 0.06, 2.6, M.steel, 74 + c * 2.8, y + 1.4, 10 + c, 6));
    railing(g, 70, 122, y, 16.2, M.steel);
    railing(g, 70, 122, y, -16.2, M.steel);
    return g;
  };

  // Main deck promenade — the outdoor lap, under the boats.
  VENUE.maindeck = function () {
    var g = new THREE.Group();
    var y = L.MAIN_DECK + 0.4;
    [-1, 1].forEach(function (side) {
      var z = side * 21.9;              // outboard of the superstructure face
      g.add(box(280, 0.3, 3.2, M.teak, -10, y - 0.15, z));
      railing(g, -148, 118, y, z + side * 1.4, M.steel);
      for (var x = -140; x <= 110; x += 18) {
        g.add(box(1.7, 0.1, 0.62, M.teak, x, y + 0.42, z - side * 0.9));
        g.add(box(1.7, 0.55, 0.1, M.teak, x, y + 0.7, z - side * 1.2));
      }
    });
    return g;
  };

  /* ------------------------------------------- walkable floors and colliders */

  // Floors are axis-aligned rectangles in ship space. The controller stands on
  // the highest one under the player, within a step.
  var FLOORS = [
    { id: 'promenade', x: [-140, 118], z: [-13, 13], y: L.PROMENADE },
    { id: 'promenade', x: [-140, 118], z: [-12.5, 12.5], y: 36.27 },
    { id: 'park', x: [L.PARK_X0, L.PARK_X1], z: [-10.5, 10.5], y: L.PARK_FLOOR + 0.46 },
    { id: 'chill', x: [-74, 6], z: [-19.5, 19.5], y: L.TOP_DECK + 0.8 },
    { id: 'thrill', x: [-153, -95], z: [-19.5, 19.5], y: L.TOP_DECK + 0.8 },
    { id: 'aquadome', x: [17, 91], z: [-25.5, 25.5], y: L.TOP_DECK + 1 },
    { id: 'hideaway', x: [-173, -143], z: [-23, 23], y: L.HIDEAWAY + 0.4 },
    { id: 'hideaway', x: [-168, -144], z: [-22, 22], y: L.HIDEAWAY + 4.25 },
    { id: 'surfside', x: [70, 122], z: [-16.5, 16.5], y: L.SURFSIDE },
    { id: 'suites', x: [68, 100], z: [-9, 17], y: L.SUITE_SUN },
    { id: 'crown', x: [-68, -32], z: [28.5, 33], y: L.CROWN + 0.3 },
    { id: 'crown', x: [-40, -30], z: [20, 33], y: L.CROWN + 0.3 },
    { id: 'maindeck', x: [-150, 120], z: [20.3, 23.4], y: L.MAIN_DECK + 0.4 },
    { id: 'maindeck', x: [-150, 120], z: [-23.4, -20.3], y: L.MAIN_DECK + 0.4 },
    { id: 'maindeck', x: [122, 150], z: [-14, 14], y: L.MAIN_DECK + 2.4 }
  ];

  // Walls the player cannot pass through, as AABBs in ship space.
  var WALLS = [
    // promenade shopfront lines
    { x: [-142, 120], y: [L.PROMENADE, L.PROMENADE + 5], z: [12.2, 13.6] },
    { x: [-142, 120], y: [L.PROMENADE, L.PROMENADE + 5], z: [-13.6, -12.2] },
    { x: [-143, -139], y: [L.PROMENADE, L.PROMENADE + 9], z: [-14, 14] },
    { x: [118, 122], y: [L.PROMENADE, L.PROMENADE + 9], z: [-14, 14] },
    // park canyon walls
    { x: [L.PARK_X0 - 2, L.PARK_X1 + 2], y: [L.PARK_FLOOR, L.PARK_FLOOR + 6], z: [10.6, 12.5] },
    { x: [L.PARK_X0 - 2, L.PARK_X1 + 2], y: [L.PARK_FLOOR, L.PARK_FLOOR + 6], z: [-12.5, -10.6] },
    { x: [L.PARK_X0 - 3, L.PARK_X0 - 1], y: [L.PARK_FLOOR, L.PARK_FLOOR + 6], z: [-12, 12] },
    { x: [L.PARK_X1 + 1, L.PARK_X1 + 3], y: [L.PARK_FLOOR, L.PARK_FLOOR + 6], z: [-12, 12] },
    // superstructure faces on the top deck
    { x: [-100, -84], y: [L.TOP_DECK, L.TOP_DECK + 14], z: [-11, 11] },
    { x: [59, 118], y: [L.TOP_DECK, L.TOP_DECK + 14], z: [-18, 18] }
  ];

  // Pools: the player wades, and the water surface sits at `surface`.
  var POOLS = [
    { name: 'Chill Island', x: [-65, -47], z: [-7, 7], surface: L.TOP_DECK + 2, floor: L.TOP_DECK + 0.4 },
    { name: 'Chill Island', x: [-38, -22], z: [6, 18], surface: L.TOP_DECK + 2, floor: L.TOP_DECK + 0.4 },
    { name: 'Chill Island', x: [-16, 0], z: [-18, -6], surface: L.TOP_DECK + 2, floor: L.TOP_DECK + 0.4 },
    { name: 'Swim & Tonic', x: [-89, -63], z: [-10, 10], surface: L.TOP_DECK + 2.1, floor: L.TOP_DECK + 0.4 },
    { name: 'AquaTheater', x: [33, 55], z: [-11, 11], surface: L.TOP_DECK + 3.3, floor: L.TOP_DECK + 1 },
    { name: 'The Hideaway', x: [-169, -151], z: [-8, 8], surface: L.HIDEAWAY + 2.1, floor: L.HIDEAWAY + 0.4 },
    { name: 'Surfside', x: [80, 96], z: [-6, 6], surface: L.SURFSIDE + 0.7, floor: L.SURFSIDE }
  ];

  // Where "walk aboard" can put you down, in the order they read on a tour.
  var SPAWNS = [
    { id: 'promenade', label: 'Royal Promenade', sub: 'Deck 5 · the interior street', pos: [-60, L.PROMENADE, 0], look: 0 },
    { id: 'park', label: 'Central Park', sub: 'Deck 8 · open to the sky', pos: [-30, L.PARK_FLOOR + 0.46, 0], look: 0 },
    { id: 'chill', label: 'Chill Island', sub: 'Deck 15 · the pools', pos: [-30, L.TOP_DECK + 0.8, -14], look: Math.PI },
    { id: 'thrill', label: 'Thrill Island', sub: 'Deck 16 · Category 6 waterpark', pos: [-118, L.TOP_DECK + 0.8, 0], look: -Math.PI / 2 },
    { id: 'aquadome', label: 'AquaDome', sub: 'Deck 15 forward · under the glass', pos: [72, L.TOP_DECK + 1, 0], look: Math.PI },
    { id: 'hideaway', label: 'The Hideaway', sub: 'Deck 15 aft · over the wake', pos: [-148, L.HIDEAWAY + 0.4, 0], look: Math.PI },
    { id: 'crown', label: "Crown's Edge", sub: '154 ft above the sea', pos: [-34, L.CROWN + 0.3, 24], look: 0 },
    { id: "maindeck", label: "Promenade Deck", sub: "Deck 5 · under the boats", pos: [40, L.MAIN_DECK + 0.4, 21.9], look: -Math.PI / 2 },
    { id: 'surfside', label: 'Surfside', sub: 'Deck 7 forward · the beach', pos: [96, L.SURFSIDE, 0], look: Math.PI }
  ];

  /* ------------------------------------------------------------------ build */

  function attach(blockId) {
    if (!M.marble) buildMaterials();
    return VENUE[blockId] ? VENUE[blockId]() : null;
  }

  global.IconVenues = {
    LEVELS: L,
    attach: attach,
    has: function (id) { return !!VENUE[id]; },
    buildCrowd: function () { if (!M.marble) buildMaterials(); return buildCrowd(); },
    updateCrowd: updateCrowd,
    floors: FLOORS,
    walls: WALLS,
    pools: POOLS,
    spawns: SPAWNS,
    materials: M
  };
})(window);
