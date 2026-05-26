import { CanvasObject } from '../types';

/**
 * Metadata for a generated line of code.
 */
export interface CodeLine {
  text: string;
  objectId?: string;
}

export interface GeneratedCode {
  code: string;
  lines: CodeLine[];
}

/**
 * Generates a JSX string and metadata for a given CanvasObject and its children.
 */
export const generateCode = (obj: CanvasObject, allObjects: CanvasObject[]): GeneratedCode => {
  const imports = new Set<string>();
  imports.add("import React from 'react';");
  
  const lineBuffer: CodeLine[] = [];
  
  // Add Imports
  // We'll collect imports during JSX generation and prepend them at the end
  const jsxLines = generateJSXLines(obj, allObjects, 0, imports);
  
  const importLines = Array.from(imports).sort().map(text => ({ text }));
  
  lineBuffer.push(...importLines);
  lineBuffer.push({ text: "" });
  lineBuffer.push({ text: "export const DesignComponent = () => {" });
  lineBuffer.push({ text: "  return (" });
  
  // Add Body with indentation
  jsxLines.forEach(l => {
    lineBuffer.push({ 
      text: "    " + l.text, 
      objectId: l.objectId 
    });
  });
  
  lineBuffer.push({ text: "  );" });
  lineBuffer.push({ text: "};" });
  
  return {
    code: lineBuffer.map(l => l.text).join('\n'),
    lines: lineBuffer
  };
};

