import React from 'react';
import type { UnitDetail } from '../UnitDetailPanel/UnitDetailPanel';

export interface GroupDetailPanelProps {
  groupName: string;
  units: UnitDetail[];
  onClose: () => void;
  style?: React.CSSProperties;
  className?: string;
}
