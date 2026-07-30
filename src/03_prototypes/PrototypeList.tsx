import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Frame } from '../02_components/01_atoms/Frame/Frame';
import { CodeEditorView } from '../02_components/DesignSystem/CodeEditorView';
import { PrototypeRail } from '../02_components/03_organisms/PrototypeRail/PrototypeRail';
import type { PrototypeEntry, PrototypeSelection } from '../02_components/03_organisms/PrototypeRail/iPrototypeRail';
import { getGraphForMap } from '../00_planning/graph/combine';
import { readFile } from '../00_planning/api/sleipnirApi';
import { TacticalHUD } from './TacticalHUD/TacticalHUD';
import { BlankPrototype } from './BlankPrototype/BlankPrototype';
import '../02_components/00_themes/tactical.css';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Same drag-to-resize handle as DesignLibrary.view.tsx's LeftRailing divider.
function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ flexShrink: 0, position: 'relative', cursor: 'col-resize', width: 8 }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          background: hover ? 'rgba(255,255,255,0.28)' : 'var(--border-1)',
          transition: 'background 80ms',
        }}
      />
    </div>
  );
}

const PROTOTYPES: PrototypeEntry[] = [
  {
    id: 'tactical-hud',
    tag: 'P-01',
    title: 'Tactical HUD',
    description: 'Full-screen tactical command and control environment.',
    icon: 'player-play',
    render: (onBack) => <TacticalHUD onHome={onBack} />,
  },
  {
    id: 'blank',
    tag: 'P-02',
    title: 'Blank Prototype',
    description: 'Empty canvas — start a new prototype here.',
    icon: 'frame',
    render: (onBack) => <BlankPrototype onHome={onBack} />,
  },
];

export const PrototypeList: React.FC<{ onHome?: () => void }> = ({ onHome }) => {
  const [selection, setSelection] = useState<PrototypeSelection | null>(null);
  const [code, setCode] = useState('// Loading source…');
  const [railWidth, setRailWidth] = useState(240);
  const dragRef = useRef<{ dragging: boolean; start: number; startSize: number }>({ dragging: false, start: 0, startSize: 0 });

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { dragging: true, start: e.clientX, startSize: railWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setRailWidth(clamp(dragRef.current.startSize + (e.clientX - dragRef.current.start), 180, 900));
    };
    const stopDrag = () => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stopDrag);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  // Real scaffolded files under 03_prototypes, distinct from PROTOTYPES above
  // (a curated, hand-registered showcase with live render() callbacks).
  // n.map === 'prototypes' excludes DSM nodes pulled in cross-map via
  // generate-graph.mjs's "borrows" merge (those keep map: 'dsm').
  const prototypeNodes = useMemo(
    () => getGraphForMap('prototypes').nodes.filter((n) => n.map === 'prototypes' && n.kind === 'built'),
    [],
  );

  const activeCurated = selection?.kind === 'curated' ? PROTOTYPES.find((p) => p.id === selection.id) : undefined;

  React.useEffect(() => {
    if (selection?.kind !== 'scaffolded') return;
    let cancelled = false;
    setCode('// Loading source…');
    readFile(selection.node.filePath ?? '')
      .then(({ content }) => { if (!cancelled) setCode(content); })
      .catch((e) => { if (!cancelled) setCode(`// Failed to load source: ${e instanceof Error ? e.message : String(e)}`); });
    return () => { cancelled = true; };
  }, [selection]);

  if (activeCurated) {
    return <>{activeCurated.render(() => setSelection(null))}</>;
  }

  return (
    <Frame theme="tactical" h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      {/* Top status bar */}
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
          03 — PROTOTYPES
        </span>
        <button
          onClick={onHome}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--text-2)',
            fontSize: 9,
            letterSpacing: '0.14em',
            padding: '5px 14px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          ← HOME
        </button>
      </Frame>

      {/* Rail + main content */}
      <Frame flow="horizontal" grow minH={0}>
        <PrototypeRail
          curated={PROTOTYPES}
          scaffolded={prototypeNodes}
          activeSelection={selection}
          onSelect={setSelection}
          width={railWidth}
        />

        <ResizeHandle onMouseDown={startDrag} />

        <Frame flow="vertical" grow minH={0} minW={0} stroke={{ left: { color: 'rgba(255,255,255,0.07)' } }}>
          {selection?.kind === 'scaffolded' ? (
            <>
              <Frame
                flow="horizontal"
                align="center"
                justify="between"
                padding={{ x: 16, y: 10 }}
                stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
              >
                <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
                  {selection.node.filePath}
                </span>
              </Frame>
              <Frame grow minH={0}>
                <CodeEditorView path={selection.node.filePath ?? ''} value={code} readOnly />
              </Frame>
            </>
          ) : (
            <Frame flow="vertical" align="center" justify="center" grow>
              <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
                Select a prototype
              </span>
            </Frame>
          )}
        </Frame>
      </Frame>
    </Frame>
  );
};