const generateJSXLines = (obj: CanvasObject, allObjects: CanvasObject[], depth: number, imports: Set<string>): CodeLine[] => {
  const indent = '  '.repeat(depth);
  const children = allObjects.filter(child => child.parentId === obj.id);
  
  let componentName = 'div';
  const props: string[] = [];

  // Base props
  if (obj.width !== undefined) props.push(`width={${Math.round(obj.width)}}`);
  if (obj.height !== undefined) props.push(`height={${Math.round(obj.height)}}`);
  if (obj.rotation !== undefined) props.push(`rotation={${obj.rotation || 0}}`);

  if (obj.parentId) {
    const parent = allObjects.find(p => p.id === obj.parentId);
    if (obj.isAbsolute || parent?.layout !== 'flex') {
      props.push(`position="absolute"`);
      props.push(`left={${Math.round(obj.x)}}`);
      props.push(`top={${Math.round(obj.y)}}`);
    }
  } else if (obj.isAbsolute) {
    props.push(`position="absolute"`);
    props.push(`left={${Math.round(obj.x)}}`);
    props.push(`top={${Math.round(obj.y)}}`);
  }

  if (obj.type === 'frame') {
    componentName = 'Frame';
    imports.add("import { Frame } from '../../01_atoms/Frame/Frame';");
    
    props.push(`layout="${obj.layout || 'none'}"`);
    props.push(`direction="${obj.direction || 'row'}"`);
    props.push(`align="${obj.align || 'start'}"`);
    props.push(`justify="${obj.justify || 'start'}"`);
    props.push(`gap={${obj.gap || 0}}`);
    props.push(`padding={${obj.padding || 0}}`);
    props.push(`margin={${obj.margin || 0}}`);
    props.push(`clipContent={${!!obj.clipContent}}`);
    
    const fillValue = obj.backgroundGradient || (obj.backgroundImage ? `url(${obj.backgroundImage})` : obj.color || 'transparent');
    props.push(`fill="${fillValue}"`);
    
    props.push(`borderRadius={${obj.borderRadius || 0}}`);
    
    const bWidth = obj.borderWidth || 0;
    const bColor = obj.borderColor || 'transparent';
    props.push(`border="${bWidth}px solid ${bColor}"`);

    props.push(`borderTop="${obj.borderTop || ''}"`);
    props.push(`borderRight="${obj.borderRight || ''}"`);
    props.push(`borderBottom="${obj.borderBottom || ''}"`);
    props.push(`borderLeft="${obj.borderLeft || ''}"`);

    props.push(`variant="${obj.variant || 'surface'}"`);
  } else if (obj.type === 'square' || obj.type === 'circle') {
    componentName = 'Frame';
    imports.add("import { Frame } from '../../01_atoms/Frame/Frame';");
    if (obj.type === 'circle') props.push(`borderRadius="50%"`);
    const bWidth = obj.borderWidth || 2;
    const bColor = obj.borderColor || 'var(--text-3)';
    props.push(`border="${bWidth}px solid ${bColor}"`);
    if (obj.color) props.push(`backgroundColor="${obj.color}"`);
    if (obj.margin) props.push(`margin={${obj.margin}}`);
  } else if (obj.type === 'component' && obj.componentType) {
    componentName = obj.componentType;
    let importPath = `../01_atoms/${obj.componentType}/${obj.componentType}`;
    if (['Counter'].includes(obj.componentType)) importPath = `../02_molecules/${obj.componentType}/${obj.componentType}.view`;
    else if (['Header', 'Footer'].includes(obj.componentType)) importPath = `../03_organisms/${obj.componentType}/${obj.componentType}.view`;
    imports.add(`import { ${obj.componentType} } from '${importPath}';`);
    if (obj.padding) props.push(`padding={${obj.padding}}`);
    if (obj.margin) props.push(`margin={${obj.margin}}`);
  } else if (obj.type === 'text') {
    componentName = 'Text';
    imports.add("import { Text } from '../01_atoms/Text/Text';");
    if (obj.textVariant) props.push(`variant="${obj.textVariant}"`);
    const fillValue = obj.backgroundGradient || (obj.backgroundImage ? `url(${obj.backgroundImage})` : obj.color || 'transparent');
    props.push(`fill="${fillValue}"`);
    props.push(`layout="${obj.layout || 'none'}"`);
    props.push(`direction="${obj.direction || 'row'}"`);
    props.push(`align="${obj.align || 'start'}"`);
    props.push(`justify="${obj.justify || 'start'}"`);
    props.push(`gap={${obj.gap || 0}}`);
    props.push(`padding={${obj.padding || 0}}`);
    props.push(`clipContent={${!!obj.clipContent}}`);
    props.push(`borderRadius={${obj.borderRadius || 0}}`);
    const tBWidth = obj.borderWidth || 0;
    const tBColor = obj.borderColor || 'transparent';
    props.push(`border="${tBWidth}px solid ${tBColor}"`);
    if (obj.margin) props.push(`margin={${obj.margin}}`);
  }

  const result: CodeLine[] = [];
  
  if (children.length === 0) {
    if (obj.type === 'component') {
      result.push({ text: `<${componentName}`, objectId: obj.id });
      props.forEach(p => result.push({ text: `${indent}  ${p}`, objectId: obj.id }));
      result.push({ text: `${indent}/>`, objectId: obj.id });
      return result;
    }
    if (obj.type === 'text') {
      result.push({ text: `<${componentName}`, objectId: obj.id });
      props.forEach(p => result.push({ text: `${indent}  ${p}`, objectId: obj.id }));
      result.push({ text: `${indent}>${obj.textContent || 'Text content'}</${componentName}>`, objectId: obj.id });
      return result;
    }
    result.push({ text: `<${componentName}`, objectId: obj.id });
    props.forEach(p => result.push({ text: `${indent}  ${p}`, objectId: obj.id }));
    result.push({ text: `${indent}>`, objectId: obj.id });
    result.push({ text: `${indent}</${componentName}>`, objectId: obj.id });
    return result;
  }

  result.push({ text: `<${componentName}`, objectId: obj.id });
  props.forEach(p => result.push({ text: `${indent}  ${p}`, objectId: obj.id }));
  result.push({ text: `${indent}>`, objectId: obj.id });

  children.forEach(child => {
    result.push(...generateJSXLines(child, allObjects, depth + 1, imports));
  });

  result.push({ text: `${indent}</${componentName}>`, objectId: obj.id });
  
  return result;
};
