import { forwardRef } from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { RankingSystemProps } from './iRankingSystem';
import { useRankingSystemViewModel } from './RankingSystemViewModel';

export const RankingSystem = forwardRef<HTMLElement, RankingSystemProps>((props, ref) => {
  useRankingSystemViewModel(props);

  return (
    <Frame ref={ref} flow="vertical">
      {/* Implement view here — rendering only, no logic */}
    </Frame>
  );
});

RankingSystem.displayName = 'RankingSystem';
