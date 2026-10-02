import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../utilities/Constants';
import { chunkKey } from '../utilities/MathUtil';
import { buildAtlas } from './TextureAtlas';
import { installAtlas, type ChunkMeshData, type MeshBuffers } from './ChunkMesher';
import { skyAt, type SkyState } from './DayNight';

const CHUNK_VERT = /* glsl */ `
attribute vec4 aColor;
attribute vec2 aLight;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vLight;
varying float vDist;
varying vec3 vWorld;
void main() {
  vUv = uv; vColor = aColor; vLight = aLight;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const CHUNK_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uSun;
uniform vec3 uSkyTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uMinLight;
uniform float uTime;
uniform float uWater;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vLight;
varying float vDist;
varying vec3 vWorld;
float curve(float l) { return pow(0.8, 15.0 - l * 15.0); }
void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (uWater < 0.5 && tex.a < 0.5) discard;
  float alpha = uWater > 0.5 ? tex.a * 0.82 : 1.0;
  vec3 skyL = vec3(curve(vLight.x) * uSun) * uSkyTint;
  vec3 blockL = vec3(curve(vLight.y)) * vec3(1.0, 0.86, 0.66);
  vec3 light = max(max(skyL, blockL), vec3(uMinLight));
  vec3 rgb = tex.rgb * vColor.rgb * vColor.a * light;
  if (uWater > 0.5) {
    float rip = sin(vWorld.x * 2.3 + uTime * 1.6) * sin(vWorld.z * 2.1 + uTime * 1.3);
    rgb *= 0.94 + 0.08 * rip;
  }
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  rgb = mix(rgb, uFogColor, f * f * (3.0 - 2.0 * f));
  gl_FragColor = vec4(rgb, alpha);
}`;

