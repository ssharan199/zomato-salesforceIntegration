/* Icon of the Seas — water.
   The open sea and the pools aboard share one wave vocabulary, so foam always
   sits where the crests actually are.

   Implemented: six analytic bands with derivative attenuation, analytic sky
   reflection sampled from the same equirectangular sky the scene renders,
   side-aware Fresnel, Beer-Lambert absorption over an estimated path length,
   crest-linked foam, tight sun glint.

   Not implemented: screen-space refraction. No scene-colour texture is bound
   here, so the body term is absorption over an authored bottom colour, not the
   refracted scene behind the water. Pool depth is an authored constant rather
   than reconstructed thickness. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  // Coarse to fine. Metres. The sea multiplies these by uScale.
  var BANDS = [
    { len: 12.0, amp: 1.00, dir: [1.0, 0.0] },
    { len: 6.0, amp: 0.55, dir: [0.0, 1.0] },
    { len: 2.5, amp: 0.22, dir: [0.707, 0.707] },
    { len: 5.25, amp: 0.12, dir: [0.866, 0.5] },
    { len: 3.0, amp: 0.08, dir: [0.866, -0.5] },
    { len: 1.5, amp: 0.05, dir: [0.5, 0.866] }
  ];

  // Shared GLSL: sky lookup, value noise, and the wave field itself.
  var FIELD = [
    'vec3 skySample(sampler2D sky, vec3 dir) {',
    '  vec3 d = normalize(dir);',
    '  float u = atan(d.z, -d.x) / 6.2831853 + 0.5;',
    '  float v = clamp(asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5, 0.0, 1.0);',
    '  return texture2D(sky, vec2(u, 1.0 - v)).rgb;',
    '}',
    'float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float wNoise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),',
    '             mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    '// slope and crest from the shared bands; foot is the screen footprint',
    'void waveField(vec2 p, float t, float scale, float amp, float foot,',
    '               out vec2 slope, out float crest) {',
    '  slope = vec2(0.0);',
    '  crest = 0.0;',
    BANDS.map(function (b, i) {
      var att = i < 3
        ? '1.0'
        : '(1.0 - smoothstep(0.0, ' + [2.0, 1.5, 1.0][i - 3].toFixed(1) + ', foot * k))';
      return [
        '  {',
        '    float k = 6.2831853 / (' + b.len.toFixed(3) + ' * scale);',
        '    float w = sqrt(9.8 * k);',
        '    vec2 d = vec2(' + b.dir[0].toFixed(3) + ', ' + b.dir[1].toFixed(3) + ');',
        '    float ph = k * dot(d, p) - w * t;',
        '    float a = ' + b.amp.toFixed(3) + ' * amp * ' + att + ';',
        '    slope += d * cos(ph) * a * k;',
        '    crest += (0.5 + 0.5 * sin(ph)) * a;',
        '  }'
      ].join('\n');
    }).join('\n'),
    '  crest /= max(0.0001, amp * 2.02);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------ pool water */

  var POOL_VERT = [
    'varying vec3 vWorld;',
    'varying vec3 vLocal;',
    'varying vec3 vNormalW;',
    'void main() {',
    '  vLocal = position;',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorld = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var POOL_FRAG = [
    'uniform float uTime;',
    'uniform float uScale;',
    'uniform float uAmp;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColour;',
    'uniform sampler2D uSky;',
    'uniform vec3 uBottom;',
    'uniform vec3 uAbsorb;',
    'uniform float uDepth;',
    'uniform float uFoam;',
    'uniform vec3 uHalf;',
    'varying vec3 vWorld;',
    'varying vec3 vLocal;',
    'varying vec3 vNormalW;',
    FIELD,
    'void main() {',
    '  vec3 V = normalize(cameraPosition - vWorld);',
    '  bool topFace = vNormalW.y > 0.6;',
    '  float foot = max(fwidth(vWorld.x), fwidth(vWorld.z));',
    '  vec2 slope; float crest;',
    '  waveField(vWorld.xz, uTime, uScale, uAmp, foot, slope, crest);',
    // the surface gets the wave normal; the walls keep their own
    '  vec3 N = topFace ? normalize(vec3(-slope.x, 1.0, -slope.y)) : vNormalW;',

    '  float eta = 1.0 / 1.333;',
    '  float f0 = pow((1.0 - eta) / (1.0 + eta), 2.0) + 0.035;',
    '  float fres = f0 + (1.0 - f0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);',

    // absorption over an estimated path length, not reconstructed thickness
    '  vec3 refr = refract(-V, N, eta);',
    '  float path = uDepth / max(0.3, abs(refr.y));',
    '  vec3 body = uBottom * exp(-uAbsorb * path);',

    '  vec3 reflection = skySample(uSky, reflect(-V, N));',
    '  vec3 H = normalize(uSunDir + V);',
    '  float spec = pow(max(dot(N, H), 0.0), 900.0) * 9.0;',

    // foam: crest-linked, plus the line where water meets the pool wall
    '  vec2 edge = uHalf.xz - abs(vLocal.xz);',
    '  float wall = 1.0 - smoothstep(0.0, 0.6, min(edge.x, edge.y));',
    '  float seed = wNoise(vWorld.xz * 0.9 + vec2(uTime * 0.06));',
    '  float foam = smoothstep(0.62, 1.0, crest * (0.6 + 0.8 * seed)) * uFoam;',
    '  foam = clamp(foam + wall * (0.3 + 0.4 * seed), 0.0, 1.0) * (topFace ? 1.0 : 0.2);',

    '  vec3 colour = mix(body, reflection, topFace ? fres : 0.10);',
    '  colour += uSunColour * spec * (topFace ? 1.0 : 0.15);',
    '  colour = mix(colour, vec3(0.92, 0.97, 1.0), foam * 0.75);',
    '  float alpha = topFace ? clamp(0.82 + fres + foam * 0.4, 0.0, 1.0) : 0.6;',
    '  gl_FragColor = vec4(colour, alpha);',
    '}'
  ].join('\n');

  function poolMaterial(halfExtents) {
    var m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 0.42 },          // pool ripples, not ocean swell
        uAmp: { value: 0.055 },
        uSunDir: { value: new THREE.Vector3(-0.6, 0.66, 0.42).normalize() },
        uSunColour: { value: new THREE.Color(0xfff3dd) },
        uSky: { value: null },
        uBottom: { value: new THREE.Color(0x74cfe6) },
        uAbsorb: { value: new THREE.Vector3(0.20, 0.06, 0.02) },
        uDepth: { value: 1.7 },
        uFoam: { value: 1 },
        uHalf: { value: halfExtents || new THREE.Vector3(8, 0.8, 6) }
      },
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    m.userData.baseOpacity = 1;
    m.userData.water = 'pool';
    return m;
  }

  /* -------------------------------------------------------------- open sea */

  // The swell is displaced on the CPU; this adds the bands the mesh cannot
  // resolve, plus sky reflection and glint. Patched into MeshStandardMaterial
  // rather than replacing it, so the sea keeps shadows, fog and scene lighting.
  function patchSea(material) {
    var uniforms = {
      uTime: { value: 0 },
      uScale: { value: 4.5 },
      uAmp: { value: 0.5 },
      uSunDir: { value: new THREE.Vector3(-0.6, 0.66, 0.42).normalize() },
      uSunColour: { value: new THREE.Color(0xfff3dd) },
      uSky: { value: null },
      uFoam: { value: 1 },
      uSeaTint: { value: new THREE.Color(0x2e8fae) },
      // Light the ship throws onto the sea. Not a reflection — an authored
      // pool of illumination that rides the wave surface instead of a flat
      // card intersecting it.
      uGlowCentre: { value: new THREE.Vector3() },
      uGlowDir: { value: new THREE.Vector2(1, 0) },
      uGlowSize: { value: new THREE.Vector2(230, 70) },
      uGlowColour: { value: new THREE.Color(0xffc98a) },
      uGlowStrength: { value: 0 }
    };

    material.onBeforeCompile = function (shader) {
      Object.keys(uniforms).forEach(function (k) { shader.uniforms[k] = uniforms[k]; });

      shader.vertexShader = 'varying vec3 vSeaWorld;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

      shader.fragmentShader = [
        'uniform float uTime;',
        'uniform float uScale;',
        'uniform float uAmp;',
        'uniform vec3 uSunDir;',
        'uniform vec3 uSunColour;',
        'uniform sampler2D uSky;',
        'uniform float uFoam;',
        'uniform vec3 uSeaTint;',
        'uniform vec3 uGlowCentre;',
        'uniform vec2 uGlowDir;',
        'uniform vec2 uGlowSize;',
        'uniform vec3 uGlowColour;',
        'uniform float uGlowStrength;',
        'varying vec3 vSeaWorld;',
        FIELD,
        shader.fragmentShader
      ].join('\n');

      // perturb the shaded normal with the fine bands
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        [
          '#include <normal_fragment_begin>',
          '{',
          '  float foot = max(fwidth(vSeaWorld.x), fwidth(vSeaWorld.z));',
          '  vec2 slope; float crest;',
          '  waveField(vSeaWorld.xz, uTime, uScale, uAmp, foot, slope, crest);',
          '  normal = normalize(normal + vec3(-slope.x, 0.0, -slope.y) * 0.5);',
          '}'
        ].join('\n')
      );

      // sky reflection, glint and crest foam on top of the lit result
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        [
          '{',
          '  vec3 V = normalize(cameraPosition - vSeaWorld);',
          '  float foot = max(fwidth(vSeaWorld.x), fwidth(vSeaWorld.z));',
          '  vec2 slope; float crest;',
          '  waveField(vSeaWorld.xz, uTime, uScale, uAmp, foot, slope, crest);',
          '  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));',
          '  float eta = 1.0 / 1.333;',
          '  float f0 = pow((1.0 - eta) / (1.0 + eta), 2.0) + 0.035;',
          '  float fres = f0 + (1.0 - f0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);',
          '  vec3 R = reflect(-V, N); R.y = abs(R.y);',
          '  vec3 reflection = skySample(uSky, R);',
          '  float scatter = pow(max(dot(V, -uSunDir), 0.0), 4.0) * 0.42 * (1.0 - fres);',
          '  vec3 H = normalize(uSunDir + V);',
          '  float spec = pow(max(dot(N, H), 0.0), 1200.0) * 12.0;',
          '  float seed = wNoise(vSeaWorld.xz * 0.06 + vec2(uTime * 0.02));',
          '  float foam = smoothstep(0.80, 1.0, crest * (0.55 + 0.9 * seed)) * uFoam;',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, reflection, fres * 0.85);',
          '  gl_FragColor.rgb += uSunColour * (spec + scatter * 0.3);',
          '  gl_FragColor.rgb += uSeaTint * crest * 0.05;',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.9, 0.95, 1.0), foam * 0.55);',
          '  if (uGlowStrength > 0.001) {',
          '    vec2 rel = vSeaWorld.xz - uGlowCentre.xz;',
          '    vec2 al = vec2(dot(rel, uGlowDir), dot(rel, vec2(-uGlowDir.y, uGlowDir.x)));',
          '    float g = exp(-dot(al / uGlowSize, al / uGlowSize) * 2.2);',
          '    gl_FragColor.rgb += uGlowColour * g * uGlowStrength * (0.55 + 0.9 * crest);',
          '  }',
          '}',
          '#include <fog_fragment>'
        ].join('\n')
      );
    };
    material.customProgramCacheKey = function () { return 'icon-sea'; };
    material.userData.water = 'sea';
    material.userData.seaUniforms = uniforms;
    return uniforms;
  }

  global.IconWater = {
    pool: poolMaterial,
    patchSea: patchSea,
    bands: BANDS
  };
})(window);
