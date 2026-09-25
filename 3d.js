// Exopus 3D stage: static Meshy models, animated in the browser.
// Tentacles ripple per arm (vertex shader), body floats and hops, turns toward the job it's doing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const canvas = document.getElementById('stage');
const world = document.getElementById('world');
const tokenLayer = document.getElementById('tokens');
if (!canvas) throw new Error('no stage');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) { document.documentElement.classList.add('no3d'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 0.35, 5.6);
camera.lookAt(0, -0.15, 0);

scene.add(new THREE.HemisphereLight(0xfff4ec, 0xd9c6f2, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xfaaca8, 1.4); rim.position.set(-3, 1, -2); scene.add(rim);

// soft blob shadow
const sc = document.createElement('canvas'); sc.width = sc.height = 128;
const g = sc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
gr.addColorStop(0, 'rgba(90,30,90,.35)'); gr.addColorStop(1, 'rgba(90,30,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.08; scene.add(shadow);

const pivot = new THREE.Group(); scene.add(pivot);      // turns toward jobs / drag
const body = new THREE.Group(); pivot.add(body);        // floats and hops

// shared uniforms for the tentacle shader
const U = {
  uTime: { value: 0 }, uAmp: { value: 1 }, uSpeed: { value: 1 },
  uArm: { value: 0 }, uBoost: { value: 0 }, uHue: { value: 0 }, uMinY: { value: -0.95 }
};

function patch(mat) {
  mat.metalness = 0; mat.roughness = Math.max(0.45, mat.roughness ?? 0.6);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `uniform float uTime,uAmp,uSpeed,uArm,uBoost,uMinY;\n` + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float w = smoothstep(-0.05, uMinY, position.y);           // 0 at the head, 1 at the tips
      float phi = atan(position.z, position.x);
      float d = abs(mod(phi - uArm + 3.14159, 6.28318) - 3.14159);
      float boost = 1.0 + uBoost * exp(-d*d*5.0) * 2.2;          // the working arm waves harder
      float t = uTime * uSpeed;
      float wave = sin(t*2.2 + phi*4.0 + position.y*5.0);
      float a = wave * 0.32 * w * uAmp * boost;                  // curl around the vertical axis
      float c = cos(a), s = sin(a);
      transformed.xz = mat2(c, -s, s, c) * transformed.xz;
      transformed.xz += normalize(position.xz + 1e-4) * sin(t*1.6 + phi*4.0) * 0.07 * w * uAmp * boost;
      transformed.y += sin(t*2.6 + phi*4.0) * 0.05 * w * uAmp * boost;
    `);
    sh.fragmentShader = `uniform float uHue;\n` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float c = cos(uHue), s = sin(uHue);
        mat3 hr = mat3(0.299+0.701*c+0.168*s, 0.587-0.587*c+0.330*s, 0.114-0.114*c-0.497*s,
                       0.299-0.299*c-0.328*s, 0.587+0.413*c+0.035*s, 0.114-0.114*c+0.292*s,
                       0.299-0.3*c+1.25*s,    0.587-0.588*c-1.05*s,  0.114+0.886*c-0.203*s);
        diffuseColor.rgb = clamp(diffuseColor.rgb * hr, 0.0, 1.0); }`);
  };
  mat.needsUpdate = true;
}

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {}; let current = null, wanted = null;

async function setStyle(k) {
  wanted = k;
  world.classList.add('loading3d');
  try {
    if (!cache[k]) {
      const gltf = await loader.loadAsync(`3d/${k}.glb`);
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m); const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
      m.position.sub(ctr); const s = 1.9 / size.y; m.scale.setScalar(s); m.position.multiplyScalar(s);
      m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); patch(o.material); } });
      cache[k] = m;
    }
    if (wanted !== k) return;
    if (current) body.remove(current);
    current = cache[k]; body.add(current);
    world.classList.add('has3d'); world.classList.remove('no3dmodel');
  } catch (e) {
    if (wanted === k) { if (current) body.remove(current); current = null; world.classList.remove('has3d'); world.classList.add('no3dmodel'); }
  } finally { world.classList.remove('loading3d'); }
}

// 8 job tokens around the arms
const ICONS = ['📋', '💶', '👥', '🏷️', '💬', '✅', '📱', '✉️'];
const tokens = ICONS.map((ic, i) => {
  const el = document.createElement('div'); el.className = 'tok'; el.textContent = ic; tokenLayer.appendChild(el);
  const th = i * Math.PI / 4;
  return { el, th, p: new THREE.Vector3(Math.cos(th) * 1.45, -0.72 + Math.sin(i * 1.7) * 0.12, Math.sin(th) * 1.45) };
});

let busy = false, activeArm = -1, targetRot = null, hop = 0;
function work(i) {
  busy = true; activeArm = ((i % 8) + 8) % 8;
  const th = tokens[activeArm].th;
  U.uArm.value = th;
  let a = th - Math.PI / 2; const cur = pivot.rotation.y;          // bring that arm to the front
  a = cur + (((a - cur) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  targetRot = a; hop = 1;
}
function idle() { busy = false; activeArm = -1; targetRot = null; hop = 0.6; }
function setHue(deg) { U.uHue.value = deg * Math.PI / 180; }

// drag to spin
let dragging = false, lastX = 0, vel = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); targetRot = null; });
canvas.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.01; pivot.rotation.y += vel; });
canvas.addEventListener('pointerup', () => { dragging = false; });

function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas); resize();

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock(); const v = new THREE.Vector3();
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);

renderer.setAnimationLoop(() => {
  if (!visible) return;
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  U.uTime.value = reduce ? 0 : t;
  U.uSpeed.value += ((busy ? 2.4 : 1) - U.uSpeed.value) * dt * 3;
  U.uAmp.value += ((busy ? 1.35 : 1) - U.uAmp.value) * dt * 3;
  U.uBoost.value += ((activeArm >= 0 ? 1 : 0) - U.uBoost.value) * dt * 4;
  if (targetRot !== null) pivot.rotation.y += (targetRot - pivot.rotation.y) * dt * 4;
  else if (!dragging) { vel *= 0.94; pivot.rotation.y += vel + (reduce ? 0 : dt * 0.25); }
  hop = Math.max(0, hop - dt * 1.6);
  const bob = reduce ? 0 : Math.sin(t * 1.4) * 0.07;
  const jump = Math.sin((1 - hop) * Math.PI) * hop * 0.35;
  body.position.y = bob + jump;
  const squash = 1 + Math.sin(t * 2.8) * 0.015 - jump * 0.12;
  body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  body.rotation.z = busy ? Math.sin(t * 9) * 0.03 : Math.sin(t * 0.9) * 0.04;
  shadow.scale.setScalar(1 - (bob + jump) * 0.6);

  const r = canvas.getBoundingClientRect();
  tokens.forEach((tk, i) => {
    v.copy(tk.p); v.y += Math.sin(t * 1.3 + i) * 0.05; v.applyAxisAngle(new THREE.Vector3(0, 1, 0), pivot.rotation.y);
    const behind = v.z < -0.2; v.project(camera);
    const x = (v.x * 0.5 + 0.5) * r.width, y = (-v.y * 0.5 + 0.5) * r.height;
    const act = i === activeArm;
    tk.el.style.opacity = behind && !act ? 0.35 : 1;
    tk.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${act ? 1.35 : 1})`;
    tk.el.classList.toggle('act', act);
    tk.el.style.zIndex = act ? 9 : (behind ? 1 : 6);
  });
  renderer.render(scene, camera);
});

window.exo3d = { setStyle, setHue, work, idle };
window.dispatchEvent(new Event('exo3d-ready'));
