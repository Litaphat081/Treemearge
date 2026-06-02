import { Vec3, Quat, makeRNG } from './math3d.js';
import { BranchNode, TreeData } from './treeData.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function h3(a, b, c) {
  let x = (Math.imul(a|0,374761393)^Math.imul(b|0,668265263)^Math.imul(c|0,1274126177))|0;
  x = Math.imul(x^(x>>>13),1274126177);
  return ((x^(x>>>16))>>>0)/4294967296;
}

export function generateBirch(age, speciesData) {
  const seed     = speciesData.seed ?? 73531;
  const rootRand = makeRNG(seed);
  const tree     = new TreeData();

  // Size scaled 
  const gf = Math.min(age / speciesData.age.max, 1);
  const tH = Math.max(1.5, speciesData.trunk.heightAtMaturity_m * Math.pow(gf, 0.70));
  const tR = Math.max(0.10, (speciesData.trunk.girthGrowth_cm_per_year * age) / 628.3);

  tree.trunkHeight = tH;
  tree.crownRadius = tH * 0.72;

  // UI 
  const gnarlMult   = Math.max(0.01, speciesData._gnarlinessMult    ?? 1.0);
  const droopMult   = Math.max(0,    speciesData._droopMult         ?? 1.0);
  const angleOffset = speciesData._branchAngleOffset ?? 0;
  const foliageDens = Math.max(0.05, speciesData._foliageDensity    ?? 1.0);
  const branchCnt   = Math.max(2, Math.round(speciesData._branchCount ?? 9));

  // Number of branching levels driven by tree size 
  const maxD = tH < 3 ? 1 : tH < 8 ? 2 : 3;

  // Parameters 
  const P = {
    len:   [ tH, tH*0.58, tH*0.36, tH*0.18 ],
    rad:   [ tR*1.6, tR*0.34, tR*0.13, tR*0.050 ],
    sec:   [ 38, 20, 12, 7 ],
    seg:   [ 10,  6,  5, 4 ],
    child: [ branchCnt, 6, 3, 0 ],

    ang: [
      0,
      Math.max(10, Math.min(80, 66 + angleOffset)),
      Math.max(10, Math.min(80, 48 + angleOffset)),
      Math.max(10, Math.min(80, 34 + angleOffset)),
    ],

    
    gnar: [ 0, 0.020, 0.055, 0.120 ].map((g, i) => i === 0 ? 0 : g * gnarlMult),

    taper: [ 0.62, 0.74, 0.86, 0.94 ],

    droop: [
      0,
      0.38 * droopMult,
      1.90 * droopMult,
      3.80 * droopMult,
    ],

    
    start: [ 0.22, 0.18, 0.20 ],
    stop:  [ 0.82, 0.80, 0.76 ],


    minRadFrac: 0.30,
  };

  // Natural trunk
  const leanAxis  = new Vec3(rootRand() - 0.5, 0, rootRand() - 0.5).normalize();
  const rootQ     = Quat.fromAxisAngle(leanAxis, leanAngle).toArray();

  let bId = 0;
  const queue = [{
    origin: [0,0,0], quat: rootQ,
    lv: 0, id: bId++, radius: P.rad[0],
  }];

  while (queue.length) {
    const b = queue.shift();
    const { lv, id } = b;
    const rand  = makeRNG(seed ^ (id * 1009 + 17));
    const total = P.sec[lv];
    const shapes = bakeShape(b, total, P, rand);

    for (let i = 0; i <= total; i++) {
      const s      = shapes[i];
      const isLeaf = lv >= 2 && i >= Math.floor(total * 0.20);

      tree.nodes.push(new BranchNode({
        origin: s.origin, quat: s.quat, radius: s.r,
        level: lv, birthAge: 0, sectionIdx: i, branchId: id,
        segments: P.seg[lv], isLeafZone: isLeaf,
      }));

      if (isLeaf && h3(id, i, 9) < 0.55)
        emitFoliage(s.origin, id, i, tree, foliageDens);
    }

    if (lv < maxD) spawnChildren(b, shapes, total, P, rand, queue, () => bId++, lv);
  }

  return tree;
}

