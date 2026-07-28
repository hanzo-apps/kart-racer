// Circuit — an arcade racer. The track is a closed Catmull-Rom loop, so the
// ribbon mesh, the collision test, the checkpoints and the AI racing line are all
// derived from ONE curve: change the control points and every system follows.
import * as THREE from 'three';

const hud = (t) => { document.getElementById('hud').innerHTML = t; };
const LAPS = 3;
const HALF_W = 7;            // track half-width, in world units

// ---- the one source of truth ---------------------------------------------
const curve = new THREE.CatmullRomCurve3([
  [0, 0, -60], [46, 0, -46], [66, 0, 0], [42, 0, 44], [0, 0, 62], [-40, 0, 50],
  [-70, 0, 12], [-58, 0, -34], [-24, 0, -70],
].map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', 0.5);

const SAMPLES = 360;
const pts = curve.getSpacedPoints(SAMPLES);          // SAMPLES+1, last == first
const tangents = pts.map((_, i) => curve.getTangentAt((i % SAMPLES) / SAMPLES).normalize());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1526);
scene.fog = new THREE.Fog(0x0d1526, 90, 240);
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x111827, 1.15));
const sun = new THREE.DirectionalLight(0xfff1d8, 2.0);
sun.position.set(60, 90, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -120;
sun.shadow.camera.right = sun.shadow.camera.top = 120;
scene.add(sun);

// road ribbon + painted edges, all from the curve
function ribbon(width, y, mat) {
  const pos = [], ind = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = pts[i % SAMPLES], t = tangents[i % SAMPLES];
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(width);
    pos.push(p.x - n.x, y, p.z - n.z, p.x + n.x, y, p.z + n.z);
    if (i < SAMPLES) { const a = i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
ribbon(HALF_W + 1.4, 0.01, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }));
ribbon(HALF_W, 0.03, new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.85 }));

const grass = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x14301f, roughness: 1 }),
);
grass.rotation.x = -Math.PI / 2;
grass.receiveShadow = true;
scene.add(grass);

// roadside pylons every 12 samples — depth cue and speed sensation
const pylon = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.5, 1.6, 8),
  new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12 }),
  Math.floor(SAMPLES / 12) * 2,
);
pylon.castShadow = true;
{
  const m = new THREE.Matrix4(); let k = 0;
  for (let i = 0; i < SAMPLES; i += 12) {
    const p = pts[i], t = tangents[i];
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
    for (const s of [-1, 1]) {
      m.setPosition(p.x + n.x * (HALF_W + 2.2) * s, 0.8, p.z + n.z * (HALF_W + 2.2) * s);
      pylon.setMatrixAt(k++, m);
    }
  }
}
scene.add(pylon);

// ---- the kart ------------------------------------------------------------
const kart = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.BoxGeometry(1.7, 0.55, 3.1),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.55, roughness: 0.3 }),
);
body.position.y = 0.55; body.castShadow = true;
const canopy = new THREE.Mesh(
  new THREE.BoxGeometry(1.1, 0.42, 1.1),
  new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.3, roughness: 0.2 }),
);
canopy.position.set(0, 0.98, -0.25); canopy.castShadow = true;
kart.add(body, canopy);
for (const [x, z] of [[-0.95, 1.05], [0.95, 1.05], [-0.95, -1.05], [0.95, -1.05]]) {
  const w = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 }),
  );
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.42, z);
  w.castShadow = true;
  kart.add(w);
}
scene.add(kart);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- state ---------------------------------------------------------------
let seg = 0;                                   // nearest curve sample
const pos = pts[0].clone();
let heading = Math.atan2(tangents[0].x, tangents[0].z);
let speed = 0, lap = 0, best = 0, lapStart = performance.now(), autopilot = true;
const keys = new Set();
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code); autopilot = false;
});
addEventListener('keyup', (e) => keys.delete(e.code));

function nearestSeg(from) {                     // walk forward from the last one
  let bi = from, bd = Infinity;
  for (let k = -8; k < 30; k++) {
    const i = (from + k + SAMPLES) % SAMPLES;
    const d = pts[i].distanceToSquared(pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

const chase = new THREE.Vector3(0, 6, 14);
let frames = 0, mark = performance.now(), fps = 0;

renderer.setAnimationLoop(() => {
  const dt = 1 / 60;
  const prev = seg;
  seg = nearestSeg(seg);
  if (prev > SAMPLES - 30 && seg < 30) {        // crossed the start/finish line
    const t = (performance.now() - lapStart) / 1000;
    if (lap > 0) best = best ? Math.min(best, t) : t;
    lap++; lapStart = performance.now();
  }

  const t = tangents[seg];
  const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
  const off = n.dot(new THREE.Vector3().subVectors(pos, pts[seg]));   // signed offset
  const onRoad = Math.abs(off) < HALF_W;

  let throttle = 0, steer = 0;
  if (autopilot) {                              // demo drives itself until a key
    const ahead = pts[(seg + 14) % SAMPLES];
    const want = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
    let d = want - heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    steer = Math.max(-1, Math.min(1, d * 2.4));
    throttle = 1;
  } else {
    if (keys.has('ArrowUp') || keys.has('KeyW')) throttle = 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) throttle = -0.6;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) steer = 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) steer = -1;
  }

  const grip = onRoad ? 1 : 0.42;               // off-track is slow and vague
  const top = 44 * grip;
  speed += (throttle * 34 * grip - speed * (keys.has('Space') ? 2.4 : 0.75)) * dt;
  speed = Math.max(-12, Math.min(top, speed));
  heading += steer * dt * 1.9 * Math.min(1, Math.abs(speed) / 14) * Math.sign(speed || 1);

  pos.x += Math.sin(heading) * speed * dt;
  pos.z += Math.cos(heading) * speed * dt;
  kart.position.copy(pos);
  kart.rotation.y = heading;
  kart.rotation.z = -steer * Math.min(0.22, Math.abs(speed) / 220);

  const want = new THREE.Vector3(
    pos.x - Math.sin(heading) * chase.z, chase.y, pos.z - Math.cos(heading) * chase.z);
  camera.position.lerp(want, 0.12);
  camera.lookAt(pos.x + Math.sin(heading) * 8, 1.4, pos.z + Math.cos(heading) * 8);
  renderer.render(scene, camera);

  if (++frames >= 30) {
    const now = performance.now();
    fps = Math.round((frames * 1000) / (now - mark));
    frames = 0; mark = now;
    const cur = ((now - lapStart) / 1000).toFixed(1);
    hud(`LAP ${Math.min(lap, LAPS)}/${LAPS} · ${cur}s · BEST ${best ? best.toFixed(1) + 's' : '—'}`
      + ` · ${Math.round(Math.abs(speed) * 3.6)} km/h · ${onRoad ? 'on track' : 'OFF TRACK'} · ${fps} fps<br>`
      + (autopilot ? 'autopilot — press any arrow key to take over' : 'arrows / WASD to drive · SPACE to brake'));
  }
});
