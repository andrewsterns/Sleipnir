import React, { useRef, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { UnitAffiliation, UnitType } from '../01_atoms/UnitMarker/iUnitMarker';

export interface GlobeUnit {
  id: string;
  groupId?: string;
  affiliation: UnitAffiliation;
  unitType: UnitType;
  callsign: string;
  lat: number;
  lon: number;
}

export interface GlobeMapProps {
  units: GlobeUnit[];
  selectedUnitId?: string | null;
  selectedGroupId?: string | null;
  onSelectUnit?: (id: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

const R = 3;

function latLonTo3D(lat: number, lon: number, r: number): THREE.Vector3 {
  const latR = THREE.MathUtils.degToRad(lat);
  const lonR = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    r * Math.cos(latR) * Math.cos(lonR),
    r * Math.sin(latR),
    r * Math.cos(latR) * Math.sin(lonR),
  );
}

function buildGridGeometry(): THREE.BufferGeometry {
  const verts: number[] = [];
  const gr = R + 0.015;

  for (let lat = -70; lat <= 70; lat += 20) {
    for (let i = 0; i < 90; i++) {
      const lon1 = -180 + (i / 90) * 360;
      const lon2 = -180 + ((i + 1) / 90) * 360;
      const p1 = latLonTo3D(lat, lon1, gr);
      const p2 = latLonTo3D(lat, lon2, gr);
      verts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  for (let lon = -180; lon < 180; lon += 20) {
    for (let i = 0; i < 60; i++) {
      const lat1 = -90 + (i / 60) * 180;
      const lat2 = -90 + ((i + 1) / 60) * 180;
      const p1 = latLonTo3D(lat1, lon, gr);
      const p2 = latLonTo3D(lat2, lon, gr);
      verts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geo;
}

// ── Globe body + grid ─────────────────────────────────────────────────────────

const Globe: React.FC = () => {
  const gridGeo = useMemo(() => buildGridGeometry(), []);
  const gridLines = useMemo(
    () => new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({ color: '#1e3d5c', transparent: true, opacity: 0.9 }),
    ),
    [gridGeo],
  );

  return (
    <group>
      {/* Atmosphere glow (back-face sphere slightly larger) */}
      <mesh>
        <sphereGeometry args={[R + 0.22, 32, 32]} />
        <meshStandardMaterial
          color="#163550"
          transparent
          opacity={0.35}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Globe body */}
      <mesh>
        <sphereGeometry args={[R, 64, 64]} />
        <meshStandardMaterial color="#0d2038" roughness={0.85} metalness={0.1} />
      </mesh>

      {/* Grid lines */}
      <primitive object={gridLines} />
    </group>
  );
};

// ── Individual unit marker ─────────────────────────────────────────────────────

interface UnitMarkerMeshProps {
  unit: GlobeUnit;
  isSelected: boolean;
  isGroupHighlighted: boolean;
  onClick: () => void;
}

const UnitMarkerMesh: React.FC<UnitMarkerMeshProps> = ({
  unit,
  isSelected,
  isGroupHighlighted,
  onClick,
}) => {
  const pos = useMemo(() => latLonTo3D(unit.lat, unit.lon, R + 0.1), [unit.lat, unit.lon]);

  const quaternion = useMemo(() => {
    const dir = pos.clone().normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    return q;
  }, [pos]);

  const isDiamond  = unit.affiliation === 'hostile' || unit.affiliation === 'unknown';
  const isHostile  = unit.affiliation === 'hostile' || unit.affiliation === 'unknown';
  const baseColor  = isHostile ? '#cc2222' : '#dce8f0';
  const hlColor    = isHostile ? '#ff5555' : '#c8dce8';
  const faceColor  = isSelected ? '#ffffff' : isGroupHighlighted ? hlColor : baseColor;
  const ringRef    = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ringRef.current && isSelected) {
      ringRef.current.rotation.z += delta * 0.9;
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick();
  }, [onClick]);

  return (
    <group position={pos} quaternion={quaternion}>
      {/* Main face */}
      <mesh
        rotation={[0, 0, isDiamond ? Math.PI / 4 : 0]}
        onClick={handleClick}
      >
        <boxGeometry args={[0.07, 0.07, 0.012]} />
        <meshStandardMaterial
          color={faceColor}
          transparent
          opacity={isSelected ? 1.0 : 0.80}
          emissive={isSelected ? '#ffffff' : isHostile ? '#440000' : '#000000'}
          emissiveIntensity={isSelected ? 0.4 : isHostile ? 0.25 : 0}
        />
      </mesh>

      {/* Selection spinning ring */}
      {isSelected && (
        <mesh ref={ringRef}>
          <ringGeometry args={[0.10, 0.115, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.60} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Group highlight ring */}
      {isGroupHighlighted && !isSelected && (
        <mesh>
          <ringGeometry args={[0.085, 0.096, 24]} />
          <meshBasicMaterial color="#7a92a8" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Callsign label */}
      <Html
        center
        distanceFactor={10}
        position={[0, 0, 0.12]}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          fontFamily: "'Sometype Mono','Courier New',monospace",
          fontSize: 8,
          color: isSelected ? '#dce8f0' : isHostile ? '#993333' : '#3a4f62',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 5px rgba(0,0,0,0.95)',
          transform: 'translateY(-11px)',
          letterSpacing: '0.06em',
        }}>
          {unit.callsign}
        </div>
      </Html>
    </group>
  );
};

// ── Scene (inside Canvas) ─────────────────────────────────────────────────────

interface GlobeSceneProps {
  units: GlobeUnit[];
  selectedUnitId: string | null;
  selectedGroupId: string | null;
  onSelectUnit: (id: string) => void;
}

const GlobeScene: React.FC<GlobeSceneProps> = ({
  units, selectedUnitId, selectedGroupId, onSelectUnit,
}) => (
  <>
    <ambientLight intensity={0.6} />
    <directionalLight position={[5, 4, 5]} intensity={0.8} color="#dce8f0" />
    <directionalLight position={[-4, -2, -5]} intensity={0.12} color="#0a1428" />
    <pointLight position={[0, 8, 0]} intensity={0.2} color="#c0d0e0" />

    <Globe />

    {units.map(unit => (
      <UnitMarkerMesh
        key={unit.id}
        unit={unit}
        isSelected={selectedUnitId === unit.id}
        isGroupHighlighted={!!(selectedGroupId && unit.groupId === selectedGroupId)}
        onClick={() => onSelectUnit(unit.id)}
      />
    ))}

    <OrbitControls
      enablePan={false}
      minDistance={4.5}
      maxDistance={10}
      dampingFactor={0.06}
      enableDamping
    />
  </>
);

// ── Public component ──────────────────────────────────────────────────────────

export const GlobeMap: React.FC<GlobeMapProps> = ({
  units,
  selectedUnitId = null,
  selectedGroupId = null,
  onSelectUnit,
  style,
  className,
}) => {
  const handleSelect = useCallback((id: string) => onSelectUnit?.(id), [onSelectUnit]);

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      <Canvas
        camera={{ position: [1, 1.5, 5.8], fov: 44, near: 0.1, far: 100 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <GlobeScene
            units={units}
            selectedUnitId={selectedUnitId}
            selectedGroupId={selectedGroupId}
            onSelectUnit={handleSelect}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
