import React, { useState } from 'react';
import { cn } from '../../../../utils/cn';
import { Icon } from '../../../01_atoms/Icon/Icon';
import { Typography } from '../../../01_atoms/Typography/Typography';
import { FillPanel } from './FillPanel';
import { CanvasObject } from '../../types';
import { InspectorPanelProps } from './iPanel';
import { useInspectorViewModel } from './InspectorPanel.viewModel';
import type { IconName } from '../../../01_atoms/Icon/Icon';

// ─── Inline Widgets ───────────────────────────────────────────────────────────

const Ticker = ({ value, onUpdate, className }: { value: number; onUpdate: (v: number) => void; label?: string; className?: string }) => (
  <div className={cn("inline-flex items-center gap-1 bg-black/40 border border-white/10 rounded px-1 h-5 pointer-events-auto hover:border-[var(--accent-1)] transition-all group mx-1", className)}>
    <button onClick={() => onUpdate(value - 1)} className="text-white/20 hover:text-[var(--accent-1)] transition-colors text-[10px] font-black leading-none">−</button>
    <span className="text-[9px] font-mono text-white/90 leading-none min-w-[18px] text-center">{value}</span>
    <button onClick={() => onUpdate(value + 1)} className="text-white/20 hover:text-[var(--accent-1)] transition-colors text-[10px] font-black leading-none">+</button>
  </div>
);

const CompactDropdown = ({ value, options, onUpdate, className }: { value: string; options: string[]; onUpdate: (v: string) => void; label?: string; className?: string }) => (
  <div className={cn("inline-flex items-center bg-black/40 border border-white/10 rounded px-1.5 h-5 pointer-events-auto hover:border-[var(--accent-1)] transition-all group relative mx-1", className)}>
    <select value={value} onChange={(e) => onUpdate(e.target.value)} className="bg-transparent text-[9px] font-mono text-white/90 outline-none cursor-pointer appearance-none pr-3">
      {options.map(opt => <option key={opt} value={opt} className="bg-[var(--bg-2)] text-white">{opt.toUpperCase()}</option>)}
    </select>
    <span className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-20 group-hover:opacity-100 text-[8px]">▾</span>
  </div>
);

const CompactToggle = ({ value, onUpdate, label, className }: { value: boolean; onUpdate: (v: boolean) => void; label: string; className?: string }) => (
  <button
    onClick={() => onUpdate(!value)}
    className={cn("inline-flex items-center gap-1.5 px-1.5 h-5 rounded border transition-all pointer-events-auto mx-1", value ? "bg-[var(--accent-1)]/20 border-[var(--accent-1)]" : "bg-black/40 border-white/10", className)}
  >
    <div className={cn("w-1.5 h-1.5 rounded-full", value ? "bg-[var(--accent-1)] shadow-[0_0_5px_var(--accent-1)]" : "bg-white/10")} />
    <span className={cn("text-[7px] font-black uppercase tracking-tighter", value ? "text-[var(--accent-1)]" : "opacity-30")}>{label}</span>
  </button>
);

const InlineAlignGrid = ({ align, justify, onUpdate, className }: { align: string; justify: string; onUpdate: (u: Partial<CanvasObject>) => void; className?: string }) => {
  const points = [
    { a: 'start', j: 'start' }, { a: 'start', j: 'center' }, { a: 'start', j: 'end' },
    { a: 'center', j: 'start' }, { a: 'center', j: 'center' }, { a: 'center', j: 'end' },
    { a: 'end', j: 'start' }, { a: 'end', j: 'center' }, { a: 'end', j: 'end' },
  ];
  return (
    <div className={cn("inline-grid grid-cols-3 gap-0.5 p-0.5 bg-black/40 border border-white/10 rounded pointer-events-auto hover:border-[var(--accent-1)] transition-all mx-1", className)}>
      {points.map((p, i) => (
        <button key={i} onClick={() => onUpdate({ align: p.a as any, justify: p.j as any })}
          className={cn("w-1.5 h-1.5 rounded-full transition-all", (p.a === align && p.j === justify) ? "bg-[var(--accent-1)] shadow-[0_0_5px_var(--accent-1)]" : "bg-white/10 hover:bg-white/30")} />
      ))}
    </div>
  );
};

