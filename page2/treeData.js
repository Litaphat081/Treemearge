export class BranchNode {
  constructor({ origin, quat, radius, level, birthAge, sectionIdx, branchId, segments,
                totalSections=1, isLeafZone=false, droopFactor=0, heightRatio=0 }) {
    this.origin=origin; this.quat=quat; this.radius=radius; this.level=level;
    this.birthAge=birthAge; this.sectionIdx=sectionIdx; this.branchId=branchId;
    this.totalSections=totalSections; this.segments=segments;
    this.isLeafZone=isLeafZone; this.droopFactor=droopFactor; this.heightRatio=heightRatio;
  }
}

export class TreeData {
  constructor() {
    this.nodes=[]; this.edges=[]; this.foliage=[];
    this.trunkHeight=0; this.crownRadius=0;
  }
}

// growth
export function branchGrowth(age, birthAge, duration=130) {
  const t = Math.max(0, Math.min(1, (age - birthAge) / duration));
  // smoothstep
  return t * t * (3 - 2 * t);
}

// float 
export function growthToSections(growth, totalSections) {
  return Math.max(0, Math.min(totalSections, growth * totalSections));
}
