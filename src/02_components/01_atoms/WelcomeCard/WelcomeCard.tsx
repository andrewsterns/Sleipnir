import { forwardRef } from 'react';
import { Frame } from '../../../app/UIKit/Frame/Frame';
import { Text } from '../../../app/UIKit/Text/Text';
import { WelcomeCardProps } from './iWelcomeCard';
import { useWelcomeCardViewModel } from './WelcomeCardViewModel';

export const WelcomeCard = forwardRef<HTMLElement, WelcomeCardProps>((props, ref) => {
  const { title, subtitle } = useWelcomeCardViewModel(props);

  return (
    <Frame ref={ref} flow="vertical" gap={8} padding={20} fill={{ solid: 'bg-2' }} radius="var(--radius-3)">
      <Text variant="h6" weight="bold">{title}</Text>
      <Text variant="small" color="text-2">{subtitle}</Text>
    </Frame>
  );
});

WelcomeCard.displayName = 'WelcomeCard';
