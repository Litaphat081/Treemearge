import { Vec3, Quat, makeRNG }                                  from './math3d.js';
import { BranchNode, TreeData, branchGrowth, growthToSections }  from './treeData.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function generateOak(age, speciesData) {
  const rand = makeRNG(speciesData.seed ?? 99999);
  const tree = new TreeData();

  const gf          = Math.min(age / 500, 1);
  const trunkHeight = Math.max(1.0, speciesData.trunk.heightAtMaturity_m * Math.pow(gf, 0.75));
  const trunkRadius = Math.max(0.18, (speciesData.trunk.girthGrowth_cm_per_year * age) / 55 / (2 * Math.PI));

  tree.trunkHeight = trunkHeight;
  tree.crownRadius = trunkHeight * 1.5;

  // UI 
  const gnarlMult    = Math.max(0.01, speciesData._gnarlinessMult   ?? 1.0);
  const angleOffset  = speciesData._branchAngleOffset ?? 0;          // degrees added to every branch angle
  const gravityMult  = Math.max(0,    speciesData._gravityMult      ?? 1.0);
  const crownSpread  = Math.max(0.2,  speciesData._crownSpread      ?? 1.0);  // 0.2 = upright, 2 = sprawling

  const maxDepth = age<10?0 : age<30?1 : age<80?2 : age<150?3 : age<300?4 : 5;

  // Per-level parameters 
  const baseAngles    = [0, 80, 70, 58, 46, 34];
  const baseGnarliness = [age<80?0.02:0.05, 0.20, 0.24, 0.38, 0.52, 0.65];

  const P = {
    length:     [trunkHeight, trunkHeight*.70*crownSpread, trunkHeight*.45*crownSpread, trunkHeight*.30, trunkHeight*.20, trunkHeight*.12],
    radius:     [trunkRadius, trunkRadius*.45, trunkRadius*.25, trunkRadius*.12, trunkRadius*.06, trunkRadius*.03],
    sections:   [35, 20, 15, 12, 8, 5],
    segments:   [12, 10,  8,  7, 6, 6],
    children:   [age<12?0:speciesData.branching.primaryBranchCount, 6, 4, 2, 2, 0],
    // apply angleOffset to levels 1-5 
    angle:      baseAngles.map((a, i) => i === 0 ? 0 : Math.max(5, Math.min(88, a + angleOffset))),
    // apply gnarlMult uniformly
    gnarliness: baseGnarliness.map(g => g * gnarlMult),
    taper:      [0.55, 0.75, 0.85, 0.90, 0.95, 0.98],
    start:      [0.44, 0.34, 0.36, 0.40, 0.44, 0.50],
    stop:       [0.78, 0.88, 0.86, 0.83, 0.80, 0.76],
    gravityMult,   // passed into bakeShape
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
    const growth  = branchGrowth(age, branch.birthAge);
    const visible = Math.floor(growthToSections(growth, total));
    const shapes  = bakeShape(branch, total, P, rand);

    // emit nodes
    for (let i = 0; i <= visible; i++) {
      const s      = shapes[i];
      let r        = s.r_base * (0.58 + 0.42 * growth);
      r           *= Math.max(0.10, 1 - Math.pow(i / Math.max(1, visible), 5));
      const isLeaf = level >= 2 && i >= Math.floor(total * 0.68);

      tree.nodes.push(new BranchNode({
        origin:s.origin, quat:s.quat, radius:r, level,
        birthAge:branch.birthAge, sectionIdx:i, branchId:branch.id,
        segments, isLeafZone:isLeaf,
      }));

      if (isLeaf && age > 12) {
        const t = i / total;
        if (rand() < Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.0) * 0.82)
          emitFoliage(s.origin, age, rand, tree, speciesData);
      }
    }

    // spawn children
    if (level < maxDepth)
      spawnChildren(branch, shapes, visible, total, P, rand, queue, () => branchId++);
  }

  return tree;
}


// bakeShape

