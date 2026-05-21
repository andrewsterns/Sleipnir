import { CanvasObject } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InspectorPanelProps {
  selectedObject: CanvasObject | undefined;
  objects: CanvasObject[];
  onUpdateObject: (id: string, updates: Partial<CanvasObject>) => void;
  onDeleteObject: (id: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  isDragging?: boolean;
  isResizing?: boolean;
  isRotating?: boolean;
}

// ─── Internal State ───────────────────────────────────────────────────────────

export type AutocompleteState = {
  suggestions: string[];
  activeIndex: number;
  line: number;
  isValue: boolean;
  propName: string;
  tokenStart: number;
};

// ─── Autocomplete Data ────────────────────────────────────────────────────────

export const FRAME_PROPS = [
  'width', 'height', 'left', 'top', 'rotation', 'fill',
  'layout', 'direction', 'align', 'justify', 'gap', 'padding',
  'margin', 'borderRadius', 'clipContent', 'variant', 'border',
  'borderWidth', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'position',
] as const;

// `variant` for Typography means h1/h2/p… not the surface style
export const TYPOGRAPHY_PROPS = [
  'variant', 'fill', 'layout', 'direction', 'align', 'justify',
  'gap', 'padding', 'margin', 'borderRadius', 'clipContent',
  'border', 'borderWidth', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'width', 'height', 'left', 'top', 'rotation', 'position',
] as const;

export const COMPONENT_GENERIC_PROPS = [
  'fill', 'variant', 'padding', 'margin', 'width', 'height', 'position',
] as const;

export const TAG_PROPS: Record<string, readonly string[]> = {
  Frame:      FRAME_PROPS,
  Typography: TYPOGRAPHY_PROPS,
  Button:     COMPONENT_GENERIC_PROPS,
  Counter:    COMPONENT_GENERIC_PROPS,
  Dropdown:   ['fill', 'variant', 'width'],
  Header:     ['fill', 'variant', 'width', 'height'],
  Footer:     ['fill', 'variant', 'width', 'height'],
};

export const PROP_VALUES: Record<string, string[]> = {
  variant:     ['"surface"', '"none"', '"glass"', '"neo"'],
  layout:      ['"none"', '"flex"'],
  direction:   ['"row"', '"column"'],
  align:       ['"start"', '"center"', '"end"'],
  justify:     ['"start"', '"center"', '"end"'],
  clipContent: ['{true}', '{false}'],
  position:    ['"absolute"', '"relative"'],
  fill:        ['"transparent"', '"var(--bg-1)"', '"var(--bg-2)"', '"var(--accent-1)"', '"var(--text-1)"', '"#ffffff"', '"#000000"'],
};

export const TEXT_VARIANT_VALUES = ['"h1"', '"h2"', '"h3"', '"h4"', '"p"', '"xs"', '"label"'] as const;