export interface ChunkMeshes { opaque?: THREE.Mesh; water?: THREE.Mesh }

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly atlas = buildAtlas();
  private uniforms: Record<string, THREE.IUniform>;
  private opaqueMat: THREE.ShaderMaterial;
  private waterMat: THREE.ShaderMaterial;
  private meshes = new Map<number, ChunkMeshes>();
  private chunkGroup = new THREE.Group();
  private skyMesh: THREE.Mesh;
  private skyUniforms: Record<string, THREE.IUniform>;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private cloudUniforms: Record<string, THREE.IUniform>;
  private highlightMesh: THREE.LineSegments;
  private crackMesh: THREE.Mesh;
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private box = new THREE.Box3();
  private oreMarkers = new Map<number, THREE.Points>();
  sky: SkyState = skyAt(0);
  renderDistance = 6;
  underwater = false;
  cloudsEnabled = true;
  renderedChunks = 0;
  private time = 0;
  private fogColor = new THREE.Color();

  constructor(readonly canvas: HTMLCanvasElement) {
    // All colours in this game are authored in display space, so skip three's linear<->sRGB conversions.
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';

    installAtlas(this.atlas.uv, this.atlas.torch);

    this.uniforms = {
      uMap: { value: this.atlas.texture },
      uSun: { value: 1 },
      uSkyTint: { value: new THREE.Vector3(1, 1, 1) },
      uFogColor: { value: new THREE.Color(0.7, 0.83, 0.98) },
      uFogNear: { value: 60 },
      uFogFar: { value: 100 },
      uMinLight: { value: 0.025 },
      uTime: { value: 0 },
      uWater: { value: 0 },
    };
    this.opaqueMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: CHUNK_VERT, fragmentShader: CHUNK_FRAG });
    const waterUniforms = { ...this.uniforms, uWater: { value: 1 } };
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: waterUniforms, vertexShader: CHUNK_VERT, fragmentShader: CHUNK_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.scene.add(this.chunkGroup);

    // --- Sky dome ---
    this.skyUniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 0 },
    };
    this.skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform float uGlow; varying vec3 vDir;
          void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
            float g = pow(max(dot(normalize(vDir), uSunDir), 0.0), 8.0) * uGlow; c += vec3(1.0, 0.6, 0.3) * g * 0.45; gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    this.sun = this.makeDisc(drawSun(), 70);
    this.moon = this.makeDisc(drawMoon(), 50);
    this.scene.add(this.sun, this.moon);

    this.stars = this.makeStars();
    this.scene.add(this.stars);

    this.cloudUniforms = {
      uTex: { value: makeCloudTexture() }, uOffset: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 300 },
    };
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.cloudUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform sampler2D uTex; uniform vec2 uOffset; uniform vec3 uColor; uniform float uFade; varying vec3 vW;
          void main(){ vec2 uv = (vW.xz + uOffset) / 640.0; float a = texture2D(uTex, uv).a;
            float d = length(vW.xz - cameraPosition.xz); a *= 0.85 * (1.0 - smoothstep(uFade * 0.5, uFade, d)); if (a < 0.02) discard; gl_FragColor = vec4(uColor, a); }`,
      }),
    );
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -5;
    this.scene.add(this.clouds);

    // --- Block highlight + crack overlay ---
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.highlightMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 }));
    this.highlightMesh.visible = false;
    this.scene.add(this.highlightMesh);
    this.crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: this.atlas.crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    this.setRenderDistance(6);
    this.resize();
    this.applyTime(0);
  }

  private makeDisc(tex: THREE.Texture, size: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }),
    );
    m.frustumCulled = false;
    m.renderOrder = -9;
    return m;
  }

  private makeStars(): THREE.Points {
    const n = 700;
    const pos = new Float32Array(n * 3);
    let s = 12345;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(t) * 380, Math.abs(u) * 380 * 0.9 + 10, r * Math.sin(t) * 380], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    p.frustumCulled = false;
    p.renderOrder = -8;
    return p;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setQuality(q: 'fast' | 'fancy') {
    this.cloudsEnabled = q === 'fancy';
    this.renderer.setPixelRatio(q === 'fancy' ? Math.min(window.devicePixelRatio || 1, 2) : 0.75);
    this.resize();
  }

  setFov(fov: number) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setRenderDistance(chunks: number) {
    this.renderDistance = chunks;
    this.updateFog();
  }

  private updateFog() {
    const far = this.renderDistance * CHUNK_SIZE;
    if (this.underwater) { this.uniforms.uFogNear.value = 0.5; this.uniforms.uFogFar.value = 22; }
    else { this.uniforms.uFogNear.value = far * 0.55; this.uniforms.uFogFar.value = far * 0.97; }
    this.cloudUniforms.uFade.value = Math.max(260, far * 2.2);
  }

  setUnderwater(u: boolean) {
    if (u === this.underwater) return;
    this.underwater = u;
    this.updateFog();
    this.applyTime(this.lastTicks);
  }

  private lastTicks = 0;

  applyTime(ticks: number) {
    this.lastTicks = ticks;
    const s = (this.sky = skyAt(ticks));
    this.uniforms.uSun.value = s.skyBrightness;
    (this.uniforms.uSkyTint.value as THREE.Vector3).set(...s.skyTint);
    this.skyUniforms.uZenith.value.setRGB(...s.zenith);
    this.skyUniforms.uHorizon.value.setRGB(...s.horizon);
    (this.skyUniforms.uSunDir.value as THREE.Vector3).set(...s.sunDir);
    this.skyUniforms.uGlow.value = Math.exp(-Math.pow(s.sunDir[1] / 0.35, 2));
    if (this.underwater) {
      const k = 0.25 + 0.75 * s.daylight;
      this.fogColor.setRGB(0.1 * k + 0.01, 0.36 * k + 0.02, 0.6 * k + 0.04);
    } else this.fogColor.setRGB(...s.horizon);
    (this.uniforms.uFogColor.value as THREE.Color).copy(this.fogColor);
    this.scene.background = this.fogColor;
    (this.stars.material as THREE.PointsMaterial).opacity = s.starAlpha;
    this.stars.visible = s.starAlpha > 0.02;
    const cc = 0.35 + 0.65 * s.daylight;
    (this.cloudUniforms.uColor.value as THREE.Color).setRGB(cc, cc, Math.min(1, cc + 0.05));
  }

  /** Per-frame update: moves sky objects with the camera and animates shader time/clouds. */
  update(dt: number) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const cp = this.camera.position;
    this.skyMesh.position.copy(cp);
    this.skyMesh.visible = !this.underwater;
    const s = this.sky;
    this.sun.position.set(cp.x + s.sunDir[0] * 300, cp.y + s.sunDir[1] * 300, cp.z + s.sunDir[2] * 300);
    this.sun.lookAt(cp);
    this.moon.position.set(cp.x + s.moonDir[0] * 300, cp.y + s.moonDir[1] * 300, cp.z + s.moonDir[2] * 300);
    this.moon.lookAt(cp);
    this.sun.visible = this.moon.visible = !this.underwater;
    this.stars.position.copy(cp);
    this.clouds.position.set(cp.x, WORLD_HEIGHT + 22, cp.z);
    this.clouds.visible = !this.underwater && this.cloudsEnabled;
    (this.cloudUniforms.uOffset.value as THREE.Vector2).x += dt * 2.2;
  }

  // ---------------- chunk meshes ----------------
  setChunkMesh(cx: number, cz: number, data: ChunkMeshData) {
    const key = chunkKey(cx, cz);
    this.disposeChunk(key);
    const entry: ChunkMeshes = {};
    if (data.opaque) entry.opaque = this.makeMesh(data.opaque, this.opaqueMat, cx, cz, data.maxY, 0);
    if (data.water) entry.water = this.makeMesh(data.water, this.waterMat, cx, cz, data.maxY, 1);
    this.meshes.set(key, entry);
  }

  private makeMesh(b: MeshBuffers, mat: THREE.Material, cx: number, cz: number, maxY: number, order: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(b.color, 4, true));
    g.setAttribute('aLight', new THREE.BufferAttribute(b.light, 2, true));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CHUNK_SIZE, maxY + 2, CHUNK_SIZE));
    g.boundingSphere = new THREE.Sphere();
    g.boundingBox.getBoundingSphere(g.boundingSphere);
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.frustumCulled = false; // we cull manually in updateCulling() so we can count rendered chunks
    m.renderOrder = order;
    this.chunkGroup.add(m);
    return m;
  }

  private disposeChunk(key: number) {
    const e = this.meshes.get(key);
    if (!e) return;
    for (const m of [e.opaque, e.water]) {
      if (m) { this.chunkGroup.remove(m); m.geometry.dispose(); }
    }
    this.meshes.delete(key);
  }

  removeChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    this.disposeChunk(key);
    const om = this.oreMarkers.get(key);
    if (om) { this.scene.remove(om); om.geometry.dispose(); this.oreMarkers.delete(key); }
  }

  get meshedChunkCount() { return this.meshes.size; }

  hasMesh(cx: number, cz: number) { return this.meshes.has(chunkKey(cx, cz)); }

  updateCulling() {
    this.camera.updateMatrixWorld();
    this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    let n = 0;
    for (const e of this.meshes.values()) {
      const ref = e.opaque ?? e.water;
      if (!ref) continue;
      const g = ref.geometry;
      this.box.copy(g.boundingBox!).applyMatrix4(ref.matrix);
      const vis = this.frustum.intersectsBox(this.box);
      if (e.opaque) e.opaque.visible = vis;
      if (e.water) e.water.visible = vis;
      if (vis) n++;
    }
    this.renderedChunks = n;
  }

  // ---------------- overlays ----------------
  setHighlight(pos: [number, number, number] | null) {
    if (!pos) { this.highlightMesh.visible = false; return; }
    this.highlightMesh.visible = true;
    this.highlightMesh.position.set(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
  }

  setCrack(pos: [number, number, number] | null, progress: number) {
    if (!pos || progress <= 0) { this.crackMesh.visible = false; return; }
    const stage = Math.min(9, Math.floor(progress * 10));
    (this.crackMesh.material as THREE.MeshBasicMaterial).map = this.atlas.crackTextures[stage];
    this.crackMesh.visible = true;
    this.crackMesh.position.set(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
  }

  /** Debug ore reveal: little see-through markers for every ore block in a chunk. */
  setOreMarkers(cx: number, cz: number, points: Float32Array | null, colors?: Float32Array) {
    const key = chunkKey(cx, cz);
    const old = this.oreMarkers.get(key);
    if (old) { this.scene.remove(old); old.geometry.dispose(); this.oreMarkers.delete(key); }
    if (!points || points.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(points, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors!, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
    p.frustumCulled = false;
    p.renderOrder = 50;
    this.scene.add(p);
    this.oreMarkers.set(key, p);
  }

  clearOreMarkers() {
    for (const [k, p] of this.oreMarkers) { this.scene.remove(p); p.geometry.dispose(); this.oreMarkers.delete(k); }
  }

  clearWorld() {
    for (const k of [...this.meshes.keys()]) this.disposeChunk(k);
    this.clearOreMarkers();
    this.setHighlight(null);
    this.setCrack(null, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function drawSun(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,250,210,1)'); grd.addColorStop(0.4, 'rgba(255,230,140,0.55)'); grd.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff8d0'; g.fillRect(20, 20, 24, 24); // blocky disc to match the voxel look
  return new THREE.CanvasTexture(c);
}

function drawMoon(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6ecf5'; g.fillRect(18, 18, 28, 28);
  g.fillStyle = '#c4cddb'; g.fillRect(24, 24, 6, 6); g.fillRect(34, 32, 8, 8); g.fillRect(22, 36, 5, 5);
  return new THREE.CanvasTexture(c);
}

function makeCloudTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  // Tileable blocky clouds from summed value-noise octaves.
  let s = 777;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const grids: number[][] = [];
  for (const n of [4, 8, 16]) { const gr: number[] = []; for (let i = 0; i < n * n; i++) gr.push(rnd()); grids.push(gr); }
  const sample = (gr: number[], n: number, x: number, y: number) => {
    const fx = (x / S) * n, fy = (y / S) * n;
    const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const a = gr[y0 * n + x0] * (1 - tx) + gr[y0 * n + x1] * tx;
    const b = gr[y1 * n + x0] * (1 - tx) + gr[y1 * n + x1] * tx;
    return a * (1 - ty) + b * ty;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = sample(grids[0], 4, x, y) * 0.5 + sample(grids[1], 8, x, y) * 0.3 + sample(grids[2], 16, x, y) * 0.2;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v > 0.56 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}
