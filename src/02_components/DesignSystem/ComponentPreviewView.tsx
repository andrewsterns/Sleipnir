import React from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { getComponentPreview } from './DesignLibrary.ViewModel'
import { Text } from '../01_atoms/Text/Text'

interface ComponentPreviewProps {
  activeComponent: string
  onActiveComponentChange: (component: string) => void
  children?: React.ReactNode
}

export const ComponentPreview = ({ activeComponent }: ComponentPreviewProps) => {
  return (
    <Frame
      flow="horizontal"
      align="center"
      justify="center"
      w="fill"
      h={220}
      minH={120}
      fill={{ solid: 'bg-1' }}
      stroke={{ bottom: { color: 'border-1' } }}
      clipContent
    >
      {getComponentPreview(activeComponent) ?? (
        <Text variant="small" color="text-2">No preview available</Text>
      )}
    </Frame>
  )
}
