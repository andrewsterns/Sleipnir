import type { Meta, StoryObj } from '@storybook/react';
import { Counter } from './Counter.view';

const meta: Meta<typeof Counter> = {
  title: 'Molecules/Counter',
  component: Counter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialValue: 0,
  },
};

export const InitialValue: Story = {
  args: {
    initialValue: 10,
  },
};
