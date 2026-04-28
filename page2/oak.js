/* ===============================
    DOM ELEMENTS & SETUP
================================ */
import { generateTreeParameters } from './createTree.js';

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

/* ===============================
    THREE.JS SETUP
================================ */
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.z = 10;

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

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2d6e1f, side: THREE.DoubleSide, roughness: 0.8 });

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
    TREE BUILDING FUNCTIONS
================================ */
function createInstancedLeaves(positions) {
    const leafCount = positions.length * 2;
    const leafGeo = new THREE.PlaneGeometry(0.6, 0.5);
    const instMesh = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
    const dummy = new THREE.Object3D();
    let idx = 0;

    for (const pos of positions) {
        for (let k = 0; k < 2; k++) {
            const leafSize = 0.8 + Math.random() * 0.4;
            dummy.position.copy(pos);
            dummy.rotation.set(
                (Math.random() - 0.5) * 1.2,
                k * Math.PI / 2 + Math.random() * 0.5,
                (Math.random() - 0.5) * 1.2
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
    // หมายเหตุ: ต้องมั่นใจว่าในไฟล์ createTree.js มีฟังก์ชัน createTree export ออกมาด้วย
    if (typeof createTree === "undefined") {
        console.warn("createTree function is not defined. Using placeholder logic.");
        return new THREE.Group(); 
    }

    const result = createTree(age, speciesData);
    const group  = new THREE.Group();

  const trunkMesh = new THREE.Mesh(result.geometry, trunkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

    if (result.leafPositions.length > 0) {
        group.add(createInstancedLeaves(result.leafPositions));
    }

    const fixedScale = 0.4; 
    group.scale.set(fixedScale, fixedScale, fixedScale);
    group.position.y = -5; // ล็อกฐานไว้ที่พื้น

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
    UI & STAGE CONTROL
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
    SCROLL LOGIC
================================ */
window.addEventListener('scroll', () => {
    if (!stages.length || !speciesData) return;
    const progress = Math.min(window.scrollY / (document.documentElement.scrollHeight - window.innerHeight), 1);
    const stageCount = stages.length;
    const stageIdx = Math.min(stageCount - 1, Math.floor(progress * stageCount));

    if (progress >= 0.999) {
        const age = AGE_MAX;
        slider.value = age;
        label.textContent = `${age} ${AGE_UNIT}`;
        updateTree(age);
        updateDots(stageCount - 1);
        currentStage = stageCount - 1;
    } else if (stageIdx !== currentStage) {
        setStage(stageIdx);
    }
});

/* ===============================
    ANIMATION & LOAD DATA
================================ */
(function animate() {
    requestAnimationFrame(animate);
    if (treeGroup) treeGroup.rotation.y += 0.002;
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