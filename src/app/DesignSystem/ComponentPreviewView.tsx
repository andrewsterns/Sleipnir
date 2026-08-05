import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { getComponentPreview } from './DesignLibrary.ViewModel'
import { Text } from '../UIKit/Text/Text'

interface ComponentPreviewProps {
  activeComponent: string
  activeComponentPath?: string
  onActiveComponentChange: (component: string) => void
  children?: React.ReactNode
}

export const ComponentPreview = ({ activeComponent, activeComponentPath }: ComponentPreviewProps) => {
  return (
    <Frame
      flow="horizontal"
      align="center"
      justify="center"
      w="fill"
      h="fill"
      fill={{ solid: 'bg-1' }}
      clipContent
    >
      {getComponentPreview(activeComponent, activeComponentPath) ?? (
        <Text variant="small" color="text-2" mono>No preview available</Text>
      )}
    </Frame>
  )
}