function bakeShape(branch, total, P, rand) {
  const lv   = branch.level;
  const sLen = branch.length / total;
  let q = new Quat(...branch.quat), o = new Vec3(...branch.origin);
  let driftX = 0, driftZ = 0;
  const gMult = P.gravityMult ?? 1.0;

  return Array.from({ length: total + 1 }, (_, i) => {
    const t      = i / total;
    const r_base = lv === 0
      ? Math.max(0.20, branch.radius * Math.pow(1 - t, 0.68))
      : Math.max(0.010, branch.radius * (1 - P.taper[lv] * t));
    const snap = { origin: o.toArray(), quat: q.toArray(), r_base };

    if (i < total) {
      // gnarliness 
      const g  = P.gnarliness[lv] * (0.35 + 0.65 * t);
      const rx = rand() - 0.5, ry = (rand() - 0.5) * 0.12, rz = rand() - 0.5;

      // mean-reversion 
      const rev  = lv === 0 ? 0.28 : 0.16;
      const axis = new Vec3(rx - driftX*rev, ry, rz - driftZ*rev).normalize();
      q.multiply(Quat.fromAxisAngle(axis, g * 0.42));
      driftX += rx; driftZ += rz;

      // phototropism + gravity 
      const dir = new Vec3(0,1,0).applyQuat(q);
      const tgt = new Vec3(0, 3, 0);
      if (lv > 0) {
        // gravity strength 
        const grav = (lv * 0.28 * gMult) * t * t;
        tgt.y -= grav;
        // centripetal pull
        tgt.x -= o.x * 0.05;
        tgt.z -= o.z * 0.05;
      }
      tgt.normalize();
      q.slerp(Quat.fromUnitVectors(dir, tgt).multiply(q), lv===0 ? 0.11 : 0.07);
      o.addScaled(new Vec3(0,1,0).applyQuat(q), sLen);
    }
    return snap;
  });
}


// spawnChildren

function spawnChildren(branch, shapes, visible, total, P, rand, queue, nextId) {
  const lv    = branch.level;
  const cl    = lv + 1;
  const count = P.children[lv] || 0;

  const baseOffset = (rand() - 0.5) * 0.22;

  for (let i = 0; i < count; i++) {
    const span   = P.stop[cl] - P.start[cl];
    const t      = Math.max(0.10, Math.min(0.95,
      P.start[cl] + (i / Math.max(1, count-1)) * span + (rand()-0.5) * 0.06
    ));
    const rawIdx = Math.min(Math.floor(t * (total-1)), shapes.length-1);

    if (rawIdx > visible) { for (let k=0;k<5;k++) rand(); continue; }

    const sec = shapes[rawIdx];

    // radial: rotate around parent forward axis 
    const radialAngle = baseOffset + i * GOLDEN + (rand()-0.5) * 0.30;
    const parentQ     = new Quat(...sec.quat);
    const parentFwd   = new Vec3(0,1,0).applyQuat(parentQ);
    const sideBias    = new Vec3(1,0,0).applyQuat(parentQ);
    const biasedAxis  = new Vec3(
      parentFwd.x + sideBias.x * 0.25,
      parentFwd.y,
      parentFwd.z + sideBias.z * 0.25
    ).normalize();

    const qRadial = Quat.fromAxisAngle(biasedAxis, radialAngle);

    // elevation
    const rotatedQ  = qRadial.clone().multiply(parentQ);
    const rightAxis = new Vec3(1,0,0).applyQuat(rotatedQ);
    // P.angle[cl] 
    const angleDeg  = P.angle[cl] + (rand()-0.5) * 14;
    const qElev     = Quat.fromAxisAngle(rightAxis, angleDeg * Math.PI / 180);

    const childQ = qElev.multiply(qRadial).multiply(parentQ);

    const birthAge = lv === 0
      ? 8 + i * 13 + rand() * 7
      : branch.birthAge + 16 + cl*13 + t*32 + rand()*14;

    queue.push({
      origin:   sec.origin,
      quat:     childQ.toArray(),
      length:   P.length[cl] * (0.62 + rand() * 0.44),
      radius:   sec.r_base   * (0.50 + rand() * 0.28),
      level:    cl,
      sections: P.sections[cl],
      segments: P.segments[cl],
      birthAge,
      id:       nextId(),
    });
  }
}

// emitFoliage 

function emitFoliage(origin, age, rand, tree, speciesData) {
  const densityMult = speciesData._foliageDensity ?? 1.0;
  const boost  = Math.min(1, age / 220);
  const n      = Math.round((5 + Math.floor(rand() * 8)) * Math.max(0.1, densityMult));
  const spread = 0.72 + boost * 1.0;
  for (let c = 0; c < n; c++) {
    const theta = rand() * Math.PI * 2;
    const phi   = Math.acos(2 * rand() - 1);
    const dist  = Math.pow(rand(), 0.55) * spread;
    tree.foliage.push([
      origin[0] + dist * Math.sin(phi) * Math.cos(theta),
      origin[1] + dist * Math.cos(phi) * 0.65,
      origin[2] + dist * Math.sin(phi) * Math.sin(theta),
    ]);
  }
}