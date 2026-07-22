import { FrameProps } from '../../01_atoms/Frame/Frame';

export interface ListItemProps extends Omit<FrameProps, 'onClick'> {
  id: string;
  title: string;
  subtitle?: string;
  isActive?: boolean;
  /** Soft highlight from an external source (e.g. hovering the name in the code panel) */
  isHovered?: boolean;
  onClick?: (id: string) => void;
}
