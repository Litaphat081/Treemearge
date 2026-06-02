import { Vec3, Quat, makeRNG }                                 from './math3d.js';
import { BranchNode, TreeData, branchGrowth, growthToSections } from './treeData.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function generateWillow(age, speciesData) {
  const rand = makeRNG(speciesData.seed ?? 38291);
  const tree = new TreeData();

  const gf          = Math.min(age / speciesData.age.max, 1);
  const trunkHeight = Math.max(0.8, speciesData.trunk.heightAtMaturity_m * Math.pow(gf, 0.68));
  const trunkRadius = Math.max(0.14, (speciesData.trunk.girthGrowth_cm_per_year * age) / 55 / (2 * Math.PI));

  tree.trunkHeight = trunkHeight;
  tree.crownRadius = trunkHeight * 0.90;

  // UI 
  const droopMult    = Math.max(0, speciesData._droopMult         ?? 1.0);
  const gnarlMult    = Math.max(0.01, speciesData._gnarlinessMult ?? 1.0);
  const angleOffset  = speciesData._branchAngleOffset ?? 0;
  const crownBase    = Math.max(0.05, Math.min(0.70,
    speciesData._crownBase ?? speciesData.crown?.baseHeightRatio ?? 0.30));
  const primaryCount = Math.max(2, Math.round(
    speciesData._primaryCount ?? speciesData.branching?.primaryBranchCount ?? 7));
  const foliageDens  = Math.max(0.05, speciesData._foliageDensity ?? 1.0);

  const maxDepth = age < 3 ? 0 : age < 8 ? 1 : age < 20 ? 2 : age < 50 ? 3 : 4;

  const P = {
    length:   [trunkHeight, trunkHeight*0.78, trunkHeight*0.50, trunkHeight*0.30, trunkHeight*0.16],
    radius:   [trunkRadius, trunkRadius*0.30, trunkRadius*0.15, trunkRadius*0.07, trunkRadius*0.035],
    sections: [40, 22, 14, 10, 6],
    segments: [12,  8,  7,  6,  5],
    angle: [0, 62, 52, 42, 35].map((a, i) =>
      i === 0 ? 0 : Math.max(5, Math.min(85, a + angleOffset))
    ),

    gnarliness: [age<60?0.006:0.020, 0.04, 0.10, 0.20, 0.30].map(g => g * gnarlMult),

    taper: [0.52, 0.65, 0.78, 0.88, 0.94],
    start: [0.20, 0.16, 0.20, 0.26],
    stop:  [0.96, 0.92, 0.88, 0.84],
    droop: [
      0,
      3.2  * droopMult,    
      8.0  * droopMult,    
      13.0 * droopMult,    
      18.0 * droopMult,    
    ],
  };

  let branchId = 0;
  const queue  = [{
    origin:[0,0,0], quat:[0,0,0,1],
    length:P.length[0], radius:P.radius[0],
    level:0, sections:P.sections[0], segments:P.segments[0],
    birthAge:0, id:branchId++,
  }];

  while (queue.length > 0) {
    const branch = queue.shift();
    if (age < branch.birthAge) continue;

    const { level, sections: total, segments } = branch;
    const growth  = branchGrowth(age, branch.birthAge, 50);
    const visible = Math.floor(growthToSections(growth, total));
    const shapes  = bakeShape(branch, total, P, rand);

    for (let i = 0; i <= visible; i++) {
      const s = shapes[i];
      let r   = s.r_base * (0.58 + 0.42 * growth);
      r      *= Math.max(0.06, 1 - Math.pow(i / Math.max(1, visible), 5));
      const isLeaf = level >= 1 && i >= Math.floor(total * 0.30);

      tree.nodes.push(new BranchNode({
        origin:s.origin, quat:s.quat, radius:r, level,
        birthAge:branch.birthAge, sectionIdx:i, branchId:branch.id,
        segments, isLeafZone:isLeaf,
      }));

      if (isLeaf && age > 2) {
        const t = i / total;
        if (rand() < Math.pow(Math.max(0, (t - 0.20) / 0.80), 0.5) * 0.92)
          emitFoliage(s.origin, age, rand, tree, level, foliageDens);
      }
    }

    if (level < maxDepth)
      spawnChildren(branch, shapes, visible, total, P, rand, queue,
        () => branchId++, primaryCount, crownBase, level);
  }

  return tree;
}

//  bakeShape 
function bakeShape(branch, total, P, rand) {
  const lv   = branch.level;
  const sLen = branch.length / total;
  let q = new Quat(...branch.quat), o = new Vec3(...branch.origin);
  let driftX = 0, driftZ = 0;

  return Array.from({ length: total + 1 }, (_, i) => {
    const t      = i / total;
    const r_base = lv === 0
      ? Math.max(branch.radius * 0.08, branch.radius * Math.pow(1 - t, 0.55))
      : Math.max(0.005, branch.radius * (1 - P.taper[lv] * t));
    const snap = { origin: o.toArray(), quat: q.toArray(), r_base };

    if (i < total) {
      const g  = P.gnarliness[lv] * (0.20 + 0.80 * t);
      const rx = rand() - 0.5, ry = (rand() - 0.5) * 0.08, rz = rand() - 0.5;
      const rev  = lv === 0 ? 0.28 : 0.10;
      const axis = new Vec3(rx - driftX*rev, ry, rz - driftZ*rev).normalize();
      q.multiply(Quat.fromAxisAngle(axis, g * 0.32));
      driftX += rx; driftZ += rz;

      const dir = new Vec3(0,1,0).applyQuat(q);
      let tgt;

      if (lv === 0) {
        tgt = new Vec3(o.x * 0.02, 8, o.z * 0.02);
      } else {
        const upPhase   = Math.max(0, 0.25 - t) / 0.25;          
        const droopPhase = Math.max(0, t - 0.15);                 
        const grav      = P.droop[lv] * Math.pow(droopPhase, 1.4); 
        const outward = lv === 1 ? 0.12 : 0.06;

        tgt = new Vec3(
          o.x * outward,
          1.2 * upPhase - grav,   
          o.z * outward
        );

    
        if (tgt.length() < 0.1) tgt.set(0, -1, 0);
      }

      tgt.normalize();
      const slerpStr = lv === 0 ? 0.12 : 0.28;
      q.slerp(Quat.fromUnitVectors(dir, tgt).multiply(q), slerpStr);
      o.addScaled(new Vec3(0,1,0).applyQuat(q), sLen);
    }
    return snap;
  });
}


