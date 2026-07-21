import { useEffect, useState } from 'react';
import { StreamTextProps } from './iStreamText';

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

export function useStreamTextViewModel({ text, speed = 14, onComplete }: StreamTextProps) {
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

  return { visibleText: text.slice(0, len), done };
}
