import { AlignmentType, JustifyType } from '../01_atoms/Frame/Frame';

export type Tool = 'select' | 'frame' | 'square' | 'circle' | 'pen' | 'component' | 'text';

export type ResizeHandle = 
  | 'top-left' | 'top-center' | 'top-right'
  | 'left-center' | 'right-center'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface CanvasObject {
  id: string;
  name: string;
  type: 'frame' | 'square' | 'circle' | 'pen' | 'component' | 'text';
  componentType?: string;
  textVariant?: string;
  textContent?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color?: string;
  // Layout
  parentId: string | null;
  layout: 'none' | 'flex';
  direction: 'row' | 'column';
  align: AlignmentType;
  justify: JustifyType;
  gap: number;
  padding: number;
  margin: number;
  borderWidth: number;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderColor?: string;
  borderRadius?: number;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  clipContent?: boolean;
  variant?: string;
  isAbsolute?: boolean;
}

export interface SandboxState {
  objects: CanvasObject[];
  selectedObjectId: string | null;
  activeTool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  isSpacePressed: boolean;
}
