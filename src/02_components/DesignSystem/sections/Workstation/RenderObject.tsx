import React, { useState } from 'react';
import { cn } from '../../../../utils/cn';
import { CanvasObject, ResizeHandle } from '../../types';
import { Frame } from '../../../01_atoms/Frame/Frame';
import { Button } from '../../../01_atoms/Button/Button';
import { Counter } from '../../../02_molecules/Counter/Counter.view';
import { Dropdown } from '../../../01_atoms/Dropdown/Dropdown.view';
import { Header } from '../../../03_organisms/Header/Header.view';
import { Footer } from '../../../03_organisms/Footer/Footer.view';
import { Typography, TypographyVariant } from '../../../01_atoms/Typography/Typography';

interface RenderObjectProps {
  obj: CanvasObject;
  objects: CanvasObject[];
  selectedObjectId: string | null;
  hoveredParentId: string | null;
  onObjectMouseDown: (e: React.MouseEvent, id: string, action: 'drag' | 'resize' | 'rotate', handle?: ResizeHandle) => void;
  onUpdateObject?: (id: string, updates: Partial<CanvasObject>) => void;
}

const renderComponent = (type: string, props: any) => {
  switch (type) {
    case 'Button': return <Button {...props} width="100%" height="100%" className="pointer-events-none">ACTION_UNIT</Button>;
    case 'Counter': return <Counter {...props} initialValue={0} width="100%" height="100%" className="pointer-events-none scale-75 origin-center" />;
    case 'Dropdown': return <Dropdown {...props} options={[{label: 'ITEM_01', value: '1'}]} width="100%" className="pointer-events-none" />;
    case 'Header': return <Header {...props} width="100%" height="100%" className="pointer-events-none" />;
    case 'Footer': return <Footer {...props} width="100%" height="100%" className="pointer-events-none" />;
    default: return <div className="text-[10px] uppercase opacity-20">Component_Missing</div>;
  }
};

// Custom SVG Rotation Cursors
const rotateCursors = {
  nw: `url("data:image/svg+xml;options=i,width=24,height=24,charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 3h6v6'/%3E%3Cpath d='M21 3l-7 7'/%3E%3Cpath d='M18 14a9 9 0 1 1-9-9'/%3E%3C/svg%3E") 12 12, auto`,
  ne: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 3h6v6'/%3E%3Cpath d='M15 3l-7 7'/%3E%3Cpath d='M6 14a9 9 0 1 0 9-9'/%3E%3C/svg%3E") 12 12, auto`,
  sw: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 21h6v-6'/%3E%3Cpath d='M21 21l-7-7'/%3E%3Cpath d='M18 10a9 9 0 1 0-9 9'/%3E%3C/svg%3E") 12 12, auto`,
  se: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 21h6v-6'/%3E%3Cpath d='M15 21l-7-7'/%3E%3Cpath d='M6 10a9 9 0 1 1 9 9'/%3E%3C/svg%3E") 12 12, auto`,
};

