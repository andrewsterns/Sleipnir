import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from '../02_molecules/Panel/Panel';
import { ConfidenceBar } from './ConfidenceBar';

export interface ThreatAssessmentItem {
  label: string;
  value: string;
}

export interface ThreatAssessmentPanelProps {
  title?: string;
  threatLabel?: string;
  items: ThreatAssessmentItem[];
  confidenceValue: number;
  impactMode?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ThreatAssessmentPanel: React.FC<ThreatAssessmentPanelProps> = ({
  title = 'THREAT ASSESSMENT',
  threatLabel = 'HIGH PROBABILITY MISSILE THREAT DETECTED',
  items,
  confidenceValue,
  impactMode,
  className,
  style,
}) => {
  return (
    <TacticalPanel
      flow="vertical"
      gap={0}
      chamfer={8}
      variant="critical"
      className={className}
      style={style}
    >
      {/* Header */}
      <Frame
        padding={{ x: 10, y: 6 }}
        style={{ borderBottom: '1px solid var(--border-1)' }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.12em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}>
          {title}
        </span>
      </Frame>

      {/* LLM analysis tag */}
      <Frame
        flow="horizontal"
        align="center"
        gap={6}
        padding={{ x: 10, y: 5 }}
        style={{ background: 'rgba(255,34,34,0.06)', borderBottom: '1px solid var(--border-1)' }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '7px',
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
        }}>
          LLM ANALYSIS // GPT-4o AGENT
        </span>
      </Frame>

      {/* Alert banner */}
      <Frame
        padding={{ x: 10, y: 8 }}
        style={{ borderBottom: '1px solid rgba(255,34,34,0.2)' }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          fontWeight: 700,
          color: 'var(--critical)',
          letterSpacing: '0.04em',
          lineHeight: '14px',
        }}>
          ▲ {threatLabel}
        </span>
      </Frame>

      {/* Assessment items */}
      <Frame
        flow="vertical"
        gap={4}
        padding={{ x: 10, y: 8 }}
        grow
        style={{ borderBottom: '1px solid var(--border-1)' }}
      >
        {items.map((item, i) => (
          <Frame key={i} flow="horizontal" gap={6} align="start">
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              color: 'var(--text-3)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              minWidth: 72,
            }}>
              {item.label}:
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              color: 'var(--text-2)',
              lineHeight: '13px',
            }}>
              {item.value}
            </span>
          </Frame>
        ))}
      </Frame>

      {/* Impact mode */}
      {impactMode && (
        <Frame
          padding={{ x: 10, y: 5 }}
          style={{ borderBottom: '1px solid var(--border-1)' }}
        >
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            color: 'var(--warn)',
            letterSpacing: '0.06em',
          }}>
            IMPACT MODE: {impactMode}
          </span>
        </Frame>
      )}

      {/* Confidence bar */}
      <Frame padding={{ x: 10, y: 8 }}>
        <ConfidenceBar value={confidenceValue} />
      </Frame>
    </TacticalPanel>
  );
};
