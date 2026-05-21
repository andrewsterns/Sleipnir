import { useMemo } from 'react';
import { CanvasObject, Tool } from '../../types';

interface WorkstationViewModelProps {
  objects: CanvasObject[];
  activeTool: Tool;
  isSpacePressed: boolean;
  zoom: number;
  pan: { x: number; y: number };
}

export const useWorkstationViewModel = ({
  objects,
  activeTool,
  isSpacePressed,
  zoom,
  pan,
}: WorkstationViewModelProps) => {
  const rootObjects = useMemo(
    () => objects.filter((o) => !o.parentId),
    [objects]
  );

  const cursorClass = useMemo(() => {
    if (activeTool !== 'select') return 'cursor-crosshair';
    if (isSpacePressed) return 'cursor-grab active:cursor-grabbing';
    return 'cursor-default';
  }, [activeTool, isSpacePressed]);

  const canvasTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  const dotGridStyle = {
    backgroundImage: `radial-gradient(var(--text-3) 1px, transparent 0)`,
    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
    backgroundPosition: `${pan.x}px ${pan.y}px`,
  };

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return { rootObjects, cursorClass, canvasTransform, dotGridStyle, zoomLabel };
};
