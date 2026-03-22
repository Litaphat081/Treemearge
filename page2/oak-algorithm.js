import {createTree, Branch} from "./createTree.js"

/* ===============================
DOM
================================ */

const container = document.getElementById("viewer")
const slider = document.getElementById("ageSlider")
const label = document.getElementById("ageLabel")

/* ===============================
THREE (โปร่งใส)
================================ */

const scene = new THREE.Scene()
scene.background = null   // ✅ เอาพื้นดำออก

const camera = new THREE.PerspectiveCamera(
45,
container.clientWidth/container.clientHeight,
0.1,
200
)

camera.position.set(0,6,14)

const renderer = new THREE.WebGLRenderer({
  antialias:true,
  alpha:true   // ✅ สำคัญมาก
})

renderer.setSize(container.clientWidth,container.clientHeight)
renderer.setClearColor(0x000000,0) // ✅ โปร่งใส

container.appendChild(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff,0.9))

const light = new THREE.DirectionalLight(0xffffff,1)
light.position.set(5,10,5)
scene.add(light)

/* ===============================
MATERIAL
================================ */

const trunkMaterial = new THREE.MeshStandardMaterial({
  color:0x5c3a21
})

const leafMaterial = new THREE.MeshStandardMaterial({
  color:0x2d6e1f,
  side:THREE.DoubleSide
})

/* ===============================
TREE (FRACTAL OAK)
================================ */

let treeMesh = new THREE.Group()
scene.add(treeMesh)

function addLeaves(group,pos){

  for(let i=0;i<30;i++){

    const offset = new THREE.Vector3(
      (Math.random()-0.5)*0.6,
      (Math.random()-0.5)*0.4,
      (Math.random()-0.5)*0.6
    )

    const geo = new THREE.PlaneGeometry(0.25,0.15)
    const mesh = new THREE.Mesh(geo,leafMaterial)

    mesh.position.copy(pos.clone().add(offset))
    mesh.lookAt(pos)

    group.add(mesh)
  }
}

function generateBranch(parent, depth, maxDepth, length, radius, group){

  if(depth > maxDepth) return

  const start = parent.position
  const dir = parent.direction

  const end = start.clone().add(
    dir.clone().multiplyScalar(length)
  )

  const mid = start.clone().add(end).multiplyScalar(0.5)

  const geo = new THREE.CylinderGeometry(
    radius*0.7,
    radius,
    length,
    6
  )

  const mesh = new THREE.Mesh(geo,trunkMaterial)

  mesh.position.copy(mid)
  mesh.lookAt(end)
  mesh.rotateX(Math.PI/2)

  group.add(mesh)

  // 🌿 ใบ
  if(depth === maxDepth){
    addLeaves(group,end)
    return
  }

  // 🌳 แตกกิ่งแบบ oak
  const branchCount = 2

  for(let i=0;i<branchCount;i++){

    const axis = new THREE.Vector3(
      Math.random()-0.5,
      Math.random()*0.3,
      Math.random()-0.5
    ).normalize()

    const angle = THREE.MathUtils.degToRad(
      35 + Math.random()*25
    )

    const newDir = dir.clone().applyAxisAngle(axis,angle)

    // gravity
    newDir.y -= 0.08

    newDir.normalize()

    const child = {
      position:end,
      direction:newDir
    }

    generateBranch(
      child,
      depth+1,
      maxDepth,
      length*0.75,
      radius*0.75,
      group
    )
  }
}

/* ===============================
BUILD
================================ */

function buildTree(age) {
  const group = new THREE.Group();

  // 🌱 กรณีอายุ 0: สร้างเป็นเมล็ด/ต้นกล้าจิ๋ว
  if (age === 0) {
    const seedGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const seed = new THREE.Mesh(seedGeo, trunkMaterial);
    seed.position.y = 0.05; // ให้ลอยเหนือพื้นนิดหน่อย
    group.add(seed);
    return group;
  }

  const root = {
    position: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 1, 0)
  };

  // 📈 คำนวณการเติบโตตามอายุ
  // ความลึกของกิ่ง (Max Depth): ยิ่งแก่ยิ่งกิ่งเยอะ
  const maxDepth = Math.min(Math.floor(age / 15), 5); 
  
  // ความยาวกิ่ง (Length): ต้นเล็กกิ่งจะสั้น ต้นใหญ่กิ่งจะยาว
  const dynamicLength = 0.5 + (Math.min(age, 60) / 60) * 2; 
  
  // ความหนาของลำต้น (Radius)
  const dynamicRadius = 0.05 + (Math.min(age, 100) / 100) * 0.3;

  generateBranch(
    root,
    0,
    maxDepth,
    dynamicLength,
    dynamicRadius,
    group
  );

  return group;
}

/* ===============================
UPDATE
================================ */

function updateTree(age){

  scene.remove(treeMesh)

  treeMesh = buildTree(age)

  treeMesh.position.y = -1

  scene.add(treeMesh)
}

/* ===============================
SLIDER
================================ */

slider.addEventListener("input",()=>{

  const age = Number(slider.value)

  label.textContent = age+" years"

  updateTree(age)
})

/* ===============================
RENDER
================================ */

function animate() {
  requestAnimationFrame(animate);

  // treeMesh.rotation.y += 0.002; // 👈 ใส่ // ไว้ข้างหน้าเพื่อหยุดการหมุน

  renderer.render(scene, camera);
}

animate()

updateTree(10)
window.addEventListener('load', () => {
  slider.value = 0;           
  label.textContent = "0 years";
  updateTree(0);              
});

animate(); // เรียกทำงาน Loop loop ปกติ