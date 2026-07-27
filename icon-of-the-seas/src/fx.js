/* Icon of the Seas — final image.

   Pipeline, in order:
     scene -> HDR target (multisampled)
     -> bright pass with a soft knee
     -> four-level downsample / tent-upsample bloom pyramid, added in HDR
     -> exposure
     -> ACES tone map            (the single tone-map owner)
     -> grade: contrast, saturation, split tone
     -> vignette, fine grain
     -> sRGB encode to the screen

   The renderer's own tone mapping is switched off so this stays the one owner.
   Exposure is authored per lighting mode rather than metered: a reel wants a
   stable image, and an auto-exposure loop would pump as the camera pans. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  var QUAD_VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  var BRIGHT_FRAG = [
    'uniform sampler2D tSrc;',
    'uniform float uThreshold;',
    'uniform float uKnee;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tSrc, vUv).rgb;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    // soft knee so highlights ramp in instead of popping
    '  float w = smoothstep(uThreshold - uKnee, uThreshold + uKnee, l);',
    '  gl_FragColor = vec4(c * w, 1.0);',
    '}'
  ].join('\n');

  var DOWN_FRAG = [
    'uniform sampler2D tSrc;',
    'uniform vec2 uTexel;',
    'varying vec2 vUv;',
    'void main() {',
    // 13-tap dual filter — stable under motion, cheap
    '  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;',
    '  vec3 b = texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb;',
    '  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;',
    '  vec3 d = texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb;',
    '  vec3 e = texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;',
    '  vec3 f = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb;',
    '  vec3 g = texture2D(tSrc, vUv).rgb;',
    '  vec3 h = texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb;',
    '  vec3 i = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb;',
    '  vec3 j = texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb;',
    '  vec3 k = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;',
    '  vec3 l = texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb;',
    '  vec3 m = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;',
    '  vec3 o = g * 0.125;',
    '  o += (a + c + k + m) * 0.03125;',
    '  o += (b + f + h + l) * 0.0625;',
    '  o += (d + e + i + j) * 0.125;',
    '  gl_FragColor = vec4(o, 1.0);',
    '}'
  ].join('\n');

  var UP_FRAG = [
    'uniform sampler2D tSrc;',
    'uniform vec2 uTexel;',
    'uniform float uRadius;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 r = uTexel * uRadius;',
    '  vec3 o = texture2D(tSrc, vUv + vec2(-r.x, r.y)).rgb;',
    '  o += texture2D(tSrc, vUv + vec2(0.0, r.y)).rgb * 2.0;',
    '  o += texture2D(tSrc, vUv + vec2(r.x, r.y)).rgb;',
    '  o += texture2D(tSrc, vUv + vec2(-r.x, 0.0)).rgb * 2.0;',
    '  o += texture2D(tSrc, vUv).rgb * 4.0;',
    '  o += texture2D(tSrc, vUv + vec2(r.x, 0.0)).rgb * 2.0;',
    '  o += texture2D(tSrc, vUv + vec2(-r.x, -r.y)).rgb;',
    '  o += texture2D(tSrc, vUv + vec2(0.0, -r.y)).rgb * 2.0;',
    '  o += texture2D(tSrc, vUv + vec2(r.x, -r.y)).rgb;',
    '  gl_FragColor = vec4(o / 16.0, 1.0);',
    '}'
  ].join('\n');

  var COMPOSITE_FRAG = [
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform float uBloom;',
    'uniform float uExposure;',
    'uniform float uContrast;',
    'uniform float uSaturation;',
    'uniform vec3 uLift;',
    'uniform vec3 uGain;',
    'uniform float uVignette;',
    'uniform float uGrain;',
    'uniform float uTime;',
    'varying vec2 vUv;',

    // ACES fitted — Narkowicz. One tone map, applied here and nowhere else.
    'vec3 aces(vec3 x) {',
    '  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;',
    '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
    '}',
    'float grainNoise(vec2 p) {',
    '  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);',
    '}',
    'void main() {',
    '  vec3 hdr = texture2D(tScene, vUv).rgb;',
    '  hdr += texture2D(tBloom, vUv).rgb * uBloom;',
    '  hdr *= uExposure;',
    '  vec3 c = aces(hdr);',

    '  c = (c - 0.5) * uContrast + 0.5;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(l), c, uSaturation);',
    // split tone: cool the shadows, warm the highlights
    '  c = c * uGain + uLift * (1.0 - l);',

    '  float d = distance(vUv, vec2(0.5));',
    '  c *= 1.0 - smoothstep(0.35, 0.95, d) * uVignette;',
    '  c += (grainNoise(vUv * 1024.0 + uTime) - 0.5) * uGrain;',

    '  c = clamp(c, 0.0, 1.0);',
    // manual sRGB encode: a raw shader gets no automatic output conversion
    '  vec3 srgb = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0001)), vec3(1.0 / 2.4)) - 0.055,',
    '                  step(vec3(0.0031308), c));',
    '  gl_FragColor = vec4(srgb, 1.0);',
    '}'
  ].join('\n');

  function Pipeline(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.scale = 1;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geo = new THREE.PlaneGeometry(2, 2);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(this.geo, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.params = {
      threshold: 0.72,
      knee: 0.08,
      radius: 0.35,
      strength: 0.42,
      exposure: 1.0,
      contrast: 1.06,
      saturation: 1.08,
      lift: new THREE.Vector3(0.008, 0.014, 0.030),
      gain: new THREE.Vector3(1.02, 1.005, 0.985),
      vignette: 0.32,
      grain: 0.016
    };

    var p = this.params;
    this.matBright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThreshold: { value: p.threshold }, uKnee: { value: p.knee } },
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false
    });
    this.matDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false
    });
    this.matUp = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: p.radius }
      },
      vertexShader: QUAD_VERT, fragmentShader: UP_FRAG,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true
    });
    this.matComposite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloom: { value: p.strength },
        uExposure: { value: p.exposure },
        uContrast: { value: p.contrast },
        uSaturation: { value: p.saturation },
        uLift: { value: p.lift },
        uGain: { value: p.gain },
        uVignette: { value: p.vignette },
        uGrain: { value: p.grain },
        uTime: { value: 0 }
      },
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false
    });

    this.mips = [];
    this.setSize(1, 1);
  }

  Pipeline.prototype.setSize = function (w, h) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (this.width === w && this.height === h) return;
    this.width = w; this.height = h;
    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: 4,                        // MSAA in the HDR pass
      depthBuffer: true,
      stencilBuffer: false
    });
    this.mips.forEach(function (m) { m.dispose(); });
    this.mips = [];
    var mw = w, mh = h;
    for (var i = 0; i < 4; i++) {
      mw = Math.max(2, Math.floor(mw / 2));
      mh = Math.max(2, Math.floor(mh / 2));
      var rt = new THREE.WebGLRenderTarget(mw, mh, {
        type: THREE.HalfFloatType,
        colorSpace: THREE.LinearSRGBColorSpace,
        depthBuffer: false,
        stencilBuffer: false
      });
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.magFilter = THREE.LinearFilter;
      this.mips.push(rt);
    }
  };

  Pipeline.prototype.blit = function (material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target || null);
    if (target) this.renderer.clear(true, false, false);
    this.renderer.render(this.scene, this.camera);
  };

  Pipeline.prototype.render = function (scene, camera, time) {
    var r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    // bright pass into the first mip
    this.matBright.uniforms.tSrc.value = this.sceneRT.texture;
    this.blit(this.matBright, this.mips[0]);

    // down the pyramid
    for (var i = 1; i < this.mips.length; i++) {
      this.matDown.uniforms.tSrc.value = this.mips[i - 1].texture;
      this.matDown.uniforms.uTexel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
      this.blit(this.matDown, this.mips[i]);
    }
    // and back up, adding each level into the one above it
    for (var j = this.mips.length - 1; j > 0; j--) {
      this.matUp.uniforms.tSrc.value = this.mips[j].texture;
      this.matUp.uniforms.uTexel.value.set(1 / this.mips[j].width, 1 / this.mips[j].height);
      this.quad.material = this.matUp;
      r.setRenderTarget(this.mips[j - 1]);
      r.render(this.scene, this.camera);          // additive, no clear
    }

    this.matComposite.uniforms.tScene.value = this.sceneRT.texture;
    this.matComposite.uniforms.tBloom.value = this.mips[0].texture;
    this.matComposite.uniforms.uTime.value = time;
    this.blit(this.matComposite, null);
  };

  Pipeline.prototype.set = function (key, value) {
    this.params[key] = value;
    var u = this.matComposite.uniforms;
    if (key === 'strength') u.uBloom.value = value;
    if (key === 'exposure') u.uExposure.value = value;
    if (key === 'contrast') u.uContrast.value = value;
    if (key === 'saturation') u.uSaturation.value = value;
    if (key === 'vignette') u.uVignette.value = value;
    if (key === 'grain') u.uGrain.value = value;
    if (key === 'threshold') this.matBright.uniforms.uThreshold.value = value;
    if (key === 'radius') this.matUp.uniforms.uRadius.value = value;
  };

  global.IconFX = { Pipeline: Pipeline };
})(window);
