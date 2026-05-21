import React from 'react';
import { cn } from '../../../../utils/cn';
import { CanvasObject, Tool, type ResizeHandle } from '../../types';
import { RenderObject } from './RenderObject';
import { useWorkstationViewModel } from './Workstation.viewModel';

interface WorkstationProps {
  objects: CanvasObject[];
  selectedObjectId: string | null;
  hoveredParentId: string | null;
  activeTool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  isSpacePressed: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onObjectMouseDown: (e: React.MouseEvent, id: string, action: 'drag' | 'resize' | 'rotate', handle?: ResizeHandle) => void;
  onUpdateObject: (id: string, updates: Partial<CanvasObject>) => void;
  onWheel: (e: React.WheelEvent) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export const Workstation: React.FC<WorkstationProps> = ({
  objects,
  selectedObjectId,
  hoveredParentId,
  activeTool,
  zoom,
  pan,
  isSpacePressed,
  onMouseDown,
  onObjectMouseDown,
  onUpdateObject,
  onWheel,
  canvasRef,
}) => {
  const { rootObjects, cursorClass, canvasTransform, dotGridStyle, zoomLabel } =
    useWorkstationViewModel({ objects, activeTool, isSpacePressed, zoom, pan });

  return (
    <main
      ref={canvasRef}
      className={cn(
        'flex-1 relative overflow-hidden transition-colors duration-200 bg-[var(--bg-dark)]',
        cursorClass
      )}
      onMouseDown={onMouseDown}
      onWheel={onWheel}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.1]"
        style={dotGridStyle}
      />

      <div
        className="canvas-content"
        style={{ transform: canvasTransform, transformOrigin: '0 0' }}
      >
        {rootObjects.map((o) => (
          <RenderObject
            key={o.id}
            obj={o}
            objects={objects}
            selectedObjectId={selectedObjectId}
            hoveredParentId={hoveredParentId}
            onObjectMouseDown={onObjectMouseDown}
            onUpdateObject={onUpdateObject}
          />
        ))}
      </div>

      {/* --- Zoom Overlay --- */}
      <div className="absolute bottom-4 left-4 bg-[var(--bg-2)] border border-[var(--border-1)] rounded px-2 py-1 text-[10px] font-mono text-[var(--text-3)] z-50">
        {zoomLabel}
      </div>
    </main>
  );
};
