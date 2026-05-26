import React, { useMemo } from 'react';
import { Tooltip } from '../02_molecules/Tooltip/Tooltip';
import { Frame } from '../01_atoms/Frame/Frame';
import { Text, type TextProps } from '../01_atoms/Text/Text';
import { cn } from '../../utils/cn';

interface ActiveCodePanelProps {
  code: string;
  onSelectComponent?: (componentName: string) => void;
  onHoverComponent?: (componentName: string | null) => void;
  className?: string;
}

type SegmentKind = 'component' | 'prop' | 'child';

interface Segment {
  start: number;
  end: number;
  kind: SegmentKind;
  value: string;
}

const TAG_TO_COMPONENT: Record<string, string> = {
  frame: 'Frame',
  div: 'Frame',
  button: 'Button',
  dropdown: 'Dropdown',
  counter: 'Counter',
  typography: 'Text',
  text: 'Text',
  header: 'Header',
  footer: 'Footer',
};

const KNOWN_COMPONENT_WORDS = new Set([
  'Frame',
  'Button',
  'Counter',
  'Dropdown',
  'Text',
  'Typography',
  'Header',
  'Footer',
  'div',
]);

const PROP_TO_COMPONENT: Record<string, string> = {
  onClick: 'Frame',
  onHover: 'Frame',
  onHoverEnd: 'Frame',
  layout: 'Frame',
  padding: 'Frame',
  margin: 'Frame',
  gap: 'Frame',
  align: 'Frame',
  justify: 'Frame',
  direction: 'Frame',
  className: 'Frame',
  children: 'Text',
  variant: 'Text',
  weight: 'Text',
  transform: 'Text',
  color: 'Text',
  tracking: 'Text',
  leading: 'Text',
};

function resolveTarget(kind: SegmentKind, token: string): string | null {
  if (kind === 'component') return TAG_TO_COMPONENT[token.toLowerCase()] ?? null;
  if (kind === 'prop') return PROP_TO_COMPONENT[token] ?? null;
  return null;
}

const COLOR_BY_KIND: Record<SegmentKind, TextProps['color']> = {
  component: 'text-1',
  prop: 'text-2',
  child: 'text-2',
};

function collectSegments(line: string): Segment[] {
  const segments: Segment[] = [];

  const tagRegex = /<\/?([A-Za-z][A-Za-z0-9]*)\b/g;
  for (const match of line.matchAll(tagRegex)) {
    const token = match[1];
    const full = match[0];
    const start = (match.index ?? 0) + full.indexOf(token);
    segments.push({ start, end: start + token.length, kind: 'component', value: token });
  }

  const propRegex = /\b([A-Za-z_$][\w$-]*)(?==)/g;
  for (const match of line.matchAll(propRegex)) {
    const token = match[1];
    const start = match.index ?? 0;
    segments.push({ start, end: start + token.length, kind: 'prop', value: token });
  }

  // TS/TSX declarations: onClick?: ..., onHover: ...
  const typedPropRegex = /\b([A-Za-z_$][\w$-]*)(?=\??:)/g;
  for (const match of line.matchAll(typedPropRegex)) {
    const token = match[1];
    const start = match.index ?? 0;
    if (token in PROP_TO_COMPONENT) {
      segments.push({ start, end: start + token.length, kind: 'prop', value: token });
    }
  }

  // Keep component words highlighted even when not in JSX tags.
  const knownWordsRegex = /\b([A-Za-z][A-Za-z0-9]*)\b/g;
  for (const match of line.matchAll(knownWordsRegex)) {
    const token = match[1];
    const start = match.index ?? 0;
    if (KNOWN_COMPONENT_WORDS.has(token)) {
      segments.push({ start, end: start + token.length, kind: 'component', value: token });
    }
  }

  const contentRegex = />\s*([^<>{}][^<]*)\s*</g;
  for (const match of line.matchAll(contentRegex)) {
    const raw = match[1];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = (match.index ?? 0) + match[0].indexOf(trimmed);
    segments.push({ start, end: start + trimmed.length, kind: 'child', value: trimmed });
  }

  segments.sort((a, b) => a.start - b.start || a.end - b.end);

  const nonOverlapping: Segment[] = [];
  for (const segment of segments) {
    const previous = nonOverlapping[nonOverlapping.length - 1];
    if (!previous || segment.start >= previous.end) {
      nonOverlapping.push(segment);
    }
  }

  return nonOverlapping;
}

