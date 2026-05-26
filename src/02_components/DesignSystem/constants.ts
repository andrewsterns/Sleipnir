import frameSource from '../01_atoms/Frame/Frame.tsx?raw';
import buttonSource from '../02_molecules/Button/Button.tsx?raw';
import counterSource from '../02_molecules/Counter/Counter.view.tsx?raw';
import dropdownSource from '../02_molecules/Dropdown/Dropdown.view.tsx?raw';
import textSource from '../01_atoms/Text/Text.tsx?raw';
import headerSource from '../03_organisms/Header/Header.view.tsx?raw';
import footerSource from '../03_organisms/Footer/Footer.view.tsx?raw';

export const COMPONENT_LIBRARY = [
  { value: 'Frame', label: 'ATOM:FRAME' },
  { value: 'Button', label: 'ATOM:BUTTON' },
  { value: 'Counter', label: 'MOL:COUNTER' },
  { value: 'Dropdown', label: 'ATOM:DROPDOWN' },
  { value: 'Text', label: 'ATOM:TEXT' },
  { value: 'Header', label: 'ORG:HEADER' },
  { value: 'Footer', label: 'ORG:FOOTER' },
];

export const COMPONENT_SIZES: Record<string, { width: number, height: number }> = {
  'Frame': { width: 240, height: 120 },
  'Button': { width: 120, height: 40 },
  'Counter': { width: 200, height: 80 },
  'Dropdown': { width: 180, height: 36 },
  'Text': { width: 240, height: 96 },
  'Header': { width: 800, height: 64 },
  'Footer': { width: 800, height: 40 },
};

export const MOCK_CODE_MAP: Record<string, string> = {
  Frame: frameSource,
  Button: buttonSource,
  Counter: counterSource,
  Dropdown: dropdownSource,
  Text: textSource,
  Header: headerSource,
  Footer: footerSource,
};
