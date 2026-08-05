import { FrameProps } from '../Frame/Frame';

export interface ScrollWindowProps extends Omit<FrameProps, 'scroll' | 'clipContent'> {
  /** Scroll axis — defaults to 'y'. */
  axis?: 'x' | 'y' | 'both';
  /** Fade the leading/trailing edge into transparent so content doesn't hard-cut. */
  fade?: boolean;
  /** Size of the fade in px. */
  fadeSize?: number;
  /** Hide the native scrollbar while keeping scroll behavior. */
  hideScrollbar?: boolean;
}
