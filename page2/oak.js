import { createTree } from './createTree.js';

const container = document.getElementById("viewer");
const slider = document.getElementById("ageSlider");
const label = document.getElementById("ageLabel");
const dots = document.querySelectorAll(".stage-dots span");

let AGE_MIN;
let AGE_MAX;
let AGE_UNIT;

let stages = [];
let currentStage = 0;
let speciesData = null;

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(
  55,
  container.clientWidth / container.clientHeight,
  0.1,
  200
);
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setClearColor(0x000000, 0);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;

container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 15, 5);
dirLight.castShadow = true;
scene.add(dirLight);

const trunkMat = new THREE.MeshStandardMaterial({
  color: 0x4a3728,
  roughness: 0.9
});

const textureLoader = new THREE.TextureLoader();
const leafTexture = textureLoader.load('pic/leaf-oak.png');

const leafMat = new THREE.MeshStandardMaterial({
  map: leafTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
  depthWrite: false
});

let treeGroup = new THREE.Group();
scene.add(treeGroup);


/* ===============================
   DETERMINISTIC RNG
================================ */

function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}


/* ===============================
   LEAVES (SUBSET GROWTH)
   - age low = subset of age high
   - stable forever
================================ */

function createInstancedLeaves(positions, age) {

  // fixed seed = stable leaf order
  const rand = makeRNG(9999);

  // smooth growth curve
  const leafFactor = Math.max(0, Math.min(1, age / AGE_MAX));
  const smoothFactor = leafFactor * leafFactor;

  // max leaves at full maturity
  const maxLeafCount = Math.floor(positions.length * 5);

  // actual leaves count for this age
  const leafCount = Math.max(10, Math.floor(maxLeafCount * smoothFactor));

  const leafGeo = new THREE.PlaneGeometry(1.2, 1.2);
  const instMesh = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);

  const dummy = new THREE.Object3D();
  let idx = 0;

  // IMPORTANT:
  // We generate leaf candidates in a fixed deterministic order,
  // then we stop once idx reaches leafCount.
  for (let i = 0; i < positions.length; i++) {

    if (idx >= leafCount) break;

    const pos = positions[i];

    // always deterministic cluster count
    const clusterCount = 3 + Math.floor(rand() * 8);

    for (let k = 0; k < clusterCount; k++) {

      if (idx >= leafCount) break;

      const leafSize = 0.55 + rand() * (0.35 + smoothFactor * 0.9);

      dummy.position.copy(pos);

      // spread grows with age (young tree = tighter leaves)
      const spread = 0.2 + rand() * (0.5 + smoothFactor * 1.6);

      dummy.position.x += (rand() - 0.5) * spread;
      dummy.position.y += (rand() - 0.5) * spread * 0.65;
      dummy.position.z += (rand() - 0.5) * spread;

      dummy.rotation.set(
        (rand() - 0.5) * 1.5,
        rand() * Math.PI * 2,
        (rand() - 0.5) * 1.5
      );

      dummy.scale.set(leafSize, leafSize, leafSize);
      dummy.updateMatrix();

      instMesh.setMatrixAt(idx++, dummy.matrix);
    }
  }

  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}


/* ===============================
   BUILD TREE
================================ */

function buildTree(age) {

  const result = createTree(age, speciesData);
  const group = new THREE.Group();

  const trunkMesh = new THREE.Mesh(result.geometry, trunkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

  if (result.leafPositions && result.leafPositions.length > 0) {
    group.add(createInstancedLeaves(result.leafPositions, age));
  }

  const fixedScale = 0.4;
  group.scale.set(fixedScale, fixedScale, fixedScale);

  group.position.y = -12;

  return group;
}


/* ===============================
   UPDATE TREE
================================ */

function updateTree(age) {

  if (!speciesData) return;

  scene.remove(treeGroup);

  treeGroup.traverse(child => {
    if (child.geometry) child.geometry.dispose();
  });

  treeGroup = buildTree(age);
  scene.add(treeGroup);
}


/* ===============================
   UI
================================ */

function updateDots(idx) {
  dots.forEach(d => d.classList.remove('active'));
  if (dots[idx]) dots[idx].classList.add('active');
}

function setStage(idx) {

  currentStage = Math.max(0, Math.min(stages.length - 1, idx));

  const age = stages[currentStage].min;

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


/* ===============================
   SCROLL → STAGE
================================ */

window.addEventListener("scroll", () => {

  if (!stages.length || !speciesData) return;

  const progress = Math.min(
    window.scrollY /
    (document.documentElement.scrollHeight - window.innerHeight),
    1
  );

  const stageCount = stages.length;
  const stage = Math.min(stageCount - 1, Math.floor(progress * stageCount));

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


/* ===============================
   RESIZE
================================ */

window.addEventListener("resize", () => {

  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(container.clientWidth, container.clientHeight);

});


/* ===============================
   ANIMATION
================================ */

(function animate() {

  requestAnimationFrame(animate);
  renderer.render(scene, camera);

})();


/* ===============================
   LOAD DATA
================================ */

Promise.all([
  fetch('./oak-data.json').then(r => r.json()),
  fetch('./tree.json').then(r => r.json()),
])
.then(([oakData, treeData]) => {

  speciesData = oakData;

  trunkMat.color.set(oakData.trunk.barkColor);

  const oak = treeData.oak;

  document.getElementById('tree-name').textContent = oak.name;
  document.getElementById('tree-species').textContent = oak.species;
  document.getElementById('tree-environment').innerHTML =
    oak.environment.replace(/\n/g, '<br>');
  document.getElementById('tree-description').textContent =
    oak.description;

  AGE_MIN  = oakData.age.min;
  AGE_MAX  = oakData.age.max;
  AGE_UNIT = oakData.age.unit;

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
.catch(err => console.error('Failed to load data:', err));