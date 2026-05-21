export const COMPONENT_LIBRARY = [
  { value: 'Frame', label: 'ATOM:FRAME' },
  { value: 'Button', label: 'ATOM:BUTTON' },
  { value: 'Counter', label: 'MOL:COUNTER' },
  { value: 'Dropdown', label: 'ATOM:DROPDOWN' },
  { value: 'Typography', label: 'ATOM:TYPOGRAPHY' },
  { value: 'Header', label: 'ORG:HEADER' },
  { value: 'Footer', label: 'ORG:FOOTER' },
];

export const COMPONENT_SIZES: Record<string, { width: number, height: number }> = {
  'Frame': { width: 240, height: 120 },
  'Button': { width: 120, height: 40 },
  'Counter': { width: 200, height: 80 },
  'Dropdown': { width: 180, height: 36 },
  'Typography': { width: 240, height: 96 },
  'Header': { width: 800, height: 64 },
  'Footer': { width: 800, height: 40 },
};

export const MOCK_CODE_MAP: Record<string, string> = {
  'Frame': `import { Frame } from '../01_atoms/Frame/Frame';

export const Card = () => (
  <Frame variant="surface" padding={24}>
    <Frame>Frame content</Frame>
  </Frame>
);`,
  'Button': `import React from 'react';\nimport { cn } from '../../../utils/cn';\n\nexport const Button = ({ variant, children }) => {\n  return (\n    <button className={cn('px-4 py-2 font-black italic uppercase', variant === 'primary' ? 'bg-primary text-black' : 'border-2 border-white text-white')}>\n      {children}\n    </button>\n  );\n};`,
  'Counter': `import React, { useState } from 'react';\n\nexport const Counter = () => {\n  const [count, setCount] = useState(0);\n  return (\n    <div className="flex gap-4 items-center bg-black/40 p-4 border border-white/10">\n      <button onClick={() => setCount(prev => prev - 1)}>-</button>\n      <span className="text-2xl font-mono text-primary">{count}</span>\n      <button onClick={() => setCount(prev => prev + 1)}>+</button>\n    </div>\n  );\n};`,
  'Dropdown': `import { Dropdown } from '../01_atoms/Dropdown/Dropdown.view';

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
];

export const Example = () => <Dropdown options={options} value="one" />;`,
  'Typography': `import { Typography } from '../01_atoms/Typography/Typography';

export const TypeRamp = () => (
  <>
    <Typography variant="h2">Heading</Typography>
    <Typography variant="p">Body copy</Typography>
  </>
);`,
  'Header': `import { Header } from '../03_organisms/Header/Header.view';

export const Example = () => <Header />;`,
  'Footer': `import { Footer } from '../03_organisms/Footer/Footer.view';

export const Example = () => <Footer />;`,
};
