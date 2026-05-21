import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Workstation } from './sections/Workstation';
import { InspectorPanel } from './sections/InspectorPanel';
import { CanvasObject, Tool, ResizeHandle } from './types';
import { COMPONENT_SIZES, COMPONENT_LIBRARY } from './constants';
import { Icon } from '../01_atoms/Icon/Icon';
import { cn } from '../../utils/cn';

interface DesignSystemProps {
  onBackToMenu: () => void;
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
}

export default function DesignSystem({ 
  onBackToMenu,
  objects, 
  setObjects, 
  selectedObjectId, 
  setSelectedObjectId 
}: DesignSystemProps) {
  // --- UI State ---
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedComponentLabel, setSelectedComponentLabel] = useState('SEARCH_COMPONENTS');
  const [pendingComponentType, setPendingComponentType] = useState<string | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(420);
  const [hoveredParentId, setHoveredParentId] = useState<string | null>(null);

  // --- Interaction State ---
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  
  // --- Refs for stable handlers ---
  const stateRef = useRef({
    objects,
    selectedObjectId,
    isDragging,
    isResizing,
    isRotating,
    isCreating,
    isPanning,
    activeResizeHandle,
    zoom,
    pan,
    activeTool,
    isAltPressed
  });

  useEffect(() => {
    stateRef.current = {
      objects,
      selectedObjectId,
      isDragging,
      isResizing,
      isRotating,
      isCreating,
      isPanning,
      activeResizeHandle,
      zoom,
      pan,
      activeTool,
      isAltPressed
    };
  }, [objects, selectedObjectId, isDragging, isResizing, isRotating, isCreating, isPanning, activeResizeHandle, zoom, pan, activeTool, isAltPressed]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastMousePos = useRef({ x: 0, y: 0 });
  const startAngle = useRef(0);
  const initialRotation = useRef(0);
  const clipboard = useRef<CanvasObject | null>(null);
  const hasDuplicated = useRef(false);

  const MAX_DEPTH = 50;

  // --- Layout Helpers ---
  const updateObject = (id: string, updates: Partial<CanvasObject>) => {
    console.log('Updating Object:', id, updates);
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const getObjectDepth = useCallback((id: string, allObjects: CanvasObject[], depth = 0): number => {
    if (depth > MAX_DEPTH) return depth;
    const obj = allObjects.find(o => o.id === id);
    if (!obj || !obj.parentId) return depth;
    return getObjectDepth(obj.parentId, allObjects, depth + 1);
  }, []);

  const getGlobalPos = useCallback((id: string, allObjects: CanvasObject[], depth = 0): { x: number, y: number } => {
    const obj = allObjects.find(o => o.id === id);
    if (!obj || depth > MAX_DEPTH) return { x: 0, y: 0 };
    if (!obj.parentId) return { x: obj.x, y: obj.y };
    const parentPos = getGlobalPos(obj.parentId, allObjects, depth + 1);
    return { x: parentPos.x + obj.x, y: parentPos.y + obj.y };
  }, []);

  const isDescendant = useCallback((parentId: string, potentialChildId: string, allObjects: CanvasObject[], depth = 0): boolean => {
    if (depth > MAX_DEPTH) return false;
    const children = allObjects.filter(o => o.parentId === parentId);
    for (const child of children) {
      if (child.id === potentialChildId) return true;
      if (isDescendant(child.id, potentialChildId, allObjects, depth + 1)) return true;
    }
    return false;
  }, []);

  const isPointInRect = (px: number, py: number, rx: number, ry: number, rw: number, rh: number) => {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  };

  // --- Advanced zoom prevention and keyboard shortcuts ---
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.code === 'Space') {
        setIsSpacePressed(true);
        if (stateRef.current.activeTool === 'select') e.preventDefault();
      }

      if (e.altKey) {
        setIsAltPressed(true);
      }

      // Ctrl + C (Copy)
      if (e.ctrlKey && e.key === 'c') {
        const sid = stateRef.current.selectedObjectId;
        if (sid) {
          const obj = stateRef.current.objects.find(o => o.id === sid);
          if (obj) clipboard.current = { ...obj };
        }
      }

      // Ctrl + V (Paste)
      if (e.ctrlKey && e.key === 'v') {
        if (clipboard.current) {
          const newId = Date.now().toString();
          const clone: CanvasObject = {
            ...clipboard.current,
            id: newId,
            x: clipboard.current.x + 20,
            y: clipboard.current.y + 20,
            name: `${clipboard.current.name}_copy`
          };
          setObjects(prev => [...prev, clone]);
          setSelectedObjectId(newId);
        }
      }

      // Prevent browser zoom shortcuts: Ctrl + (+, -, 0)
      if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '0' || e.key === '+')) {
        e.preventDefault();
      }

      // Tool Shortcuts
      switch (e.key.toLowerCase()) {
        case 'v': setActiveTool('select'); break;
        case 'f': setActiveTool('frame'); break;
        case 'r': setActiveTool('square'); break;
        case 'o': setActiveTool('circle'); break;
        case 't': setActiveTool('text'); break;
        case 'p': setActiveTool('pen'); break;
        case 'backspace':
        case 'delete': {
          const sid = stateRef.current.selectedObjectId;
          if (sid) {
            setObjects(prev => prev.filter(o => o.id !== sid));
            setSelectedObjectId(null);
          }
          break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
      if (!e.altKey) {
        setIsAltPressed(false);
      }
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // Stable listeners

  // --- Canvas Interactions ---
  const handleMouseDown = (e: React.MouseEvent) => {
    console.log('Canvas MouseDown', e.target);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;

    // Panning (Middle click or Space+Left click)
    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Default: Clear selection if clicking background
    const target = e.target as HTMLElement;
    const isBackground = target === e.currentTarget || target.classList.contains('canvas-content');
    
    if (isBackground) {
      if (activeTool === 'select') {
        setSelectedObjectId(null);
        setIsPanning(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
      } else {
        // Creating new object on background
        const id = Date.now().toString();
        const type = activeTool === 'component' ? 'component' : (activeTool as CanvasObject['type']);
        const isComponent = activeTool === 'component';
        const defaultSize = isComponent && pendingComponentType
          ? COMPONENT_SIZES[pendingComponentType]
          : activeTool === 'frame'
            ? { width: 960, height: 600 }
            : { width: 0, height: 0 };

        const newObj: CanvasObject = {
          id,
          name: isComponent ? `${pendingComponentType}_${objects.length + 1}` : `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}_${objects.length + 1}`,
          type,
          componentType: isComponent ? (pendingComponentType || undefined) : undefined,
          textVariant: type === 'text' ? 'p' : undefined,
          textContent: type === 'text' ? 'Typography Text' : undefined,
          x, y, 
          width: defaultSize.width, 
          height: defaultSize.height, 
          rotation: 0, parentId: null, layout: 'none',
          direction: 'row', align: 'start', justify: 'start', gap: 0, padding: 0, 
          margin: 0, borderWidth: 1,
          clipContent: true, variant: 'surface'
        };
        setObjects(prev => [...prev, newObj]);
        setSelectedObjectId(id);
        
        if (!isComponent) {
          setIsCreating(true);
          setIsResizing(true);
          setActiveResizeHandle('bottom-right');
        } else {
          // For components, just select it and switch tool back to select
          setActiveTool('select');
          setPendingComponentType(null);
          setSelectedComponentLabel('SEARCH_COMPONENTS');
        }
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    }
  };

  const handleObjectMouseDown = (e: React.MouseEvent, id: string, action: 'drag' | 'resize' | 'rotate', handle?: ResizeHandle) => {
    e.stopPropagation();
    
    if (isSpacePressed || e.button === 1) {
      setIsPanning(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (activeTool === 'select' || action === 'resize' || action === 'rotate') {
      let targetId = id;

      // Alt-drag Duplication
      if (isAltPressed && action === 'drag') {
        const objToClone = objects.find(o => o.id === id);
        if (objToClone) {
          const newId = Date.now().toString();
          const clone: CanvasObject = {
            ...objToClone,
            id: newId,
            name: `${objToClone.name}_copy`
          };
          setObjects(prev => [...prev, clone]);
          targetId = newId;
        }
      }

      setSelectedObjectId(targetId);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      if (action === 'drag') setIsDragging(true);
      if (action === 'resize') {
        setIsResizing(true);
        if (handle) setActiveResizeHandle(handle);
      }
      if (action === 'rotate') {
        setIsRotating(true);
        const obj = objects.find(o => o.id === targetId);
        if (obj && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const gPos = getGlobalPos(targetId, objects);
          const centerX = gPos.x + obj.width / 2;
          const centerY = gPos.y + obj.height / 2;
          const mouseX = (e.clientX - rect.left - pan.x) / zoom;
          const mouseY = (e.clientY - rect.top - pan.y) / zoom;
          startAngle.current = Math.atan2(mouseY - centerY, mouseX - centerX);
          initialRotation.current = obj.rotation || 0;
        }
      }
    } else {
      // Creation tool active: Create inside this object
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      const gPos = getGlobalPos(id, objects);

      const newId = Date.now().toString();
      const type = activeTool === 'component' ? 'component' : (activeTool as CanvasObject['type']);
      const defaultSize = activeTool === 'frame' ? { width: 960, height: 600 } : { width: 0, height: 0 };

      const newObj: CanvasObject = {
        id: newId,
        name: activeTool === 'component' ? `${pendingComponentType}_${objects.length + 1}` : `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}_${objects.length + 1}`,
        type,
        componentType: activeTool === 'component' ? (pendingComponentType || undefined) : undefined,
        x: mouseX - gPos.x,
        y: mouseY - gPos.y,
        width: defaultSize.width, height: defaultSize.height, rotation: 0, parentId: id, layout: 'none',
        direction: 'row', align: 'start', justify: 'start', gap: 0, padding: 0, margin: 0, borderWidth: 1, clipContent: true, variant: 'surface'
        };
      setObjects(prev => [...prev, newObj]);
      setSelectedObjectId(newId);
      setIsCreating(true);
      setIsResizing(true);
      setActiveResizeHandle('bottom-right');
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = stateRef.current;
    if (state.isPanning) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      dragStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const dx = (e.clientX - lastMousePos.current.x) / state.zoom;
    const dy = (e.clientY - lastMousePos.current.y) / state.zoom;

    if (state.isDragging && state.selectedObjectId) {
      const sid = state.selectedObjectId;

      // Handle Mid-drag Duplication (Alt key)
      if (state.isAltPressed && !hasDuplicated.current) {
        const objToClone = state.objects.find(o => o.id === sid);
        if (objToClone) {
          const newId = Date.now().toString();
          const clone: CanvasObject = {
            ...objToClone,
            id: newId,
            name: `${objToClone.name}_copy`
          };
          setObjects(prev => [...prev, clone]);
          setSelectedObjectId(newId);
          hasDuplicated.current = true;
          // Note: The next frame of handleMouseMove will use this newId
          return;
        }
      }

      setObjects(prev => prev.map(o => o.id === sid ? { ...o, x: o.x + dx, y: o.y + dy } : o));

      // Track potential parent for visual feedback
      const obj = state.objects.find(o => o.id === sid);
      if (obj) {
        const gPos = getGlobalPos(sid, state.objects);
        const centerX = gPos.x + obj.width / 2;
        const centerY = gPos.y + obj.height / 2;

        let newHoverId: string | null = null;
        const potentialParents = state.objects
          .filter(o => o.type === 'frame' && o.id !== sid && !isDescendant(sid, o.id, state.objects))
          .sort((a, b) => getObjectDepth(b.id, state.objects) - getObjectDepth(a.id, state.objects));

        for (const p of potentialParents) {
          const pgPos = getGlobalPos(p.id, state.objects);
          if (isPointInRect(centerX, centerY, pgPos.x, pgPos.y, p.width, p.height)) {
            newHoverId = p.id;
            break;
          }
        }
        setHoveredParentId(newHoverId);
      }
    } else if (state.isResizing && state.selectedObjectId) {
      const sid = state.selectedObjectId;
      const handle = state.activeResizeHandle;
      const creating = state.isCreating;
      
      setObjects(prev => prev.map(o => {
        if (o.id !== sid) return o;
        
        let { x, y, width, height } = o;
        const minSize = creating ? 0 : 10;

        switch (handle) {
          case 'top-left':
            x += dx; y += dy; width -= dx; height -= dy;
            break;
          case 'top-center':
            y += dy; height -= dy;
            break;
          case 'top-right':
            y += dy; width += dx; height -= dy;
            break;
          case 'left-center':
            x += dx; width -= dx;
            break;
          case 'right-center':
            width += dx;
            break;
          case 'bottom-left':
            x += dx; width -= dx; height += dy;
            break;
          case 'bottom-center':
            height += dy;
            break;
          case 'bottom-right':
          default:
            width += dx; height += dy;
            break;
        }

        if (width < minSize) {
          if (handle?.includes('left')) x -= minSize - width;
          width = minSize;
        }
        if (height < minSize) {
          if (handle?.includes('top')) y -= minSize - height;
          height = minSize;
        }

        return { ...o, x, y, width, height };
      }));
    } else if (state.isRotating && state.selectedObjectId) {
      const sid = state.selectedObjectId;
      const obj = state.objects.find(o => o.id === sid);
      if (obj && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const gPos = getGlobalPos(sid, state.objects);
        const centerX = gPos.x + obj.width / 2;
        const centerY = gPos.y + obj.height / 2;
        const mouseX = (e.clientX - rect.left - state.pan.x) / state.zoom;
        const mouseY = (e.clientY - rect.top - state.pan.y) / state.zoom;
        
        const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
        const angleDelta = currentAngle - startAngle.current;
        let degrees = initialRotation.current + (angleDelta * 180 / Math.PI);
        
        // Snap to 15 degree increments if Shift is pressed? (Optional)
        degrees = Math.round(degrees);
        setObjects(prev => prev.map(o => o.id === sid ? { ...o, rotation: degrees } : o));
      }
    }

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [getGlobalPos, isDescendant, getObjectDepth]);

  const handleMouseUp = useCallback(() => {
    const state = stateRef.current;
    
    if (state.isCreating && state.selectedObjectId) {
      const sid = state.selectedObjectId;
      setObjects(prev => {
        const obj = prev.find(o => o.id === sid);
        if (obj && obj.width < 3 && obj.height < 3) {
          return prev.filter(o => o.id !== sid);
        }
        return prev;
      });
      // Clear selection if it was deleted
      setObjects(prev => {
        if (!prev.find(o => o.id === sid)) setSelectedObjectId(null);
        return prev;
      });
    } else if (state.isDragging && state.selectedObjectId) {
      const sid = state.selectedObjectId;
      setObjects(prev => {
        const obj = prev.find(o => o.id === sid);
        if (!obj) return prev;

        const globalPos = getGlobalPos(sid, prev);
        const centerX = globalPos.x + obj.width / 2;
        const centerY = globalPos.y + obj.height / 2;

        let newParentId: string | null = null;
        const potentialParents = prev
          .filter(o => o.type === 'frame' && o.id !== sid && !isDescendant(sid, o.id, prev))
          .sort((a, b) => getObjectDepth(b.id, prev) - getObjectDepth(a.id, prev));

        for (const p of potentialParents) {
          const gPos = getGlobalPos(p.id, prev);
          if (isPointInRect(centerX, centerY, gPos.x, gPos.y, p.width, p.height)) {
            newParentId = p.id;
            break;
          }
        }

        if (newParentId !== obj.parentId) {
          console.log(`Parenting Object ${sid} to ${newParentId || 'root'}`);
          const oldParentGlobalPos = obj.parentId ? getGlobalPos(obj.parentId, prev) : { x: 0, y: 0 };
          const newParentGlobalPos = newParentId ? getGlobalPos(newParentId, prev) : { x: 0, y: 0 };
          const globalX = oldParentGlobalPos.x + obj.x;
          const globalY = oldParentGlobalPos.y + obj.y;
          
          return prev.map(o => o.id === sid ? {
            ...o,
            parentId: newParentId,
            x: globalX - newParentGlobalPos.x,
            y: globalY - newParentGlobalPos.y
          } : o);
        }
        return prev;
      });
    }

    setIsPanning(false);
    setIsDragging(false);
    setIsResizing(false);
    setIsRotating(false);
    setActiveResizeHandle(null);
    setHoveredParentId(null);
    hasDuplicated.current = false;
    if (state.isCreating) {
      setIsCreating(false);
      setActiveTool('select');
      setPendingComponentType(null);
      setSelectedComponentLabel('SEARCH_COMPONENTS');
    }
  }, [getGlobalPos, getObjectDepth, isDescendant]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const factor = Math.pow(1.1, -e.deltaY / 100);
      const newZoom = Math.min(Math.max(zoom * factor, 0.05), 20);

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        setPan(prev => ({
          x: mouseX - (newZoom / zoom) * (mouseX - prev.x),
          y: mouseY - (newZoom / zoom) * (mouseY - prev.y)
        }));
      }
      setZoom(newZoom);
    } else {
      setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const selectedObject = objects.find(o => o.id === selectedObjectId);

  const handleConvertToComponent = () => {
    if (!selectedObject || selectedObject.type === 'component') return;
    // Convert the selected frame to a component
    updateObject(selectedObject.id, { type: 'component' });
  };

  const handleSelectComponent = (type: string) => {
    setPendingComponentType(type);
    setActiveTool('component');
    setIsSearchOpen(false);
    setSelectedComponentLabel(type.toUpperCase());
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-[var(--bg-1)] text-[var(--text-2)] overflow-hidden font-sans select-none relative">
      {/* Top Bar with Tools */}
      <div className="h-14 border-b border-[var(--border-1)] bg-[var(--bg-2)] flex items-center px-4 gap-3 z-50">
        <button
          onClick={onBackToMenu}
          className="w-9 h-9 flex items-center justify-center rounded hover:bg-[var(--bg-3)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-all group relative"
          title="Back to Hub Selector"
        >
          <Icon name="research" size={16} className="rotate-180" />
        </button>

        <div className="h-6 w-[1px] bg-[var(--border-1)]" />

        {[
          { id: 'select', icon: <Icon name="click" size={16} />, key: 'V', label: 'Select' },
          { id: 'frame', icon: <Icon name="frame" size={16} />, key: 'F', label: 'Frame' },
          { id: 'square', icon: '□', key: 'R', label: 'Rectangle' },
          { id: 'circle', icon: '○', key: 'O', label: 'Circle' },
          { id: 'text', icon: 'T', key: 'T', label: 'Text' },
          { id: 'pen', icon: '✎', key: 'P', label: 'Pen' }
        ].map(tool => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id as Tool)}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded transition-all text-sm",
              activeTool === tool.id ? "bg-[var(--accent-1)] text-white" : "hover:bg-[var(--bg-3)] text-[var(--text-2)] hover:text-[var(--text-1)]"
            )}
            title={`${tool.label} (${tool.key})`}
          >
            {tool.icon}
          </button>
        ))}

        <div className="h-6 w-[1px] bg-[var(--border-1)]" />

        {selectedObject && (
          <button
            onClick={handleConvertToComponent}
            className="px-3 py-1.5 text-xs bg-[var(--accent-1)] text-white rounded hover:opacity-90 transition-all uppercase tracking-wide font-bold"
            title="Convert selected frame to component"
          >
            Convert to Component
          </button>
        )}

        <div className="flex-1" />

        <div className="relative flex-shrink-0 w-48">
          <div className={cn(
            "flex items-center bg-[var(--bg-3)] rounded px-2 border border-transparent focus-within:border-[var(--accent-1)]",
            activeTool === 'component' && "border-[var(--accent-1)]"
          )}>
            <span className="text-[10px] opacity-40 mr-2">🔍</span>
            <input 
              type="text" 
              placeholder={selectedComponentLabel}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="bg-transparent border-0 outline-none py-1 text-xs text-[var(--text-2)] w-32 placeholder:text-[var(--text-3)]/50"
            />
          </div>

          {isSearchOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--bg-2)] border border-[var(--border-1)] rounded shadow-2xl overflow-hidden py-1 z-[60]">
              {COMPONENT_LIBRARY.filter(c => 
                c.label.toLowerCase().includes(searchQuery.toLowerCase())
              ).length > 0 ? (
                COMPONENT_LIBRARY.filter(c => 
                  c.label.toLowerCase().includes(searchQuery.toLowerCase())
                ).map(c => (
                  <button
                    key={c.value}
                    onClick={() => {
                      handleSelectComponent(c.value);
                      setIsSearchOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--accent-1)] hover:text-white transition-colors flex justify-between items-center"
                  >
                    <span>{c.label}</span>
                    <span className="text-[9px] opacity-40">{c.value.toUpperCase()}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-[var(--text-3)]/50">No components found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area - Workspace + Inspector */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Workspace */}
        <div className="flex-1 min-w-0 relative bg-[var(--bg-1)]">
          <Workstation 
            objects={objects}
            selectedObjectId={selectedObjectId}
            hoveredParentId={hoveredParentId}
            activeTool={activeTool}
            zoom={zoom}
            pan={pan}
            isSpacePressed={isSpacePressed}
            onMouseDown={handleMouseDown}
            onObjectMouseDown={handleObjectMouseDown}
            onUpdateObject={updateObject}
            onWheel={handleWheel}
            containerRef={containerRef}
            canvasRef={canvasRef}
          />
        </div>

        {/* Inspector Panel - Resizable */}
        <div className="border-l border-[var(--border-1)] flex-shrink-0 overflow-hidden">
          <InspectorPanel 
            selectedObject={selectedObject}
            objects={objects}
            onUpdateObject={updateObject}
            onDeleteObject={(id) => {
              setObjects(prev => prev.filter(o => o.id !== id));
              setSelectedObjectId(null);
            }}
            width={inspectorWidth}
            onWidthChange={setInspectorWidth}
            isDragging={isDragging}
            isResizing={isResizing}
            isRotating={isRotating}
          />
        </div>
      </div>

      {/* Library Section Below */}
      <div className="h-48 border-t border-[var(--border-1)] bg-[var(--bg-2)] overflow-y-auto">
        <div className="p-4">
          <div className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--text-1)]">
            Component Library
          </div>
          <div className="grid grid-cols-4 gap-3">
            {COMPONENT_LIBRARY.map(c => (
              <button
                key={c.value}
                onClick={() => handleSelectComponent(c.value)}
                className={cn(
                  "p-3 border rounded text-left transition-all hover:border-[var(--accent-1)] hover:bg-[var(--bg-3)]",
                  pendingComponentType === c.value ? "border-[var(--accent-1)] bg-[var(--accent-1)]/10" : "border-[var(--border-1)]"
                )}
              >
                <div className="text-xs font-bold text-[var(--text-1)] mb-1">{c.label}</div>
                <div className="text-[9px] text-[var(--text-2)]">{c.value}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
