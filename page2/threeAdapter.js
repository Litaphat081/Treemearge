import { buildTreeBuffers } from './treeGeometry.js';

export function buildThreeGeometry(treeData, age) {
  const THREE = window.THREE;
  const buf   = buildTreeBuffers(treeData, age);
  const geo   = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf.position, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(buf.normal,   3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(buf.uv,       2));
  geo.setIndex(new THREE.BufferAttribute(buf.index, 1));
  return geo;
}


// buildThreeInstancedFoliage
export function buildThreeInstancedFoliage(
  treeData, material, age, ageMax,
  planeW = 1.2, planeH = 1.2
) {
  const THREE      = window.THREE;
  const positions  = treeData.foliage;

  // season / density 
  const densityMult  = Math.max(0.01, treeData.densityMult  ?? 1.0);
  const leafOpacity  = Math.max(0,    Math.min(1, treeData.leafOpacity ?? 1.0));
  const leafTint     = treeData.leafTint ?? 0xffffff;

  const leafFactor   = Math.min(1, Math.max(0, (age - 5) / 80));
  const smoothFactor = leafFactor * leafFactor * leafOpacity;

  if (positions.length === 0 || smoothFactor < 0.001) return new THREE.Group();

  // leaf plane geometry 
  const leafGeo = new THREE.PlaneGeometry(planeW, planeH, 2, 2);
  const posAttr = leafGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const lx = posAttr.getX(i);
    const ly = posAttr.getY(i);
    posAttr.setZ(i, -(lx*lx + ly*ly) * 0.08);
  }
  posAttr.needsUpdate = true;
  leafGeo.computeVertexNormals();

  // clone material so tint doesn't bleed back into shared material 
  const mat = material.clone();
  mat.color.set(leafTint);
  // reduce opacity for autumn / winter
  if (leafOpacity < 1) {
    mat.transparent = true;
    mat.opacity     = leafOpacity;
  }

  // instance count 
  const planesPerPoint = 4;
  const maxCount       = positions.length * planesPerPoint;
  const count          = Math.max(4, Math.floor(maxCount * smoothFactor * densityMult));

  const instMesh         = new THREE.InstancedMesh(leafGeo, mat, count);
  instMesh.castShadow    = true;
  instMesh.receiveShadow = false;

  // Store per-instance 
  instMesh.userData.windPhases = new Float32Array(count);
  instMesh.userData.windAmps   = new Float32Array(count);
  instMesh.userData.basePos    = new Float32Array(count * 3);   

  // seeded RNG 
  let s = 7777;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;

  const dummy = new THREE.Object3D();
  let idx     = 0;

  for (let i = 0; i < positions.length && idx < count; i++) {
    const pos    = positions[i];
    const spread = 0.3 + (smoothFactor / leafOpacity) * 1.1;   
    const planeCount = 3 + Math.floor(r() * 3);

    for (let k = 0; k < planeCount && idx < count; k++) {
      const theta = r() * Math.PI * 2;
      const phi   = Math.acos(2 * r() - 1);
      const dist  = Math.pow(r(), 0.5) * spread;

      const px = pos[0] + dist * Math.sin(phi) * Math.cos(theta);
      const py = pos[1] + dist * Math.cos(phi) * 0.65;
      const pz = pos[2] + dist * Math.sin(phi) * Math.sin(theta);

      dummy.position.set(px, py, pz);
      dummy.rotation.set(
        (r() - 0.5) * Math.PI * 0.6,
        r() * Math.PI * 2,
        (r() - 0.5) * Math.PI * 0.6,
      );

      const baseSize   = 0.55 + (smoothFactor / Math.max(0.01, leafOpacity)) * 0.65;
      const sizeJitter = 0.8 + r() * 0.5;
      dummy.scale.setScalar(baseSize * sizeJitter);

      dummy.updateMatrix();
      instMesh.setMatrixAt(idx, dummy.matrix);

      // store wind metadata
      instMesh.userData.windPhases[idx] = r() * Math.PI * 2;
      instMesh.userData.windAmps[idx]   = 0.06 + r() * 0.10;
      instMesh.userData.basePos[idx * 3 + 0] = px;
      instMesh.userData.basePos[idx * 3 + 1] = py;
      instMesh.userData.basePos[idx * 3 + 2] = pz;

      idx++;
    }
  }

  instMesh.count = idx;
  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}


// animateWind

export function animateWind(instMesh, windTime, windStr) {
  if (!instMesh || !instMesh.userData.windPhases) return;
  const THREE  = window.THREE;
  const phases = instMesh.userData.windPhases;
  const amps   = instMesh.userData.windAmps;
  const base   = instMesh.userData.basePos;
  const count  = instMesh.count;
  const dummy  = new THREE.Object3D();
  const m4     = new THREE.Matrix4();

  for (let i = 0; i < count; i++) {
    instMesh.getMatrixAt(i, m4);
    dummy.matrixAutoUpdate = false;
    dummy.matrix.copy(m4);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

    const ph   = phases[i];
    const amp  = amps[i] * windStr;
    dummy.position.x = base[i*3]     + Math.sin(windTime * 1.1 + ph) * amp;
    dummy.position.y = base[i*3 + 1] + Math.sin(windTime * 0.8 + ph * 1.3) * amp * 0.3;
    dummy.position.z = base[i*3 + 2] + Math.cos(windTime * 0.9 + ph * 0.7) * amp * 0.6;

    dummy.matrixAutoUpdate = true;
    dummy.updateMatrix();
    instMesh.setMatrixAt(i, dummy.matrix);
  }
  instMesh.instanceMatrix.needsUpdate = true;
}