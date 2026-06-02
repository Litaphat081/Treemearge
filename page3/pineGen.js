import { Vec3, Quat, makeRNG } from './math3d.js';
import { BranchNode, TreeData } from './treeData.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function generatePine(age, speciesData) {
  const seed     = speciesData.seed ?? 55577;
  const rand     = makeRNG(seed);
  const tree     = new TreeData();

  // Size from age
  const gf = Math.min(age / 500, 1);
  const tH = Math.max(2.0, speciesData.trunk.heightAtMaturity_m * Math.pow(gf, 0.72));
  const tR = Math.max(0.14, (speciesData.trunk.girthGrowth_cm_per_year * age) / 55 / (2 * Math.PI));

  tree.trunkHeight = tH;
  tree.crownRadius = tH * 0.38;

  // UI 
  const gnarlMult   = Math.max(0.01, speciesData._gnarlinessMult ?? 1.0);
  const gravMult    = Math.max(0,    speciesData._gravityMult    ?? 1.0);
  const crownBase   = Math.max(0.08, Math.min(0.70, speciesData._crownBase ?? 0.30));
  const coneTaper   = Math.max(0.2,  speciesData._coneTaper     ?? 1.0);
  const density     = Math.max(0.05, speciesData._foliageDensity ?? 1.0);
  const bPerWhorl   = Math.max(2, Math.round(speciesData.branching?.primaryBranchCount ?? 5));

  // Number of whorls 
  const whorlCount  = Math.max(3, Math.min(26, Math.round(tH * 1.4)));

  // Trunk 
  const trunkSec = 40;
  const trunkSegs = 10;
  const sLen = tH / trunkSec;

  let q = new Quat();
  let o = new Vec3(0, 0, 0);
  let dX = 0, dZ = 0;

  const trunkShapes = Array.from({ length: trunkSec + 1 }, (_, i) => {
    const t  = i / trunkSec;
    const r  = Math.max(tR * 0.05, tR * Math.pow(1 - t, 0.50));
    const snap = { origin: o.toArray(), quat: q.toArray(), r };
    if (i < trunkSec) {
      const g  = 0.006 * gnarlMult * (0.1 + 0.9 * t);
      const rx = rand() - 0.5, ry = (rand() - 0.5) * 0.05, rz = rand() - 0.5;
      const rv = 0.28;
      const ax = new Vec3(rx - dX*rv, ry, rz - dZ*rv).normalize();
      q.multiply(Quat.fromAxisAngle(ax, g * 0.30));
      dX += rx; dZ += rz;
      const dir = new Vec3(0,1,0).applyQuat(q);
      const tgt = new Vec3(0, 1, 0);
      q.slerp(Quat.fromUnitVectors(dir, tgt).multiply(q), 0.07);
      o.addScaled(new Vec3(0,1,0).applyQuat(q), sLen);
    }
    return snap;
  });

  // Emit trunk nodes
  let branchId = 0;
  for (let i = 0; i <= trunkSec; i++) {
    const s = trunkShapes[i];
    tree.nodes.push(new BranchNode({
      origin: s.origin, quat: s.quat, radius: s.r, level: 0,
      birthAge: 0, sectionIdx: i, branchId: branchId,
      segments: trunkSegs, isLeafZone: false,
    }));
  }
  branchId++;

  // Whorls
  const whorlTop  = 0.95;
  const minJuncR  = tR * 0.10;   // radius guard

  for (let w = 0; w < whorlCount; w++) {
    const wT     = whorlCount === 1 ? 0.5 : w / (whorlCount - 1);   // 0=bottom 1=top
    const trunkT = crownBase + wT * (whorlTop - crownBase);
    const tIdx   = Math.min(Math.floor(trunkT * trunkSec), trunkSec - 1);
    const junc   = trunkShapes[tIdx];

    if (junc.r < minJuncR) continue;   // ★ radius guard — no floating whorls

    // Cone 
    const baseAngle = 88 - wT * (56 * Math.min(2, coneTaper));

    // length
    const lenScale  = 0.96 - wT * Math.min(0.80, 0.72 * coneTaper);

    // Gravity droop
    const droopStr  = gravMult * wT * 1.2;   
    const whorlOff  = w * (Math.PI / bPerWhorl);

    for (let b = 0; b < bPerWhorl; b++) {
      const azimuth = whorlOff + (b / bPerWhorl) * Math.PI * 2 + (rand() - 0.5) * 0.10;
      const parentQ = new Quat(...junc.quat);
      const upAxis  = new Vec3(0,1,0).applyQuat(parentQ);
      const qAz     = Quat.fromAxisAngle(upAxis, azimuth);
      const rotQ    = qAz.clone().multiply(parentQ);
      const rightAx = new Vec3(1,0,0).applyQuat(rotQ);
      const aDeg    = Math.max(5, Math.min(88, baseAngle + (rand() - 0.5) * 5));
      const qEl     = Quat.fromAxisAngle(rightAx, aDeg * Math.PI / 180);
      const branchQ = qEl.multiply(qAz).multiply(parentQ);

      // Primary branch length & radius
      const primLen = (tH * 0.55) * Math.max(0.04, lenScale) * (0.86 + rand() * 0.18);
      const primR   = junc.r * (0.28 + rand() * 0.12);

      if (primR < tR * 0.04) { rand(); continue; }

      const primId  = branchId++;
      const subRand = makeRNG(seed ^ primId * 997 + 3);
      const pShapes = bakeBranch(junc.origin, branchQ.toArray(), primLen, primR, 1,
                                 18, gnarlMult, droopStr, subRand);

      for (let i = 0; i <= 18; i++) {
        const s      = pShapes[i];
        const isLeaf = i >= 5;  
        tree.nodes.push(new BranchNode({
          origin: s.origin, quat: s.quat, radius: s.r, level: 1,
          birthAge: 0, sectionIdx: i, branchId: primId,
          segments: 6, isLeafZone: isLeaf,
        }));
        if (isLeaf) emitNeedles(s.origin, primId, i, density, rand, tree);
      }

      // Sub-branches
      const subCount = 4;
      const subMinR  = primR * 0.25;
      for (let si = 0; si < subCount; si++) {
        const st     = 0.18 + (si / (subCount - 1)) * 0.60;
        const sIdx   = Math.min(Math.floor(st * 17), pShapes.length - 2);
        const sJunc  = pShapes[sIdx];
        if (sJunc.r < subMinR) { subRand(); subRand(); continue; }

        const side     = si % 2 === 0 ? 1 : -1;
        const sAz      = side * (Math.PI * 0.5) + (subRand() - 0.5) * 0.32;
        const sPQ      = new Quat(...sJunc.quat);
        const sFwd     = new Vec3(0,1,0).applyQuat(sPQ);
        const sRef     = Math.abs(sFwd.y) > 0.88 ? new Vec3(1,0,0) : new Vec3(0,1,0);
        const sRight   = sFwd.clone().cross(sRef).normalize();
        const sqAz     = Quat.fromAxisAngle(sFwd, sAz);
        const sSpr     = sRight.clone().applyQuat(sqAz).normalize();
        const sEl      = 52 + (subRand() - 0.5) * 10;
        const sqEl     = Quat.fromAxisAngle(sSpr, sEl * Math.PI / 180);
        const subQ     = sqEl.multiply(sqAz).multiply(sPQ);

        const subLen   = primLen * (0.38 + subRand() * 0.18);
        const subR     = sJunc.r * (0.46 + subRand() * 0.18);
        const subId    = branchId++;
        const s2Rand   = makeRNG(seed ^ subId * 883 + 5);
        const s2Shapes = bakeBranch(sJunc.origin, subQ.toArray(), subLen, subR, 2,
                                    10, gnarlMult, droopStr * 0.6, s2Rand);

        for (let i = 0; i <= 10; i++) {
          const ss     = s2Shapes[i];
          const isLeaf = i >= 2;
          tree.nodes.push(new BranchNode({
            origin: ss.origin, quat: ss.quat, radius: ss.r, level: 2,
            birthAge: 0, sectionIdx: i, branchId: subId,
            segments: 5, isLeafZone: isLeaf,
          }));
          if (isLeaf) emitNeedles(ss.origin, subId, i, density * 0.7, s2Rand, tree);
        }
      }
    }
  }

  return tree;
}

