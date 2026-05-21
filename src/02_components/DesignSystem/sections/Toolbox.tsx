import React from 'react';
import { cn } from '../../../utils/cn';
import { Icon } from '../../01_atoms/Icon/Icon';
import { Tool } from '../types';
import { COMPONENT_LIBRARY } from '../constants';

interface ToolboxProps {
  onBackToMenu?: () => void;
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
  pendingComponentType: string | null;
  onSelectComponent: (type: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedComponentLabel: string;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
}

export const Toolbox: React.FC<ToolboxProps> = ({
  onBackToMenu,
  activeTool,
  onSelectTool,
  pendingComponentType,
  onSelectComponent,
  searchQuery,
  onSearchChange,
  selectedComponentLabel,
  isSearchOpen,
  setIsSearchOpen
}) => {
  const filteredComponents = COMPONENT_LIBRARY.filter(c => 
    c.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center bg-[var(--bg-2)]/95 backdrop-blur border border-[var(--border-1)] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-1 z-[100]">
      {onBackToMenu && (
        <button
          onClick={onBackToMenu}
          className="w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all relative group hover:bg-[var(--bg-3)]/50 text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          <span className="text-lg leading-none flex items-center justify-center"><Icon name="research" size={18} className="rotate-180" /></span>
          <div className="absolute top-full mt-2 px-2 py-1 bg-[var(--bg-2)] text-[var(--text-1)] text-[10px] rounded border border-[var(--border-1)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-widest">
            Back
          </div>
        </button>
      )}
      
      {onBackToMenu && <div className="h-6 w-[1px] bg-[var(--border-1)] mx-1" />}

      {[
        { id: 'select', icon: <Icon name="click" size={18} />, key: 'V', label: 'Select' },
        { id: 'frame', icon: <Icon name="frame" size={18} />, key: 'F', label: 'Frame' },
        { id: 'square', icon: '□', key: 'R', label: 'Rectangle' },
        { id: 'circle', icon: '○', key: 'O', label: 'Circle' },
        { id: 'text', icon: 'T', key: 'T', label: 'Text' },
        { id: 'pen', icon: '✎', key: 'P', label: 'Pen' }
      ].map(tool => (
        <button
          key={tool.id}
          onClick={() => onSelectTool(tool.id as Tool)}
          className={cn(
            "w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all relative group",
            (activeTool === tool.id || (tool.id === 'component' && pendingComponentType)) ? "bg-[var(--bg-3)] text-[var(--text-1)] shadow-inner" : "hover:bg-[var(--bg-3)]/50 text-[var(--text-2)] hover:text-[var(--text-1)]"
          )}
        >
          <span className="text-lg leading-none flex items-center justify-center">{tool.icon}</span>
          <div className="absolute top-full mt-2 px-2 py-1 bg-[var(--bg-2)] text-[var(--text-1)] text-[10px] rounded border border-[var(--border-1)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-widest">
            {tool.label} ({tool.key})
          </div>
        </button>
      ))}

      <div className="h-6 w-[1px] bg-[var(--border-1)] mx-2" />
      
      <div className="relative px-2">
        <div className={cn(
          "flex items-center bg-[var(--bg-3)] rounded px-2 border border-transparent focus-within:border-[var(--accent-1)]",
          activeTool === 'component' && "border-[var(--accent-1)] ring-1 ring-[var(--accent-1)]"
        )}>
          <span className="text-[10px] opacity-40 mr-2">🔍</span>
          <input 
            type="text" 
            placeholder={selectedComponentLabel}
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            className="bg-transparent border-0 outline-none py-1.5 text-[11px] text-[var(--text-2)] w-32 placeholder:text-[var(--text-3)]/50"
          />
        </div>
        
        {isSearchOpen && (
          <div className="absolute top-full left-2 mt-1 w-48 bg-[var(--bg-2)] border border-[var(--border-1)] rounded-lg shadow-2xl overflow-hidden py-1">
            {filteredComponents.length > 0 ? (
              filteredComponents.map(c => (
                <button
                  key={c.value}
                  onClick={() => onSelectComponent(c.value)}
                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-[var(--accent-1)] hover:text-white transition-colors flex justify-between items-center"
                >
                  <span>{c.label}</span>
                  <span className="text-[9px] opacity-40">{c.value.toUpperCase()}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-[11px] text-[var(--text-3)]/50">No components found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
