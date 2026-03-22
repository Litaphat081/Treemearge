const THREE = window.THREE;

function makeRNG(seed) {
  let s = seed % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

export class Branch {
  constructor(origin, orientation, length, radius, level, sections, segments, parent) {
    this.origin      = origin.clone();
    this.orientation = orientation.clone();
    this.length      = length;
    this.radius      = radius;
    this.level       = level;
    this.sections    = sections;
    this.segments    = segments;
    this.parent      = parent;
    this.children    = [];
    this.sectionData = []; 
  }
}

export function createTree(age, data) {
  const rand = makeRNG(Math.floor(age * 9973 + 12345));

  let maxDepth = 0;
  let branchingStartAge = 5; 

  if (age < branchingStartAge) {
    maxDepth = 0; 
  } else if (age < 20) {
    maxDepth = 1; 
  } else if (age < 100) {
    maxDepth = 2; 
  } else if (age < 300) {
    maxDepth = 3;
  } else {
    maxDepth = 4; 
  }

  const growthFactor = age / 500; 
  const trunkHeight = Math.max(0.8, data.trunk.heightAtMaturity_m * growthFactor);
  const trunkRadius = Math.max(0.12, (data.trunk.girthGrowth_cm_per_year * age) / 75 / (2 * Math.PI));

  const params = {
    length:     [trunkHeight, trunkHeight * 0.6, trunkHeight * 0.35, trunkHeight * 0.2, trunkHeight * 0.1],
    radius:     [trunkRadius, trunkRadius * 0.55, trunkRadius * 0.35, trunkRadius * 0.15, trunkRadius * 0.08],
    sections:   [30, 10, 10, 8, 6], 
    segments:   [12, 10, 8, 7, 6], 
    children:   [age < branchingStartAge ? 60 : data.branching.primaryBranchCount, 5, 4, 2, 0],
    angle:      [0, 60, 50, 35, 30], 
    gnarliness: [age < 100 ? 0.01 : 0.05, 0.1, 0.15, 0.25, 0.45],
    start:      [0.2, 0.3, 0.25, 0.2, 0.2], 
  };

  const verts         = [];
  const indices       = [];
  const normals       = [];
  const uvs           = [];
  const leafPositions = [];
  const branchQueue   = [];

  const trunk = new Branch(
    new THREE.Vector3(2, 0, 0),
    new THREE.Euler(0, 0, 0),
    params.length[0],
    params.radius[0],
    0,
    params.sections[0],
    params.segments[0],
    null
  );

  branchQueue.push(trunk);

  while (branchQueue.length > 0) {
    const branch = branchQueue.shift();
    generateBranch(branch);
  }

  function generateBranch(branch) {
    const level      = branch.level;
    const branchStartVertexIndex = verts.length / 3;
    
    let sectionOrigin      = branch.origin.clone();
    let sectionOrientation = branch.orientation.clone();
    const sectionLength    = branch.length / branch.sections;
    const sectionData      = [];

    for (let i = 0; i <= branch.sections; i++) {
      const t = i / branch.sections;
      
      let sectionRadius;
      if (level === 0) {
        sectionRadius = Math.max(0.35, branch.radius * Math.pow(1 - t, 0.7));
      } else {
        sectionRadius = Math.max(0.05, branch.radius * Math.pow(1 - t, 2.0));
      }

      if (i < branch.sections) {
        const currentGnarliness = params.gnarliness[level];
        if (level === 0) {
          sectionOrientation.x += (rand() - 0.6) * currentGnarliness  * 4.0;
          sectionOrientation.z += (rand() - 0.4) * currentGnarliness  * 5.0;
        } else {
          sectionOrientation.x += (rand() - 0.3) * currentGnarliness  * 4.0;
          sectionOrientation.z += (rand() - 0.9) * currentGnarliness   *4.5;
        }

        const forceDir = level === 0 
          ? new THREE.Vector3(0, 1, 0) 
          : new THREE.Vector3(sectionOrigin.x * 0.1, 0.5, sectionOrigin.z * 0.1).normalize();

        const qSection = new THREE.Quaternion().setFromEuler(sectionOrientation);
        const qForce   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), forceDir);
        
        qSection.rotateTowards(qForce, 0.05 / Math.max(0.1, sectionRadius));
        sectionOrientation.setFromQuaternion(qSection);
      }

      for (let j = 0; j < branch.segments; j++) {
        const angle = (2 * Math.PI * j) / branch.segments;
        
        // เพิ่มความขรุขระ (Texture)
        const detailNoise = (rand() - 0.5) * 0.1 + (Math.sin(angle * 10) + Math.cos(t * 15)) * 0.2; 
        const finalRadius = sectionRadius * (1.0 + detailNoise * (level === 0 ? 0.3 : 0.15));

        const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).applyEuler(sectionOrientation).normalize();
        
        const vertex = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(finalRadius) 
          .applyEuler(sectionOrientation)
          .add(sectionOrigin);

        verts.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(j / (branch.segments - 1), t); 
      }

      if (i > 0) {
        const prevRingOffset = branchStartVertexIndex + (i - 1) * branch.segments;
        const currRingOffset = branchStartVertexIndex + i * branch.segments;

        for (let j = 0; j < branch.segments; j++) {
          const next = (j + 1) % branch.segments;
          indices.push(prevRingOffset + j, currRingOffset + j, prevRingOffset + next);
          indices.push(prevRingOffset + next, currRingOffset + j, currRingOffset + next);
        }
      }

      sectionData.push({
        origin:      sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius:      sectionRadius
      });

      if (i < branch.sections) {
        const stepDir = new THREE.Vector3(0, 1, 0).applyEuler(sectionOrientation);
        sectionOrigin.addScaledVector(stepDir, sectionLength);
      }
    }

    branch.sectionData = sectionData;

    // แก้ส่วนใบไม้ให้กระจายเป็นพุ่ม (ออกตั้งแต่ Level 2 ขึ้นไป)
    if (level >= 3) {
      for (let i = 1; i < sectionData.length; i++) {
        if (rand() > 0.3) { // 0.1 คือหนามาก ปรับเพิ่มถ้าอยากให้บางลง
          for (let n = 0; n < 3; n++) {
          const origin = sectionData[i].origin.clone();
          const scale = 3.5 + rand() * 3.0;
          leafPositions.push(sectionData[i].origin.clone());
        }
      }
    }
    }

    if (level < maxDepth && level < params.children.length - 1) {
      generateChildBranches(branch, sectionData);
    }
  }

