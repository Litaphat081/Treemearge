const THREE = window.THREE;

export function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

export class Branch {
  constructor(origin, quaternion, length, radius, level, sections, segments, birthAge) {
    this.origin      = origin.clone();
    this.quaternion  = quaternion.clone();
    this.length      = length;
    this.radius      = radius;
    this.level       = level;
    this.sections    = sections;
    this.segments    = segments;
    this.birthAge    = birthAge;
    this.droopFactor = 0;
    this.heightRatio = 0; // 0=base of trunk, 1=tip — ใช้กำหนดความยาวกิ่ง
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

  const rand = makeRNG(data.seed ?? 55577);

  // ── depth by age ──────────────────────────────────────────────────────
  let maxDepth = 0;
  if      (age <   3) maxDepth = 0;
  else if (age <  12) maxDepth = 1;
  else if (age <  30) maxDepth = 2;
  else if (age <  80) maxDepth = 3;
  else                maxDepth = 4;

  // ── trunk dimensions ──────────────────────────────────────────────────
  const growthFactor = Math.min(age / 500, 1);
  const heightFactor = Math.pow(growthFactor, 0.65);
  const trunkHeight  = Math.max(0.8, data.trunk.heightAtMaturity_m * heightFactor);
  const trunkRadius  = Math.max(
    0.10,
    (data.trunk.girthGrowth_cm_per_year * age) / 60 / (2 * Math.PI)
  );

  // ── whorl layout ──────────────────────────────────────────────────────
  // Pine ออกกิ่งเป็น whorl (วงแหวน) 1 ครั้งต่อปี
  // จำนวน whorl = ประมาณ age / 8 แต่จำกัดตาม maxDepth
  const whorlsOnTrunk = Math.max(1, Math.min(
    Math.floor(age / 8),
    28   // cap เพื่อ performance
  ));

  // จำนวนกิ่งต่อ whorl (pine จริง 4-6 กิ่ง)
  const branchesPerWhorl = Math.min(6, data.branching.primaryBranchCount);

  // ── params ────────────────────────────────────────────────────────────
  const params = {
    // ความยาวกิ่งตาม level — level 0 = trunk
    // ความยาวกิ่งหลักจะถูก override ตาม heightRatio อีกที
    length: [
      trunkHeight,
      trunkHeight * 0.55,  // max primary branch length (ที่โคน)
      trunkHeight * 0.28,
      trunkHeight * 0.14,
      trunkHeight * 0.07
    ],
    radius: [
      trunkRadius,
      trunkRadius * 0.32,
      trunkRadius * 0.16,
      trunkRadius * 0.08,
      trunkRadius * 0.04
    ],
    sections: [40, 12, 9, 7, 5],
    segments: [12,  8, 7, 6, 5],

    // pine ลำต้นตรงมาก, กิ่งค่อย ๆ คดขึ้น
    gnarliness: [
      age < 80 ? 0.004 : 0.014,
      0.07, 0.14, 0.24, 0.38
    ],
    taper: [0.42, 0.70, 0.80, 0.88, 0.94],
  };

  const verts         = [];
  const indices       = [];
  const normals       = [];
  const uvs           = [];
  const leafPositions = [];
  const branchQueue   = [];

  // ── trunk ─────────────────────────────────────────────────────────────
  branchQueue.push(new Branch(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion(),
    params.length[0],
    params.radius[0],
    0,
    params.sections[0],
    params.segments[0],
    0          // trunk birthAge = 0
  ));

  while (branchQueue.length > 0) {
    generateBranch(branchQueue.shift());
  }

  // ──────────────────────────────────────────────────────────────────────
  function generateBranch(branch) {
    if (age < branch.birthAge) return;

    const level          = branch.level;
    const startVtx       = verts.length / 3;
    const totalSections  = branch.sections;
    const fullSectionLen = branch.length / totalSections;

    // growth 0→1
    let growth = Math.max(0, Math.min(1, (age - branch.birthAge) / 110));
    growth = Math.pow(growth, 1.35);

    // ── PASS 1: bake full shape (consume all rand) ─────────────────────
    const shapes = [];
    {
      let q = branch.quaternion.clone();
      let o = branch.origin.clone();

      for (let i = 0; i <= totalSections; i++) {
        const t = i / totalSections;

        // radius
        let r_base;
        if (level === 0) {
          // trunk: ค่อย ๆ เรียว แต่โคนหนา
          r_base = Math.max(0.15, branch.radius * Math.pow(1 - t * 0.82, 0.50));
        } else {
          r_base = Math.max(0.006, branch.radius * (1 - params.taper[level] * t));
        }

        shapes.push({ origin: o.clone(), quat: q.clone(), r_base });

        if (i < totalSections) {
          const g = params.gnarliness[level] * (0.35 + 0.65 * t);

          // consume 3 rand เสมอ → shape stable
          const rx = rand() - 0.5;
          const ry = (rand() - 0.5) * 0.2;
          const rz = rand() - 0.5;
          _ax.set(rx, ry, rz).normalize();
          _qS.setFromAxisAngle(_ax, g * 0.40);
          q.multiply(_qS);

          _dir.set(0, 1, 0).applyQuaternion(q);
          const tgt = new THREE.Vector3(0, 1, 0);

          if (level === 0) {
            // ลำต้นตรงมาก — pull แรงมาก
            // ไม่ต้องทำอะไรพิเศษ tgt = (0,1,0) แล้ว
          } else {
            // กิ่ง: droop ที่ปลาย, pull กลับแกน (symmetry)
            const droop = (branch.droopFactor ?? 0) * Math.pow(t, 1.6);
            tgt.y -= droop;
            tgt.x += (-o.x) * 0.10;
            tgt.z += (-o.z) * 0.10;
          }

          tgt.normalize();
          _qF.setFromUnitVectors(_dir, tgt);
          const str = level === 0 ? 0.22 : 0.08;
          q.slerp(_qF.multiply(q), str);

          _dir.set(0, 1, 0).applyQuaternion(q);
          o.addScaledVector(_dir, fullSectionLen);
        }
      }
    }

    // ── PASS 2: render visible sections ──────────────────────────────
    const visibleSections = Math.max(1, Math.min(
      totalSections,
      Math.floor(totalSections * growth)
    ));

    const sectionData = [];

    for (let i = 0; i <= visibleSections; i++) {
      const t     = i / totalSections;
      const shape = shapes[i];

      let r = shape.r_base * (0.5 + 0.5 * growth);
      const tipTaper = 1 - Math.pow(i / visibleSections, 4);
      r *= Math.max(0.08, tipTaper);

      for (let j = 0; j < branch.segments; j++) {
        const ang = (j / branch.segments) * Math.PI * 2;

        // pine bark: ร่องตามแนวตั้ง
        const barkNoise =
          Math.sin(ang * 5 + i * 0.7 + level * 11.1) * 0.03
          * (level === 0 ? 1.0 : 0.35);
        const finalR = r * (1.0 + barkNoise * (level === 0 ? 0.20 : 0.08));

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

      sectionData.push({ origin: shape.origin, quat: shape.quat, radius: r });
    }

    // ── Needle clusters ────────────────────────────────────────────────
    // ออกตาม level >= 1, กระจายสม่ำเสมอตลอดกิ่ง (ไม่กระจุกปลาย)
    if (level >= 1 && age > 3) {
      const needleFactor = Math.min(1, (age - 3) / 50);

      for (let i = 0; i < sectionData.length; i++) {
        const t = i / Math.max(1, sectionData.length - 1);
        // สม่ำเสมอตลอดกิ่ง พร้อม bias เล็กน้อยที่ปลาย
        const chance = (0.45 + Math.pow(t, 1.2) * 0.40) * needleFactor;

        if (rand() < chance) {
          const ageBoost  = Math.min(1, age / 120);
          const clusters  = 2 + Math.floor(rand() * (3 + ageBoost * 3));
          const branchDir = new THREE.Vector3(0, 1, 0).applyQuaternion(sectionData[i].quat);

          for (let c = 0; c < clusters; c++) {
            const spread    = 0.18 + ageBoost * 0.35;
            const radialAng = rand() * Math.PI * 2;

            // ออกตั้งฉากกับกิ่ง
            let perp = new THREE.Vector3(Math.cos(radialAng), 0, Math.sin(radialAng));
            perp.addScaledVector(branchDir, -perp.dot(branchDir));
            if (perp.lengthSq() < 0.0001) perp.set(1, 0, 0);
            perp.normalize();

            const offset = new THREE.Vector3()
              .copy(perp).multiplyScalar(0.12 + rand() * spread)
              .addScaledVector(branchDir, (rand() - 0.5) * 0.25);

            leafPositions.push(sectionData[i].origin.clone().add(offset));
          }
        }
      }
    }

    // ── Child branches ─────────────────────────────────────────────────
    if (level === 0) {
      // trunk: spawn whorls
      spawnWhorls(sectionData, visibleSections, totalSections);
    } else if (level < maxDepth) {
      // branch: spawn sub-branches (1–2 near tip)
      spawnSubBranches(branch, sectionData, level, visibleSections, totalSections);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // spawnWhorls: วางกิ่งเป็นวงแหวนตลอดลำต้น
  // ────────────────────────────────────────────────────────────────────
  function spawnWhorls(sectionData, visibleSections, totalSections) {

    if (maxDepth < 1) return;

    // pine crown เริ่มที่ประมาณ 30-40% ของความสูง
    // กิ่งล่างสุดตาย/หลุดในต้นแก่ → crownBase สูงขึ้น
    const crownBase = Math.min(0.35, 0.10 + (age / 500) * 0.28);

    for (let w = 0; w < whorlsOnTrunk; w++) {

      // ตำแหน่ง whorl บนลำต้น (เริ่มจากโคน crown ขึ้นไปถึงยอด)
      // whorl 0 = ใกล้ยอด (เกิดล่าสุด), whorl สูง = ล่าง (เกิดก่อน)
      // เรียงจากล่างขึ้นบน: w=0 อยู่ที่ crownBase, w=last อยู่ที่ยอด
      const whorlT = crownBase + (w / Math.max(1, whorlsOnTrunk - 1)) * (0.97 - crownBase);

      // consume rand สำหรับ rotation offset ของ whorl นี้เสมอ
      const whorlRotOffset = rand() * Math.PI * 2;
      // แต่ละ whorl หมุนเยื้อง 180°/branchesPerWhorl จาก whorl ก่อนหน้า
      const whorlStagger = w * (Math.PI / branchesPerWhorl);

      const rawIdx = whorlT * (totalSections - 1);

      if (rawIdx > visibleSections) {
        // whorl ยังไม่โผล่ — consume rand ให้ครบ
        for (let i = 0; i < branchesPerWhorl; i++) {
          rand(); rand(); rand(); rand();
        }
        continue;
      }

      const secIdx    = Math.min(Math.floor(rawIdx), sectionData.length - 1);
      const parentSec = sectionData[secIdx];

      // heightRatio: 0 = crownBase, 1 = ยอด
      const heightRatio = (whorlT - crownBase) / Math.max(0.01, 0.97 - crownBase);

      for (let i = 0; i < branchesPerWhorl; i++) {

        // radial angle: กระจายสม่ำเสมอ 360° + jitter เล็กน้อย
        const radial = whorlRotOffset + whorlStagger
          + (i / branchesPerWhorl) * Math.PI * 2
          + (rand() - 0.5) * 0.15;

        const childQuat = parentSec.quat.clone();

        // หมุนรอบแกน Y ไปทิศ radial
        _qS.setFromAxisAngle(_up, radial);
        childQuat.multiply(_qS);

        // ── elevation angle ─────────────────────────────────────────
        // Pine silhouette: กิ่งล่าง ~90° (แนวนอน) กิ่งบน ~50° (ชี้ขึ้น)
        // heightRatio=0 → angle=90°, heightRatio=1 → angle=50°
        const elevAngle = (90 - heightRatio * 42 + (rand() - 0.5) * 8) * Math.PI / 180;
        _qF.setFromAxisAngle(new THREE.Vector3(1, 0, 0), elevAngle);
        childQuat.multiply(_qF);

        // ── branch length ────────────────────────────────────────────
        // กิ่งล่าง (heightRatio~0) ยาวสุด, กิ่งบน (heightRatio~1) สั้นสุด
        // → ได้รูปทรงกรวย
        const lengthRatio = 0.85 - heightRatio * 0.72;  // 0.85 → 0.13
        const branchLen   = params.length[1] * lengthRatio * (0.80 + rand() * 0.28);

        // ── droop ────────────────────────────────────────────────────
        // กิ่งล่างห้อย ปลายห้อยลงนิดหน่อย, กิ่งบนเกือบตรง
        const droopFactor = Math.max(0, 0.50 - heightRatio * 0.52);

        // ── birthAge ─────────────────────────────────────────────────
        // pine ออก whorl 1 วงต่อปี → whorl ล่าง (เก่ากว่า) เกิดก่อน
        // w=0 เกิดเมื่อ age ≈ (ค่าต่ำ), w=last เกิดทีหลัง
        const birthAge = 5 + w * 8 + (rand() * 5);

        const child = new Branch(
          parentSec.origin,
          childQuat,
          branchLen,
          parentSec.radius * (0.38 + rand() * 0.18),
          1,
          params.sections[1],
          params.segments[1],
          birthAge
        );
        child.droopFactor  = droopFactor;
        child.heightRatio  = heightRatio;
        branchQueue.push(child);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // spawnSubBranches: กิ่งย่อย (level 2+) ออกจากกิ่งหลัก
  // ────────────────────────────────────────────────────────────────────
  function spawnSubBranches(branch, sectionData, level, visibleSections, totalSections) {

    const childLevel = level + 1;
    // กิ่งย่อยออก 2–4 อันต่อกิ่งแม่, กระจาย 2 ด้าน (herringbone pattern)
    const subCount = level === 1 ? 3 : 2;

    for (let i = 0; i < subCount; i++) {

      // ตำแหน่ง: กระจายตั้งแต่ 30% ถึง 85% ของกิ่งแม่
      const t      = 0.30 + (i / Math.max(1, subCount - 1)) * 0.55 + (rand() - 0.5) * 0.08;
      const rawIdx = t * (totalSections - 1);

      if (rawIdx > visibleSections) {
        rand(); rand(); rand();
        continue;
      }

      const secIdx    = Math.min(Math.floor(rawIdx), sectionData.length - 1);
      const parentSec = sectionData[secIdx];

      const childQuat = parentSec.quat.clone();

      // สลับซ้าย-ขวา (herringbone) + jitter
      const side   = i % 2 === 0 ? 1 : -1;
      const radial = side * (Math.PI / 2) + (rand() - 0.5) * 0.5;
      _qS.setFromAxisAngle(_up, radial);
      childQuat.multiply(_qS);

      // angle จากกิ่งแม่: ประมาณ 50–65°
      const elevAngle = (55 + (rand() - 0.5) * 12) * Math.PI / 180;
      _qF.setFromAxisAngle(new THREE.Vector3(1, 0, 0), elevAngle);
      childQuat.multiply(_qF);

      const childLen = params.length[childLevel] * (0.55 + rand() * 0.38);
      const birthAge = branch.birthAge + 10 + i * 10 + rand() * 12;

      const child = new Branch(
        parentSec.origin,
        childQuat,
        childLen,
        parentSec.radius * (0.45 + rand() * 0.20),
        childLevel,
        params.sections[childLevel],
        params.segments[childLevel],
        birthAge
      );
      child.droopFactor = (branch.droopFactor ?? 0) * 0.45;
      branchQueue.push(child);
    }
  }

  // ── geometry ─────────────────────────────────────────────────────────
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  return {
    geometry: geo,
    leafPositions,
    trunkHeight,
    crownRadius: trunkHeight * 0.45,
    maxDepth
  };
}