/* ===============================
   DOM ELEMENTS
================================ */
const container = document.getElementById("viewer");
const slider = document.getElementById("ageSlider");
const label = document.getElementById("ageLabel");
const dots = document.querySelectorAll(".stage-dots span");

/* ===============================
   THREE.JS SETUP
================================ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.z = 6;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1));

/* ===============================
   TREE (PLACEHOLDER)
================================ */
const material = new THREE.MeshStandardMaterial({ color: 0x9ec981 });
const tree = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.3, 0.3),
  material
);
scene.add(tree);

// base position
tree.position.x = 0.05;
tree.position.y = -1.5;
let targetScale = new THREE.Vector3(0.5, 0.75, 0.5);

/* ===============================
   GROWTH LOGIC
================================ */
function updateTree(age) {
  let scale;

  if (age <= 20) scale = 0.5;
  else if (age <= 40) scale = 1;
  else if (age <= 60) scale = 1.5;
  else if (age <= 80) scale = 2;
  else {
    // 81 → 100
    const t = (age - 81) / 19; // 0 → 1
    scale = 2.5 + t * 0.3;
  }

  targetScale.set(scale, scale * 1.5, scale);

}

/* ===============================
   STAGES
================================ */
const stages = [
  { min: 1, max: 20 },
  { min: 21, max: 40 },
  { min: 41, max: 60 },
  { min: 61, max: 80 },
  { min: 81, max: 100 }
];

let currentStage = 0;

/* ===============================
   DOTS
================================ */
function updateDots(stageIndex) {
  dots.forEach(dot => dot.classList.remove("active"));
  if (dots[stageIndex]) dots[stageIndex].classList.add("active");
}

/* ===============================
   SET STAGE (CORE LOGIC)
================================ */
function setStage(stageIndex) {
  currentStage = Math.max(0, Math.min(4, stageIndex));

  const stage = stages[currentStage];
  const age = stage.min;

  slider.value = age;
  label.textContent = `${age} years`;

  updateTree(age);
  updateDots(currentStage);
}

/* ===============================
   SLIDER → TREE
================================ */
slider.addEventListener("input", () => {
  const age = Number(slider.value);
  label.textContent = `${age} years`;
  updateTree(age);
});

/* ===============================
   SCROLL → STAGE
================================ */
window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const maxScroll =
    document.documentElement.scrollHeight - window.innerHeight;

  const progress = Math.min(scrollTop / maxScroll, 1);

  // map scroll → stage (0–4)
  const stage = Math.min(4, Math.floor(progress * 5));

  if (progress >= 0.999) {
    slider.value = 100;
    label.textContent = "100 years";
    updateTree(100);
    updateDots(4);
    currentStage = 4;
  } else if (stage !== currentStage) {
    setStage(stage);
  }
});

/* ===============================
   RENDER LOOP
================================ */
function animate() {
  requestAnimationFrame(animate);
   // smooth scale animation
  tree.scale.lerp(targetScale, 0.08);
  renderer.render(scene, camera);
}
animate();

/* ===============================
   INIT
================================ */
updateTree(1);
updateDots(0);
