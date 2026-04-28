const THREE = window.THREE;

export function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

export class Branch {
  constructor(origin, quaternion, length, radius, level, sections, segments, birthAge) {
    this.origin     = origin.clone();
    this.quaternion = quaternion.clone();
    this.length     = length;
    this.radius     = radius;
    this.level      = level;
    this.sections   = sections;
    this.segments   = segments;
    this.birthAge   = birthAge;
  }
}

const _v   = new THREE.Vector3();
const _n   = new THREE.Vector3();
const _up  = new THREE.Vector3(0, 1, 0);
const _ax  = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _qS  = new THREE.Quaternion();
const _qF  = new THREE.Quaternion();

export function createTree(age, data) {

  const rand = makeRNG(data.seed ?? 12345);

  let maxDepth = 0;
  if      (age <   5) maxDepth = 0;
  else if (age <  20) maxDepth = 1;
  else if (age <  60) maxDepth = 2;
  else if (age < 150) maxDepth = 3;
  else if (age < 300) maxDepth = 4;
  else                maxDepth = 5;

  const growthFactor = Math.min(age / 500, 1);
  const heightFactor = Math.pow(growthFactor, 0.72);
  const trunkHeight  = Math.max(1.0, data.trunk.heightAtMaturity_m * heightFactor);
  const trunkRadius  = Math.max(
    0.18,
    (data.trunk.girthGrowth_cm_per_year * age) / 60 / (2 * Math.PI)
  );

  const params = {
    length: [
      trunkHeight,
      trunkHeight * 0.75,
      trunkHeight * 0.55,
      trunkHeight * 0.38,
      trunkHeight * 0.22,
      trunkHeight * 0.14
    ],
    radius: [
      trunkRadius,
      trunkRadius * 0.55,
      trunkRadius * 0.30,
      trunkRadius * 0.15,
      trunkRadius * 0.08,
      trunkRadius * 0.045
    ],
    sections: [34, 18, 14, 10, 7, 5],
    segments: [12, 10,  9,  7, 6, 6],
    children: [
      age < 8 ? 0 : data.branching.primaryBranchCount,
      4, 5, 4, 3, 0
    ],
    angle:      [0, 55, 48, 42, 35, 28],
    gnarliness: [age < 80 ? 0.02 : 0.06, 0.12, 0.20, 0.34, 0.50, 0.62],
    taper:      [0.55, 0.70, 0.82, 0.88, 0.92, 0.96],
    start:      [0.12, 0.18, 0.22, 0.25, 0.30, 0.35],
  };

  const verts         = [];
  const indices       = [];
  const normals       = [];
  const uvs           = [];
  const leafPositions = [];
  const branchQueue   = [];

  branchQueue.push(new Branch(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion(),
    params.length[0],
    params.radius[0],
    0,
    params.sections[0],
    params.segments[0],
    0
  ));

  while (branchQueue.length > 0) {
    generateBranch(branchQueue.shift());
  }

  // ─────────────────────────────────────────────
  function generateBranch(branch) {
    if (age < branch.birthAge) return;

    const level        = branch.level;
    const startVtx     = verts.length / 3;
    const totalSections = branch.sections;
    const fullSectionLen = branch.length / totalSections;

    // growth 0→1 สำหรับกิ่งนี้
    let growth = Math.max(0, Math.min(1, (age - branch.birthAge) / 140));
    growth = Math.pow(growth, 1.55);

    // ── PASS 1: คำนวณ shape ครบทุก section ──────────────────────────────
    // ต้องเรียก rand() ครบทุก section เสมอ ไม่ว่า growth จะเป็นเท่าไหร่
    // เพื่อให้ sequence ของ rand ไม่เลื่อนและ shape ไม่เปลี่ยนเมื่อ age เพิ่ม
    const shapes = [];

    {
      let q = branch.quaternion.clone();
      let o = branch.origin.clone();

      for (let i = 0; i <= totalSections; i++) {
        const t = i / totalSections;

        let r_base;
        if (level === 0) {
          r_base = Math.max(0.25, branch.radius * Math.pow(1 - t, 0.65));
        } else {
          r_base = Math.max(0.015, branch.radius * (1 - params.taper[level] * t));
        }

        shapes.push({ origin: o.clone(), quat: q.clone(), r_base });

        // เรียก rand() ทุก iteration ไม่ break ก่อน → shape คงที่
        if (i < totalSections) {
          const tipBoost = 0.3 + 0.7 * t;
          const g = params.gnarliness[level] * tipBoost;

          _ax.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
          _qS.setFromAxisAngle(_ax, g * 0.40);
          q.multiply(_qS);

          _dir.set(0, 1, 0).applyQuaternion(q);
          const targetDir = new THREE.Vector3(0, 1, 0);

          if (level > 0) {
            const droop = (level * 0.22) * (0.2 + 0.8 * t);
            targetDir.y -= droop;
            targetDir.x += (-o.x) * 0.075;
            targetDir.z += (-o.z) * 0.075;
            targetDir.x += o.x * 0.025;
            targetDir.z += o.z * 0.025;
          }

          targetDir.normalize();
          _qF.setFromUnitVectors(_dir, targetDir);
          const strength = level === 0 ? 0.09 : 0.06;
          q.slerp(_qF.multiply(q), strength);

          _dir.set(0, 1, 0).applyQuaternion(q);
          o.addScaledVector(_dir, fullSectionLen);
        }
      }
    }

    // ── PASS 2: render เฉพาะส่วนที่ growth ถึง ──────────────────────────
    const visibleSections = Math.max(1, Math.min(
      totalSections,
      Math.floor(totalSections * growth)
    ));

    const sectionData = [];

    for (let i = 0; i <= visibleSections; i++) {
      const t     = i / totalSections;  // ← totalSections เพื่อ radius scale ถูกต้อง
      const shape = shapes[i];

      let r = shape.r_base * (0.55 + 0.45 * growth);
      // tip taper ให้ปลายแหลม
      const tipTaper = 1 - Math.pow(i / visibleSections, 6);
      r *= Math.max(0.12, tipTaper);

      // bark noise แบบ deterministic ไม่ใช้ rand() เพิ่มเติม
      // ป้องกัน sequence เลื่อน
      for (let j = 0; j < branch.segments; j++) {
        const ang = (j / branch.segments) * Math.PI * 2;

        const barkNoise =
          Math.sin(i * 1.3 + level * 17.7 + ang * 8 + t * 14)
          * 0.04 * (level === 0 ? 1.0 : 0.5);

        const finalR = r * (1.0 + barkNoise * (level === 0 ? 0.25 : 0.12));

        _v.set(Math.cos(ang) * finalR, 0, Math.sin(ang) * finalR)
          .applyQuaternion(shape.quat)
          .add(shape.origin);

        _n.set(Math.cos(ang), 0, Math.sin(ang))
          .applyQuaternion(shape.quat)
          .normalize();

        verts.push(_v.x, _v.y, _v.z);
        normals.push(_n.x, _n.y, _n.z);
        uvs.push(j / (branch.segments - 1), t);
      }

      if (i > 0) {
        const p = startVtx + (i - 1) * branch.segments;
        const c = startVtx + i * branch.segments;
        for (let j = 0; j < branch.segments; j++) {
          const nx = (j + 1) % branch.segments;
          indices.push(p + j, c + j, p + nx);
          indices.push(p + nx, c + j, c + nx);
        }
      }

      sectionData.push({
        origin: shape.origin,
        quat:   shape.quat,
        radius: r
      });
    }

    // ─────────────────────────────────────────────
    // Leaves
    // ─────────────────────────────────────────────
    if (level >= 2 && age > 15) {
      const leafFactor = Math.min(1, (age - 15) / 90);

      for (let i = 0; i < sectionData.length; i++) {
        const t       = i / (sectionData.length - 1);
        const tipBias = Math.pow(t, 2.0);
        const chance  = (0.06 + tipBias * 0.95) * leafFactor;

        if (rand() < chance) {
          const ageBoost = Math.min(1, age / 200);
          const clusters = 3 + Math.floor(rand() * (6 + ageBoost * 6));

          for (let c = 0; c < clusters; c++) {
            const spread = 0.6 + ageBoost * 0.9;
            const offset = new THREE.Vector3(
              (rand() - 0.5) * spread,
              (rand() - 0.5) * spread * 0.65,
              (rand() - 0.5) * spread
            );
            leafPositions.push(sectionData[i].origin.clone().add(offset));
          }
        }
      }
    }

    // ─────────────────────────────────────────────
    // Child branches
    // ─────────────────────────────────────────────
    if (level < maxDepth) {
      const childCount  = params.children[level] || 0;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const angleOffset = rand() * Math.PI * 2;

      for (let i = 0; i < childCount; i++) {

        const baseT      = i / Math.max(1, childCount - 1);
        const apicalBias = Math.pow(baseT, 1.25);
        const startT     = params.start[level + 1] ?? 0.2;

        const t = Math.max(0.1, Math.min(0.95,
          startT + apicalBias * (1 - startT) + (rand() - 0.5) * 0.06
        ));

        // spawn point index บน totalSections
        const rawIdx = t * (totalSections - 1);

        // กิ่งลูกโผล่เมื่อส่วนของกิ่งพ่อที่มันนั่งอยู่ถูก render แล้ว
        if (rawIdx > visibleSections) {
          // ยังไม่ถึง — consume rand ให้ครบเพื่อไม่เลื่อน sequence
          rand(); rand(); rand(); rand();
          continue;
        }

        const visIdx    = Math.min(Math.floor(rawIdx), sectionData.length - 1);
        const parentSec = sectionData[visIdx];

        const childQuat = parentSec.quat.clone();

        _qS.setFromAxisAngle(_up, angleOffset + i * goldenAngle + (rand() - 0.5) * 0.6);
        childQuat.multiply(_qS);

        let baseAngle = params.angle[level + 1];
        if (level === 0) {
          const heightT    = visIdx / Math.max(1, sectionData.length - 1);
          const lowerBoost = (1 - heightT) * 32;
          baseAngle += lowerBoost;
        }
        baseAngle += 6;

        const branchAngle = (baseAngle + (rand() - 0.5) * 14) * Math.PI / 180;
        _qF.setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngle);
        childQuat.multiply(_qF);

        const childLevel = level + 1;
        const birthAge   =
          branch.birthAge +
          18 +
          childLevel * 18 +
          apicalBias * 55 +
          rand() * 20;

        branchQueue.push(new Branch(
          parentSec.origin,
          childQuat,
          params.length[childLevel] * (0.55 + rand() * 0.55),
          parentSec.radius * (0.58 + rand() * 0.22),
          childLevel,
          params.sections[childLevel],
          params.segments[childLevel],
          birthAge
        ));
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  return {
    geometry: geo,
    leafPositions,
    trunkHeight,
    crownRadius: trunkHeight * 1.25,
    maxDepth
  };
}