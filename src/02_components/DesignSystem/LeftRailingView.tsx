import { Frame } from '../01_atoms/Frame/Frame'
import { componentsList } from './DesignLibrary.ViewModel'
import { ComponentList } from '../03_organisms/ComponentList/ComponentList'

interface LeftRailingProps {
  activeComponent: string
  hoveredCodeTarget: string | null
  onSelectComponent: (component: string) => void
}

export const LeftRailing = ({ activeComponent, hoveredCodeTarget, onSelectComponent }: LeftRailingProps) => {
  const sections = [
    { title: 'Atoms',     items: componentsList.filter(c => c.type === 'atom') },
    { title: 'Molecules', items: componentsList.filter(c => c.type === 'molecule') },
    { title: 'Organisms', items: componentsList.filter(c => c.type === 'organism') },
  ]

  return (
    <Frame
      flow="vertical"
      gap={0}
      minH={0}
      minW={220}
      padding={8}
      fill={{ solid: 'bg-2' }}
      stroke={{ right: { color: 'border-1' } }}
    >
      <ComponentList
        sections={sections}
        activeComponent={activeComponent}
        hoveredComponent={hoveredCodeTarget}
        onSelectComponent={onSelectComponent}
      />
    </Frame>
  )
}
