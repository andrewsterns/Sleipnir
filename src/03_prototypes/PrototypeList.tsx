import React, { useState } from 'react';
import { Frame } from '../02_components/01_atoms/Frame/Frame';
import { Icon, type IconName } from '../02_components/01_atoms/Icon/Icon';
import { TacticalPanel } from '../02_components/02_molecules/Panel/Panel';
import { TacticalHUD } from './TacticalHUD/TacticalHUD';
import { BlankPrototype } from './BlankPrototype/BlankPrototype';
import '../02_components/00_themes/tactical.css';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

interface PrototypeEntry {
  id: string;
  tag: string;
  title: string;
  description: string;
  icon: IconName;
  render: (onBack: () => void) => React.ReactNode;
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = PROTOTYPES.find((p) => p.id === activeId);

  if (active) {
    return <>{active.render(() => setActiveId(null))}</>;
  }

  return (
    <Frame
      theme="tactical"
      h="fill"
      flow="vertical"
      fill={{ solid: 'var(--bg-1)' }}
      style={MONO}
    >
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

      {/* Prototype list */}
      <Frame flow="vertical" grow padding={{ x: 32, y: 24 }} gap={12}>
        <span style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--text-3)', ...MONO }}>
          {PROTOTYPES.length} PROTOTYPES REGISTERED
        </span>

        {PROTOTYPES.map((item) => (
          <TacticalPanel
            key={item.id}
            as="button"
            variant="default"
            chamfer={6}
            flow="horizontal"
            align="center"
            padding={{ x: 20, y: 16 }}
            gap={20}
            style={{ cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onClick={() => setActiveId(item.id)}
          >
            <span style={{ color: 'var(--text-1)', opacity: 0.75, display: 'flex' }}>
              <Icon name={item.icon} size={28} />
            </span>

            <Frame flow="vertical" gap={4} grow>
              <Frame flow="horizontal" align="center" gap={10}>
                <span style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--text-2)', ...MONO }}>
                  {item.tag}
                </span>
                <span style={{ fontSize: 12, letterSpacing: '0.12em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
                  {item.title.toUpperCase()}
                </span>
              </Frame>
              <span style={{ fontSize: 10, letterSpacing: '0.07em', color: 'var(--text-2)', lineHeight: 1.65, ...MONO }}>
                {item.description.toUpperCase()}
              </span>
            </Frame>

            <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', ...MONO }}>{'>'}_</span>
          </TacticalPanel>
        ))}
      </Frame>
    </Frame>
  );
};
