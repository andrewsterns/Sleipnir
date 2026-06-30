import React, { useEffect, useState } from 'react';

let _kfInjected = false;
function ensureCSS() {
  if (_kfInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-tars-kf', '');
  el.textContent = `@keyframes tars-cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }`;
  document.head.appendChild(el);
  _kfInjected = true;
}
ensureCSS();

export interface StreamTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const StreamText: React.FC<StreamTextProps> = ({
  text,
  speed = 14,
  onComplete,
  className,
  style,
}) => {
  const [len, setLen] = useState(0);
  const done = len >= text.length;

  useEffect(() => {
    setLen(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setLen(i);
      if (i >= text.length) {
        clearInterval(t);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);

  return (
    <span className={className} style={style}>
      {text.slice(0, len)}
      {!done && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '0.5em',
            height: '0.8em',
            background: 'currentColor',
            marginLeft: 2,
            verticalAlign: '-0.08em',
            animation: 'tars-cursor-blink 0.85s step-end infinite',
          }}
        />
      )}
    </span>
  );
};
