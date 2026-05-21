import React, { useState } from 'react';
import { cn } from '../../../utils/cn';
import { Icon } from '../../01_atoms/Icon/Icon';
import { CanvasObject } from '../types';

interface LayersPanelProps {
  objects: CanvasObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ 
  objects, 
  selectedObjectId, 
  onSelectObject 
}) => {
  const [leftTab, setLeftTab] = useState<'layers' | 'library'>('layers');

  // Render objects hierarchy recursively in the layers list
  const RenderLayerItem = ({ obj, depth = 0 }: { obj: CanvasObject, depth?: number }) => {
    const children = objects.filter(o => o.parentId === obj.id);
    const isSelected = selectedObjectId === obj.id;

    return (
      <React.Fragment key={obj.id}>
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onSelectObject(obj.id);
          }}
          className={cn(
            "px-2 py-1.5 rounded cursor-default text-[12px] flex items-center space-x-2 transition-colors",
            isSelected ? "bg-[var(--accent-1)] text-white" : "hover:bg-[var(--bg-3)] text-[var(--text-2)]"
          )}
          style={{ paddingLeft: `${(depth * 12) + 8}px` }}
        >
          <span className="opacity-40">{obj.type === 'frame' ? '#' : obj.type === 'component' ? '◆' : '•'}</span>
          <span className="truncate">{obj.name}</span>
        </div>
        {children.map(child => (
          <RenderLayerItem key={child.id} obj={child} depth={depth + 1} />
        ))}
      </React.Fragment>
    );
  };

  const rootObjects = objects.filter(o => !o.parentId);

  return (
    <aside className="w-64 border-r border-[var(--border-1)] bg-[var(--bg-2)] flex flex-col z-20 shadow-xl">
      <div className="flex bg-[var(--bg-1)] p-1 gap-1 border-b border-[var(--border-1)]">
         <button 
           onClick={() => setLeftTab('layers')}
           className={cn("flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded transition-all", leftTab === 'layers' ? "bg-[var(--bg-3)] text-[var(--text-1)]" : "text-[var(--text-2)] hover:text-[var(--text-1)]")}
         >
           Layers
         </button>
         <button 
           onClick={() => setLeftTab('library')}
           className={cn("flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded transition-all", leftTab === 'library' ? "bg-[var(--bg-3)] text-[var(--text-1)]" : "text-[var(--text-2)] hover:text-[var(--text-1)]")}
         >
           Library
         </button>
      </div>
      
      <div className="flex-1 overflow-auto">
        {leftTab === 'layers' ? (
          <div className="p-2 space-y-1">
            {objects.length === 0 && (
              <div className="p-4 text-center text-[10px] text-[var(--text-3)]/50 italic">No layers yet. Press 'F' to add a frame.</div>
            )}
            {rootObjects.map(o => (
              <RenderLayerItem key={o.id} obj={o} />
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-6">
             <div className="space-y-3">
                <h4 className="text-[10px] font-black text-[var(--text-3)] uppercase tracking-widest flex items-center gap-2">
                   <Icon name="align-left-top" size={10} /> 00_RESEARCH
                </h4>
                <div className="space-y-1 ml-4">
                   {['Personas', 'Analytics', 'Insights'].map(item => (
                      <div key={item} className="text-[11px] py-1 text-[var(--text-2)] hover:text-[var(--text-1)] cursor-pointer transition-colors flex items-center gap-2">
                         <span className="w-1 h-1 bg-[var(--border-1)] rounded-full" /> {item}
                      </div>
                   ))}
                </div>
             </div>
             <div className="space-y-3">
                <h4 className="text-[10px] font-black text-[var(--text-3)] uppercase tracking-widest flex items-center gap-2">
                   <Icon name="align-center-middle" size={10} /> 01_PLANNING
                </h4>
                <div className="space-y-1 ml-4">
                   {['Board_Tasks', 'Roadmaps', 'Sprint_S-099'].map(item => (
                      <div key={item} className="text-[11px] py-1 text-[var(--text-2)] hover:text-[var(--text-1)] cursor-pointer transition-colors flex items-center gap-2">
                         <span className="w-1 h-1 bg-[var(--border-1)] rounded-full" /> {item}
                      </div>
                   ))}
                </div>
             </div>
          </div>
        )}
      </div>
    </aside>
  );
};
