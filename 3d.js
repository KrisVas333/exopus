// Exopus 3D stage. Static Meshy models animated in the browser:
// tentacles ripple per arm (vertex shader), and the octopus transforms per activity
// (costume props + tint + its own way of moving). No rig needed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const canvas = document.getElementById('stage');
const world = document.getElementById('world');
const tokenLayer = document.getElementById('tokens');
if (!canvas) throw new Error('no stage');

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
catch (e) { document.documentElement.classList.add('no3d'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 0.3, 6.0);
camera.lookAt(0, -0.1, 0);
scene.add(new THREE.HemisphereLight(0xfff4ec, 0xdad0ec, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(2, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xfaaca8, 1.3); rim.position.set(-3, 1, -2); scene.add(rim);

function dotTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: dotTexture('rgba(90,30,90,.33)', 'rgba(90,30,90,0)'), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.08; scene.add(shadow);

const pivot = new THREE.Group(); scene.add(pivot);
const body = new THREE.Group(); pivot.add(body);
const propRoot = new THREE.Group(); body.add(propRoot);

const U = { uTime: { value: 0 }, uAmp: { value: 1 }, uSpeed: { value: 1 }, uArm: { value: 0 }, uBoost: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintAmt: { value: 0 }, uMinY: { value: -0.95 } };
function patch(mat) {
  mat.metalness = 0; mat.roughness = Math.max(0.45, mat.roughness ?? 0.6);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `uniform float uTime,uAmp,uSpeed,uArm,uBoost,uMinY;\n` + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float w = smoothstep(-0.05, uMinY, position.y);
      float phi = atan(position.z, position.x);
      float d = abs(mod(phi - uArm + 3.14159, 6.28318) - 3.14159);
      float boost = 1.0 + uBoost * exp(-d*d*5.0) * 2.2;
      float t = uTime * uSpeed;
      float a = sin(t*2.2 + phi*4.0 + position.y*5.0) * 0.32 * w * uAmp * boost;
      float c = cos(a), s = sin(a);
      transformed.xz = mat2(c, -s, s, c) * transformed.xz;
      transformed.xz += normalize(position.xz + 1e-4) * sin(t*1.6 + phi*4.0) * 0.07 * w * uAmp * boost;
      transformed.y += sin(t*2.6 + phi*4.0) * 0.05 * w * uAmp * boost;`);
    sh.fragmentShader = `uniform vec3 uTint; uniform float uTintAmt;\n` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float sat = (mx - mn) / max(mx, 1e-4);                     // only the coloured skin, not eyes, whites or suckers
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 tinted = uTint * (l / max(dot(uTint, vec3(0.299, 0.587, 0.114)), 0.05));
        diffuseColor.rgb = mix(c, clamp(tinted, 0.0, 1.0), uTintAmt * smoothstep(0.18, 0.45, sat)); }`);
  };
  mat.needsUpdate = true;
}

/* ---------- head measurements (per model) ---------- */
let HEAD = { top: 0.95, y: 0.42, r: 0.72, front: 0.72 };
function measure(root) {
  const v = new THREE.Vector3(); let top = -9; const all = [];
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 5) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); all.push([v.x, v.y, v.z]); if (v.y > top) top = v.y; } });
  const q = (arr, f) => { if (!arr.length) return 0; arr.sort((a, b) => a - b); return arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]; };
  const rad = (lo, hi) => all.filter(p => p[1] > lo && p[1] < hi).map(p => Math.hypot(p[0], p[2]));
  const r = q(rad(top - 0.62, top - 0.3), 0.72) || 0.6;             // head, ignoring raised arms
  let waist = r * 0.6, waistY = -0.1, best = 9;                        // the neck: narrowest slice between head and tentacles
  for (let y = top - r * 1.1; y > -0.7; y -= 0.06) { const w = q(rad(y - 0.04, y + 0.04), 0.5); if (w && w < best) { best = w; waist = w; waistY = y; } }
  const front = q(all.filter(p => p[1] > top - r * 1.1 && p[1] < top - r * 0.5 && Math.abs(p[0]) < 0.12).map(p => p[2]), 0.97) || r;
  return { top, r, y: top - r * 0.78, front, waist, waistY };
}

