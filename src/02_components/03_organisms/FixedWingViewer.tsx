import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ── Procedural fixed-wing mesh ────────────────────────────────────────────────

function buildFuselage(): THREE.BufferGeometry {
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

function buildWing(sweep: number, span: number, chord: number, taper: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(chord, 0);
  shape.lineTo(chord * taper + sweep * span, span);
  shape.lineTo(sweep * span, span);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  return geo;
}

function buildTailFin(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.6, 0);
  shape.lineTo(0.3, 0.7);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// ── Aircraft group ────────────────────────────────────────────────────────────

interface AircraftProps {
  color: string;
  edgeColor: string;
  selected: boolean;
}

function Aircraft({ color, edgeColor, selected }: AircraftProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  const fuselageGeo  = useMemo(() => buildFuselage(), []);
  const wingGeo      = useMemo(() => buildWing(0.55, 1.8, 0.7, 0.28), []);
  const tailWingGeo  = useMemo(() => buildWing(0.4, 0.7, 0.45, 0.35), []);
  const tailFinGeo   = useMemo(() => buildTailFin(), []);

  const bodyMat  = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 }), [color]);
  const edgeMat  = useMemo(() => new THREE.LineBasicMaterial({ color: edgeColor }), [edgeColor]);
  const wingMat  = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }), [color]);

  const fuselageEdges = useMemo(() => new THREE.EdgesGeometry(fuselageGeo, 15), [fuselageGeo]);
  const wingEdges     = useMemo(() => new THREE.EdgesGeometry(wingGeo, 1), [wingGeo]);
  const tailWingEdges = useMemo(() => new THREE.EdgesGeometry(tailWingGeo, 1), [tailWingGeo]);

  return (
    <group ref={groupRef}>
      {/* Fuselage */}
      <mesh geometry={fuselageGeo} material={bodyMat} rotation={[0, 0, Math.PI / 2]} />
      <lineSegments geometry={fuselageEdges} material={edgeMat} rotation={[0, 0, Math.PI / 2]} />

      {/* Main wings */}
      <mesh geometry={wingGeo} material={wingMat} position={[0, 0, 0.06]} rotation={[-Math.PI / 2, 0, 0]} />
      <lineSegments geometry={wingEdges} material={edgeMat} position={[0, 0, 0.06]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh geometry={wingGeo} material={wingMat} position={[0, 0, -0.06]} rotation={[-Math.PI / 2, 0, Math.PI]} />
      <lineSegments geometry={wingEdges} material={edgeMat} position={[0, 0, -0.06]} rotation={[-Math.PI / 2, 0, Math.PI]} />

      {/* Tail stabilizers */}
      <mesh geometry={tailWingGeo} material={wingMat} position={[-1.6, 0, 0.04]} rotation={[-Math.PI / 2, 0, 0]} />
      <lineSegments geometry={tailWingEdges} material={edgeMat} position={[-1.6, 0, 0.04]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh geometry={tailWingGeo} material={wingMat} position={[-1.6, 0, -0.04]} rotation={[-Math.PI / 2, 0, Math.PI]} />
      <lineSegments geometry={tailWingEdges} material={edgeMat} position={[-1.6, 0, -0.04]} rotation={[-Math.PI / 2, 0, Math.PI]} />

      {/* Vertical tail fin */}
      <mesh geometry={tailFinGeo} material={wingMat} position={[-1.65, 0, 0]} rotation={[0, Math.PI / 2, 0]} />

      {/* Selection ring */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.4, 0.02, 8, 48]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface FixedWingViewerProps {
  selected?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const FixedWingViewer: React.FC<FixedWingViewerProps> = ({
  selected = false,
  style,
  className,
}) => {
  return (
    <div style={{ width: '100%', height: '100%', ...style }} className={className}>
      <Canvas
        camera={{ position: [3, 1.5, 3.5], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} color="#b8d4e8" />
        <directionalLight position={[-3, -2, -3]} intensity={0.3} color="#3a6080" />

        <Aircraft
          color="#0d2035"
          edgeColor="#00aaff"
          selected={selected}
        />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI * 0.72}
        />
      </Canvas>
    </div>
  );
};
