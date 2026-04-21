const THREE = window.THREE;

function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

export class Branch {
  constructor(origin, orientation, length, radius, level, sections, segments) {
    this.origin = origin.clone();
    this.orientation = orientation.clone();
    this.length = length;
    this.radius = radius;
    this.level = level;
    this.sections = sections;
    this.segments = segments;
    this.children = [];
    this.sectionData = [];
    this.birthAge = level * 20;
    this.isTop = false;
  }
}

export function createTree(age, data) {

    
  // deterministic seed
  const rand = makeRNG(12345);

  let maxDepth = 0;
  if (age < 5) maxDepth = 0;
  else if (age < 20) maxDepth = 1;
  else if (age < 100) maxDepth = 2;
  else if (age < 300) maxDepth = 3;
  else maxDepth = 4;

  const growthFactor = age / 500;
  const trunkHeight = Math.max(0.8, data.trunk.heightAtMaturity_m * growthFactor);
  const trunkRadius = Math.max(0.12, (data.trunk.girthGrowth_cm_per_year * age) / 75 / (2 * Math.PI));

  // ❗ keep your original params (do not change values)
  const params = {
    length: [trunkHeight, trunkHeight * 0.6, trunkHeight * 0.35, trunkHeight * 0.2, trunkHeight * 0.1],
    radius: [trunkRadius, trunkRadius * 0.55, trunkRadius * 0.35, trunkRadius * 0.15, trunkRadius * 0.08],
    sections: [30, 10, 10, 8, 6],
    segments: [12, 10, 8, 7, 6],
    children: [age < 5 ? 0 : data.branching.primaryBranchCount, 4, 4, 2, 0],
    angle: [0, 70, 65, 50, 40],
    gnarliness: [age < 100 ? 0.01 : 0.05, 0.1, 0.15, 0.25, 0.45],
    start: [0.2, 0.3, 0.25, 0.2, 0.2],
  };

  const verts = [];
  const indices = [];
  const normals = [];
  const uvs = [];
  const leafPositions = [];
  const branchQueue = [];

  const trunk = new Branch(
    new THREE.Vector3(0, 0, 0),
    new THREE.Euler(0, 0, 0),
    params.length[0],
    params.radius[0],
    0,
    params.sections[0],
    params.segments[0]
  );

  branchQueue.push(trunk);

  while (branchQueue.length > 0) {
    const branch = branchQueue.shift();
    generateBranch(branch);
  }

  function generateBranch(branch) {
    if (age < branch.birthAge) return;

    const level = branch.level;
    const branchStartVertexIndex = verts.length / 3;

    let sectionOrigin = branch.origin.clone();
    let sectionOrientation = branch.orientation.clone();

    let growth = Math.max(0, Math.min(1, (age - branch.birthAge) / 150));
    growth = growth * growth;

    const effectiveLength = branch.length * growth;
    const sectionLength = effectiveLength / branch.sections;

    const sectionData = [];

    for (let i = 0; i <= branch.sections; i++) {
      const t = i / branch.sections;

      let sectionRadius;

      if (level === 0) {
        const exponent = 0.7 - (age / 500) * 0.2;
        sectionRadius = Math.max(0.35, branch.radius * Math.pow(1 - t, exponent));
      } else {
        sectionRadius = Math.max(0.05, branch.radius * Math.pow(1 - t, 2.0));
      }

      sectionRadius *= growth;

      // curvature / gnarliness
      if (i < branch.sections) {
        const currentGnarliness = params.gnarliness[level];

        if (!branch.isTop) {
          sectionOrientation.x += (rand() - 0.5) * currentGnarliness * 4.0;
          sectionOrientation.z += (rand() - 0.5) * currentGnarliness * 4.0;
        }

        const forceDir =
          (level === 0)
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(sectionOrigin.x * 0.1, 0.5, sectionOrigin.z * 0.1).normalize();

        const qSection = new THREE.Quaternion().setFromEuler(sectionOrientation);
        const qForce = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), forceDir);

        qSection.rotateTowards(qForce, 0.04 / Math.max(0.1, sectionRadius));
        sectionOrientation.setFromQuaternion(qSection);
      }

      // ring vertices
      for (let j = 0; j < branch.segments; j++) {
        const angle = (2 * Math.PI * j) / branch.segments;

        const detailNoise =
          (rand() - 0.5) * 0.1 +
          (Math.sin(angle * 10) + Math.cos(t * 15)) * 0.2;

        const finalRadius =
          sectionRadius * (1.0 + detailNoise * (level === 0 ? 0.3 : 0.15));

        const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
          .applyEuler(sectionOrientation)
          .normalize();

        const vertex = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(finalRadius)
          .applyEuler(sectionOrientation)
          .add(sectionOrigin);

        verts.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(j / (branch.segments - 1), t);
      }

      // faces
      if (i > 0) {
        const prevRing = branchStartVertexIndex + (i - 1) * branch.segments;
        const currRing = branchStartVertexIndex + i * branch.segments;

        for (let j = 0; j < branch.segments; j++) {
          const next = (j + 1) % branch.segments;
          indices.push(prevRing + j, currRing + j, prevRing + next);
          indices.push(prevRing + next, currRing + j, currRing + next);
        }
      }

      sectionData.push({
        origin: sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius: sectionRadius
      });

      if (i < branch.sections) {
        const stepDir = new THREE.Vector3(0, 1, 0).applyEuler(sectionOrientation);
        sectionOrigin.addScaledVector(stepDir, sectionLength);
      }
    }

    branch.sectionData = sectionData;

    

    // ===============================
    // LEAVES (MAKE IT DENSE LIKE EZTREE)
    // ===============================
    if (level >= 2) {
      const leafFactor = Math.min(1, age / 500);

      // bias leaves towards branch tips
      for (let i = 0; i < sectionData.length; i++) {
        const t = i / (sectionData.length - 1);
        const tipBias = Math.pow(t, 2.2);

        // more leaves at tips
        const chance = 0.10 + tipBias * 0.65;

        if (rand() < chance * leafFactor) {

          // cluster leaf pack
          const clusterCount = 3 + Math.floor(rand() * 6);

          for (let n = 0; n < clusterCount; n++) {
            const p = sectionData[i].origin.clone();

            // random small spread (makes it fluffy)
            p.x += (rand() - 0.5) * 0.6;
            p.y += (rand() - 0.5) * 0.4;
            p.z += (rand() - 0.5) * 0.6;

            leafPositions.push(p);
          }
        }
      }
    }

    // ===============================
    // CHILD BRANCHES
    // ===============================
    if (level < maxDepth && level < params.children.length - 1) {
      generateChildBranches(branch, sectionData, params, rand, branchQueue);

      // EXTRA canopy filling (without changing params)
      // add more twigs near the tip to mimic EZTREE density
      if (level >= 1 && level <= 2 && age > 80) {
        const extraCount = 2 + Math.floor(rand() * 3);

        for (let k = 0; k < extraCount; k++) {
          const tipSection = sectionData[Math.floor(sectionData.length * (0.75 + rand() * 0.2))];

          const qParent = new THREE.Quaternion().setFromEuler(tipSection.orientation);

          const radialAngle = rand() * Math.PI * 2;
          const branchAngle = (35 + rand() * 30) * Math.PI / 180;

          const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngle);
          const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radialAngle);

          const childQ = qParent.clone().multiply(q2).multiply(q1);

          const childLevel = level + 1;

          const child = new Branch(
            tipSection.origin,
            new THREE.Euler().setFromQuaternion(childQ),
            params.length[childLevel] * (0.35 + rand() * 0.4),
            tipSection.radius * (0.5 + rand() * 0.25),
            childLevel,
            params.sections[childLevel],
            params.segments[childLevel]
          );

          child.birthAge = (childLevel * 70) + rand() * 40;
          branchQueue.push(child);
        }
      }
    }
  }
  

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  return {
    geometry: geo,
    leafPositions,
    trunkHeight,
    crownRadius: Math.max(1.5, Math.min(age * 0.08, trunkHeight * 1.2)),
    maxDepth
  };
}

