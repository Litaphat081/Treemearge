import { generateWillow }                                 from './willowGen.js';
import { buildThreeGeometry, buildThreeInstancedFoliage } from './threeAdapter.js';

const container = document.getElementById("viewer");
const slider    = document.getElementById("ageSlider");
const label     = document.getElementById("ageLabel");
const dots      = document.querySelectorAll(".stage-dots span");

let AGE_MIN, AGE_MAX, AGE_UNIT;
let stages=[], currentStage=0, speciesData=null;

// Scene 
const THREE  = window.THREE;
const scene  = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(55, container.clientWidth/container.clientHeight, 0.1, 200);
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.92));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.58);
dirLight.position.set(5, 15, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// Procedural willow bark 
function makeWillowBarkTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, c.width, 0);
  g.addColorStop(0,   '#4a3c28');
  g.addColorStop(0.5, '#6b5a3e');
  g.addColorStop(1,   '#4a3c28');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);


  for (let i = 0; i < 22; i++) {
    const px  = Math.random() * c.width;
    const len = 80 + Math.random() * 280;
    const py  = Math.random() * c.height;
    x.fillStyle = 'rgba(15,10,4,' + (0.40 + Math.random() * 0.45) + ')';
    x.fillRect(px, py, 1.2 + Math.random() * 2.5, len);
  }

  // Horizontal ridges
  for (let i = 0; i < 35; i++) {
    const py = Math.random() * c.height;
    const len = 15 + Math.random() * 60;
    x.fillStyle = 'rgba(15,10,4,' + (0.18 + Math.random() * 0.22) + ')';
    x.fillRect(Math.random() * c.width, py, len, 1.5 + Math.random() * 2);
  }

  // Slight moisture highlight 
  for (let i = 0; i < 14; i++) {
    const px = Math.random() * c.width;
    const py = Math.random() * c.height;
    const r  = 20 + Math.random() * 45;
    const rg = x.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, 'rgba(120, 100, 60, ' + (0.06 + Math.random() * 0.08) + ')');
    rg.addColorStop(1, 'rgba(120, 100, 60, 0)');
    x.fillStyle = rg;
    x.fillRect(px-r, py-r, r*2, r*2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 5);
  return tex;
}

// Materials 
const barkTex  = makeWillowBarkTexture();
const trunkMat = new THREE.MeshStandardMaterial({
  map: barkTex, color: 0xffffff, roughness: 0.93,
});

// Willow leaf
const leafTex = new THREE.TextureLoader().load('pic/willow.png');
const leafMat = new THREE.MeshStandardMaterial({
  map:         leafTex,
  transparent: true,
  alphaTest:   0.15,  
  side:        THREE.DoubleSide,
  depthWrite:  false,
});

let treeGroup = new THREE.Group();
scene.add(treeGroup);

// Build tree 
function buildTree(age) {
  const treeData = generateWillow(age, speciesData);
  const group    = new THREE.Group();

  const mesh = new THREE.Mesh(buildThreeGeometry(treeData, age), trunkMat);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);

  if (treeData.foliage.length > 0) {
    group.add(buildThreeInstancedFoliage(treeData, leafMat, age, AGE_MAX, 0.70, 1.2));
  }

  group.scale.setScalar(0.44);
  group.position.y = -11;
  return group;
}

function updateTree(age) {
  if (!speciesData) return;
  scene.remove(treeGroup);
  treeGroup.traverse(c => c.geometry?.dispose());
  treeGroup = buildTree(age);
  scene.add(treeGroup);
}

// UI 
function updateDots(idx) {
  dots.forEach(d => d.classList.remove('active'));
  dots[idx]?.classList.add('active');
}

function setStage(idx) {
  currentStage      = Math.max(0, Math.min(stages.length-1, idx));
  const age         = stages[currentStage].min;
  slider.value      = age;
  label.textContent = `${age} ${AGE_UNIT}`;
  updateTree(age);
  updateDots(currentStage);
}

slider.addEventListener('input', () => {
  const age = Number(slider.value);
  label.textContent = `${age} ${AGE_UNIT}`;
  updateTree(age);
});

window.addEventListener("scroll", () => {
  if (!stages.length || !speciesData) return;
  const progress   = Math.min(window.scrollY/(document.documentElement.scrollHeight-window.innerHeight), 1);
  const stageCount = stages.length;
  const stage      = Math.min(stageCount-1, Math.floor(progress*stageCount));
  if (progress >= 0.999) {
    slider.value=AGE_MAX; label.textContent=`${AGE_MAX} ${AGE_UNIT}`;
    updateTree(AGE_MAX); updateDots(stageCount-1); currentStage=stageCount-1;
  } else if (stage !== currentStage) setStage(stage);
});

window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth/container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

(function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); })();

// Load data
fetch('./willow.json')
  .then(r => r.json())
  .then(data => {
    speciesData = data;
    trunkMat.color.set(data.trunk.barkColor);

    document.getElementById('tree-name').textContent        = data.commonName;
    document.getElementById('tree-species').textContent     = data.species;
    document.getElementById('tree-environment').innerHTML   =
      'Riverbanks &amp; wetlands<br>China, widely cultivated worldwide';
    document.getElementById('tree-description').textContent =
      'The Weeping Willow is one of the most recognisable trees in the world, ' +
      'known for its long, cascading branches that sweep gracefully toward the ground. ' +
      'It thrives near water and grows rapidly, often reaching full height within 30 years. ' +
      'Its narrow leaves shimmer in the slightest breeze, giving it an unmistakable, ' +
      'melancholic beauty.';

    AGE_MIN=data.age.min; AGE_MAX=data.age.max; AGE_UNIT=data.age.unit;
    slider.min=AGE_MIN; slider.max=AGE_MAX; slider.value=AGE_MIN;
    label.textContent = `${AGE_MIN} ${AGE_UNIT}`;

    const step = Math.floor((AGE_MAX-AGE_MIN+1)/dots.length);
    stages = Array.from({length:dots.length}, (_,i) => ({
      min: AGE_MIN+i*step,
      max: i===dots.length-1 ? AGE_MAX : AGE_MIN+(i+1)*step-1,
    }));
    setStage(0);
  })
  .catch(err => console.error('Failed to load willow.json:', err));