// --- Helpers ---

function getObjectDepth(id: string, allObjects: CanvasObject[], depth = 0): number {
  const obj = allObjects.find(o => o.id === id);
  if (!obj || !obj.parentId || depth > 50) return depth;
  return getObjectDepth(obj.parentId, allObjects, depth + 1);
}

function highlightCode(
  code: string,
  isFlashing: boolean,
  isDragging: boolean,
  isResizing: boolean,
  isRotating: boolean,
): React.ReactNode {
  const parts = code.split(/(<\/?[a-zA-Z0-9]+|=\{?[^}\s>]+}?|\s[a-z]+(?==)|>)/g);
  return parts.map((part, i) => {
    const lowerPart = part.toLowerCase();
    const isTag  = /frame|typography|button|counter|header|footer/i.test(lowerPart);
    const isAttr = part.trim() && !part.startsWith('<') && !part.startsWith('=') && !part.startsWith('/') && part !== '>';

    let isChanging = false;
    if (isResizing && /width|height/i.test(lowerPart)) isChanging = true;
    if (isDragging && /left|top/i.test(lowerPart))     isChanging = true;
    if (isRotating && /rotation/i.test(lowerPart))     isChanging = true;

    if (isTag)
      return <span key={i} className="text-[var(--text-3)] font-black">{part}</span>;
    if (part.startsWith('<') || part === '>')
      return <span key={i} className="text-[var(--text-2)] opacity-30">{part}</span>;
    if (part.startsWith('='))
      return (
        <span key={i} className={cn("text-[var(--accent-1)] transition-all", isChanging && "bg-[var(--accent-1)] text-white px-0.5 rounded shadow-[0_0_8px_var(--accent-1)]")}>
          {part}
        </span>
      );
    if (isAttr)
      return (
        <span key={i} className={cn("text-[var(--text-0)] opacity-70", isChanging && "bg-[var(--accent-1)]/20 ring-1 ring-[var(--accent-1)] px-0.5 rounded")}>
          {part}
        </span>
      );

    return (
      <span key={i} className={cn("transition-all duration-300", isFlashing ? "text-white" : "text-[var(--text-0)]")}>
        {part}
      </span>
    );
  });
}

// --- Component ---

