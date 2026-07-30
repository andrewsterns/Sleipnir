import React from 'react'
import { Button } from '../../02_molecules/Button/Button'
import { Card, CardProps } from '../../02_molecules/Card/Card'
import { useCounterViewModel } from './Counter.viewModel'
import { Frame } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

interface CounterProps extends CardProps {
  initialValue?: number
}

export const Counter: React.FC<CounterProps> = ({
  initialValue = 0,
  ...props
}) => {
  const { count, increment, decrement, reset } = useCounterViewModel(initialValue)

  return (
    <Card align="center" {...props}>
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
    </Card>
  )
}