/* ---------- costume props ---------- */
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra });
function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); return m; }
const BUILD = {
  dance(h) { const g = new THREE.Group();
    const skirt = (r1, r2, y, c) => mesh(new THREE.CylinderGeometry(r1, r2, 0.16, 40, 1, true), M(c, { side: THREE.DoubleSide, transparent: true, opacity: .92 }), [0, y, 0]);
    g.add(skirt(h.waist * 1.05, h.waist * 1.8, h.waistY - 0.08, 0xF6A6C4), skirt(h.waist * 1.0, h.waist * 1.55, h.waistY, 0xFBCFE0));
    const bow = mesh(new THREE.TorusKnotGeometry(0.07, 0.03, 48, 8, 2, 3), M(0xE0457B), [h.r * 0.45, h.top - 0.12, h.r * 0.35]); g.add(bow); return g; },
  martial(h) { const g = new THREE.Group(); const red = M(0xD7263D);
    g.add(mesh(new THREE.TorusGeometry(h.r * 0.99, 0.05, 12, 64), red, [0, h.y + 0.06, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.02), red, [0.08, h.y - 0.1, -h.r * 0.98], [0.2, 0, 0.35]));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), red, [-0.06, h.y - 0.08, -h.r * 0.98], [0.2, 0, -0.3]));
    const belt = M(0x1B1B1F);
    g.add(mesh(new THREE.TorusGeometry(h.waist * 1.02, 0.045, 10, 64), belt, [0, h.waistY, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.09, 0.05), belt, [0, h.waistY, h.waist * 1.02])); return g; },
  music(h) { const g = new THREE.Group(); const ink = M(0x26212B), cup = M(0xAE4197);
    g.add(mesh(new THREE.TorusGeometry(h.r * 1.04, 0.035, 10, 48, Math.PI), ink, [0, h.y, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24), cup, [h.r * 1.03, h.y, 0], [0, 0, Math.PI / 2]));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24), cup, [-h.r * 1.03, h.y, 0], [0, 0, Math.PI / 2])); return g; },
  art(h) { const g = new THREE.Group(); const beret = mesh(new THREE.SphereGeometry(h.r * 0.78, 32, 16), M(0x7B2D5B), [h.r * 0.12, h.top - 0.08, 0], [0, 0, -0.28]);
    beret.scale.set(1, 0.32, 1); g.add(beret);
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 8), M(0x7B2D5B), [h.r * 0.02, h.top + 0.1, 0], [0, 0, -0.28]));
    const pal = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 28), M(0xE8C9A0), [h.r * 1.05, -0.35, h.r * 0.45], [1.2, 0, 0.3]); g.add(pal);
    [0xE0457B, 0x3D8BD9, 0xF2B53A, 0x2E9A55].forEach((c, i) => pal.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), M(c), [Math.cos(i * 1.4) * 0.11, 0.025, Math.sin(i * 1.4) * 0.11])));
    return g; },
  robotics(h) { const g = new THREE.Group(); const metal = M(0xB9C2CF, { metalness: .6, roughness: .3 });
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), metal, [0, h.top + 0.14, 0]));
    const tip = mesh(new THREE.SphereGeometry(0.06, 16, 12), M(0x34E2E4, { emissive: 0x34E2E4, emissiveIntensity: 1.2 }), [0, h.top + 0.32, 0]); tip.name = 'blink'; g.add(tip);
    g.add(mesh(new THREE.TorusGeometry(h.r * 0.55, 0.03, 8, 40), metal, [0, h.top - 0.06, 0], [Math.PI / 2, 0, 0])); return g; },
  languages(h) { const g = new THREE.Group(); const glasses = M(0x26212B);
    [-1, 1].forEach(s => g.add(mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 28), glasses, [s * 0.17, h.y - 0.1, h.front + 0.02])));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), glasses, [0, h.y - 0.1, h.front + 0.02])); return g; },
  science(h) { const g = new THREE.Group(); const strap = M(0x2E9A55), lens = M(0xCFF6EC, { transparent: true, opacity: .55, roughness: .1 });
    g.add(mesh(new THREE.TorusGeometry(h.r * 0.99, 0.035, 10, 64), strap, [0, h.y + 0.06, 0], [Math.PI / 2, 0, 0]));
    [-1, 1].forEach(s => { g.add(mesh(new THREE.TorusGeometry(0.12, 0.035, 10, 28), strap, [s * 0.16, h.y + 0.06, h.front * 0.97]));
      g.add(mesh(new THREE.CircleGeometry(0.12, 24), lens, [s * 0.16, h.y + 0.06, h.front * 0.97])); });
    const flask = new THREE.Group(); flask.position.set(-h.r * 1.05, -0.35, h.r * 0.4);
    flask.add(mesh(new THREE.SphereGeometry(0.13, 20, 16), M(0x7FE0B8, { transparent: true, opacity: .8 })));
    flask.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 12), M(0xDDF7EE, { transparent: true, opacity: .8 }), [0, 0.15, 0])); g.add(flask); return g; },
  football(h, basket) { const g = new THREE.Group(); const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = basket ? '#E8752A' : '#fff'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#1B1B1F';
    if (basket) { x.fillRect(0, 30, 128, 4); x.fillRect(62, 0, 4, 64); x.fillRect(30, 0, 3, 64); x.fillRect(95, 0, 3, 64); } else [[20, 16], [64, 12], [108, 18], [40, 44], [88, 46]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 9, 0, 7); x.fill(); });
    const ball = mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: .5 }), [h.r * 0.9, 0.2, h.r * 0.5]); ball.name = 'ball'; g.add(ball);
    g.add(mesh(new THREE.TorusGeometry(h.r * 0.99, 0.04, 10, 64), M(basket ? 0xE8752A : 0x2E9A55), [0, h.y + 0.1, 0], [Math.PI / 2, 0, 0])); return g; },
  basketball(h) { return BUILD.football(h, true); },
  coding(h) { const g = BUILD.languages(h);
    const lap = new THREE.Group(); lap.position.set(h.r * 1.0, -0.4, h.r * 0.55); lap.rotation.y = -0.6;
    lap.add(mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), M(0xB9C2CF, { metalness: .5, roughness: .35 })));
    lap.add(mesh(new THREE.BoxGeometry(0.34, 0.22, 0.015), M(0x2E2B33), [0, 0.11, -0.12], [-0.25, 0, 0]));
    lap.add(mesh(new THREE.PlaneGeometry(0.29, 0.17), M(0x3097D7, { emissive: 0x3097D7, emissiveIntensity: .7 }), [0, 0.11, -0.11], [-0.25, 0, 0]));
    g.add(lap); return g; },
  gymnastics(h) { const g = new THREE.Group(); const pts = [];
    for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 4, rr = Math.max(h.r, h.waist * 1.6) * 1.55; pts.push(new THREE.Vector3(Math.cos(a) * rr, -0.75 + i / 60 * 1.1, Math.sin(a) * rr)); }
    const rib = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.018, 6), M(0xE0457B)); rib.name = 'ribbon'; g.add(rib);
    g.add(mesh(new THREE.TorusGeometry(h.r * 0.99, 0.035, 10, 64), M(0xE0457B), [0, h.y + 0.12, 0], [Math.PI / 2, 0, 0])); return g; },
  detective(h) { const g = new THREE.Group(); const tweed = M(0x8A6A4A);
    const cap = mesh(new THREE.SphereGeometry(h.r * 0.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), tweed, [0, h.top - h.r * 0.42, 0]); cap.scale.set(1, 0.6, 1.05); g.add(cap);
    const brim = mesh(new THREE.CylinderGeometry(h.r * 0.9, h.r * 0.9, 0.02, 32), tweed, [0, h.top - h.r * 0.42, 0]); brim.scale.set(0.85, 1, 1.25); g.add(brim);
    const mag = new THREE.Group(); mag.position.set(-h.r * 1.0, -0.3, h.r * 0.6); mag.rotation.set(0.3, 0.5, 0.6);
    mag.add(mesh(new THREE.TorusGeometry(0.14, 0.025, 10, 28), M(0x2E2B33)));
    mag.add(mesh(new THREE.CircleGeometry(0.14, 24), M(0xCCE0F0, { transparent: true, opacity: .5, roughness: .1 })));
    mag.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.24, 10), M(0x2E2B33), [0, -0.26, 0])); g.add(mag); return g; },
  chess(h) { const g = new THREE.Group(); const gold = M(0xE3B341, { metalness: .5, roughness: .35 });
    g.add(mesh(new THREE.CylinderGeometry(h.r * 0.5, h.r * 0.56, 0.14, 5, 1, true), gold, [0, h.top - 0.02, 0]));
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), gold, [Math.cos(a) * h.r * 0.5, h.top + 0.08, Math.sin(a) * h.r * 0.5])); }
    return g; },
  exo() { return new THREE.Group(); }
};

