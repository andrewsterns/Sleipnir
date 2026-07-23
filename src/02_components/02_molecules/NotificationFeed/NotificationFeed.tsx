import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { cn } from '../../../utils/cn';

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
}) => {
  return (
    <Frame
      flow="vertical"
      gap={3}
      padding={{ y: 8, x: 12 }}
      className={cn(
        'font-[family-name:var(--font-mono)] text-[8px] leading-[13px] whitespace-nowrap',
        className,
      )}
    >
      {notifications.map((n, i) => (
        <Frame key={n.id ?? i} flow="horizontal" align="baseline" gap={8}>
          <Frame textColor={LEVEL_COLOR[n.level]} minW={60} shrink={0}>
            {LEVEL_LABEL[n.level]}
          </Frame>
          <Frame textColor="var(--text-2)" grow>
            {n.message}
          </Frame>
          {n.ref && (
            <Frame textColor="var(--text-3)" margin={{ left: 8 }}>
              {n.ref}
            </Frame>
          )}
          {n.age && (
            <Frame textColor="var(--text-3)" margin={{ left: 8 }}>
              {n.age}
            </Frame>
          )}
        </Frame>
      ))}
    </Frame>
  );
};
