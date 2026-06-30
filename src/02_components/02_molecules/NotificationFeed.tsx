import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';

export type NotificationLevel = 'note' | 'advise' | 'warning' | 'caution' | 'iff';

export interface Notification {
  id?: string;
  level: NotificationLevel;
  message: string;
  ref?: string;
  age?: string;
}

export interface NotificationFeedProps {
  notifications: Notification[];
  className?: string;
  style?: React.CSSProperties;
}

const LEVEL_LABEL: Record<NotificationLevel, string> = {
  note:    '**NOTE   ',
  advise:  '**ADVISE ',
  warning: '**WARNING',
  caution: '**CAUTION',
  iff:     '**IFF    ',
};

const LEVEL_COLOR: Record<NotificationLevel, string> = {
  note:    'var(--text-3)',
  advise:  'var(--text-2)',
  warning: 'var(--warn)',
  caution: 'var(--caution)',
  iff:     'var(--track)',
};

export const NotificationFeed: React.FC<NotificationFeedProps> = ({
  notifications,
  className,
  style,
}) => {
  return (
    <Frame
      flow="vertical"
      gap={3}
      className={className}
      style={{
        background: 'transparent',
        padding: '8px 12px',
        ...style,
      }}
    >
      {notifications.map((n, i) => {
        const color = LEVEL_COLOR[n.level];
        return (
          <div
            key={n.id ?? i}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              lineHeight: '13px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color, minWidth: 60, flexShrink: 0 }}>
              {LEVEL_LABEL[n.level]}
            </span>
            <span style={{ color: 'var(--text-2)', flex: 1 }}>
              {n.message}
            </span>
            {n.ref && (
              <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
                {n.ref}
              </span>
            )}
            {n.age && (
              <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
                {n.age}
              </span>
            )}
          </div>
        );
      })}
    </Frame>
  );
};