export const InspectorPanel: React.FC<InspectorPanelProps> = (props) => {
  const {
    selectedObject, objects, onUpdateObject, onDeleteObject,
    width, isDragging = false, isResizing = false, isRotating = false,
  } = props;

  const vm = useInspectorViewModel(props);

  const {
    textareaRef, preRef, widgetsRef, fillPickerRef, autocompleteRef,
    editableCode, codeLines, isFlashing, showFillPicker, autocomplete,
    setEditableCode, setShowFillPicker, setAutocomplete, setIsResizingPanel,
    acceptSuggestion, handleScroll, handleSyncCode, computeAutocomplete,
  } = vm;

  // Code section visibility state
  const [visibleSections, setVisibleSections] = useState({ interface: true, logic: true, return: true });
  const [sectionCode, setSectionCode] = useState({
    interface: `interface = {\n  // interface logic\n}`,
    logic: `const item = (interface: null) => {\n  // null\n}`,
  });

  const toggleSection = (key: keyof typeof visibleSections) =>
    setVisibleSections(prev => ({ ...prev, [key]: !prev[key] }));

  const codeSections: { key: keyof typeof visibleSections; label: string; icon: IconName }[] = [
    { key: 'interface', label: 'INTERFACE', icon: 'align-left-top' },
    { key: 'logic',     label: 'LOGIC',     icon: 'player-play'    },
    { key: 'return',    label: 'RETURN',    icon: 'frame'          },
  ];

  // --- Empty state ---
  if (!selectedObject) {
    return (
      <aside style={{ width }} className="border-l border-[var(--border-1)] bg-[var(--bg-2)] flex flex-col z-20 shadow-2xl relative">
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--accent-1)] transition-colors z-30"
          onMouseDown={() => setIsResizingPanel(true)}
        />
        <div className="h-full flex flex-col items-center justify-center py-12 text-center space-y-4 opacity-20">
          <Icon name="click" size={48} />
          <div className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
            Select Layer<br />to initialize stream
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside style={{ width }} className="border-l border-[var(--border-1)] bg-[var(--bg-ide)] flex flex-col z-20 shadow-2xl relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--accent-1)] transition-colors z-30"
        onMouseDown={() => setIsResizingPanel(true)}
      />

      {/* Header */}
      <div className="p-3 border-b border-[var(--border-1)] bg-[var(--bg-2)] flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-1)] shadow-[0_0_10px_var(--accent-1)]" />
          <Typography variant="xs" weight="black" className="uppercase tracking-[0.2em] text-[var(--text-1)]">
            {selectedObject.name}
          </Typography>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncCode}
            className="text-[9px] font-black uppercase bg-[var(--accent-1)] text-white px-4 py-1 italic hover:shadow-[0_0_15px_var(--accent-1)] transition-all rounded-sm flex items-center gap-2"
          >
            <Icon name="player-play" size={10} /> Sync_Stream
          </button>
          <button
            onClick={() => onDeleteObject(selectedObject.id)}
            className="text-[9px] font-black uppercase text-red-500/40 hover:text-red-500 p-1"
          >
            <Icon name="click" size={14} />
          </button>
        </div>
      </div>

      {/* Unified Code Sheet */}
      <div className="flex-1 flex min-h-0 bg-black/20">

        {/* Section Icon Strip */}
        <div className="flex flex-col items-center py-2 gap-1 border-r border-[var(--border-1)] bg-[var(--bg-2)]/80 z-40 shrink-0 w-8">
          {codeSections.map(({ key, icon }) => (
            <button
              key={key}
              onClick={() => toggleSection(key)}
              title={key}
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded transition-all",
                visibleSections[key]
                  ? "bg-[var(--accent-1)]/20 text-[var(--accent-1)] shadow-[0_0_8px_var(--accent-1)]"
                  : "text-[var(--text-2)]/30 hover:text-[var(--text-1)] hover:bg-white/5"
              )}
            >
              <Icon name={icon} size={12} />
            </button>
          ))}
        </div>

        {/* Single scrollable code column */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">

          {/* ── INTERFACE ─────────────────────────────── */}
          <div className="shrink-0 border-b border-white/5">
            <div className="flex items-center gap-2 px-3 py-1 bg-black/30 sticky top-0 z-10">
              <span className={cn("text-[7px] font-black uppercase tracking-widest transition-colors", visibleSections.interface ? "text-[var(--accent-1)]" : "text-[var(--text-2)]/30")}>
                INTERFACE
              </span>
            </div>
            {visibleSections.interface && (
              <textarea
                value={sectionCode.interface}
                onChange={e => setSectionCode(prev => ({ ...prev, interface: e.target.value }))}
                spellCheck={false}
                rows={sectionCode.interface.split('\n').length}
                className="w-full bg-transparent font-mono text-[10px] text-[var(--text-1)] caret-[var(--accent-1)] resize-none outline-none px-4 py-2"
                style={{ lineHeight: '20px' }}
              />
            )}
          </div>

          {/* ── LOGIC ─────────────────────────────────── */}
          <div className="shrink-0 border-b border-white/5">
            <div className="flex items-center gap-2 px-3 py-1 bg-black/30 sticky top-0 z-10">
              <span className={cn("text-[7px] font-black uppercase tracking-widest transition-colors", visibleSections.logic ? "text-[var(--accent-1)]" : "text-[var(--text-2)]/30")}>
                LOGIC
              </span>
            </div>
            {visibleSections.logic && (
              <textarea
                value={sectionCode.logic}
                onChange={e => setSectionCode(prev => ({ ...prev, logic: e.target.value }))}
                spellCheck={false}
                rows={sectionCode.logic.split('\n').length}
                className="w-full bg-transparent font-mono text-[10px] text-[var(--text-1)] caret-[var(--accent-1)] resize-none outline-none px-4 py-2"
                style={{ lineHeight: '20px' }}
              />
            )}
          </div>

          {/* ── RETURN ────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-1 bg-black/30 sticky top-0 z-10 shrink-0">
              <span className={cn("text-[7px] font-black uppercase tracking-widest transition-colors", visibleSections.return ? "text-[var(--accent-1)]" : "text-[var(--text-2)]/30")}>
                RETURN
              </span>
            </div>
            {visibleSections.return && (
              <div className="flex-1 relative flex min-h-0">

                {/* Interactive Widgets Gutter */}
                <div
                  ref={widgetsRef}
                  className="w-[100px] z-30 pointer-events-none py-4 font-mono text-[10px] overflow-hidden border-r border-white/5 bg-black/20 shrink-0"
                  style={{ lineHeight: '26px' }}
                >
                  {codeLines.map((lineMeta, idx) => {
                    const line  = lineMeta.text;
                    const objId = lineMeta.objectId;
                    const obj   = objId ? objects.find(o => o.id === objId) : null;

                    if (!obj) return <div key={idx} className="h-[26px]" />;

                    const hasWidth       = line.includes('width=');
                    const hasHeight      = line.includes('height=');
                    const hasLeft        = line.includes('left=');
                    const hasTop         = line.includes('top=');
                    const hasFill        = line.includes('fill=');
                    const hasAlign       = line.includes('align=');
                    const hasLayout      = line.includes('layout=');
                    const hasDirection   = line.includes('direction=');
                    const hasGap         = line.includes('gap=');
                    const hasPadding     = line.includes('padding=');
                    const hasMargin      = line.includes('margin=');
                    const hasRadius      = line.includes('borderRadius=');
                    const hasClip        = line.includes('clipContent=');
                    const hasVariant     = line.includes('variant=');
                    const hasBorderWidth = line.includes('borderWidth=') || line.includes('border=');
                    const hasRotation    = line.includes('rotation=');

                    return (
                      <div key={idx} className="h-[26px] flex items-center justify-end pr-2 whitespace-nowrap">
                        {hasWidth       && <Ticker value={Math.round(obj.width)}           onUpdate={(v) => onUpdateObject(obj.id, { width:        Math.max(0, v) })} />}
                        {hasHeight      && <Ticker value={Math.round(obj.height)}          onUpdate={(v) => onUpdateObject(obj.id, { height:       Math.max(0, v) })} />}
                        {hasLeft        && <Ticker value={Math.round(obj.x)}               onUpdate={(v) => onUpdateObject(obj.id, { x: v })} />}
                        {hasTop         && <Ticker value={Math.round(obj.y)}               onUpdate={(v) => onUpdateObject(obj.id, { y: v })} />}
                        {hasRotation    && <Ticker value={obj.rotation || 0}               onUpdate={(v) => onUpdateObject(obj.id, { rotation: v })} />}
                        {hasBorderWidth && <Ticker value={obj.borderWidth || 0}            onUpdate={(v) => onUpdateObject(obj.id, { borderWidth:  Math.max(0, v) })} />}
                        {hasLayout      && <CompactDropdown value={obj.layout || 'none'}   options={['none', 'flex']}    onUpdate={(v) => onUpdateObject(obj.id, { layout:     v as any })} />}
                        {hasDirection   && <CompactDropdown value={obj.direction || 'row'} options={['row', 'column']}  onUpdate={(v) => onUpdateObject(obj.id, { direction:  v as any })} />}
                        {hasGap         && <Ticker value={obj.gap || 0}                    onUpdate={(v) => onUpdateObject(obj.id, { gap:          Math.max(0, v) })} />}
                        {hasPadding     && <Ticker value={obj.padding || 0}                onUpdate={(v) => onUpdateObject(obj.id, { padding:      Math.max(0, v) })} />}
                        {hasMargin      && <Ticker value={obj.margin || 0}                 onUpdate={(v) => onUpdateObject(obj.id, { margin:       Math.max(0, v) })} />}
                        {hasRadius      && <Ticker value={obj.borderRadius || 0}           onUpdate={(v) => onUpdateObject(obj.id, { borderRadius: Math.max(0, v) })} />}
                        {hasClip        && <CompactToggle label="CLIP" value={!!obj.clipContent} onUpdate={(v) => onUpdateObject(obj.id, { clipContent: v })} />}
                        {hasVariant     && <CompactDropdown value={obj.variant || 'surface'} options={['surface', 'none', 'glass', 'neo']} onUpdate={(v) => onUpdateObject(obj.id, { variant: v })} />}

                        {hasFill && (
                          <div className="flex items-center gap-2 pointer-events-auto">
                            <button
                              onClick={() => setShowFillPicker(!showFillPicker)}
                              className="w-4 h-4 rounded-full border border-white/40 shadow-xl hover:scale-125 transition-transform"
                              style={{
                                background: obj.backgroundGradient || (obj.backgroundImage ? `url(${obj.backgroundImage})` : obj.color || '#fff'),
                                backgroundSize: 'cover',
                              }}
                            />
                            {showFillPicker && selectedObject?.id === obj.id && (
                              <div
                                ref={fillPickerRef}
                                className="fixed right-0 mr-8 top-1/2 -translate-y-1/2 z-[200] w-64 p-4 bg-[var(--bg-2)] border border-[var(--border-1)] rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200"
                                style={{ marginRight: `${width + 20}px` }}
                              >
                                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                  <Typography variant="xs" weight="black" className="uppercase tracking-widest opacity-40">Fill_Controller</Typography>
                                  <button onClick={() => setShowFillPicker(false)} className="text-white/20 hover:text-white transition-colors">
                                    <Icon name="click" size={14} />
                                  </button>
                                </div>
                                <FillPanel
                                  color={obj.color}
                                  backgroundGradient={obj.backgroundGradient}
                                  backgroundImage={obj.backgroundImage}
                                  onUpdate={(u) => onUpdateObject(obj.id, u)}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {hasAlign && (
                          <InlineAlignGrid
                            align={obj.align || 'start'}
                            justify={obj.justify || 'start'}
                            onUpdate={(u) => onUpdateObject(obj.id, u)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Live JSX Code Editor */}
                <div className="flex-1 relative overflow-hidden">
                  <pre
                    ref={preRef}
                    className="absolute inset-0 z-20 font-mono text-[10px] pointer-events-none whitespace-pre overflow-auto p-4 custom-scrollbar text-white"
                    aria-hidden="true"
                    style={{ lineHeight: '26px' }}
                  >
                    {highlightCode(editableCode, isFlashing, isDragging, isResizing, isRotating)}
                  </pre>

                  <textarea
                    ref={textareaRef}
                    value={editableCode}
                    onChange={(e) => {
                      setEditableCode(e.target.value);
                      computeAutocomplete(e.target.value, e.target.selectionStart);
                    }}
                    onKeyDown={(e) => {
                      if (!autocomplete) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAutocomplete(prev => prev ? { ...prev, activeIndex: (prev.activeIndex + 1) % prev.suggestions.length } : null);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAutocomplete(prev => prev ? { ...prev, activeIndex: (prev.activeIndex - 1 + prev.suggestions.length) % prev.suggestions.length } : null);
                      } else if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        acceptSuggestion(autocomplete.suggestions[autocomplete.activeIndex], autocomplete);
                      } else if (e.key === 'Escape') {
                        setAutocomplete(null);
                      }
                    }}
                    onClick={() => setAutocomplete(null)}
                    onScroll={handleScroll}
                    spellCheck={false}
                    className="relative w-full h-full z-10 bg-transparent font-mono text-[10px] text-transparent caret-[var(--accent-1)] resize-none outline-none overflow-auto p-4 custom-scrollbar whitespace-pre"
                    style={{ lineHeight: '26px' }}
                  />

                  {autocomplete && (() => {
                    const ta = textareaRef.current;
                    if (!ta) return null;
                    const rect   = ta.getBoundingClientRect();
                    const rawTop = rect.top + 16 + (autocomplete.line + 1) * 26 - ta.scrollTop;
                    const dropH  = autocomplete.suggestions.length * 30 + 40;
                    const top    = rawTop + dropH > window.innerHeight ? rawTop - dropH - 28 : rawTop;
                    return (
                      <div
                        ref={autocompleteRef}
                        className="fixed z-[9999] overflow-hidden rounded-xl border border-[var(--accent-1)]/20 shadow-[0_20px_60px_rgba(0,0,0,0.9)] bg-[var(--bg-2)]"
                        style={{ top: Math.max(8, top), left: rect.left + 108, minWidth: 210 }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2 bg-black/40">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] shadow-[0_0_6px_var(--accent-1)]" />
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-3)]">
                            {autocomplete.isValue ? `${autocomplete.propName} values` : 'intellisense'}
                          </span>
                        </div>
                        {autocomplete.suggestions.map((s, i) => (
                          <button
                            key={s}
                            className={cn(
                              'w-full text-left px-3 py-1.5 text-[11px] font-mono flex items-center gap-3 transition-colors',
                              i === autocomplete.activeIndex
                                ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)] ring-inset ring-1 ring-[var(--accent-1)]/30'
                                : 'text-[var(--text-1)] hover:bg-white/5'
                            )}
                            onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s, autocomplete); }}
                          >
                            <span className={cn('text-[8px] font-black w-3 shrink-0', i === autocomplete.activeIndex ? 'text-[var(--accent-1)]' : 'opacity-20')}>
                              {autocomplete.isValue ? '=' : 'P'}
                            </span>
                            <span className="flex-1">{s}</span>
                            {i === autocomplete.activeIndex && (
                              <span className="text-[8px] opacity-30 font-sans">↵</span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Analytics Footer */}
      <div className="p-2.5 bg-black/40 border-t border-[var(--border-1)] flex justify-between items-center z-20">
        <div className="flex gap-6 items-center">
          <div className="flex flex-col">
            <span className="text-[7px] text-[var(--text-3)] font-black">STREAM_DEPTH</span>
            <span className="text-[9px] font-mono text-[var(--accent-1)] tracking-tighter">{getObjectDepth(selectedObject.id, objects)}</span>
          </div>
          <div className="flex flex-col border-l border-white/10 pl-4">
            <span className="text-[7px] text-[var(--text-3)] font-black">NODE_CLASS</span>
            <span className="text-[9px] font-mono text-white/80">{selectedObject.type.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex gap-4 text-right">
          <div className="flex flex-col items-end">
            <span className="text-[7px] text-[var(--text-3)] font-black">DIMENSIONS</span>
            <span className="text-[9px] font-mono text-[var(--accent-1)]">{Math.round(selectedObject.width)}x{Math.round(selectedObject.height)}</span>
          </div>
          <div className="flex flex-col items-end border-l border-white/10 pl-4">
            <span className="text-[7px] text-[var(--text-3)] font-black">LOC_STREAM</span>
            <span className="text-[9px] font-mono text-white/40">{Math.round(selectedObject.x)},{Math.round(selectedObject.y)}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
