import * as THREE from 'three';

// Pure procedural geometry builders — no hooks, safe to extract from the
// render tree. The Aircraft component's useFrame/useMemo hooks stay in the
// view since they're coupled to the R3F render loop and Canvas reconciler.

export function buildFuselage(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = (t - 0.5) * 4.2;
    // Teardrop cross-section profile
    const r = t < 0.5
      ? 0.08 + Math.sin(t * Math.PI) * 0.18
      : 0.08 + Math.sin((1 - t) * Math.PI * 1.2) * 0.14;
    pts.push(new THREE.Vector2(r, x));
  }
  return new THREE.LatheGeometry(pts, 12);
}

export function buildWing(sweep: number, span: number, chord: number, taper: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(chord, 0);
  shape.lineTo(chord * taper + sweep * span, span);
  shape.lineTo(sweep * span, span);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  return geo;
}

export function buildTailFin(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.6, 0);
  shape.lineTo(0.3, 0.7);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
