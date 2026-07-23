import { useState } from 'react';
import { GroupDetailPanelProps } from './iGroupDetailPanel';

export function useGroupDetailPanelViewModel({ units }: Pick<GroupDetailPanelProps, 'units'>) {
  const [activeIdx, setActiveIdx] = useState(0);
  const unit = units[activeIdx];
  const isActiveUnit = !!unit && (unit.status === 'tracking' || unit.status === 'operational' || unit.status === 'nominal' || unit.status === 'acquired');

  return { activeIdx, setActiveIdx, unit, isActiveUnit };
}
