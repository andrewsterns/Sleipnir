import React, { forwardRef } from 'react';
import { FrameProps } from './iFrame';
import { useFrameViewModel, FrameOverlayData } from './FrameViewModel';

// ─── Overlay assets ──────────────────────────────────────────────────────────

const NOISE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

// ─── Overlays (fill underlays, video, noise, texture, loading) ───────────────

const FrameOverlays: React.FC<FrameOverlayData> = ({ underlays, video, noise, texture, isLoading }) => (
  <>
    {/* Fill layers with true layer opacity — underlays at z-index -1 */}
    {underlays.map((l, i) => (
      <div
        key={`fill-layer-${i}`}
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, zIndex: -1,
          borderRadius: 'inherit',
          backgroundImage: l.image,
          backgroundSize: l.size,
          backgroundPosition: l.position,
          backgroundRepeat: l.repeat as React.CSSProperties['backgroundRepeat'],
          opacity: l.opacity,
          mixBlendMode: l.blend as React.CSSProperties['mixBlendMode'],
          pointerEvents: 'none',
        }}
      />
    ))}
    {video && (
      <video
        src={video.url}
        autoPlay loop muted playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', opacity: video.opacity }}
      />
    )}
    {noise && (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          borderRadius: 'inherit',
          backgroundImage: `url("${NOISE_DATA_URL}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
          opacity: noise.opacity,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
    )}
    {texture && (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          borderRadius: 'inherit',
          backgroundImage: `url("${texture.src}")`,
          backgroundSize: texture.size ?? 'cover',
          backgroundRepeat: texture.size === 'repeat' ? 'repeat' : 'no-repeat',
          opacity: texture.opacity ?? 1,
          mixBlendMode: texture.blendMode ?? 'normal',
          pointerEvents: 'none',
        }}
      />
    )}
    {isLoading && (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)', zIndex: 50, borderRadius: 'inherit',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: 'var(--accent-1, #5a51b7)',
          animation: 'frame-spin 0.65s linear infinite',
        }} />
      </div>
    )}
  </>
);

// ─── Frame (view) ────────────────────────────────────────────────────────────
// All prop resolution lives in useFrameViewModel; this component only renders.

export const Frame = forwardRef<HTMLElement, FrameProps>((props, ref) => {
  const {
    Component, combinedRef, eventHandlers,
    wrapper, frameStyle, frameClassName,
    overlays, disabled, children, domProps, isVoid,
  } = useFrameViewModel(props, ref);

  // Void elements (input, img, hr, ...) must render self-closing — React
  // throws if they receive children, so overlays are skipped too.
  const frame = isVoid ? (
    <Component
      ref={wrapper ? undefined : combinedRef}
      style={frameStyle}
      className={frameClassName}
      disabled={disabled}
      {...eventHandlers}
      {...domProps}
    />
  ) : (
    <Component
      ref={wrapper ? undefined : combinedRef}
      style={frameStyle}
      className={frameClassName}
      disabled={disabled}
      {...eventHandlers}
      {...domProps}
    >
      <FrameOverlays {...overlays} />
      {children}
    </Component>
  );

  // Gradient stroke renders a wrapper: outer div carries the gradient +
  // layout/positioning styles, the frame element sits inside it.
  if (!wrapper) return frame;
  return (
    <div
      ref={combinedRef as React.Ref<HTMLDivElement>}
      style={wrapper.style}
      className={wrapper.className}
    >
      {frame}
    </div>
  );
});

Frame.displayName = 'Frame';

export type { FrameProps } from './iFrame';
