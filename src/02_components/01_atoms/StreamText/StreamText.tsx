import React from 'react';
import { StreamTextProps } from './iStreamText';
import { useStreamTextViewModel } from './StreamTextViewModel';

export const StreamText: React.FC<StreamTextProps> = (props) => {
  const { className, style } = props;
  const { visibleText, done } = useStreamTextViewModel(props);

  return (
    <span className={className} style={style}>
      {visibleText}
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
