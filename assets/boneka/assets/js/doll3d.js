import * as THREE from './three.module.min.js';

/* ------------------------------------------------------------------ */
/*  Palette                                                            */
/* ------------------------------------------------------------------ */
const C = {
  skin:   0xfff1e5,
  cheek:  'rgba(255,76,146,1)',
  hair:   0x342852,
  dress:  0xa894e6,
  collar: 0xf6f1ff,
  shoe:   0xbcaaf0,
  eye:    0x241733,
  lip:    0xa64d5f,
  tongue: 0xe58a9c,
  bow:    0xf2a9be,
  halo:   0xcbb8ff,
};

const stage    = document.getElementById('doll-stage');
const canvasEl = document.getElementById('doll-canvas');
const fallback = document.getElementById('doll-fallback');
const hintEl   = document.getElementById('stage-hint');
const btn      = document.getElementById('wallpaper-btn');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
} catch (err) {
  canvasEl.hidden = true;
  if (hintEl) hintEl.hidden = true;
  fallback.hidden = false;
  if (btn) { btn.disabled = true; btn.textContent = '3D NOT SUPPORTED HERE'; }
  throw err;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 1.75, 7.0);
camera.lookAt(0, 1.05, 0);

/* ------------------------------------------------------------------ */
/*  Lights                                                             */
/* ------------------------------------------------------------------ */
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
scene.add(new THREE.HemisphereLight(0xf5edff, 0x594475, 0.68));

const key = new THREE.DirectionalLight(0xfff4e8, 1.25);
key.position.set(3, 5, 4);
scene.add(key);

const fill = new THREE.DirectionalLight(0xb7a8ff, 0.52);
fill.position.set(-4, 2, -3);
scene.add(fill);

const hairRim = new THREE.DirectionalLight(0xe6dcff, 0.82);
hairRim.position.set(-3, 4, -4);
scene.add(hairRim);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/** Capsule limb stretched between two points. */
function limb(from, to, radius, material) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = Math.max(dir.length() - radius * 2, 0.02);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 8, 16), material);
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  return mesh;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function heartGeometry(size) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.55, -0.5, 0.55, -0.5, 0.2);
  s.bezierCurveTo(-0.5, -0.15, 0, -0.3, 0, -0.55);
  s.bezierCurveTo(0, -0.3, 0.5, -0.15, 0.5, 0.2);
  s.bezierCurveTo(0.5, 0.55, 0, 0.55, 0, 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 3 });
  g.center();
  g.scale(size, size, size);
  return g;
}

function starGeometry(size) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.21;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2 });
  g.center();
  g.scale(size, size, size);
  return g;
}

/* ------------------------------------------------------------------ */
/*  The doll                                                           */
/* ------------------------------------------------------------------ */
const doll = new THREE.Group();
scene.add(doll);

const skinMat  = mat(C.skin, {
  roughness: 0.68,
  emissive: 0xffcdb2,
  emissiveIntensity: 0.18,
});
const hairMat  = mat(C.hair, {
  roughness: 0.58,
  emissive: 0x78649f,
  emissiveIntensity: 0.2,
});
const hairGlowMat = new THREE.MeshBasicMaterial({
  color: 0xbba9f0,
  transparent: true,
  opacity: 0.16,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const dressMat = mat(C.dress, {
  transparent: false,
  opacity: 1,
  depthWrite: true,
  depthTest: true,
  side: THREE.DoubleSide,
  roughness: 0.72,
  emissive: 0x6f5aae,
  emissiveIntensity: 0.2,
});

const HEAD_Y = 1.5;   // lower head + shorter body = chunkier chibi ratio
const HEAD_R = 0.98;

/* --- head group: everything on it tilts together, cutely --- */
const headGroup = new THREE.Group();
headGroup.position.y = HEAD_Y;
doll.add(headGroup);

const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 48, 32), skinMat);
headGroup.add(head);

