import React, { useState, useMemo } from 'react';
import { Icon, IconName } from '../../01_atoms/Icon/Icon';
import { Typography } from '../../01_atoms/Typography/Typography';
import { Frame } from '../../01_atoms/Frame/Frame';
import { Logo } from '../../01_atoms/Logo/Logo';
import { Page } from '../../../types';
import { cn } from '../../../utils/cn';
import { CanvasObject } from '../../DesignSystem/types';
import { COMPONENT_LIBRARY } from '../../DesignSystem/constants';

interface NavNode {
  id: string;
  label: string;
  num?: string;
  type: 'project' | 'stage' | 'item' | 'layer' | 'library-folder' | 'library-item';
  page?: Page;
  children?: NavNode[];
  layerId?: string;
  icon?: IconName;
}

interface SystemSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  objects: CanvasObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

export const SystemSidebar: React.FC<SystemSidebarProps> = ({ 
  currentPage, 
  onNavigate, 
  objects, 
  selectedObjectId, 
  onSelectObject 
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['00', '01', '02', 'lib-root', 'lib-frames']));
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedIds(newSet);
  };

  // Convert CanvasObjects to NavNodes for the Design System stage
  const layerNodes = useMemo(() => {
    const buildTree = (parentId: string | null): NavNode[] => {
      return objects
        .filter(obj => obj.parentId === parentId)
        .map(obj => ({
          id: `layer-${obj.id}`,
          layerId: obj.id,
          label: obj.name,
          type: 'layer',
          page: 'components',
          children: buildTree(obj.id)
        }));
    };
    return buildTree(null);
  }, [objects]);

  const libraryNodes = useMemo(() => {
    return COMPONENT_LIBRARY.map(c => ({
      id: `lib-comp-${c.value}`,
      label: c.label,
      type: 'library-item' as const,
      page: 'components' as const
    }));
  }, []);

  const PROJECT_TREE: NavNode[] = [
    {
      id: '00',
      label: 'SLEIPNIR_CORE',
      type: 'project',
      page: 'planning',
      children: [
        {
          id: '01',
          label: 'Research',
          num: '01',
          type: 'stage',
          page: 'research',
          children: [
            { id: 'r1', label: 'User_Personas', type: 'item', page: 'research' },
            { id: 'r2', label: 'System_Analytics', type: 'item', page: 'research' },
            { id: 'r3', label: 'Research_Proposals', type: 'item', page: 'research' },
          ]
        },
        {
          id: '02',
          label: 'Components',
          num: '02',
          type: 'stage',
          page: 'components',
          children: [
            ...layerNodes,
            {
              id: 'lib-master',
              label: 'Master_Library',
              type: 'library-folder',
              children: libraryNodes
            }
          ]
        },
        {
          id: '03',
          label: 'Prototypes',
          num: '03',
          type: 'stage',
          page: 'prototypes',
          children: [
            { id: 'pr1', label: 'Alpha_Stream', type: 'item', page: 'prototypes' },
          ]
        },
        {
          id: '04',
          label: 'Validation',
          num: '04',
          type: 'stage',
          page: 'validation',
          children: [
            { id: 'v1', label: 'Unit_Test_Matrix', type: 'item', page: 'validation' },
          ]
        },
        {
          id: '05',
          label: 'Telemetry',
          num: '05',
          type: 'stage',
          page: 'analytics',
          children: [
            { id: 'a1', label: 'Live_Performance', type: 'item', page: 'analytics' },
          ]
        }
      ]
    }
  ];

  const RenderNode = ({ node, depth = 0 }: { node: NavNode, depth?: number }) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isLayer = node.type === 'layer' || (node.type === 'library-item' && node.layerId);
    const isActive = isLayer 
      ? selectedObjectId === node.layerId 
      : (node.page === currentPage && node.type !== 'project');

    const handleClick = (e: React.MouseEvent) => {
      if (hasChildren) toggleExpand(node.id, e);

      if (node.layerId) {
        onSelectObject(node.layerId || null);
        onNavigate('components');
      } else if (node.page) {
        onNavigate(node.page);
      }
    };

    return (
      <div key={node.id} className="space-y-0.5">
        <div 
          onClick={handleClick}
          className={cn(
            "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all border border-transparent",
            isActive ? "bg-[var(--bg-3)] border-[var(--border-1)] shadow-sm" : "hover:bg-[var(--bg-3)]/40"
          )}
          style={{ marginLeft: `${depth * 8}px` }}
        >
          {/* Twirl Arrow */}
          <div 
            className={cn(
              "w-4 h-4 flex items-center justify-center transition-transform duration-200 opacity-20 group-hover:opacity-100",
              isExpanded && "rotate-90",
              !hasChildren && "invisible"
            )}
          >
             <Icon name="align-right-middle" size={10} />
          </div>

          {/* Icon/Indicator */}
          {node.type === 'project' ? (
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] animate-pulse" />
          ) : isLayer ? (
            <span className="text-[10px] opacity-40 font-mono">
              {objects.find(o => o.id === node.layerId)?.type === 'frame' ? '#' : '•'}
            </span>
          ) : node.type === 'library-folder' ? (
            <Icon name="frame" size={10} className="opacity-40" />
          ) : node.num ? (
            <span className="text-[7px] font-black bg-[var(--bg-3)] px-1 py-0.5 rounded-xs text-[var(--accent-1)] leading-none">{node.num}</span>
          ) : (
            <div className="w-1 h-1 rounded-full bg-[var(--text-3)] opacity-20" />
          )}

          {/* Label */}
          <Typography 
            variant="xs" 
            weight={node.type === 'project' ? 'black' : isActive ? 'bold' : 'medium'}
            className={cn(
              "text-[9px] uppercase tracking-widest truncate flex-1",
              isActive ? "text-[var(--text-0)]" : "text-[var(--text-2)] group-hover:text-[var(--text-1)]"
            )}
          >
            {node.label}
          </Typography>
        </div>

        {isExpanded && hasChildren && (
          <div className="space-y-0.5">
            {node.children!.map(child => <RenderNode key={child.id} node={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };


  return (
    <Frame 
      as="aside"
      width={256}
      layout="flex"
      direction="column"
      height="100%"
      background="var(--bg-2)"
      border={{ right: { width: 'var(--border-w)', color: 'var(--border-1)' } }}
      zIndex={100}
      shadows="-10px 0 30px rgba(0,0,0,0.1)"
      className="transition-colors duration-500"
    >
      {/* Branding */}
      <Frame padding={24} border={{ bottom: { width: 'var(--border-w)', color: 'var(--border-1)' } }}>
        <button 
          onClick={() => onNavigate('planning')}
          className="hover:text-[var(--accent-1)] transition-all active:scale-95 flex items-center gap-3"
        >
          <Logo className="h-5 w-auto" />
          <div className="h-3 w-[1px] bg-[var(--border-1)]" />
          <Typography variant="xs" weight="black" className="text-[8px] tracking-[0.3em] opacity-40">CORE_OS</Typography>
        </button>
      </Frame>


      {/* Search Bar - Relocated to Sidebar */}
      <Frame padding={{ x: 24, y: 16 }} border={{ bottom: { width: 'var(--border-w)', color: 'var(--border-1)' } }} background="rgba(0,0,0,0.05)">
        <div className="relative group">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] opacity-20 group-focus-within:text-[var(--accent-1)] group-focus-within:opacity-100 transition-all font-mono">/</span>
          <input 
            type="text"
            placeholder="SEARCH_LIBRARY..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-1)]/50 border border-[var(--border-1)] rounded-md py-1.5 pl-8 pr-4 text-[9px] font-mono text-[var(--text-1)] outline-none focus:border-[var(--accent-1)] transition-all placeholder:text-[var(--text-2)]/20"
          />
        </div>
      </Frame>

      {/* Hierarchy Control */}
      <Frame flexGrow={1} clipContent padding={{ x: 24, y: 24 }} className="overflow-auto custom-scrollbar">
        <div className="space-y-8">
          <div>
            <Typography variant="xs" color="text-2" weight="black" className="uppercase tracking-[0.3em] opacity-30 mb-4 px-2 text-[8px]">
              Hierarchy_Control
            </Typography>
            <div className="space-y-1">
              {PROJECT_TREE.map(node => <RenderNode key={node.id} node={node} />)}
            </div>
          </div>
        </div>
      </Frame>

      {/* Notifications Footer */}
      <Frame 
        margin={{ top: 'auto' }}
 
        border={{ top: { width: 'var(--border-w)', color: 'var(--border-1)' } }}
        background="rgba(0,0,0,0.1)"
        padding={{ x: 24, y: 16 }}
      >
        <div className="space-y-3">
          <Typography variant="xs" color="text-2" weight="black" className="uppercase tracking-[0.2em] opacity-30 text-[8px]">
            System_Telemetry
          </Typography>
          <div className="space-y-2">
            {[
              { id: '1', title: 'IDE_Sync: Active', color: 'bg-green-500' },
              { id: '2', title: 'DB_Link: Nominal', color: 'bg-[var(--accent-1)]' }
            ].map(item => (
              <div key={item.id} className="flex items-center gap-2 opacity-60 hover:opacity-100 cursor-default transition-opacity">
                <div className={cn("w-1 h-1 rounded-full", item.color)} />
                <Typography variant="xs" className="text-[8px] font-mono tracking-tighter text-[var(--text-2)]">{item.title}</Typography>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    </Frame>
  );
};
