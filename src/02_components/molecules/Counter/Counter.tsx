import React from 'react';
import { Button } from '../../atoms/Button/Button';
import { useCounterViewModel } from '../../../hooks/view-models/useCounterViewModel';
import { cn } from '../../../utils/cn';

interface CounterProps {
  initialValue?: number;
  className?: string;
}

export const Counter: React.FC<CounterProps> = ({ initialValue = 0, className }) => {
  const { count, increment, decrement, reset } = useCounterViewModel(initialValue);

  return (
    <div className={cn('flex flex-col items-center gap-4 p-6 border rounded-lg shadow-sm bg-white', className)}>
      <h3 className="text-lg font-semibold text-gray-900">Atomic Counter</h3>
      <div className="flex items-center gap-6">
        <Button variant="outline" size="sm" onClick={decrement} disabled={count === 0}>
          -
        </Button>
        <span className="text-3xl font-bold tabular-nums text-blue-600 w-12 text-center">
          {count}
        </span>
        <Button variant="outline" size="sm" onClick={increment}>
          +
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={reset} className="text-gray-500">
        Reset
      </Button>
    </div>
  );
};
