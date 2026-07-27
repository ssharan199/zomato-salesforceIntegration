/* Icon of the Seas — being aboard.

   Walker    first-person movement in ship space, so the deck rolls under you
   Director  authored camera moves for filming
   Recorder  captures the canvas to a webm file

   The player lives in the ship's own coordinate frame and is composed through
   the hull's world matrix every frame. That is what makes the horizon tilt when
   she rolls: you are standing on her, not next to her. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ----------------------------------------------------------------- walker */

  function Walker(venues) {
    this.venues = venues;
    this.pos = new THREE.Vector3(-60, 33, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.68;
    this.radius = 0.42;
    this.onGround = false;
    this.wading = 0;
    this.bob = 0;
    this.overboard = false;
    this.venue = '';
    this.keys = {};
    this.look = new THREE.Vector2();      // pointer delta accumulated per frame
    this.move = new THREE.Vector2();      // touch stick, -1..1
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  Walker.prototype.spawn = function (spawn) {
    this.pos.set(spawn.pos[0], spawn.pos[1] + 0.2, spawn.pos[2]);
    this.yaw = spawn.look || 0;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.overboard = false;
    this.venue = spawn.label;
  };

  // Highest floor rectangle under the player that is within a step.
  Walker.prototype.groundAt = function (x, z, feet) {
    var best = null, floors = this.venues.floors;
    for (var i = 0; i < floors.length; i++) {
      var f = floors[i];
      if (x < f.x[0] || x > f.x[1] || z < f.z[0] || z > f.z[1]) continue;
      if (f.y > feet + 0.85) continue;                  // too high to step onto
      if (best === null || f.y > best) best = f.y;
    }
    return best;
  };

  // The footprint alone is not enough: pools sit above other decks, and being
  // on the deck below one is not the same as standing in it.
  Walker.prototype.poolAt = function (x, z, feet) {
    var pools = this.venues.pools;
    for (var i = 0; i < pools.length; i++) {
      var p = pools[i];
      if (x < p.x[0] || x > p.x[1] || z < p.z[0] || z > p.z[1]) continue;
      if (feet < p.floor - 0.6 || feet > p.surface) continue;
      return p;
    }
    return null;
  };

  // Push out of any wall the player has ended up inside.
  Walker.prototype.resolveWalls = function () {
    var walls = this.venues.walls, r = this.radius;
    var feet = this.pos.y, head = this.pos.y + this.eye;
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (head < w.y[0] || feet > w.y[1]) continue;
      var x0 = w.x[0] - r, x1 = w.x[1] + r, z0 = w.z[0] - r, z1 = w.z[1] + r;
      if (this.pos.x < x0 || this.pos.x > x1 || this.pos.z < z0 || this.pos.z > z1) continue;
      // shortest way out
      var dl = this.pos.x - x0, dr = x1 - this.pos.x;
      var db = this.pos.z - z0, df = z1 - this.pos.z;
      var m = Math.min(dl, dr, db, df);
      if (m === dl) this.pos.x = x0;
      else if (m === dr) this.pos.x = x1;
      else if (m === db) this.pos.z = z0;
      else this.pos.z = z1;
    }
  };

  Walker.prototype.update = function (dt, opts) {
    var k = this.keys;
    var fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + this.move.y;
    var strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.move.x;
    var sprint = k.ShiftLeft || k.ShiftRight ? 1.9 : 1;

    // look
    this.yaw -= this.look.x * 0.0022;
    this.pitch = clamp(this.pitch - this.look.y * 0.0022, -1.35, 1.35);
    this.look.set(0, 0);

    var speed = 3.1 * sprint * (1 - this.wading * 0.55);
    var sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // ship space: yaw 0 looks down -Z, so forward is (-sin, 0, -cos)
    var wishX = (-sin * fwd + cos * strafe);
    var wishZ = (-cos * fwd - sin * strafe);
    var len = Math.hypot(wishX, wishZ);
    if (len > 1) { wishX /= len; wishZ /= len; }

    var accel = this.onGround ? 14 : 3;
    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, accel * dt);

    if (this.onGround && k.Space) { this.vel.y = 4.6; this.onGround = false; }
    this.vel.y -= 18 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.resolveWalls();

    var ground = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (ground !== null && this.pos.y <= ground + 0.02) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // wading — the pools are shallow enough to stand in
    var pool = this.poolAt(this.pos.x, this.pos.z, this.pos.y);
    var target = 0;
    if (pool && this.pos.y < pool.surface) {
      target = clamp((pool.surface - this.pos.y) / 1.4, 0, 1);
    }
    this.wading += (target - this.wading) * Math.min(1, dt * 6);

    // walked off the ship
    if (this.pos.y < 12 && !this.overboard) this.overboard = true;

    var moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * moving * 1.9;
    var bobY = this.onGround ? Math.sin(this.bob * 2) * 0.035 * Math.min(1, moving / 3) : 0;
    var bobR = this.onGround ? Math.sin(this.bob) * 0.006 * Math.min(1, moving / 3) : 0;

    this.eyeY = this.pos.y + this.eye - this.wading * 0.95 + bobY;
    // Chest-deep at most: keep the eye above the surface so the view stays an
    // above-water one, which is what the water shader is built for.
    if (pool) this.eyeY = Math.max(this.eyeY, pool.surface + 0.14);
    this.roll = bobR;
    if (opts && opts.venueOf) this.venue = opts.venueOf(this.pos) || this.venue;
    return moving;
  };

  // Compose the player's local frame through the hull's world matrix.
  Walker.prototype.applyTo = function (camera, shipMatrix) {
    this._e.set(this.pitch, this.yaw, this.roll || 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this._m.compose(
      new THREE.Vector3(this.pos.x, this.eyeY, this.pos.z),
      this._q,
      new THREE.Vector3(1, 1, 1)
    );
    this._m.premultiply(shipMatrix);
    this._m.decompose(camera.position, camera.quaternion, new THREE.Vector3());
  };

  /* --------------------------------------------------------------- director */

  // Authored shots, all in ship space so they hold as she moves and rolls.
  var SHOTS = [
    {
      label: 'Bow rise', dur: 9, fov: 34,
      from: [300, 6, 60], to: [212, 46, 26],
      lookFrom: [180, 24, 0], lookTo: [120, 44, 0]
    },
    {
      label: 'Royal Promenade', dur: 11, fov: 46,
      from: [-118, 34.4, 0.5], to: [46, 34.4, -0.5],
      lookFrom: [-40, 34.6, 0], lookTo: [110, 35.4, 0]
    },
    {
      label: 'Central Park', dur: 10, fov: 42,
      from: [-40, 48.2, 3], to: [44, 48.6, -3],
      lookFrom: [10, 48.4, 0], lookTo: [70, 52, 0]
    },
    {
      label: 'Chill Island crane', dur: 10, fov: 40,
      from: [-88, 78.6, 18], to: [-18, 96, 40],
      lookFrom: [-52, 78, 0], lookTo: [-46, 78, 0]
    },
    {
      label: 'Category 6', dur: 9, fov: 52,
      from: [-96, 100, 22], to: [-140, 80, 6],
      lookFrom: [-118, 88, 0], lookTo: [-136, 78, 0]
    },
    {
      label: 'AquaDome', dur: 9, fov: 50,
      from: [24, 78.4, 12], to: [58, 80.5, -2],
      lookFrom: [54, 82, 0], lookTo: [56, 92, 0]
    },
    {
      label: "Crown's Edge", dur: 8, fov: 44,
      from: [-30, 68.4, 26], to: [-64, 67.4, 34],
      lookFrom: [-60, 60, 34], lookTo: [-70, 20, 42]
    },
    {
      label: 'The Hideaway', dur: 9, fov: 40,
      from: [-140, 66, 14], to: [-176, 70, -6],
      lookFrom: [-166, 63, 0], lookTo: [-210, 40, 0]
    },
    {
      label: 'Beauty pass', dur: 14, fov: 30,
      from: [-460, 120, 330], to: [420, 90, 300],
      lookFrom: [-40, 50, 0], lookTo: [40, 50, 0]
    }
  ];

  function Director() {
    this.shots = SHOTS;
    this.index = 0;
    this.t = 0;
    this.running = false;
    this.loop = true;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  Director.prototype.start = function (i) {
    this.index = i === undefined ? 0 : i;
    this.t = 0;
    this.running = true;
  };

  Director.prototype.stop = function () { this.running = false; };

  Director.prototype.shot = function () { return this.shots[this.index]; };

  Director.prototype.update = function (dt, camera, shipMatrix) {
    if (!this.running) return;
    var s = this.shots[this.index];
    this.t += dt;
    var k = clamp(this.t / s.dur, 0, 1);
    var e = k * k * (3 - 2 * k);            // ease in and out of every shot

    this._a.fromArray(s.from).lerp(this._b.fromArray(s.to), e);
    var eye = this._a.clone();
    this._a.fromArray(s.lookFrom).lerp(this._b.fromArray(s.lookTo), e);
    var target = this._a.clone();

    this._m.lookAt(eye, target, this._up);
    var q = new THREE.Quaternion().setFromRotationMatrix(this._m);
    var local = new THREE.Matrix4().compose(eye, q, new THREE.Vector3(1, 1, 1));
    local.premultiply(shipMatrix);
    local.decompose(camera.position, camera.quaternion, new THREE.Vector3());

    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }

    if (this.t >= s.dur) {
      this.t = 0;
      this.index++;
      if (this.index >= this.shots.length) {
        this.index = 0;
        if (!this.loop) this.running = false;
      }
    }
  };

  /* --------------------------------------------------------------- recorder */

  function Recorder(canvas) {
    this.canvas = canvas;
    this.chunks = [];
    this.recorder = null;
    this.startedAt = 0;
    this.supported = typeof MediaRecorder !== 'undefined' &&
      !!canvas.captureStream;
  }

  Recorder.prototype.mime = function () {
    var options = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (var i = 0; i < options.length; i++) {
      if (MediaRecorder.isTypeSupported(options[i])) return options[i];
    }
    return '';
  };

  Recorder.prototype.start = function (fps) {
    if (!this.supported || this.recorder) return false;
    var stream = this.canvas.captureStream(fps || 60);
    var mime = this.mime();
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12000000 } : undefined);
    var self = this;
    this.recorder.ondataavailable = function (e) { if (e.data.size) self.chunks.push(e.data); };
    this.recorder.start(250);
    this.startedAt = performance.now();
    return true;
  };

  Recorder.prototype.stop = function (onFile) {
    if (!this.recorder) return;
    var self = this;
    this.recorder.onstop = function () {
      var blob = new Blob(self.chunks, { type: 'video/webm' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'icon-of-the-seas.webm';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
      if (onFile) onFile(blob);
      self.recorder = null;
    };
    this.recorder.stop();
  };

  Recorder.prototype.elapsed = function () {
    return this.recorder ? (performance.now() - this.startedAt) / 1000 : 0;
  };

  global.IconWalk = { Walker: Walker, Director: Director, Recorder: Recorder, shots: SHOTS };
})(window);
