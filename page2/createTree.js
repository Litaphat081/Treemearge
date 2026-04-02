const THREE = window.THREE;

function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

export class Branch {
  constructor(origin, orientation, length, radius, level, sections, segments, parentSectionIndex = 0) {
    this.origin = origin.clone();
    this.orientation = orientation.clone();
    this.length = length;
    this.radius = radius;
    this.level = level;
    this.sections = sections;
    this.segments = segments;
    this.parentSectionIndex = parentSectionIndex; // เพิ่มจุดนี้จุดเดียวใน Class
    this.children = [];
    this.sectionData = [];
    this.birthAge = level * 20;
    this.isTop = false;
  }
}

export function createGraph(seed, data) {
  const randStructure = makeRNG(seed);
  const maxDepth = 4;
  const trunkHeight = data.trunk.heightAtMaturity_m;
  const trunkRadius = (data.trunk.girthGrowth_cm_per_year * 500) / 75 / (2 * Math.PI);

  const params = {
    length: [trunkHeight, trunkHeight * 0.6, trunkHeight * 0.35, trunkHeight * 0.2, trunkHeight * 0.1],
    radius: [trunkRadius, trunkRadius * 0.55, trunkRadius * 0.35, trunkRadius * 0.15, trunkRadius * 0.08],
    sections: [30, 10, 10, 8, 6],
    segments: [12, 10, 8, 7, 6],
    children: [
      Math.max(1, data.branching.primaryBranchCount + Math.floor(randStructure() * 3 - 1)),
      Math.floor(3 + randStructure() * 2),
      Math.floor(2 + randStructure() * 2),
      2,
      0
    ],
    angle: [0, 70, 65, 50, 40],
    gnarliness: [0.05, 0.1, 0.15, 0.25, 0.45],
    start: [0.2, 0.3, 0.25, 0.2, 0.2],
  };

  const trunk = new Branch(new THREE.Vector3(0, 0, 0), new THREE.Euler(0, 0, 0), params.length[0], params.radius[0], 0, params.sections[0], params.segments[0]);
  trunk.birthAge = 0;

  const buildQueue = [trunk];
  while (buildQueue.length > 0) {
    const branch = buildQueue.shift();
    buildBranch(branch);
  }

  function buildBranch(branch) {
    const level = branch.level;
    let sectionOrigin = branch.origin.clone();
    let sectionOrientation = branch.orientation.clone();
    const sectionLength = branch.length / branch.sections;
    const sectionData = [];

    for (let i = 0; i <= branch.sections; i++) {
      const t = i / branch.sections;
      let sectionRadius = (level === 0) ? Math.max(0.35, branch.radius * Math.pow(1 - t, 0.6)) : Math.max(0.05, branch.radius * Math.pow(1 - t, 2.0));

      if (i < branch.sections) {
        const currentGnarliness = params.gnarliness[level];
        if (!branch.isTop) {
          sectionOrientation.x += (randStructure() - 0.5) * currentGnarliness * 4.0;
          sectionOrientation.z += (randStructure() - 0.5) * currentGnarliness * 4.0;
        }
        const forceDir = (level === 0) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(sectionOrigin.x * 0.1, 0.5, sectionOrigin.z * 0.1).normalize();
        const qSection = new THREE.Quaternion().setFromEuler(sectionOrientation);
        const qForce = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), forceDir);
        qSection.rotateTowards(qForce, 0.04 / Math.max(0.1, sectionRadius));
        sectionOrientation.setFromQuaternion(qSection);
      }

      sectionData.push({ origin: sectionOrigin.clone(), orientation: sectionOrientation.clone(), radius: sectionRadius });

      if (i < branch.sections) {
        const stepDir = new THREE.Vector3(0, 1, 0).applyEuler(sectionOrientation);
        sectionOrigin.addScaledVector(stepDir, sectionLength);
      }
    }
    branch.sectionData = sectionData;
    if (level < maxDepth && level < params.children.length - 1) {
      generateChildBranches(branch, sectionData, params, randStructure, buildQueue);
    }
  }
  return { trunk, params, seed };
}