/* hair: cap + back curtain + side strands + curly ahoge + bow */
const hairCap = new THREE.Mesh(
  new THREE.SphereGeometry(HEAD_R * 1.09, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairMat
);
hairCap.position.y = 0.02;
hairCap.rotation.x = -0.22;
headGroup.add(hairCap);

const hairCapGlow = new THREE.Mesh(hairCap.geometry, hairGlowMat);
hairCapGlow.position.copy(hairCap.position);
hairCapGlow.rotation.copy(hairCap.rotation);
hairCapGlow.scale.setScalar(1.035);
headGroup.add(hairCapGlow);

const hairBack = new THREE.Mesh(
  new THREE.SphereGeometry(HEAD_R * 1.06, 48, 32, 0, Math.PI, 0, Math.PI * 0.82),
  hairMat
);
hairBack.position.y = 0.02;
hairBack.rotation.y = Math.PI;
headGroup.add(hairBack);

const hairBackGlow = new THREE.Mesh(hairBack.geometry, hairGlowMat);
hairBackGlow.position.copy(hairBack.position);
hairBackGlow.rotation.copy(hairBack.rotation);
hairBackGlow.scale.setScalar(1.04);
headGroup.add(hairBackGlow);

for (const s of [-1, 1]) {
  headGroup.add(limb([s * 0.95, -0.05, 0.12], [s * 1.0, -0.66, 0.16], 0.15, hairMat));
}

/* curly two-segment ahoge */
headGroup.add(limb([0.0, 1.02, 0], [0.14, 1.3, 0.05], 0.045, hairMat));
headGroup.add(limb([0.14, 1.3, 0.05], [0.02, 1.42, 0.1], 0.038, hairMat));

/* hair bow (her left, viewer right) */
{
  const bow = new THREE.Group();
  const bowMat = mat(C.bow, { roughness: 0.5, emissive: C.bow, emissiveIntensity: 0.15 });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), bowMat);
  bow.add(knot);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.26, 20), bowMat);
    wing.rotation.z = s * Math.PI / 2;      // apex points toward the knot
    wing.rotation.x = 0.1 * s;
    wing.position.x = s * 0.155;
    wing.scale.z = 0.55;                    // flatten
    bow.add(wing);
  }
  const n = new THREE.Vector3(0.62, 0.58, 0.44).normalize();
  bow.position.copy(n).multiplyScalar(HEAD_R * 1.1);
  bow.quaternion.setFromUnitVectors(FWD, n);
  headGroup.add(bow);
}

/* face — positions relative to head center, sitting on the sphere */
function onHead(x, yOff, push = 1) {
  const z = Math.sqrt(Math.max(HEAD_R * HEAD_R - x * x - yOff * yOff, 0.01));
  return new THREE.Vector3(x, yOff, z * push);
}

/** Orient a flat mesh so it faces outward along the head normal. */
function faceOutward(mesh) {
  const n = mesh.position.clone().normalize();
  mesh.quaternion.setFromUnitVectors(FWD, n);
}

/* big sparkly blinking eyes — grouped so highlights blink too */
const eyeGroups = [];
for (const s of [-1, 1]) {
  const g = new THREE.Group();
  g.position.copy(onHead(s * 0.37, -0.02, 0.97));

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 24), mat(C.eye, { roughness: 0.3 }));
  eye.scale.set(1, 1.5, 0.5);
  g.add(eye);

  const hi = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), mat(0xffffff, { roughness: 0.2 }));
  hi.position.set(s * -0.035, 0.075, 0.1);
  g.add(hi);

  const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), mat(0xffffff, { roughness: 0.2 }));
  hi2.position.set(s * 0.05, -0.07, 0.1);
  g.add(hi2);

  headGroup.add(g);
  eyeGroups.push(g);
}

/* soft gradient blush */
for (const s of [-1, 1]) {
  const blush = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.23),
    new THREE.MeshBasicMaterial({
      map: radialTexture(C.cheek, 'rgba(255,76,146,0)'),
      transparent: true,
      depthWrite: false,
    })
  );
  blush.position.copy(onHead(s * 0.58, -0.24, 1.01));
  faceOutward(blush);
  headGroup.add(blush);
}

/* open happy mouth: dark half-disc + little tongue */
{
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.115, 28, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: C.lip })
  );
  mouth.position.copy(onHead(0, -0.3, 1.005));
  faceOutward(mouth);
  headGroup.add(mouth);

  const tongue = new THREE.Mesh(
    new THREE.CircleGeometry(0.062, 20, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: C.tongue })
  );
  tongue.position.copy(onHead(0, -0.315, 1.012));
  faceOutward(tongue);
  headGroup.add(tongue);
}

/* --- body: squat bell dress, chubby limbs --- */
const profile = [
  [0.001, 0.96], [0.30, 0.94], [0.40, 0.80], [0.50, 0.58],
  [0.64, 0.32], [0.80, 0.10], [0.84, 0.04], [0.84, 0.0], [0.001, 0.0],
].map(([x, y]) => new THREE.Vector2(x, y));
const dress = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), dressMat);
doll.add(dress);

const hem = new THREE.Mesh(new THREE.TorusGeometry(0.825, 0.038, 12, 48), mat(0xe4d9ff));
hem.rotation.x = Math.PI / 2;
hem.position.y = 0.05;
doll.add(hem);

