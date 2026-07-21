import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from '../02_molecules/Panel/Panel';
import { StatusBadge } from '../02_molecules/StatusBadge/StatusBadge';
import { AlertEntry, AlertEntryProps } from './AlertEntry';

export interface AssetMonitorProps {
  callsign: string;
  status: string;
  confidence: number;
  type?: string;
  role?: string;
}

export interface TarsPanelProps {
  timestamp?: string;
  logs: AlertEntryProps[];
  asset?: AssetMonitorProps;
  effDetect?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const TarsPanel: React.FC<TarsPanelProps> = ({
  timestamp = '14-MAI-31ZZ',
  logs,
  asset,
  effDetect = 90.7,
  className,
  style,
}) => {
  return (
    <TacticalPanel
      flow="vertical"
      gap={0}
      chamfer={8}
      className={className}
      style={style}
    >
      {/* Panel header */}
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 10, y: 6 }}
        stroke={{ bottom: { color: 'border-1' } }}
      >
        <Frame flow="horizontal" align="center" gap={6}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'var(--scan)',
          }}>
            ✦ TARS
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '7px',
            color: 'var(--text-3)',
            letterSpacing: '0.06em',
          }}>
            TACTICAL ANALYSIS & RECOMMENDATION SYSTEM
          </span>
        </Frame>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          color: 'var(--text-3)',
        }}>
          {timestamp}
        </span>
      </Frame>

      <Frame flow="horizontal" grow minH={0}>
        {/* Object/Network log */}
        <Frame
          flow="vertical"
          gap={0}
          grow
          basis={0}
          stroke={{ right: { color: 'border-1' } }}
        >
          <Frame
            padding={{ x: 8, y: 5 }}
            stroke={{ bottom: { color: 'border-1' } }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              letterSpacing: '0.10em',
              color: 'var(--text-3)',
            }}>
              OBJECT // NETWORK
            </span>
          </Frame>
          <Frame
            flow="vertical"
            gap={1}
            padding={{ x: 0, y: 4 }}
            scroll="y"
            grow
            basis={0}
          >
            {logs.map((log, i) => (
              <AlertEntry key={i} {...log} />
            ))}
          </Frame>
          {/* EFF Detect footer */}
          <Frame
            flow="horizontal"
            align="center"
            gap={8}
            padding={{ x: 8, y: 5 }}
            stroke={{ top: { color: 'border-1' } }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              color: 'var(--text-3)',
            }}>
              EFF Detect
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--scan)',
              fontWeight: 600,
            }}>
              {effDetect.toFixed(1)}%
            </span>
          </Frame>
        </Frame>

        {/* Asset monitor */}
        {asset && (
          <Frame
            flow="vertical"
            gap={8}
            padding={{ x: 10, y: 8 }}
            w={140}
            shrink={0}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              letterSpacing: '0.10em',
              color: 'var(--text-3)',
            }}>
              ASSET MONITOR
            </span>

            {/* Aircraft silhouette placeholder */}
            <Frame
              flow="horizontal"
              align="center"
              justify="center"
              h={70}
              fill={{ solid: 'rgba(0,255,136,0.04)' }}
              stroke={{ color: 'border-1' }}
            >
              <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
                {/* Simple aircraft silhouette */}
                <path d="M30 4L38 20H50L38 24L42 36L30 28L18 36L22 24L10 20H22L30 4Z"
                  fill="rgba(0,255,136,0.3)" stroke="var(--scan)" strokeWidth="0.5" />
              </svg>
            </Frame>

            <Frame flow="vertical" gap={3}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-1)', fontWeight: 600 }}>
                {asset.callsign}
              </span>
              <Frame flow="horizontal" align="center" gap={4}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-3)' }}>STATUS</span>
                <StatusBadge status="operational" label={asset.status} />
              </Frame>
              <Frame flow="horizontal" align="center" gap={4}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-3)' }}>TRACKING</span>
              </Frame>
            </Frame>

            <Frame flow="vertical" gap={3}>
              {asset.type && (
                <Frame flow="horizontal" justify="between">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-3)' }}>TYPE</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-2)' }}>{asset.type}</span>
                </Frame>
              )}
              {asset.role && (
                <Frame flow="horizontal" justify="between">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-3)' }}>ROLE</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-2)' }}>{asset.role}</span>
                </Frame>
              )}
              <Frame flow="horizontal" justify="between">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-3)' }}>CONFIDENCE</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--scan)' }}>
                  {asset.confidence.toFixed(1)}%
                </span>
              </Frame>
            </Frame>
          </Frame>
        )}
      </Frame>
    </TacticalPanel>
  );
};