export const RenderObject: React.FC<RenderObjectProps> = ({ 
  obj, 
  objects, 
  selectedObjectId, 
  hoveredParentId,
  onObjectMouseDown,
  onUpdateObject
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const children = objects.filter(o => o.parentId === obj.id);
  const isSelected = selectedObjectId === obj.id;
  const isHoveredParent = hoveredParentId === obj.id;
  const parent = obj.parentId ? objects.find(o => o.id === obj.parentId) : null;

  const handlePositions: { type: ResizeHandle, cursor: string, style: React.CSSProperties }[] = [
    { type: 'top-left', cursor: 'nwse-resize', style: { top: 0, left: 0 } },
    { type: 'top-center', cursor: 'ns-resize', style: { top: 0, left: '50%' } },
    { type: 'top-right', cursor: 'nesw-resize', style: { top: 0, left: '100%' } },
    { type: 'left-center', cursor: 'ew-resize', style: { top: '50%', left: 0 } },
    { type: 'right-center', cursor: 'ew-resize', style: { top: '50%', left: '100%' } },
    { type: 'bottom-left', cursor: 'nesw-resize', style: { top: '100%', left: 0 } },
    { type: 'bottom-center', cursor: 'ns-resize', style: { top: '100%', left: '50%' } },
    { type: 'bottom-right', cursor: 'nwse-resize', style: { top: '100%', left: '100%' } },
  ];

  const rotateZones: { cursor: string, style: React.CSSProperties }[] = [
    { cursor: rotateCursors.nw, style: { top: -16, left: -16 } },
    { cursor: rotateCursors.ne, style: { top: -16, left: '100%' } },
    { cursor: rotateCursors.sw, style: { top: '100%', left: -16 } },
    { cursor: rotateCursors.se, style: { top: '100%', left: '100%' } },
  ];

  const isFlexChild = parent && parent.layout === 'flex';
  const forceAbsolute = obj.isAbsolute;

  // Compute the fill property
  const fillValue = obj.backgroundGradient || (obj.backgroundImage ? `url(${obj.backgroundImage})` : obj.color);

  const componentProps = {
    fill: fillValue,
    variant: obj.variant || 'none',
    padding: obj.padding,
    gap: obj.gap,
    borderRadius: obj.borderRadius,
    borderTop: obj.borderTop,
    borderRight: obj.borderRight,
    borderBottom: obj.borderBottom,
    borderLeft: obj.borderLeft,
    border: obj.type !== 'frame' ? `${obj.borderWidth || 2}px solid ${obj.borderColor || 'var(--text-3)'}` : undefined,
  };

  return (
    <Frame
      position={(isFlexChild && !forceAbsolute) ? 'relative' : 'absolute'}
      left={(isFlexChild && !forceAbsolute) ? undefined : obj.x}
      top={(isFlexChild && !forceAbsolute) ? undefined : obj.y}
      width={obj.width}
      height={obj.height}
      rotation={obj.rotation}
      zIndex={isSelected ? 100 : undefined}
      clipContent={false}
      className={cn(
        "group select-none transition-shadow",
        isSelected ? "ring-1 ring-[var(--accent-1)]" : "group-hover:ring-1 group-hover:ring-[var(--accent-1)]/50"
      )}
      onMouseDown={(e) => {
        console.log('Object MouseDown:', obj.id, obj.name, obj.type);
        e.stopPropagation();
        onObjectMouseDown(e, obj.id, 'drag');
      }}
    >
      {/* Actual Content Frame */}
      {obj.type === 'component' && obj.componentType ? (
          <div className={cn(
            "w-full h-full flex items-center justify-center transition-all duration-200",
            isHoveredParent && "ring-4 ring-[var(--accent-1)] bg-[var(--accent-1)]/5 scale-[1.01]"
          )}>
            {renderComponent(obj.componentType, componentProps)}
          </div>
      ) : (
        <Frame
          width="100%"
          height="100%"
          layout={obj.layout === 'none' ? 'block' : obj.layout}
          direction={obj.direction}
          align={obj.align}
          justify={obj.justify}
          gap={obj.gap}
          padding={obj.padding}
          clipContent={obj.clipContent}
          variant={(obj.variant as any) || (obj.type === 'frame' ? 'surface' : 'none')}
          borderRadius={obj.type === 'circle' ? '50%' : obj.borderRadius}
          fill={fillValue}
          borderTop={obj.borderTop}
          borderRight={obj.borderRight}
          borderBottom={obj.borderBottom}
          borderLeft={obj.borderLeft}
          border={obj.type !== 'frame' ? `${obj.borderWidth || (obj.type === 'text' ? 0 : 2)}px solid ${obj.borderColor || (obj.type === 'text' ? 'transparent' : 'var(--text-3)')}` : undefined}
          className={cn(
            "w-full h-full transition-all duration-200",
            isHoveredParent && "ring-4 ring-[var(--accent-1)] bg-[var(--accent-1)]/5 scale-[1.01]"
          )}
        >
          {obj.type === 'text' && (
            <div 
              className="w-full h-full p-2 overflow-hidden"
              onDoubleClick={(e) => {
                if (isSelected && !isEditing) {
                  e.stopPropagation();
                  setIsEditing(true);
                }
              }}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  defaultValue={obj.textContent || 'Typography Text'}
                  className="w-full h-full bg-transparent border-none outline-none resize-none text-[var(--text-1)] font-sans text-sm leading-relaxed"
                  onBlur={(e) => {
                    onUpdateObject?.(obj.id, { textContent: e.target.value });
                    setIsEditing(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsEditing(false);
                    }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <Typography variant={obj.textVariant as TypographyVariant || 'p'} className="flex flex-wrap gap-x-1">
                  {(obj.textContent || 'Typography Text').split(' ').map((word, i) => (
                    <span 
                      key={i} 
                      className="px-0.5 rounded border border-transparent hover:border-[var(--accent-1)]/50 hover:bg-[var(--accent-1)]/5 transition-all cursor-text inline-block"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {word}
                    </span>
                  ))}
                </Typography>
              )}
            </div>
          )}

          {children.map(child => (
            <RenderObject 
              key={`${child.id}-${child.width}-${child.height}-${child.x}-${child.y}-${child.rotation}-${child.color || ''}-${child.layout || ''}-${child.padding || 0}-${child.gap || 0}-${child.borderRadius || 0}`} 
              obj={child} 
              objects={objects} 
              selectedObjectId={selectedObjectId} 
              hoveredParentId={hoveredParentId}
              onObjectMouseDown={onObjectMouseDown}
              onUpdateObject={onUpdateObject}
            />
          ))}
        </Frame>
      )}

      {/* Resize Handles */}
      {isSelected && handlePositions.map(hp => (
        <div 
          key={hp.type}
          className="absolute w-6 h-6 z-[110] pointer-events-auto flex items-center justify-center -translate-x-1/2 -translate-y-1/2" 
          style={{ ...hp.style, cursor: hp.cursor }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onObjectMouseDown(e, obj.id, 'resize', hp.type);
          }} 
        >
          <div className="w-1.5 h-1.5 bg-white border border-[var(--accent-1)] rounded-[1px] shadow-sm" />
        </div>
      ))}

      {/* Invisible Rotation Zones at Corners with Custom SVG Cursors */}
      {isSelected && rotateZones.map((rz, i) => (
        <div 
          key={`rotate-${i}`}
          className="absolute w-8 h-8 z-[105] pointer-events-auto -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100" 
          style={{ ...rz.style, cursor: rz.cursor }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onObjectMouseDown(e, obj.id, 'rotate');
          }} 
        />
      ))}
    </Frame>
  );
};
