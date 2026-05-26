import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { Text } from '../../01_atoms/Text/Text';

interface ListItemProps {
  id: string;
  title: string;
  subtitle?: string;
  isActive?: boolean;
  isHighlighted?: boolean;
  onClick?: (id: string) => void;
}

export const ListItem: React.FC<ListItemProps> = ({
  id,
  title,
  subtitle,
  isActive = false,
  isHighlighted = false,
  onClick,
}) => {
  const isEmphasized = isActive || isHighlighted;

  return (
    <Frame as="li" variant="none" className="list-none">
      <Frame
        as="button"
        type="button"
        onClick={() => onClick?.(id)}
        variant="none"
        padding={{ x: 12, y: 10 }}
        layout="flex"
        direction="column"
        align="start"
        gap={3}
        borderRadius="var(--radius-1)"
        border="1px solid var(--border-1)"
        backgroundColor={isEmphasized ? 'var(--primary-3)' : 'transparent'}
        className="w-full text-left transition-colors hover:bg-[var(--primary-5)]"
      >
        <Text variant="small" weight={isActive ? 'bold' : 'normal'} color="text-0" className="uppercase tracking-[0.1em] leading-tight">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="xs" color="text-2" className="font-[var(--weight-normal)] tracking-[0.08em]">
            {subtitle}
          </Text>
        ) : null}
      </Frame>
    </Frame>
  );
};