function generateChildBranches(branch, sectionData, params, rand, branchQueue) {
  const level = branch.level;
  const childLevel = level + 1;
  const count = params.children[level] || 0;

  // GOLDEN ANGLE distribution = balanced canopy
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angleOffset = rand() * Math.PI * 2;

  for (let i = 0; i < count; i++) {

    // keep your "top leader branch"
    if (level === 0 && i === 0) {
      const tipSection = sectionData[Math.floor(sectionData.length * 0.95)];

      const child = new Branch(
        tipSection.origin,
        new THREE.Euler(0, 0, 0),
        params.length[childLevel] * 0.3,
        tipSection.radius * 1.3,
        childLevel,
        params.sections[childLevel],
        params.segments[childLevel]
      );

      child.birthAge = (childLevel * 80);
      child.isTop = true;
      branchQueue.push(child);
      continue;
    }

    const baseT = i / Math.max(1, count - 1);

    // bias branching to upper trunk (EZTREE style)
    const apicalBias = Math.pow(baseT, 1.35);

    const t =
      params.start[childLevel]
      + apicalBias * (1 - params.start[childLevel])
      + (rand() - 0.5) * 0.04;

    const sectionIndex = Math.floor(
      Math.max(0, Math.min(t, 0.95)) * (sectionData.length - 1)
    );

    const parentSection = sectionData[sectionIndex];

    const childRadius = parentSection.radius * (0.65 + rand() * 0.25);

    const qParent = new THREE.Quaternion().setFromEuler(parentSection.orientation);

    // balanced radial spread
    const radialAngle = angleOffset + i * goldenAngle;

    const branchAngle =
      (params.angle[childLevel] + (rand() - 0.5) * 10) * Math.PI / 180;

    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngle);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radialAngle);

    const childQ = qParent.clone().multiply(q2).multiply(q1);

    const child = new Branch(
      parentSection.origin,
      new THREE.Euler().setFromQuaternion(childQ),
      params.length[childLevel] * (0.45 + rand() * 0.7),
      childRadius,
      childLevel,
      params.sections[childLevel],
      params.segments[childLevel]
    );

    child.birthAge = (childLevel * 80) + apicalBias * 50 + i * 8 + rand() * 10;
    branchQueue.push(child);
  }
}