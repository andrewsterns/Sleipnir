import { useState, useCallback } from 'react';

export interface CounterViewModel {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useCounterViewModel = (initialValue: number = 0): CounterViewModel => {
  const [count, setCount] = useState(initialValue);

  const increment = useCallback(() => {
    setCount((prev) => prev + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount((prev) => Math.max(0, prev - 1));
  }, []);

  const reset = useCallback(() => {
    setCount(initialValue);
  }, [initialValue]);

  return {
    count,
    increment,
    decrement,
    reset,
  };
};
