import { Frame } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'
import { ListItem } from '../../02_molecules/ListItem/ListItem'
import { ComponentMeta } from '../../DesignSystem/DesignLibrary.ViewModel'
import React from 'react'

interface ComponentListProps {
  sections: { title: string; items: ComponentMeta[] }[]
  activeComponent: string
  hoveredComponent?: string | null
  onSelectComponent: (name: string) => void
}

export const ComponentList: React.FC<ComponentListProps> = ({
  sections,
  activeComponent,
  hoveredComponent,
  onSelectComponent,
}) => (
  <Frame as="nav" flow="vertical" gap={12} w="fill">
    {sections.map(section => (
      <Frame key={section.title} flow="vertical" gap={4} w="fill">
        <Text variant="xs" color="text-3" transform="uppercase" tracking="widest">
          {section.title}
        </Text>
        <Frame as="ul" flow="vertical" gap={2} padding={0} w="fill">
          {section.items.map(item => (
            <ListItem
              key={item.name}
              id={item.name}
              title={item.name}
              isActive={activeComponent === item.name}
              isHovered={hoveredComponent === item.name && activeComponent !== item.name}
              onClick={() => onSelectComponent(item.name)}
            />
          ))}
        </Frame>
      </Frame>
    ))}
  </Frame>
)