export function renderTree(graph, age, seed) {
  const { trunk } = graph;
  const randGeometry = makeRNG(seed + 1);
  const ORIGIN = new THREE.Vector3(0, 0, 0);
  
  const verts = [], indices = [], normals = [], uvs = [], leafPositions = [];

  // traverse แบบส่งต่อตำแหน่งที่ยืดแล้ว (runningOrigin)
  function traverseAndRender(branch, runningOrigin) {
    if (age < branch.birthAge) return;
    
    // เรียก render และรับตำแหน่งข้อกิ่งที่ยืดใหม่มา
    
    const result = renderBranch(branch, runningOrigin ?? ORIGIN);
    
    for (const child of branch.children) {
      // ดึงพิกัดข้อกิ่งที่ถูกต้อง (Index ที่จองไว้ตอนสร้าง) มาส่งต่อให้ลูก
      const attachIdx = Math.min(child.parentSectionIndex, result.newSections.length - 1);
      traverseAndRender(child, result.newSections[attachIdx]);
    }
  }

  function renderBranch(branch, startOrigin) {
    const level = branch.level;
    const sectionData = branch.sectionData;
    const branchStartVertexIndex = verts.length / 3;
    let growth = Math.pow(Math.max(0, Math.min(1, (age - branch.birthAge) / 150)), 2);

    const newSections = [];
    let currentPos = startOrigin.clone();
    const effectiveSectionLength = (branch.length * growth) / branch.sections;

    for (let i = 0; i <= branch.sections; i++) {
      const t = i / branch.sections;
      const { orientation: sectionOrientation, radius } = sectionData[i];
      const sectionRadius = radius * growth;
      
      newSections.push(currentPos.clone()); // เก็บไว้ให้ลูกเกาะ

      for (let j = 0; j < branch.segments; j++) {
        const angle = (2 * Math.PI * j) / branch.segments;
        const detailNoise = (randGeometry() - 0.5) * 0.1 + (Math.sin(angle * 10) + Math.cos(t * 15)) * 0.2;
        const finalRadius = sectionRadius * (1.0 + detailNoise * (level === 0 ? 0.3 : 0.15));

        const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).applyEuler(sectionOrientation).normalize();
        const vertex = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(finalRadius).applyEuler(sectionOrientation).add(currentPos);

        verts.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(j / (branch.segments - 1), t);
      }

      if (i > 0) {
        const p = branchStartVertexIndex + (i - 1) * branch.segments, c = branchStartVertexIndex + i * branch.segments;
        for (let j = 0; j < branch.segments; j++) {
          const n = (j + 1) % branch.segments;
          indices.push(p + j, c + j, p + n, p + n, c + j, c + n);
        }
      }

      if (i < branch.sections) {
        const stepDir = new THREE.Vector3(0, 1, 0).applyEuler(sectionOrientation);
        currentPos.addScaledVector(stepDir, effectiveSectionLength);
      }
    }

    // ใบไม้: เกาะตามข้อที่ยืดแล้ว
    if (level >= 3) {
      const leafFactor = Math.min(1, age / 500);
      for (let i = 1; i < newSections.length; i++) {
        const hash = Math.abs(Math.sin(i * 12.9898 + level * 78.233 + seed * 0.0001));
        if (hash < leafFactor && growth > 0.5) {
          leafPositions.push(newSections[i].clone());
        }
      }
    }
    return { newSections };
  }

  traverseAndRender(trunk, null);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const trunkHeight = trunk.length * (age / 500);
  const crownRadius = Math.max(1.5, Math.min(age * 0.08, trunkHeight * 1.2));

  return { geometry: geo, leafPositions, trunkHeight, crownRadius };
}

function generateChildBranches(branch, sectionData, params, randStructure, buildQueue) {
  const level = branch.level;
  const childLevel = level + 1;
  const count = params.children[level] || 0;
  const angleOffset = randStructure() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    // 1. Logic พิเศษสำหรับกิ่งยอด (isTop) ของมึง
    if (level === 0 && i === 0) {
      const sIdx = Math.floor(sectionData.length * 0.95);
      const tipSection = sectionData[sIdx];
      const child = new Branch(tipSection.origin, new THREE.Euler(0, 0, 0), params.length[childLevel] * 0.3, tipSection.radius * 1.3, childLevel, params.sections[childLevel], params.segments[childLevel], sIdx);
      child.birthAge = childLevel * 80;
      child.isTop = true;
      branch.children.push(child);
      buildQueue.push(child);
      continue;
    }

    // 2. Logic กิ่งข้างซ้ายขวาตามบาลานซ์เดิมของมึง
    const baseT = i / count;
    const apicalBias = Math.pow(baseT, 1.2 + (randStructure() * 0.5));
    const t = params.start[childLevel] + apicalBias * (1 - params.start[childLevel]) + (randStructure() - 0.5) * 0.1;
    const sIdx = Math.floor(Math.max(0, Math.min(t, 0.95)) * (sectionData.length - 1));
    const parentSection = sectionData[sIdx];

    const childRadius = parentSection.radius * (0.65 + randStructure() * 0.25);
    const qParent = new THREE.Quaternion().setFromEuler(parentSection.orientation);
    const radialAngle = angleOffset + (i / count) * Math.PI * 4;
    const branchAngle = (params.angle[childLevel] + (randStructure() - 0.5) * 20) * Math.PI / 180;

    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngle);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radialAngle);
    const childQ = qParent.clone().multiply(q2).multiply(q1);

    const child = new Branch(parentSection.origin, new THREE.Euler().setFromQuaternion(childQ), params.length[childLevel] * (0.4 + randStructure() * 0.7), childRadius, childLevel, params.sections[childLevel], params.segments[childLevel], sIdx);
    child.birthAge = (childLevel * 80) + apicalBias * 60 + i * 10 + randStructure() * 10;

    branch.children.push(child);
    buildQueue.push(child);
  }
}