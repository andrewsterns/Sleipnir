import React from 'react'
import { Button } from '../Button/Button'
import { useCounterViewModel } from './Counter.viewModel'
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

interface CounterProps extends FrameProps {
  initialValue?: number
}

export const Counter: React.FC<CounterProps> = ({
  initialValue = 0,
  variant = 'surface',
  className,
  ...props
}) => {
  const { count, increment, decrement, reset } = useCounterViewModel(initialValue)

  return (
    <Frame
      variant={variant}
      flow="vertical"
      align="center"
      gap={16}
      padding={24}
      radius="var(--radius-2)"
      effects={{ 'drop-shadow': { y: 2, blur: 12, color: 'rgba(0,0,0,0.2)' } }}
      className={className}
      {...props}
    >
      <Text variant="h6" weight="black" italic transform="uppercase" color="text-1">
        Atomic Counter
      </Text>
      <Frame flow="horizontal" align="center" gap={24}>
        <Button variant="outline" size="sm" onClick={decrement} disabled={count === 0} aria-label="decrement">
   Minus
        </Button>
        <Text variant="h3" weight="black" color="text-3">
          {count}
        </Text>
        <Button variant="outline" size="sm" onClick={increment}>
          +
        </Button>
      </Frame>
      <Button variant="ghost" size="sm" onClick={reset}>
        Reset
      </Button>
    </Frame>
  )
}