//  bakeShape 
function bakeShape(b, total, P, rand) {
  const lv   = b.lv;
  const jit  = lv === 0 ? 1.0 : 0.76 + rand() * 0.34;
  const sLen = (P.len[lv] * jit) / total;

  let q = new Quat(...b.quat);
  let o = new Vec3(...b.origin);
  let dX = 0, dZ = 0;

  return Array.from({ length: total + 1 }, (_, i) => {
    const t = i / total;
    const r = lv === 0
      ? Math.max(b.radius * 0.05, b.radius * Math.pow(1 - t, 0.54))
      : Math.max(0.003, b.radius * (1 - P.taper[lv] * t));

    const snap = { origin: o.toArray(), quat: q.toArray(), r };

    if (i < total) {
      // Gnarliness
      const g  = P.gnar[lv] * (0.18 + 0.82 * t);
      const rx = rand() - 0.5;
      const ry = (rand() - 0.5) * 0.06;
      const rz = rand() - 0.5;
      const rv = lv === 0 ? 0.30 : 0.12;
      const ax = new Vec3(rx - dX * rv, ry, rz - dZ * rv).normalize();
      q.multiply(Quat.fromAxisAngle(ax, g * 0.32));
      dX += rx; dZ += rz;

      // Droop correction
      if (lv > 0) {
        const dir    = new Vec3(0,1,0).applyQuat(q);
        const rise   = Math.max(0, 0.28 - t) / 0.28;       // 1→0 as t→0.28
        const droopT = Math.max(0, t - 0.20);
        const grav   = P.droop[lv] * Math.pow(droopT, 1.5);
        const push   = 0.18 + lv * 0.07;
        let tgt = new Vec3(o.x * push, 0.7 * rise - grav, o.z * push);
        if (tgt.length() < 0.04) tgt.set(0, -1, 0);
        tgt.normalize();
        q.slerp(Quat.fromUnitVectors(dir, tgt).multiply(q), 0.13);
      } else {
        // trunk
        const dir = new Vec3(0,1,0).applyQuat(q);
        const tgt = new Vec3(0, 1, 0);   // just pull back toward upright gently
        q.slerp(Quat.fromUnitVectors(dir, tgt).multiply(q), 0.06);
      }

      o.addScaled(new Vec3(0,1,0).applyQuat(q), sLen);
    }
    return snap;
  });
}


//  spawnChildren 
function spawnChildren(branch, shapes, total, P, rand, queue, nextId, lv) {
  const cl    = lv + 1;
  const count = P.child[lv];
  if (!count) return;

  const minR  = P.rad[cl] * P.minRadFrac;

  const baseOff = (rand() - 0.5) * 0.16;

  for (let i = 0; i < count; i++) {
    const frac   = count === 1 ? 0.5 : i / (count - 1);
    const t      = P.start[cl-1] + frac * (P.stop[cl-1] - P.start[cl-1])
                   + (rand() - 0.5) * 0.03;
    const rawIdx = Math.min(Math.floor(Math.max(0, t) * (total - 1)), shapes.length - 2);
    const sec    = shapes[rawIdx];

    
    if (sec.r < minR) { rand(); rand(); continue; }

    const parentQ = new Quat(...sec.quat);
    const fwd   = new Vec3(0,1,0).applyQuat(parentQ);
    const ref   = Math.abs(fwd.y) > 0.88 ? new Vec3(1,0,0) : new Vec3(0,1,0);
    const right = fwd.clone().cross(ref).normalize();
    const az   = baseOff + i * GOLDEN + (rand() - 0.5) * 0.22;
    const qAz  = Quat.fromAxisAngle(fwd, az);
    const spr  = right.clone().applyQuat(qAz).normalize();

    // elevation
    const elDeg = P.ang[cl] + (rand() - 0.5) * 9;
    const qEl   = Quat.fromAxisAngle(spr, elDeg * Math.PI / 180);
    const childQ = qEl.multiply(qAz).multiply(parentQ);

    // Child radius
    const childR = Math.min(P.rad[cl], Math.max(minR, sec.r * (0.52 + rand() * 0.18)));

    queue.push({
      origin:  sec.origin,
      quat:    childQ.toArray(),
      lv:      cl,
      id:      nextId(),
      radius:  childR,
    });
  }
}


//  emitFoliage 
function emitFoliage(org, bId, sId, tree, foliageDens = 1.0) {
  const base  = 3 + Math.floor(4 * Math.random());  
  const count = Math.max(1, Math.round(base * Math.max(0.05, foliageDens)));
  for (let k = 0; k < count; k++) {
    const u    = h3(bId, sId, k*3);
    const v    = h3(bId, sId, k*3+1);
    const dist = 0.04 + h3(bId, sId, k*3+2) * 0.24;
    tree.foliage.push([
      org[0] + dist * Math.sin(v*6.2) * Math.cos(u*6.2),
      org[1] - dist * 0.50 - 0.06,
      org[2] + dist * Math.sin(v*6.2) * Math.sin(u*6.2),
    ]);
  }
}