import { Vec3, Quat }              from './math3d.js';
import { branchGrowth, growthToSections } from './treeData.js';

export function buildTreeBuffers(treeData, age) {
  const positions=[], normals=[], uvs=[], indices=[];

  // group nodes 
  const byBranch = new Map();
  for (const node of treeData.nodes) {
    if (!byBranch.has(node.branchId)) byBranch.set(node.branchId, []);
    byBranch.get(node.branchId).push(node);
  }

  for (const [, nodes] of byBranch) {
    nodes.sort((a, b) => a.sectionIdx - b.sectionIdx);
    const totalSections = nodes.length - 1;
    if (totalSections < 1) continue;

    const first    = nodes[0];
    const growth   = branchGrowth(age, first.birthAge);
    if (growth <= 0) continue;

    // fractional visible length 
    const visibleF   = growthToSections(growth, totalSections);
    const visibleInt = Math.floor(visibleF);
    const frac       = visibleF - visibleInt;   // 0→1: ส่วนที่โผล่ของ section ถัดไป

    if (visibleInt < 1) continue;

    const segments = first.segments;
    const startVtx = positions.length / 3;

    // render rings 
    const ringCount = visibleInt + (frac > 0.01 ? 1 : 0);

    for (let i = 0; i <= Math.min(ringCount, totalSections); i++) {
      const node = nodes[i];
      const t    = i / totalSections;

      // radius 
      let r = node.radius * (0.5 + 0.5 * growth);

      if (i === visibleInt && frac > 0.01 && i < totalSections) {
        const nextR = nodes[i + 1].radius * (0.5 + 0.5 * growth);
        r = r * (1 - frac) + nextR * frac;
        r *= Math.max(0.04, frac * 0.6);
      } else {
        r *= Math.max(0.08, 1 - Math.pow(i / Math.max(1, visibleInt), 4.5));
      }

      // lerp origin
      let origin = new Vec3(...node.origin);
      let quat   = new Quat(...node.quat);

      if (i === visibleInt && frac > 0.01 && i < totalSections) {
        const nxt = nodes[i + 1];
        const no  = new Vec3(...nxt.origin);
        const nq  = new Quat(...nxt.quat);
        origin = new Vec3(
          origin.x + (no.x - origin.x) * frac,
          origin.y + (no.y - origin.y) * frac,
          origin.z + (no.z - origin.z) * frac,
        );
        quat = quat.slerp(nq, frac);
      }

      // emit ring 
      for (let j = 0; j < segments; j++) {
        const ang  = (j / segments) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const barkNoise = Math.sin(i * 1.3 + node.level * 17.7 + ang * 8 + t * 14) * 0.04;
        const noiseStrength = node.level === 0 ? 0.05 : 0.4; 
        const finalR = r * (1 + barkNoise * noiseStrength);

        const pos = new Vec3(cosA * finalR, 0, sinA * finalR).applyQuat(quat).add(origin);
        const nrm = new Vec3(cosA, 0, sinA).applyQuat(quat).normalize();

        positions.push(pos.x, pos.y, pos.z);
        normals.push(nrm.x, nrm.y, nrm.z);
        uvs.push(j / (segments - 1), t);
      }

      // faces between ring 
      if (i > 0) {
        const p = startVtx + (i - 1) * segments;
        const c = startVtx + i * segments;
        for (let j = 0; j < segments; j++) {
          const nx = (j + 1) % segments;
          indices.push(p+j, c+j, p+nx,  p+nx, c+j, c+nx);
        }
      }
    }
  }

  return {
    position: new Float32Array(positions),
    normal:   new Float32Array(normals),
    uv:       new Float32Array(uvs),
    index:    new Uint32Array(indices),
  };
}