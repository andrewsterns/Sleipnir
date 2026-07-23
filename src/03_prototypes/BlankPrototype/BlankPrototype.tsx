import React from 'react';
import { Frame } from '../../02_components/01_atoms/Frame/Frame';
import '../../02_components/00_themes/tactical.css';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

export const BlankPrototype: React.FC<{ onHome?: () => void }> = ({ onHome }) => (
  <Frame
    theme="tactical"
    h="fill"
    flow="vertical"
    fill={{ solid: 'var(--bg-1)' }}
    style={MONO}
  >
    {/* Top bar */}
    <Frame
      flow="horizontal"
      align="center"
      justify="between"
      padding={{ x: 24, y: 10 }}
      stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
    >
      <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
        PROTOTYPE: BLANK
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
        ← BACK
      </button>
    </Frame>

    {/* This is Nate's edits */}
    <Frame flow='horizontal' w="220" h="36" fill={{ solid: '#c94a4a' }} >This is some text</Frame>

    {/* Empty canvas — build here */}
    <Frame grow flow="vertical" align="center" justify="center" gap={8}>
      <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-3)', ...MONO }}>
        BLANK PROTOTYPE
      </span>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-2)', ...MONO }}>
        START BUILDING HERE
      </span>
    </Frame>
  </Frame>
);