function generateChildBranches(branch, sectionData) {
    const level      = branch.level;
    const childLevel = level + 1;
    const count      = params.children[level] || 0;
    const angleOffset = rand() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const t = params.start[childLevel] + (i / count) * (1 - params.start[childLevel]) + (rand() - 0.5) * 0.1;
      const sectionIndex = Math.floor(Math.max(0, Math.min(t, 0.95)) * (sectionData.length - 1));
      
      const parentSection = sectionData[sectionIndex];
      const childOrigin   = parentSection.origin;
      
      const thicknessScale = 0.65 + (rand() * 0.25);
      const childRadius    = parentSection.radius * thicknessScale;

      const qParent = new THREE.Quaternion().setFromEuler(parentSection.orientation);
      const radialAngle = angleOffset + (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.8;
      const branchAngle = (params.angle[childLevel] + (rand() - 0.5) * 30) * Math.PI / 180; 

      const q1     = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngle);
      const q2     = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radialAngle);
      const childQ = qParent.clone().multiply(q2).multiply(q1);

      const childOrientation = new THREE.Euler().setFromQuaternion(childQ);
      
      const lengthScale = 0.4 + (rand() * 0.7);
      const childLength = params.length[childLevel] * lengthScale;

      const child = new Branch(
        childOrigin,
        childOrientation,
        childLength,
        childRadius,
        childLevel,
        params.sections[childLevel],
        params.segments[childLevel],
        branch
      );
      branch.children.push(child);
      branchQueue.push(child);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  return {
    geometry:     geo,
    leafPositions,
    trunkHeight,
    crownRadius:  Math.max(1.5, Math.min(age * 0.08, trunkHeight * 1.2)),
    maxDepth
  };
}