/* activities: key, target hue (null = artwork), motion, floating words */
const ACT = {
  exo:        { tint: null,     motion: 'idle' },
  football:   { tint: 0x2E9A55, motion: 'juggle' },
  robotics:   { tint: 0x3097D7, motion: 'robot' },
  martial:    { tint: 0xD7263D, motion: 'martial' },
  dance:      { tint: 0xE0579A, motion: 'dance' },
  coding:     { tint: 0x2BB3A8, motion: 'robot', words: ['{ }', '</>', 'if'] },
  languages:  { tint: 0x6B5BD6, motion: 'talk', words: ['Labas!', 'Hello!', 'Hola!', 'Ciao!'] },
  art:        { tint: 0xE8A21E, motion: 'sway' },
  basketball: { tint: 0xE8752A, motion: 'juggle' },
  music:      { tint: 0xD9731A, motion: 'music', words: ['♪', '♫', '♪'] },
  gymnastics: { tint: 0xC74FB8, motion: 'dance' },
  detective:  { tint: 0x8A6A4A, motion: 'think', words: ['?', 'Kas?', '!'] },
  chess:      { tint: 0x4A5568, motion: 'think' },
  science:    { tint: 0x1FA389, motion: 'sway' }
};

/* ---------- models ---------- */
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {}; let current = null, wanted = null, baseHue = 285, styleKey = 'pixar';
let actKey = 'exo', prop = null, oldProp = null, tf = 1, tfStart = -9;
const tintFrom = new THREE.Color(), tintTo = new THREE.Color(); let amtFrom = 0, amtTo = 0;



