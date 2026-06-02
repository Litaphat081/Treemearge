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

// buildThreeInstancedFoliage //

export function buildThreeInstancedFoliage(treeData, material, age, ageMax, planeW=1.2, planeH=1.2) {
  const THREE        = window.THREE;
  const positions    = treeData.foliage;
  const leafFactor   = Math.min(1, Math.max(0, (age - 5) / 80));   // เริ่มมีใบที่ age 5
  const smoothFactor = leafFactor * leafFactor;
  if (positions.length === 0 || smoothFactor < 0.001) return new THREE.Group();
  const leafGeo = new THREE.PlaneGeometry(planeW, planeH, 2, 2);


  const posAttr = leafGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const lx = posAttr.getX(i);
    const ly = posAttr.getY(i);

    posAttr.setZ(i, -(lx*lx + ly*ly) * 0.08);
  }
  posAttr.needsUpdate = true;
  leafGeo.computeVertexNormals();

  // count //

  const planesPerPoint = 4;
  const maxCount       = positions.length * planesPerPoint;
  const count          = Math.max(4, Math.floor(maxCount * smoothFactor));

  const instMesh = new THREE.InstancedMesh(leafGeo, material, count);
  instMesh.castShadow    = true;
  instMesh.receiveShadow = false;

  // seeded RNG //
  let s = 7777;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;

  const dummy = new THREE.Object3D();
  let idx = 0;

  for (let i = 0; i < positions.length && idx < count; i++) {
    const pos = positions[i];

    // spread //
    const spread = 0.3 + smoothFactor * 1.1;
    const planeCount = 3 + Math.floor(r() * 3);  

    for (let k = 0; k < planeCount && idx < count; k++) {
      const theta = r() * Math.PI * 2;
      const phi   = Math.acos(2 * r() - 1);  
      const dist  = Math.pow(r(), 0.5) * spread;  

      dummy.position.set(
        pos[0] + dist * Math.sin(phi) * Math.cos(theta),
        pos[1] + dist * Math.cos(phi) * 0.65,           
        pos[2] + dist * Math.sin(phi) * Math.sin(theta),
      );

      // rotation //
      dummy.rotation.set(
        (r() - 0.5) * Math.PI * 0.6,  
        r() * Math.PI * 2,              
        (r() - 0.5) * Math.PI * 0.6,
      );

      // size //
      const baseSize  = 0.55 + smoothFactor * 0.65;
      const sizeJitter = 0.8 + r() * 0.5;  // 0.8x - 1.3x
      dummy.scale.setScalar(baseSize * sizeJitter);

      dummy.updateMatrix();
      instMesh.setMatrixAt(idx++, dummy.matrix);
    }
  }

  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}
