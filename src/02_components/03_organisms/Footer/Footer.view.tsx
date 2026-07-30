import { Frame, FrameProps } from '../../01_atoms/Frame/Frame';
import { cn } from '../../../utils/cn';

export const Footer: React.FC<FrameProps> = ({ className, variant = 'none', ...props }) => {
  return (
    <Frame
      as="footer"
      height={40}
      layout="flex"
      align="center"
      justify="center"
      padding={{ x: 24 }}
      variant={variant}
      background={variant === 'none' && !props.fill && !props.background ? "var(--bg-2)" : undefined}
      border={{ top: { width: 'var(--border-w)', color: 'var(--border-1)' } }}
      className={cn("text-[10px] text-[var(--text-2,#d0c9c3)] font-mono font-bold transition-colors duration-500", className)}
      {...props}
    >
      <div className="flex items-center space-x-6 uppercase tracking-[0.3em]">
        <span>Agent-Optimized-Environment</span>
        <span className="text-[var(--text-3,#ff073a)]">#ResearchDriven</span>
      </div>
    </Frame>
  );
};
