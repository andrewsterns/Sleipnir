import { Component, type ReactNode } from 'react'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

/**
 * Keeps a failure inside the 3D view inside the 3D view. Its code arrives as a
 * separate chunk, and a chunk that fails to load (offline, a stale dev build)
 * or a WebGL context the machine can't give would otherwise take the whole app
 * down with it. Offers a retry, and the way back to 2D.
 */
export class Viewport3DBoundary extends Component<{ children: ReactNode; onBack: () => void; onRetry: () => void }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error, attempt } = this.state
    if (!error) return <div key={attempt} style={{ width: '100%', height: '100%' }}>{this.props.children}</div>
    const button: React.CSSProperties = { ...MONO, fontSize: 10, color: 'var(--info-5)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: '100%', ...MONO, fontSize: 10, color: 'var(--text-3)' }}>
        <span>The 3D view couldn’t load: {error.message}</span>
        <span style={{ display: 'flex', gap: 16 }}>
          <button type="button" style={button} onClick={() => {
              this.props.onRetry()
              this.setState({ error: null, attempt: attempt + 1 })
            }}>
            Try again
          </button>
          <button type="button" style={button} onClick={this.props.onBack}>
            Back to 2D
          </button>
        </span>
      </div>
    )
  }
}