const collar = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 16, 48), mat(C.collar));
collar.rotation.x = Math.PI / 2;
collar.position.y = 0.92;
doll.add(collar);

/* little heart on her chest */
{
  const chestHeart = new THREE.Mesh(
    heartGeometry(0.28),
    mat(C.bow, { roughness: 0.5, emissive: C.bow, emissiveIntensity: 0.2 })
  );
  chestHeart.position.set(0, 0.50, 0.57);
  chestHeart.rotation.x = -0.28; // follow the slope of the dress
  chestHeart.scale.z = 0.5;
  doll.add(chestHeart);
}

/* stubby arms + bigger hands */
for (const s of [-1, 1]) {
  doll.add(limb([s * 0.38, 0.78, 0.14], [s * 0.28, 0.42, 0.52], 0.10, skinMat));
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 20), skinMat);
  hand.position.set(s * 0.28, 0.4, 0.55);
  doll.add(hand);
}

/* Cream legs rest horizontally on the ground with shoes at the tips. */
const shoeMat = mat(C.shoe, { roughness: 0.68 });
for (const s of [-1, 1]) {
  doll.add(limb([s * 0.27, 0.09, 0.66], [s * 0.33, 0.09, 0.92], 0.11, skinMat));
  const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 20), shoeMat);
  shoe.scale.set(1, 0.8, 1.16);
  shoe.position.set(s * 0.34, 0.09, 1.02);
  doll.add(shoe);
}

/* halo behind the head (doesn't tilt with the head — it's a halo) */
const halo = new THREE.Mesh(
  new THREE.TorusGeometry(1.58, 0.018, 12, 96),
  new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
);
const haloSoft = new THREE.Mesh(
  new THREE.TorusGeometry(1.58, 0.07, 12, 96),
  new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
);
const haloGroup = new THREE.Group();
haloGroup.add(halo, haloSoft);
haloGroup.position.set(0, HEAD_Y, -0.55);
doll.add(haloGroup);

/* soft ground shadow (outside the doll group so it never tilts) */
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(1.2, 48),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(10,7,26,0.4)', 'rgba(10,7,26,0)'),
    transparent: true,
    depthWrite: false,
  })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(0, 0.005, 0.15);
scene.add(shadow);

/* ------------------------------------------------------------------ */
/*  Floating decorations                                               */
/* ------------------------------------------------------------------ */
const decorColors = [0xf2a9be, 0xffd9a0, 0xa9e8d8, 0xcbb8ff, 0xf5c8dc];
const decor = new THREE.Group();
scene.add(decor);
const decorItems = [];

const spots = [
  [-2.5, 2.6, -1.2], [2.6, 2.9, -1.0], [-3.0, 1.2, 0.4], [3.1, 1.5, 0.2],
  [-2.0, 3.4, 0.8], [2.1, 0.6, 1.4], [-2.7, 0.5, 1.2], [2.8, 3.5, -0.6],
  [-1.6, 4.0, -1.8], [1.7, 4.2, -1.6], [-3.4, 2.2, -1.8], [3.4, 2.0, -2.0],
];

spots.forEach((p, i) => {
  const isHeart = i % 2 === 0;
  const size = 0.28 + (i % 3) * 0.07;
  const color = decorColors[i % decorColors.length];
  const m = new THREE.Mesh(
    isHeart ? heartGeometry(size) : starGeometry(size),
    mat(color, { roughness: 0.55, emissive: color, emissiveIntensity: 0.28 })
  );
  m.position.set(...p);
  m.rotation.set(Math.random() * 0.5 - 0.25, Math.random() * Math.PI, Math.random() * 0.4 - 0.2);
  decor.add(m);
  decorItems.push({ mesh: m, baseY: p[1], phase: i * 1.7, speed: 0.6 + (i % 4) * 0.12 });
});

