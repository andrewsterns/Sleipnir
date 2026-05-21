import { render, screen, fireEvent } from '@testing-library/react';
import { Counter } from './Counter.view';
import { describe, it, expect } from 'vitest';

describe('Counter Molecule', () => {
  it('renders with initial value', () => {
    render(<Counter initialValue={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('increments value on click', () => {
    render(<Counter initialValue={0} />);
    const plusButton = screen.getByText('+');
    fireEvent.click(plusButton);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('decrements value on click', () => {
    render(<Counter initialValue={5} />);
    const minusButton = screen.getByText('-');
    fireEvent.click(minusButton);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('resets value on click', () => {
    render(<Counter initialValue={10} />);
    const resetButton = screen.getByText('Reset');
    fireEvent.click(screen.getByText('+')); // 11
    fireEvent.click(resetButton);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('does not decrement below zero', () => {
    render(<Counter initialValue={0} />);
    const minusButton = screen.getByRole('button', { name: '-' });
    expect(minusButton).toBeDisabled();
  });
});