//  bakeBranch
function bakeBranch(origin, quatArr, length, baseR, level, secs, gnarlMult, droopStr, rand) {
  const sLen = length / secs;
  let q = new Quat(...quatArr);
  let o = new Vec3(...origin);
  let dX = 0, dZ = 0;

  return Array.from({ length: secs + 1 }, (_, i) => {
    const t = i / secs;
    const taper = level === 1 ? 0.72 : 0.86;
    const r = Math.max(baseR * 0.04, baseR * (1 - taper * t));
    const snap = { origin: o.toArray(), quat: q.toArray(), r };

    if (i < secs) {
      const g  = (level === 1 ? 0.018 : 0.040) * gnarlMult * (0.20 + 0.80 * t);
      const rx = rand() - 0.5, ry = (rand() - 0.5) * 0.06, rz = rand() - 0.5;
      const rv = 0.14;
      const ax = new Vec3(rx - dX*rv, ry, rz - dZ*rv).normalize();
      q.multiply(Quat.fromAxisAngle(ax, g * 0.30));
      dX += rx; dZ += rz;

      // Gravity droop
      const dir   = new Vec3(0,1,0).applyQuat(q);
      const grav  = droopStr * Math.pow(t, 1.4);
      const push  = 0.15 + level * 0.06;
      let tgt = new Vec3(o.x * push, 0.6 - grav, o.z * push);
      if (tgt.length() < 0.04) tgt.set(0, -1, 0);
      tgt.normalize();
      q.slerp(Quat.fromUnitVectors(dir, tgt).multiply(q), 0.14);
      o.addScaled(new Vec3(0,1,0).applyQuat(q), sLen);
    }
    return snap;
  });
}


//  emitNeedles 
function emitNeedles(origin, brId, secIdx, density, rand, tree) {
  if (rand() > 0.42 * Math.max(0.1, density)) return;

  const count = Math.max(1, Math.round(1 + rand() * 1.5 * Math.max(0.05, density)));

  for (let k = 0; k < count; k++) {
    const theta = rand() * Math.PI * 2;
    const phi   = Math.acos(2 * rand() - 1);
    const dist  = 0.04 + rand() * 0.18;
    tree.foliage.push([
      origin[0] + dist * Math.sin(phi) * Math.cos(theta),
      origin[1] + dist * Math.cos(phi) * 0.25,   
      origin[2] + dist * Math.sin(phi) * Math.sin(theta),
    ]);
  }
}