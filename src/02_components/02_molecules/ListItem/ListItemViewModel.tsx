import { useState } from 'react';
import { ListItemProps } from './iListItem';

export function useListItemViewModel({ isActive = false, isHovered = false }: Pick<ListItemProps, 'isActive' | 'isHovered'>) {
  const [mouseOver, setMouseOver] = useState(false);

  const bg = isActive   ? 'primary-3'
           : isHovered  ? 'primary-4'
           : mouseOver  ? 'primary-5'
           : 'transparent';

  return {
    bg,
    onHover: () => setMouseOver(true),
    onHoverEnd: () => setMouseOver(false),
  };
}
