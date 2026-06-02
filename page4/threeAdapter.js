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

export function buildThreeInstancedFoliage(treeData, material, age, ageMax) {
  const THREE     = window.THREE;
  const positions = treeData.foliage;
  if (!positions || positions.length === 0) return new THREE.Group();

  const densityMult = Math.max(0.01, treeData.densityMult       ?? 1.0);
  const leafOpacity = Math.max(0,    Math.min(1, treeData.leafOpacity ?? 1.0));
  const leafTint    = treeData.leafTint          ?? 0xffffff;
  const scaleOvr    = Math.max(0.1,  treeData.leafScaleOverride  ?? 1.0);

  if (leafOpacity < 0.01) return new THREE.Group();   // winter — no leaves


  const mat = material.clone();
  mat.color.set(leafTint);
  if (leafOpacity < 1.0) { mat.transparent = true; mat.opacity = leafOpacity; }

  // Birch leaf
  const planeW = 0.6 * scaleOvr;
  const planeH = 0.9 * scaleOvr;
  const leafGeo = new THREE.PlaneGeometry(planeW, planeH);
  leafGeo.translate(0, -planeH / 2, 0);

  // Instance count scaled by density
  const planesPerPoint = 2;
  const maxCount       = positions.length * planesPerPoint;
  const count          = Math.max(4, Math.floor(maxCount * Math.min(densityMult, 3)));

  const instMesh         = new THREE.InstancedMesh(leafGeo, mat, count);
  instMesh.castShadow    = true;
  instMesh.receiveShadow = false;

  // Wind 
  instMesh.userData.windPhases = new Float32Array(count);
  instMesh.userData.windAmps   = new Float32Array(count);
  instMesh.userData.basePos    = new Float32Array(count * 3);


  const posHash = (pos, salt) => {
    const a = (pos[0] * 1031) | 0;
    const b = (pos[1] * 1031) | 0;
    const c = (pos[2] * 1031) | 0;
    let x = (Math.imul(a ^ 374761393, b ^ 668265263) ^ Math.imul(c ^ 1274126177, (salt | 1))) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };

  const dummy = new THREE.Object3D();
  let idx     = 0;

  for (let i = 0; i < positions.length && idx < count; i++) {
    const pos  = positions[i];
    const reps = Math.max(1, Math.round(planesPerPoint * Math.min(densityMult, 3)));

    for (let k = 0; k < reps && idx < count; k++) {
      const s   = k * 13 + 5;
      const r1  = posHash(pos, s);
      const r2  = posHash(pos, s + 1);
      const r3  = posHash(pos, s + 2);
      const rSz = posHash(pos, s + 3);

      dummy.position.set(pos[0], pos[1], pos[2]);

  
      dummy.rotation.set(
        (Math.PI * 0.4) + (r1 * 0.8),
        r2 * Math.PI * 2,
        (r3 - 0.5) * 0.4,
      );

      const scale = (0.7 + rSz * 0.5) * scaleOvr;
      dummy.scale.set(scale, scale, scale);

      dummy.updateMatrix();
      instMesh.setMatrixAt(idx, dummy.matrix);

      // Bake wind data
      instMesh.userData.windPhases[idx]    = r2 * Math.PI * 2;
      instMesh.userData.windAmps[idx]      = 0.08 + r1 * 0.12;
      instMesh.userData.basePos[idx * 3]   = pos[0];
      instMesh.userData.basePos[idx*3 + 1] = pos[1];
      instMesh.userData.basePos[idx*3 + 2] = pos[2];

      idx++;
    }
  }

  instMesh.count = idx;
  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}

// animateWind 
export function animateWind(instMesh, windTime, windStr) {
  if (!instMesh?.userData?.windPhases) return;
  const THREE  = window.THREE;
  const phases = instMesh.userData.windPhases;
  const amps   = instMesh.userData.windAmps;
  const base   = instMesh.userData.basePos;
  const count  = instMesh.count ?? instMesh.instanceMatrix.count;
  const dummy  = new THREE.Object3D();
  const m4     = new THREE.Matrix4();

  for (let i = 0; i < count; i++) {
    instMesh.getMatrixAt(i, m4);
    dummy.matrixAutoUpdate = false;
    dummy.matrix.copy(m4);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

    const ph  = phases[i];
    const amp = amps[i] * windStr;
    dummy.position.x = base[i*3]     + Math.sin(windTime * 1.4 + ph) * amp;
    dummy.position.y = base[i*3 + 1] + Math.sin(windTime * 0.7 + ph * 1.2) * amp * 0.25;
    dummy.position.z = base[i*3 + 2] + Math.cos(windTime * 1.0 + ph * 0.9) * amp * 0.7;

    dummy.matrixAutoUpdate = true;
    dummy.updateMatrix();
    instMesh.setMatrixAt(i, dummy.matrix);
  }
  instMesh.instanceMatrix.needsUpdate = true;
}