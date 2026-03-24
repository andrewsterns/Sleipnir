import { render, screen, fireEvent } from '@testing-library/react';
import { CounterPrototype } from './CounterPrototype';
import { describe, it, expect } from 'vitest';

describe('CounterPrototype', () => {
  it('renders and increments correctly', () => {
    render(<CounterPrototype />);
    const incrementButton = screen.getByText('Increment');
    fireEvent.click(incrementButton);
    expect(screen.getByText('SYSTEM_VIBE_COUNT: 1')).toBeInTheDocument();
  });

  it('resets correctly', () => {
    render(<CounterPrototype />);
    const incrementButton = screen.getByText('Increment');
    const resetButton = screen.getByText('Reset');
    fireEvent.click(incrementButton);
    fireEvent.click(resetButton);
    expect(screen.getByText('SYSTEM_VIBE_COUNT: 0')).toBeInTheDocument();
  });
});
