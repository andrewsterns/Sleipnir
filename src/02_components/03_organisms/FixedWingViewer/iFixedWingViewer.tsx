import React from 'react';

export interface FixedWingViewerProps {
  selected?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface AircraftProps {
  color: string;
  edgeColor: string;
  selected: boolean;
}
