import { createTree } from './createTree.js';

const container = document.getElementById("viewer");
const slider    = document.getElementById("ageSlider");
const label     = document.getElementById("ageLabel");
const dots      = document.querySelectorAll(".stage-dots span");

let AGE_MIN;
let AGE_MAX;
let AGE_UNIT;

let stages       = [];
let currentStage = 0;
let speciesData  = null;

/* ── Scene ──────────────────────────────────────────────────────────── */
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(
  55,
  container.clientWidth / container.clientHeight,
  0.1,
  200
);
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
dirLight.position.set(5, 15, 5);
dirLight.castShadow = true;
scene.add(dirLight);

/* ── Materials ──────────────────────────────────────────────────────── */
const trunkMat = new THREE.MeshStandardMaterial({
  color: 0x7a5230,
  roughness: 0.95
});

const textureLoader = new THREE.TextureLoader();

// needle texture — a small sprig/needle sprite
// falls back gracefully if file missing
const needleTexture = textureLoader.load('pic/pine.png');

const needleMat = new THREE.MeshStandardMaterial({
  map:         needleTexture,
  transparent: true,
  alphaTest:   0.45,
  side:        THREE.DoubleSide,
  depthWrite:  false,
  color:       0x2d5a1b    // deep pine green tint
});

let treeGroup = new THREE.Group();
scene.add(treeGroup);

/* ── RNG (for leaves — same pattern as oak.js) ───────────────────────── */
function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

/* ── Needle clusters (instanced) ────────────────────────────────────────
   Pine needles are smaller and more elongated than oak leaves.
   We use a tall narrow plane (0.5 × 1.4) to simulate needle sprigs.
   Orientation aligns outward from branch.
─────────────────────────────────────────────────────────────────────── */
function createInstancedNeedles(positions, age) {

  const rand        = makeRNG(7777);
  const needleFactor = Math.max(0, Math.min(1, age / AGE_MAX));
  const smoothFactor = needleFactor * needleFactor;

  // pine is denser in needles per cluster but smaller spread
  const maxNeedleCount = Math.floor(positions.length * 4);
  const needleCount    = Math.max(5, Math.floor(maxNeedleCount * smoothFactor));

  // narrow tall plane = needle sprig silhouette
  const needleGeo  = new THREE.PlaneGeometry(0.55, 1.4);
  const instMesh   = new THREE.InstancedMesh(needleGeo, needleMat, needleCount);

  const dummy = new THREE.Object3D();
  let idx     = 0;

  for (let i = 0; i < positions.length; i++) {
    if (idx >= needleCount) break;

    const pos          = positions[i];
    const clusterCount = 2 + Math.floor(rand() * 6);

    for (let k = 0; k < clusterCount; k++) {
      if (idx >= needleCount) break;

      // needle sprigs are smaller than oak leaves
      const needleSize = 0.40 + rand() * (0.25 + smoothFactor * 0.55);

      dummy.position.copy(pos);

      // tight spread — pine needles hug the branch
      const spread = 0.12 + rand() * (0.22 + smoothFactor * 0.55);
      dummy.position.x += (rand() - 0.5) * spread;
      dummy.position.y += (rand() - 0.5) * spread * 0.5;
      dummy.position.z += (rand() - 0.5) * spread;

      // needles have varied rotation but tend outward
      dummy.rotation.set(
        (rand() - 0.5) * 1.2,
        rand() * Math.PI * 2,
        (rand() - 0.5) * 1.0
      );

      dummy.scale.set(needleSize, needleSize, needleSize);
      dummy.updateMatrix();

      instMesh.setMatrixAt(idx++, dummy.matrix);
    }
  }

  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}

/* ── Build tree ─────────────────────────────────────────────────────── */
function buildTree(age) {

  const result = createTree(age, speciesData);
  const group  = new THREE.Group();

  const trunkMesh = new THREE.Mesh(result.geometry, trunkMat);
  trunkMesh.castShadow    = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

  if (result.leafPositions && result.leafPositions.length > 0) {
    group.add(createInstancedNeedles(result.leafPositions, age));
  }

  // pine is taller and narrower — scale similarly to oak
  const fixedScale = 0.4;
  group.scale.set(fixedScale, fixedScale, fixedScale);
  group.position.y = -12;

  return group;
}

/* ── Update tree ────────────────────────────────────────────────────── */
function updateTree(age) {
  if (!speciesData) return;

  scene.remove(treeGroup);
  treeGroup.traverse(child => {
    if (child.geometry) child.geometry.dispose();
  });

  treeGroup = buildTree(age);
  scene.add(treeGroup);
}

/* ── UI ─────────────────────────────────────────────────────────────── */
function updateDots(idx) {
  dots.forEach(d => d.classList.remove('active'));
  if (dots[idx]) dots[idx].classList.add('active');
}

function setStage(idx) {
  currentStage = Math.max(0, Math.min(stages.length - 1, idx));
  const age    = stages[currentStage].min;
  slider.value = age;
  label.textContent = `${age} ${AGE_UNIT}`;
  updateTree(age);
  updateDots(currentStage);
}

slider.addEventListener('input', () => {
  const age = Number(slider.value);
  label.textContent = `${age} ${AGE_UNIT}`;
  updateTree(age);
});

/* ── Scroll → stage ─────────────────────────────────────────────────── */
window.addEventListener("scroll", () => {
  if (!stages.length || !speciesData) return;

  const progress = Math.min(
    window.scrollY / (document.documentElement.scrollHeight - window.innerHeight),
    1
  );

  const stageCount = stages.length;
  const stage      = Math.min(stageCount - 1, Math.floor(progress * stageCount));

  if (progress >= 0.999) {
    slider.value = AGE_MAX;
    label.textContent = `${AGE_MAX} ${AGE_UNIT}`;
    updateTree(AGE_MAX);
    const lastStage = stageCount - 1;
    updateDots(lastStage);
    currentStage = lastStage;
  } else if (stage !== currentStage) {
    setStage(stage);
  }
});

/* ── Resize ─────────────────────────────────────────────────────────── */
window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

/* ── Animation loop ─────────────────────────────────────────────────── */
(function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
})();

/* ── Load data ──────────────────────────────────────────────────────── */
Promise.all([
  fetch('./pine-data.json').then(r => r.json()),
  fetch('./tree.json').then(r => r.json()),
])
.then(([pineData, treeData]) => {

  speciesData = pineData;
  trunkMat.color.set(pineData.trunk.barkColor);

  const pine = treeData.pine;
  document.getElementById('tree-name').textContent        = pine.name;
  document.getElementById('tree-species').textContent     = pine.species;
  document.getElementById('tree-environment').innerHTML   =
    pine.environment.replace(/\n/g, '<br>');
  document.getElementById('tree-description').textContent = pine.description;

  AGE_MIN  = pineData.age.min;
  AGE_MAX  = pineData.age.max;
  AGE_UNIT = pineData.age.unit;

  slider.min   = AGE_MIN;
  slider.max   = AGE_MAX;
  slider.value = AGE_MIN;
  label.textContent = `${AGE_MIN} ${AGE_UNIT}`;

  const step = Math.floor((AGE_MAX - AGE_MIN + 1) / dots.length);
  stages = Array.from({ length: dots.length }, (_, i) => ({
    min: AGE_MIN + i * step,
    max: i === dots.length - 1
      ? AGE_MAX
      : AGE_MIN + (i + 1) * step - 1,
  }));

  setStage(0);
})
.catch(err => console.error('Failed to load pine data:', err));