//  spawnChildren
function spawnChildren(branch, shapes, visible, total, P, rand, queue, nextId,
  primaryCount, crownBase, lv) {

  const cl = lv + 1;

  if (lv === 0) {
    const whorlTop = 0.75;
    for (let i = 0; i < primaryCount; i++) {
      const wT     = primaryCount === 1 ? 0.5 : i / (primaryCount - 1);
      const trunkT = crownBase + wT * (whorlTop - crownBase);
      const rawIdx = Math.min(Math.floor(trunkT * (total - 1)), shapes.length - 1);

      if (rawIdx > visible) { rand(); rand(); rand(); continue; }

      const sec = shapes[rawIdx];

      const baseAngle = Math.max(5, Math.min(85,
        (72 - wT * 18) + (P.angle[1] - 62)
      ));
      const lenRatio = 0.92 - wT * 0.22;

      const radial  = i * GOLDEN + (rand() - 0.5) * 0.22;
      const parentQ = new Quat(...sec.quat);
      const upAxis  = new Vec3(0,1,0).applyQuat(parentQ);
      const qRadial = Quat.fromAxisAngle(upAxis, radial);
      const rotQ    = qRadial.clone().multiply(parentQ);
      const rightAx = new Vec3(1,0,0).applyQuat(rotQ);
      const angleDeg = baseAngle + (rand() - 0.5) * 8;
      const qElev   = Quat.fromAxisAngle(rightAx, angleDeg * Math.PI / 180);
      const childQ  = qElev.multiply(qRadial).multiply(parentQ);

      queue.push({
        origin:   sec.origin,
        quat:     childQ.toArray(),
        length:   P.length[1] * Math.max(0.05, lenRatio) * (0.80 + rand() * 0.22),
        radius:   sec.r_base  * (0.28 + rand() * 0.12),
        level:    1,
        sections: P.sections[1],
        segments: P.segments[1],
        birthAge: 3 + i * 5 + rand() * 4,
        id:       nextId(),
      });
    }
    return;
  }

  const count      = lv === 1 ? 7 : lv === 2 ? 5 : 3;
  const start      = P.start[lv - 1];
  const stop       = P.stop[lv - 1];
  const baseOffset = (rand() - 0.5) * 0.16;

  for (let i = 0; i < count; i++) {
    const t      = start + (i / Math.max(1, count-1)) * (stop - start) + (rand()-0.5) * 0.04;
    const rawIdx = Math.min(Math.floor(t * (total-1)), shapes.length-1);
    if (rawIdx > visible) { rand(); rand(); rand(); rand(); continue; }

    const sec      = shapes[rawIdx];
    const radial   = baseOffset + i * GOLDEN + (rand()-0.5) * 0.26;
    const parentQ  = new Quat(...sec.quat);
    const parentFwd = new Vec3(0,1,0).applyQuat(parentQ);
    const sideAx   = new Vec3(1,0,0).applyQuat(parentQ);
    const biasedAx = new Vec3(
      parentFwd.x + sideAx.x * 0.15,
      parentFwd.y,
      parentFwd.z + sideAx.z * 0.15,
    ).normalize();

    const qRadial  = Quat.fromAxisAngle(biasedAx, radial);
    const rotQ     = qRadial.clone().multiply(parentQ);
    const rightAx  = new Vec3(1,0,0).applyQuat(rotQ);
    const angleDeg = P.angle[cl] + (rand()-0.5) * 14;
    const qElev    = Quat.fromAxisAngle(rightAx, angleDeg * Math.PI / 180);
    const childQ   = qElev.multiply(qRadial).multiply(parentQ);

    queue.push({
      origin:   sec.origin,
      quat:     childQ.toArray(),
      length:   P.length[cl] * (0.65 + rand() * 0.38),
      radius:   sec.r_base   * (0.48 + rand() * 0.22),
      level:    cl,
      sections: P.sections[cl],
      segments: P.segments[cl],
      birthAge: branch.birthAge + 7 + cl*9 + t*22 + rand()*9,
      id:       nextId(),
    });
  }
}


//  emitFoliage 

function emitFoliage(origin, age, rand, tree, level, foliageDens = 1.0) {
  const boost  = Math.min(1, age / 70);
  const base   = 3 + Math.floor(rand() * 5);
  const n      = Math.max(1, Math.round(base * Math.max(0.05, foliageDens)));
  const spreadH = 0.06 + boost * 0.12;   
  const spreadV = 0.08 + boost * 0.18;  

  for (let c = 0; c < n; c++) {
    const theta = rand() * Math.PI * 2;
    const distH = Math.pow(rand(), 0.7) * spreadH;
    const distV = rand() * spreadV;  

    tree.foliage.push([
      origin[0] + distH * Math.cos(theta),
      origin[1] - distV,               
      origin[2] + distH * Math.sin(theta),
    ]);
  }
}