import React from 'react';
import { Button } from '../../01_atoms/Button/Button';
import { useCounterViewModel } from './Counter.viewModel';
import { cn } from '../../../utils/cn';
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame';

interface CounterProps extends FrameProps {
  initialValue?: number;
}

export const Counter: React.FC<CounterProps> = ({ initialValue = 0, className, variant = 'surface', ...props }) => {
  const { count, increment, decrement, reset } = useCounterViewModel(initialValue);

  return (
    <Frame
      variant={variant}
      layout="flex"
      direction="column"
      align="center"
      gap={16}
      padding={24}
      borderRadius="var(--radius-1)"
      className={cn('shadow-sm', className)}
      {...props}
    >
      <h3 className="text-lg font-black italic uppercase text-[var(--text-1)]">Atomic Counter</h3>
      <div className="flex items-center gap-6">
        <Button variant="outline" size="sm" onClick={decrement} disabled={count === 0}>
          -
        </Button>
        <span className="text-3xl font-black tabular-nums text-[var(--text-3)] w-12 text-center italic">
          {count}
        </span>
        <Button variant="outline" size="sm" onClick={increment}>
          +
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={reset}>
        Reset
      </Button>
    </Frame>
  );
};