/* sparkle dust */
const sparkleCount = 70;
const sparklePos = new Float32Array(sparkleCount * 3);
for (let i = 0; i < sparkleCount; i++) {
  const r = 2.4 + Math.random() * 2.4;
  const a = Math.random() * Math.PI * 2;
  const y = Math.random() * 4.6 - 0.2;
  sparklePos[i * 3] = Math.cos(a) * r;
  sparklePos[i * 3 + 1] = y;
  sparklePos[i * 3 + 2] = Math.sin(a) * r - 0.5;
}
const sparkleGeo = new THREE.BufferGeometry();
sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
const sparkles = new THREE.Points(
  sparkleGeo,
  new THREE.PointsMaterial({
    size: 0.07,
    map: radialTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'),
    color: 0xe9dfff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
);
scene.add(sparkles);

/* ------------------------------------------------------------------ */
/*  Interaction: drag to spin                                          */
/* ------------------------------------------------------------------ */
let dragging = false;
let px = 0, py = 0;
let rotY = 0, rotX = 0, velY = 0;
let lastInteract = -10;
let hintHidden = false;

stage.addEventListener('pointerdown', (e) => {
  dragging = true;
  px = e.clientX; py = e.clientY;
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('grabbing');
  if (!hintHidden && hintEl) { hintEl.classList.add('fade-out'); hintHidden = true; }
});

stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - px;
  const dy = e.clientY - py;
  px = e.clientX; py = e.clientY;
  rotY += dx * 0.011;
  rotX = THREE.MathUtils.clamp(rotX + dy * 0.005, -0.3, 0.35);
  velY = dx * 0.011;
  lastInteract = clock.getElapsedTime();
});

const endDrag = () => { dragging = false; stage.classList.remove('grabbing'); };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

/* ------------------------------------------------------------------ */
/*  Wallpaper export (1920x1080 PNG of the live scene)                 */
/* ------------------------------------------------------------------ */
function wallpaperBackground() {
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, 1080);
  grad.addColorStop(0, '#3a2d5d');
  grad.addColorStop(0.55, '#2d214a');
  grad.addColorStop(1, '#211832');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1920, 1080);

  const glow = g.createRadialGradient(960, 520, 60, 960, 520, 700);
  glow.addColorStop(0, 'rgba(219,205,255,0.42)');
  glow.addColorStop(0.5, 'rgba(242,169,190,0.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1920, 1080);

  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 1920;
    const y = Math.random() * 1080;
    const r = Math.random() * 1.8 + 0.4;
    g.globalAlpha = Math.random() * 0.6 + 0.15;
    g.fillStyle = Math.random() > 0.8 ? '#f5c8dc' : '#e9dfff';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function downloadWallpaper() {
  const W = 1920, H = 1080;
  const prevPR = renderer.getPixelRatio();
  const bg = wallpaperBackground();

  scene.background = bg;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  const a = document.createElement('a');
  a.download = 'maeghan-tiny-friend-wallpaper.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();

  scene.background = null;
  bg.dispose();
  renderer.setPixelRatio(prevPR);
  resize();
}
if (btn) btn.addEventListener('click', downloadWallpaper);

/* ------------------------------------------------------------------ */
/*  Resize + render loop                                               */
/* ------------------------------------------------------------------ */
function resize() {
  const w = stage.clientWidth || 1;
  const h = stage.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

const clock = new THREE.Clock();

/* blinking */
let blinkStart = -1;
let nextBlink = 2.2;
const BLINK_DUR = 0.22;

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (!dragging) {
    rotY += velY;
    velY *= 0.94;
    if (!reduceMotion && t - lastInteract > 3) rotY += 0.0035; // gentle idle spin
  }

  const sway  = reduceMotion ? 0 : Math.sin(t * 0.6) * 0.05;
  const bob   = reduceMotion ? 0 : Math.sin(t * 1.3) * 0.05 + 0.05;
  doll.rotation.y = rotY + sway;
  doll.rotation.x = rotX;
  doll.position.y = bob;
  shadow.scale.setScalar(1 - bob * 0.25);

  /* cute head tilt */
  headGroup.rotation.z = reduceMotion ? 0.06 : 0.06 + Math.sin(t * 0.8) * 0.045;

  /* blink: eyes (with highlights) squish shut and reopen */
  if (!reduceMotion) {
    if (t > nextBlink) {
      blinkStart = t;
      nextBlink = t + 2.6 + Math.random() * 2.6;
      if (Math.random() < 0.18) nextBlink = t + 0.35; // occasional double blink
    }
    const bt = t - blinkStart;
    let eyeY = 1;
    if (bt >= 0 && bt < BLINK_DUR) {
      eyeY = Math.max(0.07, Math.abs(Math.cos((bt / BLINK_DUR) * Math.PI)));
    }
    for (const g of eyeGroups) g.scale.y = eyeY;
  }

  halo.material.opacity     = 0.6 + Math.sin(t * 1.6) * 0.15;
  haloSoft.material.opacity = 0.13 + Math.sin(t * 1.6) * 0.05;

  if (!reduceMotion) {
    for (const d of decorItems) {
      d.mesh.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 0.22;
      d.mesh.rotation.y += 0.004;
    }
    sparkles.material.opacity = 0.65 + Math.sin(t * 2.1) * 0.25;
    sparkles.rotation.y = t * 0.02;
  }

  renderer.render(scene, camera);
}
animate();
