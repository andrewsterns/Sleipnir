import { FrameProps } from '../../01_atoms/Frame/Frame';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps extends Omit<FrameProps, 'onChange' | 'variant'> {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  variant?: 'surface' | 'none';
}
