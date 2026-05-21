import { useState, useEffect, useRef, useCallback } from 'react';
import { CodeLine, generateCode } from '../../utils/codeGenerator';
import { CanvasObject } from '../../types';
import {
  InspectorPanelProps, AutocompleteState,
  TAG_PROPS, FRAME_PROPS, PROP_VALUES, TEXT_VARIANT_VALUES,
} from './iPanel';

export interface InspectorViewModel {
  // Refs
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  preRef: React.RefObject<HTMLPreElement>;
  widgetsRef: React.RefObject<HTMLDivElement>;
  fillPickerRef: React.RefObject<HTMLDivElement>;
  autocompleteRef: React.RefObject<HTMLDivElement>;
  // State
  editableCode: string;
  codeLines: CodeLine[];
  isFlashing: boolean;
  showFillPicker: boolean;
  autocomplete: AutocompleteState | null;
  isResizingPanel: boolean;
  // Actions
  setEditableCode: (v: string) => void;
  setShowFillPicker: (v: boolean) => void;
  setAutocomplete: React.Dispatch<React.SetStateAction<AutocompleteState | null>>;
  setIsResizingPanel: (v: boolean) => void;
  acceptSuggestion: (suggestion: string, ac: AutocompleteState) => void;
  handleScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  handleSyncCode: () => void;
  computeAutocomplete: (value: string, cursor: number) => void;
}

