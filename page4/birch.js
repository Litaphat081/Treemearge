import { generateBirch }                                  from './birchGen.js';
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

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
dirLight.position.set(5, 15, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// Procedural birch bark texture 
function makeBirchBarkTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, c.width, 0);
  g.addColorStop(0,    '#d6cdb6');
  g.addColorStop(0.5,  '#f1ead7');
  g.addColorStop(1,    '#d6cdb6');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 28; i++) {
    const px = Math.random() * c.width;
    const py = Math.random() * c.height;
    const r  = 25 + Math.random() * 55;
    const rg = x.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, 'rgba(176, 138, 90, ' + (0.06 + Math.random()*0.08) + ')');
    rg.addColorStop(1, 'rgba(176, 138, 90, 0)');
    x.fillStyle = rg;
    x.fillRect(px-r, py-r, r*2, r*2);
  }


  for (let i = 0; i < 18; i++) {
    const px = Math.random() * c.width;
    const py = Math.random() * c.height;
    const w  = 20 + Math.random() * 35;
    const h  = 4  + Math.random() * 8;
    x.fillStyle = 'rgba(72, 54, 36, ' + (0.18 + Math.random()*0.22) + ')';
    x.fillRect(px, py, w, h);
  }


  for (let i = 0; i < 480; i++) {
    const py  = Math.random() * c.height;
    const px  = Math.random() * c.width;
    const len = 8 + Math.random() * 42;
    const th  = 1 + Math.random() * 2.3;
    x.fillStyle = 'rgba(18, 12, 8, ' + (0.55 + Math.random()*0.42) + ')';
    x.fillRect(px, py, len, th);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 3);
  return tex;
}

// Materials 
const barkTex  = makeBirchBarkTexture();
const trunkMat = new THREE.MeshStandardMaterial({
  map: barkTex,
  color: 0xffffff,   
  roughness: 0.85,
});

const leafTex = new THREE.TextureLoader().load('pic/birch.png');
const leafMat = new THREE.MeshStandardMaterial({
  map: leafTex,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
  depthWrite: false,
});

let treeGroup = new THREE.Group();
scene.add(treeGroup);

// Build tree 
function buildTree(age) {
  const treeData = generateBirch(age, speciesData);
  const group    = new THREE.Group();

  const mesh = new THREE.Mesh(buildThreeGeometry(treeData, age), trunkMat);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);

  if (treeData.foliage.length > 0)
    group.add(buildThreeInstancedFoliage(treeData, leafMat, age, AGE_MAX, 0.9, 0.9));


  group.scale.setScalar(0.55);
  group.position.y = -12;
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
fetch('./birch.json')
  .then(r => r.json())
  .then(data => {
    speciesData = data;

    document.getElementById('tree-name').textContent      = data.commonName;
    document.getElementById('tree-species').textContent   = data.species;
    document.getElementById('tree-environment').innerHTML =
      'Temperate and boreal forests<br>Europe, Siberia, Asia Minor';
    document.getElementById('tree-description').textContent =
      'A graceful pioneer species recognised by its white papery bark and the ' +
      'horizontal black lenticels that scar its trunk. Silver birch lives up to ' +
      '150 years and is often the first tree to colonise disturbed ground — its ' +
      'leaves return nutrients to the soil and prepare the way for slower-growing forests.';

    AGE_MIN = data.age.min; AGE_MAX = data.age.max; AGE_UNIT = data.age.unit;
    slider.min = AGE_MIN; slider.max = AGE_MAX; slider.value = AGE_MIN;
    label.textContent = `${AGE_MIN} ${AGE_UNIT}`;

    const step = Math.floor((AGE_MAX - AGE_MIN + 1) / dots.length);
    stages = Array.from({length: dots.length}, (_, i) => ({
      min: AGE_MIN + i * step,
      max: i === dots.length-1 ? AGE_MAX : AGE_MIN + (i+1) * step - 1,
    }));
    setStage(0);
  })
  .catch(err => console.error('Failed to load birch.json:', err));