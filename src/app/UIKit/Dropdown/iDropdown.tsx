import React from 'react';
import { FrameProps } from '../Frame/Frame';

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional section header this option renders under (e.g. "ASSET TYPE" vs "FILE TYPE") — consecutive options sharing a group are visually clustered under one heading, and the menu widens to fit two-column-ish grouped lists. */
  group?: string;
}

export interface DropdownProps extends Omit<FrameProps, 'onChange' | 'variant'> {
  options: DropdownOption[];
  /**
   * Single-select (default): a plain `string`. Multi-select (`multiple`):
   * a `string[]`. Typed loosely here rather than as a discriminated union
   * against `Omit<FrameProps,...>` — callers narrow via the `multiple` flag
   * they themselves passed.
   */
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  label?: string;
  variant?: 'surface' | 'none';
  /** Replaces the default label+caret trigger content when provided. Open/close/click-outside logic is unchanged. */
  trigger?: React.ReactNode;
  /** When true, selecting an option toggles it in/out of `value` (a string[]) and the menu stays open, instead of single-select-and-close. */
  multiple?: boolean;
}