export const useInspectorViewModel = ({
  selectedObject,
  objects,
  onUpdateObject,
  onWidthChange,
}: InspectorPanelProps): InspectorViewModel => {
  const [editableCode, setEditableCode] = useState('');
  const [codeLines, setCodeLines] = useState<CodeLine[]>([]);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const widgetsRef = useRef<HTMLDivElement>(null);
  const fillPickerRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const lastCodeRef = useRef('');
  const isTypingRef = useRef(false);

  // Close fill picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fillPickerRef.current && !fillPickerRef.current.contains(e.target as Node)) {
        setShowFillPicker(false);
      }
    };
    if (showFillPicker) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showFillPicker]);

  // Sync generated code when selected object changes
  useEffect(() => {
    if (selectedObject) {
      const generated = generateCode(selectedObject, objects);
      if (generated.code !== lastCodeRef.current && !isTypingRef.current) {
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 300);
        setEditableCode(generated.code);
        setCodeLines(generated.lines);
        lastCodeRef.current = generated.code;
      } else if (!isTypingRef.current) {
        setEditableCode(generated.code);
        setCodeLines(generated.lines);
      }
      lastCodeRef.current = generated.code;
    }
  }, [selectedObject, objects]);

  // Panel resize drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPanel) return;
      const newWidth = window.innerWidth - e.clientX;
      onWidthChange(Math.max(340, Math.min(newWidth, 900)));
    };
    const handleMouseUp = () => setIsResizingPanel(false);
    if (isResizingPanel) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel, onWidthChange]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (widgetsRef.current) {
      widgetsRef.current.scrollTop = scrollTop;
      widgetsRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const computeAutocomplete = useCallback((value: string, cursor: number) => {
    const beforeCursor = value.substring(0, cursor);
    const lines = beforeCursor.split('\n');
    const lineIndex = lines.length - 1;
    const currentLineText = lines[lineIndex];

    const trimmed = currentLineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('import') || trimmed === '') {
      setAutocomplete(null); return;
    }

    const tagMatches = [...beforeCursor.matchAll(/<([A-Za-z][A-Za-z0-9]*)/g)];
    const lastTag = tagMatches.length > 0 ? tagMatches[tagMatches.length - 1][1] : null;
    if (!lastTag) { setAutocomplete(null); return; }

    const isTypographyCtx = lastTag === 'Typography';
    const eqIdx = currentLineText.lastIndexOf('=');
    const spaceIdx = Math.max(currentLineText.lastIndexOf(' '), currentLineText.lastIndexOf('\t'));

    if (eqIdx > spaceIdx) {
      const propName = currentLineText.substring(spaceIdx + 1, eqIdx).trim();
      const afterEq = currentLineText.substring(eqIdx + 1);
      const valueTyped = afterEq.replace(/^[{"']+/, '');
      const valueSuggestions = isTypographyCtx && propName === 'variant'
        ? TEXT_VARIANT_VALUES
        : (PROP_VALUES[propName] || []);
      const filtered = valueSuggestions.filter(s =>
        s.replace(/[{}"']/g, '').toLowerCase().startsWith(valueTyped.toLowerCase())
      );
      if (!filtered.length) { setAutocomplete(null); return; }
      setAutocomplete({ suggestions: filtered, activeIndex: 0, line: lineIndex, isValue: true, propName, tokenStart: cursor - afterEq.length });
    } else {
      const token = currentLineText.substring(spaceIdx + 1);
      if (token.length < 1) { setAutocomplete(null); return; }
      const availableProps = TAG_PROPS[lastTag] ?? FRAME_PROPS;
      const filtered = availableProps.filter(p => p.startsWith(token) && p !== token);
      if (!filtered.length) { setAutocomplete(null); return; }
      setAutocomplete({ suggestions: filtered, activeIndex: 0, line: lineIndex, isValue: false, propName: '', tokenStart: cursor - token.length });
    }
  }, []);

  const acceptSuggestion = useCallback((suggestion: string, ac: AutocompleteState) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const insertText = ac.isValue ? suggestion : suggestion + '=';
    const newCode = editableCode.substring(0, ac.tokenStart) + insertText + editableCode.substring(cursor);
    isTypingRef.current = true;
    setEditableCode(newCode);
    setAutocomplete(null);
    setTimeout(() => {
      const newCursor = ac.tokenStart + insertText.length;
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
      isTypingRef.current = false;
    }, 0);
  }, [editableCode]);

  const handleSyncCode = useCallback(() => {
    if (!selectedObject) return;

    const currentLines = editableCode.split('\n');
    const updatesByObj: Record<string, Partial<CanvasObject>> = {};
    let floatingObjId: string | null = null;

    currentLines.forEach((lineText, idx) => {
      const lineMeta = codeLines[idx];
      const trimmed = lineText.trim();

      if (lineMeta?.objectId) floatingObjId = lineMeta.objectId;
      if (trimmed === '' || trimmed === ');' || trimmed === '};' || trimmed === '}') {
        floatingObjId = null;
      }

      const objId = lineMeta?.objectId ?? floatingObjId;
      if (!objId) return;
      if (!updatesByObj[objId]) updatesByObj[objId] = {};
      const updates = updatesByObj[objId];

      const reg = (p: string) => new RegExp(`${p}=\\{?"?([^"\\} ]+)"?\\}?`);
      const regNum = (p: string) => new RegExp(`${p}=\\{?([0-9.]+)\\}?`);

      const w = lineText.match(regNum('width'));     if (w)   updates.width    = parseFloat(w[1]);
      const h = lineText.match(regNum('height'));    if (h)   updates.height   = parseFloat(h[1]);
      const x = lineText.match(regNum('left'));      if (x)   updates.x        = parseFloat(x[1]);
      const y = lineText.match(regNum('top'));       if (y)   updates.y        = parseFloat(y[1]);
      const rot = lineText.match(regNum('rotation')); if (rot) updates.rotation = parseFloat(rot[1]);
      const gap = lineText.match(regNum('gap'));     if (gap) updates.gap      = parseFloat(gap[1]);
      const pad = lineText.match(regNum('padding')); if (pad) updates.padding  = parseFloat(pad[1]);
      const rad = lineText.match(regNum('borderRadius')); if (rad) updates.borderRadius = parseFloat(rad[1]);

      const borderMatch = lineText.match(/border="([0-9.]+)px/);
      if (borderMatch) updates.borderWidth = parseFloat(borderMatch[1]);

      const bt = lineText.match(/borderTop="([^"]+)"/);    if (bt) updates.borderTop    = bt[1];
      const br = lineText.match(/borderRight="([^"]+)"/);  if (br) updates.borderRight  = br[1];
      const bb = lineText.match(/borderBottom="([^"]+)"/); if (bb) updates.borderBottom = bb[1];
      const bl = lineText.match(/borderLeft="([^"]+)"/);   if (bl) updates.borderLeft   = bl[1];

      const fill = lineText.match(/fill="([^"]+)"/);
      if (fill) {
        const val = fill[1];
        if (val.startsWith('linear-gradient')) {
          updates.backgroundGradient = val;  updates.color = undefined;  updates.backgroundImage = undefined;
        } else if (val.startsWith('url(')) {
          updates.backgroundImage = val.replace(/url\(['"]?|['"]?\)/g, '');  updates.color = undefined;  updates.backgroundGradient = undefined;
        } else {
          updates.color = val;  updates.backgroundGradient = undefined;  updates.backgroundImage = undefined;
        }
      }

      const layout    = lineText.match(reg('layout'));    if (layout)    updates.layout    = layout[1] as any;
      const direction = lineText.match(reg('direction')); if (direction) updates.direction = direction[1] as any;
      const align     = lineText.match(reg('align'));     if (align)     updates.align     = align[1] as any;
      const justify   = lineText.match(reg('justify'));   if (justify)   updates.justify   = justify[1] as any;
      const variant   = lineText.match(reg('variant'));   if (variant)   updates.variant   = variant[1];
      const clip = lineText.match(/clipContent=\{?(true|false)\}?/);
      if (clip) updates.clipContent = clip[1] === 'true';

      const textContent = lineText.match(/>([^<]+)<\/Typography>/);
      if (textContent) updates.textContent = textContent[1];
      const textVariant = lineText.match(/variant="([^"]+)"/);
      if (textVariant && lineMeta?.objectId) {
        const targetObj = objects.find(o => o.id === lineMeta.objectId);
        if (targetObj?.type === 'text') updates.textVariant = textVariant[1];
      }
    });

    Object.entries(updatesByObj).forEach(([id, updates]) => onUpdateObject(id, updates));
  }, [selectedObject, editableCode, codeLines, objects, onUpdateObject]);

  return {
    textareaRef, preRef, widgetsRef, fillPickerRef, autocompleteRef,
    editableCode, codeLines, isFlashing, showFillPicker, autocomplete, isResizingPanel,
    setEditableCode, setShowFillPicker, setAutocomplete, setIsResizingPanel,
    acceptSuggestion, handleScroll, handleSyncCode, computeAutocomplete,
  };
};