async function setStyle(k, base) {
  wanted = k; styleKey = k; if (typeof base === 'number') baseHue = base;
  world.classList.add('loading3d');
  try {
    if (!cache[k]) {
      const gltf = await loader.loadAsync(`3d/${k}.glb`); const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m); const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
      m.position.sub(ctr); const s = 1.9 / size.y; m.scale.setScalar(s); m.position.multiplyScalar(s);
      m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); patch(o.material); } });
      cache[k] = { m, head: null };
    }
    if (wanted !== k) return;
    if (current) body.remove(current);
    current = cache[k].m; body.add(current);
    if (!cache[k].head) cache[k].head = measure(current);
    HEAD = cache[k].head;
    if (prop) { propRoot.remove(prop); prop = BUILD[actKey](HEAD); propRoot.add(prop); }

    world.classList.add('has3d'); world.classList.remove('no3dmodel');
  } catch (e) {
    if (wanted === k) { if (current) body.remove(current); current = null; world.classList.remove('has3d'); world.classList.add('no3dmodel'); }
  } finally { world.classList.remove('loading3d'); }
}

/* sparkles for the transformation */
const SP = 60, spGeo = new THREE.BufferGeometry(), spPos = new Float32Array(SP * 3), spVel = [];
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
const sparkles = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.09, map: dotTexture('rgba(255,255,255,1)', 'rgba(255,220,240,0)'), transparent: true, depthWrite: false, color: 0xffffff }));
scene.add(sparkles); let spLife = 0;
function burst() { for (let i = 0; i < SP; i++) { spPos.set([0, 0, 0], i * 3); const a = Math.random() * 6.28, b = Math.random() * 3.14; const s = 1.4 + Math.random() * 1.6; spVel[i] = [Math.cos(a) * Math.sin(b) * s, Math.cos(b) * s + 0.4, Math.sin(a) * Math.sin(b) * s]; } spLife = 1; }

/* floating words (languages, music) */
const words = [];
function setWords(list) {
  words.forEach(w => w.el.remove()); words.length = 0;
  (list || []).forEach((txt, i) => { const el = document.createElement('div'); el.className = 'word'; el.textContent = txt; tokenLayer.appendChild(el); words.push({ el, i, n: list.length }); });
}

let onAct = null;
function setActivity(k) {
  if (!ACT[k] || k === actKey && prop) return;
  actKey = k; tf = 0; tfStart = clock.elapsedTime; burst();
  oldProp = prop; prop = BUILD[k](HEAD); prop.scale.setScalar(0.001); propRoot.add(prop);
  tintFrom.copy(U.uTint.value); amtFrom = U.uTintAmt.value;
  if (ACT[k].tint === null) { tintTo.copy(tintFrom); amtTo = 0; } else { tintTo.set(ACT[k].tint); amtTo = 0.85; if (amtFrom === 0) tintFrom.copy(tintTo); }
  targetRot = nearestFront();
  setWords(ACT[k].words);
  onAct && onAct(k);
}
function nearestFront() { const c = pivot.rotation.y; return Math.round(c / (Math.PI * 2)) * Math.PI * 2; }

