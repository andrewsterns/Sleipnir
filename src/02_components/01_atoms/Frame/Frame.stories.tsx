import type { Meta, StoryObj } from '@storybook/react';
import { Frame } from './Frame';

const meta: Meta<typeof Frame> = {
  title: 'Atoms/Frame',
  component: Frame,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Frame>;

export const Default: Story = {
  args: {
    children: 'Default Frame',
    padding: 20,
    border: '1px solid #444',
  },
};

export const AutoLayout: Story = {
  args: {
    layout: 'flex',
    direction: 'column',
    gap: 12,
    padding: 24,
    variant: 'surface',
    borderRadius: 8,
    children: (
      <>
        <div className="bg-blue-500/20 p-2 border border-blue-500/30">Item 1</div>
        <div className="bg-blue-500/20 p-2 border border-blue-500/30">Item 2</div>
        <div className="bg-blue-500/20 p-2 border border-blue-500/30">Item 3</div>
      </>
    ),
  },
};

export const ComplexStyling: Story = {
  args: {
    width: 300,
    height: 200,
    layout: 'flex',
    align: 'center',
    justify: 'center',
    background: 'linear-gradient(135deg, #007aff 0%, #ff073a 100%)',
    borderRadius: { topLeft: 40, bottomRight: 40 },
    border: { width: 4, style: 'solid', color: 'white' },
    shadows: [
      { x: 0, y: 10, blur: 20, color: 'rgba(0,0,0,0.3)' },
      { x: 0, y: 0, blur: 40, spread: 5, color: 'rgba(0,122,255,0.2)' }
    ],
    children: <span className="text-white font-black italic">SLEIPNIR</span>,
  },
};

export const Glassmorphism: Story = {
  args: {
    width: 400,
    height: 250,
    layout: 'flex',
    align: 'center',
    justify: 'center',
    background: 'rgba(255, 255, 255, 0.05)',
    backdropBlur: 12,
    borderRadius: 24,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    shadows: { x: 0, y: 10, blur: 30, color: 'rgba(0,0,0,0.5)' },
    children: <div className="text-center"><div className="text-2xl font-bold">Glass Frame</div><div className="text-xs opacity-50 font-mono">BACKDROP_BLUR: 12PX</div></div>,
  },
  decorators: [
    (Story) => (
      <div style={{ padding: '100px', background: 'url(https://images.unsplash.com/photo-1614850523296-d8c1af93d400?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&q=80)', backgroundSize: 'cover' }}>
        <Story />
      </div>
    ),
  ],
};

export const SideSpecificBorders: Story = {
  args: {
    padding: 32,
    variant: 'surface',
    border: {
      left: { width: 8, color: '#007aff', style: 'solid' },
      bottom: { width: 1, color: 'rgba(255,255,255,0.1)', style: 'solid' }
    },
    children: 'Frame with specific border sides',
  },
};
