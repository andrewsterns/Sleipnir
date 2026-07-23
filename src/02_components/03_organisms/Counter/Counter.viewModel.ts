import { useCallback, useState } from 'react'

export function useCounterViewModel(initialValue = 0) {
  const [count, setCount] = useState(initialValue)

  const increment = useCallback(() => setCount(c => c + 1), [])
  const decrement = useCallback(() => setCount(c => Math.max(0, c - 1)), [])
  const reset = useCallback(() => setCount(initialValue), [initialValue])

  return { count, increment, decrement, reset }
}
