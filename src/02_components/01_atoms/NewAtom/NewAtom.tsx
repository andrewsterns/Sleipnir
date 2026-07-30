import { forwardRef } from 'react';
import { Frame } from '../Frame/Frame';
import { NewAtomProps } from './iNewAtom';
import { useNewAtomViewModel } from './NewAtomViewModel';

export const NewAtom = forwardRef<HTMLElement, NewAtomProps>((props, ref) => {
  useNewAtomViewModel(props);

  return (
    <Frame ref={ref} flow="vertical">
      {/* Implement view here — rendering only, no logic */}
    </Frame>
  );
});

NewAtom.displayName = 'NewAtom';