function extractPrimaryConstBlock(source: string): string {
  const blockStartPattern = /(?:export\s+)?const\s+[A-Za-z_$][\w$]*[\s\S]*?=>\s*\{/g;
  const candidates = [...source.matchAll(blockStartPattern)];

  for (const candidate of candidates) {
    const startIndex = candidate.index ?? 0;
    const openBraceIndex = source.indexOf('{', startIndex);
    if (openBraceIndex === -1) continue;

    let depth = 0;
    let endIndex = -1;
    for (let i = openBraceIndex; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex === -1) continue;

    const maybeSemicolon = source[endIndex + 1] === ';' ? endIndex + 2 : endIndex + 1;
    const block = source.slice(startIndex, maybeSemicolon).trim();
    if (/\breturn\b/.test(block)) {
      return block;
    }
  }

  return source.trim();
}

export const ActiveCodePanel: React.FC<ActiveCodePanelProps> = ({
  code,
  onSelectComponent,
  onHoverComponent,
  className,
}) => {
  const lines = useMemo(() => extractPrimaryConstBlock(code).split('\n'), [code]);

  const renderLine = (line: string, lineIndex: number) => {
    const segments = collectSegments(line);
    if (!segments.length) {
      return (
        <Text as="span" variant="p" className="font-code text-[var(--text-2)]">
          {line}
        </Text>
      );
    }

    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    segments.forEach((segment, idx) => {
      if (segment.start > cursor) {
        nodes.push(
          <Text
            key={`plain-${lineIndex}-${idx}-${cursor}`}
            as="span"
            variant="p"
            className="font-code text-[var(--text-3)]"
          >
            {line.slice(cursor, segment.start)}
          </Text>,
        );
      }

      const tokenText = line.slice(segment.start, segment.end);
      const targetComponent = resolveTarget(segment.kind, segment.value);
      const tokenColor = COLOR_BY_KIND[segment.kind];

      const tokenNode = (
        <Text
          as="span"
          variant="p"
          color={tokenColor}
          className={cn(
            'font-code',
            segment.kind === 'child' && 'opacity-90',
            targetComponent &&
              'cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[var(--accent-1)]',
          )}
          onClick={targetComponent ? () => onSelectComponent?.(targetComponent) : undefined}
          onMouseEnter={targetComponent ? () => onHoverComponent?.(targetComponent) : undefined}
          onMouseLeave={targetComponent ? () => onHoverComponent?.(null) : undefined}
        >
          {tokenText}
        </Text>
      );

      nodes.push(
        <React.Fragment key={`tok-${lineIndex}-${idx}-${segment.start}`}>
          {targetComponent ? (
            <Tooltip content={`${segment.kind.toUpperCase()}: ${segment.value} -> ${targetComponent}`}>
              {tokenNode}
            </Tooltip>
          ) : (
            tokenNode
          )}
        </React.Fragment>,
      );

      cursor = segment.end;
    });

    if (cursor < line.length) {
      nodes.push(
        <Text
          key={`tail-${lineIndex}-${cursor}`}
          as="span"
          variant="p"
          className="font-code text-[var(--text-3)]"
        >
          {line.slice(cursor)}
        </Text>,
      );
    }

    return nodes;
  };

  return (
    <Frame
      as="pre"
      backgroundColor="var(--primary-6)"
      padding={16}
      height="100%"
      border="1px solid var(--border-1)"
      className={cn(
        'max-h-[34rem] overflow-auto whitespace-pre-wrap break-words font-code normal-case text-[var(--font-p)] tracking-[-0.02em] leading-[1.35]',
        className,
      )}
      onMouseLeave={() => onHoverComponent?.(null)}
    >
      {lines.map((line, index) => (
        <React.Fragment key={`line-${index}`}>
          {renderLine(line, index)}
          {index < lines.length - 1 ? '\n' : null}
        </React.Fragment>
      ))}
    </Frame>
  );
};