/* job tokens (Phosphor icons) around the arms */
const ICONS = ['ph-clipboard-text', 'ph-credit-card', 'ph-users-three', 'ph-tag', 'ph-chat-circle-text', 'ph-check-square', 'ph-device-mobile', 'ph-envelope-simple'];
const tokens = ICONS.map((ic, i) => {
  const el = document.createElement('div'); el.className = 'tok'; el.innerHTML = `<i class="ph ${ic}"></i>`; tokenLayer.appendChild(el);
  const th = i * Math.PI / 4;
  return { el, th, p: new THREE.Vector3(Math.cos(th) * 1.5, -0.74 + Math.sin(i * 1.7) * 0.12, Math.sin(th) * 1.5) };
});

let busy = false, activeArm = -1, targetRot = null, hop = 0;
function work(i) {
  busy = true; activeArm = ((i % 8) + 8) % 8; const th = tokens[activeArm].th; U.uArm.value = th;
  let a = th - Math.PI / 2; const cur = pivot.rotation.y;
  targetRot = cur + (((a - cur) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; hop = 1;
}
function idle() { busy = false; activeArm = -1; targetRot = null; hop = 0.6; }

let dragging = false, lastX = 0, vel = 0, lastTouch = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); targetRot = null; lastTouch = performance.now(); });
canvas.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.01; pivot.rotation.y += vel; });
canvas.addEventListener('pointerup', () => { dragging = false; });

function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(canvas); resize();

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock(); const v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
let visible = true; new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
const ease = x => 1 - Math.pow(1 - x, 3);
const elastic = x => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1;

