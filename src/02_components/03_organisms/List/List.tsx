import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { ListItem } from '../../02_molecules/ListItem/ListItem';

export interface ListEntry {
  id: string;
  title: string;
  subtitle?: string;
}

interface ListProps {
  items: ListEntry[];
  activeId?: string;
  highlightedId?: string | null;
  onSelectItem?: (id: string) => void;
}

export const List: React.FC<ListProps> = ({
  items,
  activeId,
  highlightedId,
  onSelectItem,
}) => {
  return (
    <Frame as="ul" variant="none" layout="flex" direction="column" gap={6} className="m-0 p-0 list-none">
      {items.map((item) => (
        <ListItem
          key={item.id}
          id={item.id}
          title={item.title}
          subtitle={item.subtitle}
          isActive={activeId === item.id}
          isHovered={highlightedId === item.id}
          onClick={onSelectItem}
        />
      ))}
    </Frame>
  );
};
