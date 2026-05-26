import { Frame } from '../01_atoms/Frame/Frame';
import { Text } from '../01_atoms/Text/Text';
import { List } from '../03_organisms/List/List';
import { COMPONENT_LIBRARY } from './constants';

interface LeftRailingProps {
  activeComponent: string;
  hoveredCodeTarget: string | null;
  onSelectComponent: (componentValue: string) => void;
}

export function LeftRailing({ activeComponent, hoveredCodeTarget, onSelectComponent }: LeftRailingProps) {
  const listItems = COMPONENT_LIBRARY.map((component) => ({
    id: component.value,
    title: component.label,
    subtitle: component.value,
  }));

  return (
    <Frame
      variant="none"
      padding={12}
      layout="flex"
      direction="column"
      gap={14}
      backgroundColor="var(--primary-4)"
      className="min-h-0 border-r border-[var(--border-1)]"
    >
      <Frame layout="flex" direction="column" gap={6}>
        <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
          Component Browser
        </Text>
        <Text variant="h5" weight="black" className="uppercase tracking-[0.12em]">
          Component List
        </Text>
      </Frame>

      <Frame layout="flex" direction="column" gap={8} className="overflow-auto">
        <List
          items={listItems}
          activeId={activeComponent}
          highlightedId={hoveredCodeTarget}
          onSelectItem={onSelectComponent}
        />
      </Frame>
    </Frame>
  );
}