renderer.setAnimationLoop(() => {
  if (!visible) return;
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, mo = ACT[actKey].motion;
  U.uTime.value = reduce ? 0 : t;
  const stiff = mo === 'robot' ? 0.45 : 1;
  U.uSpeed.value += ((busy ? 2.4 : mo === 'dance' ? 1.8 : 1) - U.uSpeed.value) * dt * 3;
  U.uAmp.value += ((busy ? 1.35 : stiff) - U.uAmp.value) * dt * 3;

  // martial arts: alternating strikes with two arms
  let boostTarget = activeArm >= 0 ? 1 : 0;
  if (!busy && mo === 'martial') { const ph = Math.floor(t * 1.6) % 2; U.uArm.value = ph ? Math.PI * 0.25 : Math.PI * 0.75; boostTarget = (Math.sin(t * Math.PI * 3.2) > 0.2) ? 1.4 : 0.2; }
  if (!busy && mo === 'juggle') { U.uArm.value = Math.PI * 0.2; boostTarget = 0.8; }
  U.uBoost.value += (boostTarget - U.uBoost.value) * dt * 6;

  // transformation progress
  if (tf < 1) {
    tf = Math.min(1, Math.max(0.001, (t - tfStart) / 1.3));
    const e = ease(tf);
    U.uTint.value.copy(tintFrom).lerp(tintTo, e); U.uTintAmt.value = amtFrom + (amtTo - amtFrom) * e;
    if (oldProp) { const s = Math.max(0.001, 1 - tf * 3); oldProp.scale.setScalar(s); if (tf > 0.34) { propRoot.remove(oldProp); oldProp = null; } }
    if (prop) prop.scale.setScalar(Math.max(0.001, tf < 0.4 ? 0.001 : elastic((tf - 0.4) / 0.6)));
  }
  const spin = tf < 1 ? Math.sin(ease(tf) * Math.PI) * 0.18 : 0;

  // rotation
  if (targetRot !== null) { pivot.rotation.y += (targetRot - pivot.rotation.y) * dt * 4; if (tf >= 1 && !busy && Math.abs(targetRot - pivot.rotation.y) < 0.01) targetRot = null; }
  else if (!dragging) {
    vel *= 0.94; let s = reduce ? 0 : dt * 0.22;
    if (mo === 'dance') s = dt * 1.1;
    if (mo === 'robot') s = Math.sin(t * 7.5) > 0.6 ? dt * 1.6 : 0;   // stop-start, mechanical turn
    pivot.rotation.y += vel + s;
  }

  // body motion per activity
  hop = Math.max(0, hop - dt * 1.6);
  let bob = reduce ? 0 : Math.sin(t * 1.4) * 0.07, rx = 0, rz = busy ? Math.sin(t * 9) * 0.03 : Math.sin(t * 0.9) * 0.04, pz = 0;
  if (!busy && !reduce) {
    if (mo === 'dance') { rz = Math.sin(t * 3) * 0.12; bob = Math.abs(Math.sin(t * 3)) * 0.12; }
    if (mo === 'martial') { pz = Math.max(0, Math.sin(t * Math.PI * 1.6)) * 0.12; rx = pz * 0.6; }
    if (mo === 'music') { rx = Math.sin(t * Math.PI * 4) * 0.07; bob = Math.abs(Math.sin(t * Math.PI * 2)) * 0.08; }
    if (mo === 'talk') { bob = Math.abs(Math.sin(t * 6)) * 0.04; }
    if (mo === 'robot') { rz = 0; bob = Math.round(Math.sin(t * 2) * 3) / 3 * 0.05; }
    if (mo === 'think') { rz = Math.sin(t * 0.6) * 0.1; bob = Math.sin(t * 0.8) * 0.04; }
  }
  const jump = Math.sin((1 - hop) * Math.PI) * hop * 0.35;
  body.position.set(0, bob + jump, pz);
  const sq = 1 + (reduce ? 0 : Math.sin(t * 2.8) * 0.015) - jump * 0.12 - spin * 0.3;
  body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  body.rotation.set(rx, spin * Math.PI * 2 * 5.5, rz);
  shadow.scale.setScalar(1 - (bob + jump) * 0.6);

  // prop details
  if (prop) {
    const tip = prop.getObjectByName('blink'); if (tip) tip.material.emissiveIntensity = (Math.sin(t * 6) > 0) ? 1.6 : 0.3;
    const rib = prop.getObjectByName('ribbon'); if (rib) rib.rotation.y = t * 1.5;
    const ball = prop.getObjectByName('ball'); if (ball) { ball.position.y = 0.05 + Math.abs(Math.sin(t * 3.2)) * 0.55; ball.rotation.x += dt * 5; }
  }

  // sparkles
  if (spLife > 0) { spLife = Math.max(0, spLife - dt * 1.1); for (let i = 0; i < SP; i++) { spPos[i * 3] += spVel[i][0] * dt; spPos[i * 3 + 1] += spVel[i][1] * dt; spPos[i * 3 + 2] += spVel[i][2] * dt; spVel[i][1] -= dt * 1.5; } spGeo.attributes.position.needsUpdate = true; }
  sparkles.material.opacity = spLife; sparkles.visible = spLife > 0;

  // tokens + words in screen space
  const r = canvas.getBoundingClientRect();
  tokens.forEach((tk, i) => {
    v.copy(tk.p); v.y += Math.sin(t * 1.3 + i) * 0.05; v.applyAxisAngle(Y, pivot.rotation.y);
    const behind = v.z < -0.2; v.project(camera);
    const act = i === activeArm;
    tk.el.style.transform = `translate(${(v.x * .5 + .5) * r.width}px,${(-v.y * .5 + .5) * r.height}px) translate(-50%,-50%) scale(${act ? 1.3 : 1})`;
    tk.el.classList.toggle('act', act); tk.el.style.opacity = behind && !act ? 0.3 : 1; tk.el.style.zIndex = act ? 9 : (behind ? 1 : 6);
  });
  words.forEach(w => {
    const a = t * 0.6 + w.i / w.n * Math.PI * 2; v.set(Math.cos(a) * 1.25, 0.55 + Math.sin(t * 1.5 + w.i) * 0.15, Math.sin(a) * 1.25); v.project(camera);
    w.el.style.transform = `translate(${(v.x * .5 + .5) * r.width}px,${(-v.y * .5 + .5) * r.height}px) translate(-50%,-50%)`;
    w.el.style.opacity = tf < 0.5 ? 0 : 1;
  });
  renderer.render(scene, camera);
});

window.exo3d = { setStyle, setActivity, work, idle, set onActivity(fn) { onAct = fn; }, get activity() { return actKey; }, get busy() { return busy; }, get lastTouch() { return lastTouch; } };
window.dispatchEvent(new Event('exo3d-ready'));
