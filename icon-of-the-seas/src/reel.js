/* Icon of the Seas — the reel.

   A cut sequence for a 9:16 vertical short, cut to a Hinglish voice-over.
   Each scene owns its camera move, its lighting, and its caption.

   The durations are measured against the delivered recording (36.24 s): each
   line gets time in proportion to its syllable count, and every boundary is
   then snapped to the nearest pause in the audio where one falls within
   0.75 s. Change any `dur` and everything after it shifts with it.

   All camera positions are in ship space, so a shot holds its framing even
   while she is under way and rolling.

   The whole cut runs in daylight: the blue-water aerials read the ship's shape
   and her decks, which is what this script is actually about. Night is still a
   toggle in the console if a scene ever wants it. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  /* --------------------------------------------------- Titanic, for scale */

  // 269.1 m LOA against Icon's 364.75 m. Built plainly and kept dark: she is
  // a silhouette for comparison, not a subject.
  function buildTitanic() {
    var g = new THREE.Group();
    var black = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.8 });
    var white = new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.8 });
    var buff = new THREE.MeshStandardMaterial({ color: 0xc2924b, roughness: 0.75 });
    var red = new THREE.MeshStandardMaterial({ color: 0x6d1f1f, roughness: 0.85 });

    var LOA = 269.1, BEAM = 28.2;
    // hull, tapered fore and aft
    for (var i = 0; i < 22; i++) {
      var t = i / 21;
      var x = -LOA / 2 + t * LOA;
      var taper = Math.sin(Math.PI * Math.min(1, Math.max(0.06, t * 1.12))) ;
      var w = BEAM * Math.pow(taper, 0.42);
      var seg = new THREE.Mesh(new THREE.BoxGeometry(LOA / 21 + 0.6, 18, w), black);
      seg.position.set(x, 9, 0);
      g.add(seg);
      var boot = new THREE.Mesh(new THREE.BoxGeometry(LOA / 21 + 0.6, 10, w * 1.005), red);
      boot.position.set(x, 5, 0);
      g.add(boot);
    }
    // superstructure
    g.add(mesh(new THREE.BoxGeometry(150, 9, 22), white, 6, 22, 0));
    g.add(mesh(new THREE.BoxGeometry(110, 6, 19), white, 10, 29, 0));
    g.add(mesh(new THREE.BoxGeometry(70, 4, 16), white, 18, 34, 0));
    // four funnels, raked
    [46, 18, -10, -38].forEach(function (fx, i) {
      var f = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 19, 16), buff);
      f.position.set(fx, 45, 0);
      f.rotation.z = 0.08;
      g.add(f);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 4, 16), black);
      cap.position.set(fx - 0.8, 55, 0);
      cap.rotation.z = 0.08;
      g.add(cap);
    });
    // masts
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.8, 34, 8), buff, 92, 40, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.8, 30, 8), buff, -86, 38, 0));

    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.visible = false;
    return g;
  }

  function mesh(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }

  /* ------------------------------------------------------------- the cut */

  // dur      seconds on screen
  // env      'day' | 'night' — applied on the cut, so the hitch is invisible
  // from/to  camera eye, ship space; lookFrom/lookTo the aim
  // hold     true keeps the camera still (used for the hardest cuts)
  // line     the caption; sub is the small line under it
  var SCENES = [
    {
      id: 'hook', dur: 4.57, env: 'day', fov: 46,
      from: [340, 9, 76], to: [104, 36, 64],
      lookFrom: [170, 28, 4], lookTo: [-10, 52, 0],
      line: 'Ye koi sheher nahi', sub: ''
    },
    {
      id: 'name', dur: 1.59, env: 'day', fov: 34,
      up: [0.3, 1, 0],
      from: [-690, 500, 580], to: [-600, 445, 505],
      lookFrom: [0, 42, 0], lookTo: [0, 42, 0],
      line: 'ICON OF THE SEAS', sub: 'Duniya ka sabse bada cruise ship'
    },
    {
      // Straight down with the camera's up along the hull, so both ships run
      // the length of a 9:16 frame instead of across it.
      id: 'titanic', dur: 4.77, env: 'day', fov: 32, titanic: true,
      up: [1, 0, 0],
      from: [-24, 930, -58], to: [-24, 850, -58],
      lookFrom: [-24, 10, -58], lookTo: [-24, 10, -58],
      line: 'Titanic se 5× bada', sub: '46,328 GT  vs  248,663 GT'
    },
    {
      id: 'decks', dur: 4.42, env: 'day', fov: 40,
      from: [-40, 8, 120], to: [-40, 96, 150],
      lookFrom: [-40, 30, 0], lookTo: [-40, 60, 0],
      line: '20 decks', sub: '20-manzil ki building, samundar pe'
    },
    {
      id: 'people', dur: 6.48, env: 'day', fov: 58,
      from: [-118, 34.6, 0.4], to: [30, 34.6, -0.4],
      lookFrom: [-20, 34.8, 0], lookTo: [120, 35.6, 0],
      line: '7,600 guests', sub: '+ 2,350 crew — ek chhota sheher'
    },
    {
      id: 'pools', dur: 2.06, env: 'day', fov: 42,
      from: [-108, 100, 52], to: [-20, 132, 86],
      lookFrom: [-52, 78, 0], lookTo: [-40, 76, 0],
      line: '7 swimming pools', sub: ''
    },
    {
      id: 'waterpark', dur: 2.22, env: 'day', fov: 54,
      from: [-70, 118, 62], to: [-150, 96, 44],
      lookFrom: [-118, 88, 0], lookTo: [-130, 82, 0],
      line: 'Samundar ka sabse bada waterpark', sub: 'Category 6 · 6 slides'
    },
    {
      id: 'park', dur: 3.3, env: 'day', fov: 46,
      from: [-42, 48.4, 3], to: [46, 48.8, -3],
      lookFrom: [10, 48.6, 0], lookTo: [72, 54, 0],
      line: 'Hazaaron asli paudhe', sub: 'Central Park · khule aasman ke neeche'
    },
    {
      id: 'food', dur: 2.87, env: 'day', fov: 60,
      from: [40, 34.6, 4], to: [-70, 34.6, -4],
      lookFrom: [-20, 35, 0], lookTo: [-130, 35.4, 0],
      line: 'Har din alag restaurant', sub: 'Royal Promenade'
    },
    {
      id: 'price', dur: 3.96, env: 'day', fov: 30,
      from: [-620, 360, 560], to: [-980, 520, 830],
      lookFrom: [-30, 45, 0], lookTo: [-30, 45, 0],
      line: '200 crore rupees', sub: 'Ek ship ki keemat'
    }
  ];

  /* ----------------------------------------------------------- controller */

  function Reel(opts) {
    this.scenes = SCENES;
    this.index = 0;
    this.t = 0;
    this.running = false;
    this.speed = 1;              // stretch the whole cut to fit a voice track
    this.onScene = opts && opts.onScene;
    this.onEnd = opts && opts.onEnd;
    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  Reel.prototype.total = function () {
    var n = 0;
    for (var i = 0; i < this.scenes.length; i++) n += this.scenes[i].dur;
    return n / this.speed;
  };

  // Start of each scene on the finished timeline — what you line the voice up to.
  Reel.prototype.marks = function () {
    var out = [], t = 0;
    for (var i = 0; i < this.scenes.length; i++) {
      out.push({ id: this.scenes[i].id, at: t / this.speed, dur: this.scenes[i].dur / this.speed });
      t += this.scenes[i].dur;
    }
    return out;
  };

  Reel.prototype.start = function (from) {
    this.index = from || 0;
    this.t = 0;
    this.running = true;
    if (this.onScene) this.onScene(this.scenes[this.index], this.index, true);
  };

  Reel.prototype.stop = function () { this.running = false; };

  // Jump to an absolute time on the finished timeline. Used by the offline
  // renderer, which addresses frames by time rather than stepping.
  Reel.prototype.seek = function (abs) {
    var t = abs * this.speed, i = 0;
    while (i < this.scenes.length - 1 && t >= this.scenes[i].dur) {
      t -= this.scenes[i].dur;
      i++;
    }
    var changed = i !== this.index;
    this.index = i;
    this.t = Math.min(t, this.scenes[i].dur);
    this.running = true;
    if (changed && this.onScene) this.onScene(this.scenes[i], i, true);
    return { index: i, local: this.t, scene: this.scenes[i], changed: changed };
  };

  Reel.prototype.scene = function () { return this.scenes[this.index]; };

  Reel.prototype.update = function (dt, camera, shipMatrix) {
    if (!this.running) return;
    var s = this.scenes[this.index];
    this.t += dt * this.speed;

    var k = Math.min(1, this.t / s.dur);
    var e = s.hold ? 0 : k * k * (3 - 2 * k);

    this._a.fromArray(s.from).lerp(this._b.fromArray(s.to), e);
    var eye = this._a.clone();
    this._a.fromArray(s.lookFrom).lerp(this._b.fromArray(s.lookTo), e);
    var aim = this._a.clone();

    var up = s.up ? this._up.set(s.up[0], s.up[1], s.up[2]) : this._up.set(0, 1, 0);
    this._m.lookAt(eye, aim, up);
    var q = new THREE.Quaternion().setFromRotationMatrix(this._m);
    var local = new THREE.Matrix4().compose(eye, q, new THREE.Vector3(1, 1, 1));
    local.premultiply(shipMatrix);
    local.decompose(camera.position, camera.quaternion, new THREE.Vector3());

    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }

    if (this.t >= s.dur) {
      this.t = 0;
      this.index++;
      if (this.index >= this.scenes.length) {
        this.index = 0;
        this.running = false;
        if (this.onEnd) this.onEnd();
        return;
      }
      if (this.onScene) this.onScene(this.scenes[this.index], this.index, true);
    }
  };

  // How far through the current scene, for the caption animation.
  Reel.prototype.phase = function () {
    var s = this.scenes[this.index];
    return { k: Math.min(1, this.t / s.dur), left: s.dur - this.t };
  };

  global.IconReel = { Reel: Reel, scenes: SCENES, buildTitanic: buildTitanic };
})(window);
