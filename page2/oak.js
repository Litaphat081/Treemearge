/* ===============================
   DOM ELEMENTS
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

/* ===============================
   THREE.JS SETUP
================================ */
const scene = new THREE.Scene();
scene.background = null;   // เอาพื้นหลังดำออก

const camera = new THREE.PerspectiveCamera(
  55,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true   // ทำให้พื้นหลังโปร่งใส
});

renderer.setClearColor(0x000000, 0);  // 0 = โปร่งใส
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1));

/* ===============================
   TREE (PLACEHOLDER)
================================ */
// กลุ่มต้นไม้
let treeGroup = new THREE.Group();
scene.add(treeGroup);
treeGroup.position.y = -1;

function buildTree(age) {
  scene.remove(treeGroup);
  treeGroup = new THREE.Group();
  scene.add(treeGroup);
  treeGroup.position.y = -1;

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5016 });

  const progress = Math.max(0, Math.min(1, (age - AGE_MIN) / (AGE_MAX - AGE_MIN)));

  // === ระยะที่ 1: ท่อนไม้เล็กๆ (0-15%) ===
  if (progress < 0.15) {
    const stumpHeight = 0.3 + progress * 3;
    const stumpRadius = 0.15;
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(stumpRadius, stumpRadius * 1.2, stumpHeight, 8),
      trunkMaterial
    );
    stump.position.y = stumpHeight / 2 - 3;
    treeGroup.add(stump);
    return;
  }

  // === ระยะที่ 2+: มีลำต้นและกิ่ง ===
  const baseHeight = 0.8 + (progress - 0.15) * 2.5;
  const baseRadius = 0.15;
  const maxDepth = Math.floor(progress * 4); // 0-4 ชั้น

  // เริ่มสร้างต้นไม้แบบ recursive
  createBranch(
    new THREE.Vector3(0, -3, 0),
    new THREE.Vector3(0, 1, 0),
    baseHeight,
    baseRadius,
    0,
    maxDepth,
    progress
  );

  // === ฟังก์ชันสร้างกิ่งแบบ recursive ===
  function createBranch(startPos, direction, length, radius, depth, maxDepth, prog) {
    if (depth > maxDepth) return;

    const endPos = startPos.clone().add(direction.clone().multiplyScalar(length));

    // สร้างกิ่ง
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.7, radius, length, 8),
      trunkMaterial
    );

    branch.position.copy(startPos).add(direction.clone().multiplyScalar(length / 2));

    // หมุนกิ่งให้ชี้ถูกทิศทาง
    const axis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const angle = Math.acos(new THREE.Vector3(0, 1, 0).dot(direction.normalize()));
    if (axis.length() > 0) {
      branch.quaternion.setFromAxisAngle(axis, angle);
    }

    treeGroup.add(branch);

    // ถ้าเป็นปลายสุด → สร้างใบ
    if (depth === maxDepth || prog < 0.3) {
      if (prog >= 0.25) { // เริ่มมีใบที่ progress > 25%
        const leafSize = 0.25 + Math.random() * 0.15;
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(leafSize, 8, 8),
          leafMaterial
        );
        leaf.position.copy(endPos);
        treeGroup.add(leaf);
      }
      return;
    }

    // === สร้างกิ่งย่อย ===
    const numBranches = depth === 0 ? 2 : (prog > 0.6 ? 3 : 2);
    const angleSpread = Math.PI / 4 + Math.random() * Math.PI / 8;

    for (let i = 0; i < numBranches; i++) {
      const rotationAngle = (Math.PI * 2 * i) / numBranches + (Math.random() - 0.5) * 0.5;
      const newDirection = direction.clone();

      // หมุนออกด้านข้าง
      const rotAxis = new THREE.Vector3(
        Math.cos(rotationAngle),
        0,
        Math.sin(rotationAngle)
      ).normalize();
      
      newDirection.applyAxisAngle(rotAxis, angleSpread);
      newDirection.normalize();

      const newLength = length * (0.6 + Math.random() * 0.15);
      const newRadius = radius * 0.7;

      createBranch(endPos, newDirection, newLength, newRadius, depth + 1, maxDepth, prog);
    }
  }
}






/* ===============================
   GROWTH LOGIC
================================ */
function updateTree(age) {
  buildTree(age);
}


/* ===============================
   DOTS
================================ */
function updateDots(stageIndex) {
  dots.forEach(dot => dot.classList.remove("active"));
  if (dots[stageIndex]) dots[stageIndex].classList.add("active");
}

/* ===============================
   SET STAGE
================================ */
function setStage(stageIndex) {
  const lastStage = stages.length - 1;
  currentStage = Math.max(0, Math.min(lastStage, stageIndex));

  const stage = stages[currentStage];
  const age = stage.min;

  slider.value = age;
  label.textContent = `${age} ${AGE_UNIT}`;

  updateTree(age);
  updateDots(currentStage);
}

/* ===============================
   SLIDER → TREE
================================ */
slider.addEventListener("input", () => {
  const age = Number(slider.value);
  label.textContent = `${age} ${AGE_UNIT}`;
  updateTree(age);
});

/* ===============================
   SCROLL → STAGE
================================ */
window.addEventListener("scroll", () => {
  if (!stages.length) return;

  const scrollTop = window.scrollY;
  const maxScroll =
    document.documentElement.scrollHeight - window.innerHeight;

  const progress = Math.min(scrollTop / maxScroll, 1);

  const stageCount = stages.length;
  const stage = Math.min(
    stageCount - 1,
    Math.floor(progress * stageCount)
  );

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
   RENDER LOOP
================================ */
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();



/* ===============================
   LOAD DATA
================================ */
fetch("../web/tree.json")
  .then(res => res.json())
  .then(data => {
    const oak = data.oak;

    // TEXT INFO
    document.getElementById("tree-name").textContent = oak.name;
    document.getElementById("tree-species").textContent = oak.species;
    document.getElementById("tree-environment").innerHTML =
      oak.environment.replace(/\n/g, "<br>");
    document.getElementById("tree-description").textContent =
      oak.description;

    // AGE CONFIG
    AGE_MIN = oak.age.min;
    AGE_MAX = oak.age.max;
    AGE_UNIT = oak.age.unit;

    slider.min = AGE_MIN;
    slider.max = AGE_MAX;
    slider.value = AGE_MIN;
    label.textContent = `${AGE_MIN} ${AGE_UNIT}`;

    // BUILD STAGES (5 stages)
    const stageCount = dots.length;
    const range = AGE_MAX - AGE_MIN + 1;
    const step = Math.floor(range / stageCount);

    stages = [];
    for (let i = 0; i < stageCount; i++) {
      const min = AGE_MIN + i * step;
      const max =
        i === stageCount - 1
          ? AGE_MAX
          : min + step - 1;
      stages.push({ min, max });
    }

    // INIT
    setStage(0);
    updateTree(AGE_MIN);
    updateDots(0);
  });
