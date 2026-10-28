/**
 * Sleipnir — portfolio story page.
 *
 * Self-contained on purpose: this file is meant to be copied out of this
 * repo and pasted into another project. No external imports besides React,
 * no CSS files, no design system. Placeholder boxes mark where real
 * screenshots go later. A few small inline SVGs stand in for icons where a
 * picture communicates the idea faster than a paragraph.
 *
 * sleipnir-keep: nothing here imports it on purpose — it's copied out whole.
 */

function ImagePlaceholder({ label, height = 320 }: { label: string; height?: number }) {
  return (
    <div
      style={{
        border: '1px dashed #888',
        borderRadius: 8,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontFamily: 'monospace',
        fontSize: 14,
        margin: '24px 0',
      }}
    >
      [ Placeholder — {label} ]
    </div>
  );
}

function StageIcon({ index }: { index: number }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" />
      <text x="20" y="25" textAnchor="middle" fontSize="14" fontFamily="monospace" fill="currentColor">
        {index}
      </text>
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="20" x2="60" y2="40" stroke="currentColor" strokeWidth="1.5" />
      <line x1="60" y1="40" x2="100" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="60" y1="40" x2="60" y2="70" stroke="currentColor" strokeWidth="1.5" />
      <line x1="60" y1="40" x2="20" y2="65" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="20" cy="20" r="8" fill="currentColor" />
      <circle cx="100" cy="20" r="8" fill="currentColor" />
      <circle cx="60" cy="40" r="9" fill="currentColor" />
      <circle cx="60" cy="70" r="8" fill="currentColor" />
      <circle cx="20" cy="65" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

const stages = [
  { name: 'Planning', detail: 'Every change starts as a roadmap, not a commit.' },
  { name: 'Research', detail: 'The "why" behind the plan, cited, not assumed.' },
  { name: 'Components', detail: 'The building blocks the plan is allowed to use.' },
  { name: 'Prototypes', detail: 'Ideas made clickable before they’re made permanent.' },
  { name: 'Validation', detail: 'Checked against reality before it ships.' },
  { name: 'Analytics', detail: 'What actually happened — feeding the next round of research.' },
];

export default function PortfolioStory() {
  return (
    <article style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', lineHeight: 1.6 }}>
      {/* 1. Hero */}
      <section>
        <h1 style={{ fontSize: 40, marginBottom: 8 }}>Sleipnir</h1>
        <p style={{ fontSize: 20, marginTop: 0 }}>
          A desktop workbench for research-driven UI design — with a built-in AI coding agent
          that works inside the plan, not around it.
        </p>
        <p>
          Sleipnir is a place to think, plan, and build UI without losing the thread between
          "why are we doing this" and "what did we actually ship."
        </p>
        <p style={{ fontSize: 14, color: '#888' }}>
          Named after Odin's eight-legged horse — the one said to carry its rider between
          worlds. Fitting, for something built to carry an idea from research to shipped code.
        </p>
        <ImagePlaceholder label="Hero screenshot — Sleipnir workspace" />
      </section>

      {/* 2. The problem */}
      <section>
        <h2>The problem</h2>
        <p>
          Building UI today means living in five places at once: a design tool, an issue
          tracker, a diagram tool for the architecture no one kept up to date, a terminal, and
          Git. Every switch between them is a place an idea can get lost.
        </p>
        <p>
          Most of us already "vibe code" — we start typing before we've fully thought it
          through, and let the code tell us what we meant. That's not a bad instinct. The
          problem is nothing grounds it: nothing checks the idea against the research, or
          against what the codebase can actually support, before it becomes permanent.
        </p>
      </section>

      {/* 3. The pipeline */}
      <section>
        <h2>A pipeline you actually follow</h2>
        <p>
          Sleipnir organizes work as a numbered pipeline. Not a diagram on a wall — an actual
          rule: no implementation is allowed without a roadmap behind it first.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '24px 0' }}>
          {stages.map((stage, i) => (
            <div key={stage.name} style={{ width: 180 }}>
              <StageIcon index={i} />
              <h3 style={{ fontSize: 16, margin: '8px 0 4px' }}>{stage.name}</h3>
              <p style={{ fontSize: 14, margin: 0, color: '#666' }}>{stage.detail}</p>
            </div>
          ))}
        </div>
        <p>
          Analytics feeds back into Research, closing the loop — what actually happened becomes
          the next thing worth investigating.
        </p>
        <ImagePlaceholder label="Pipeline overview screenshot" />
      </section>

      {/* 4. The graph */}
      <section>
        <h2>Your codebase, mapped as it actually is</h2>
        <div style={{ color: '#555' }}>
          <GraphIcon />
        </div>
        <p>
          Tools like Obsidian popularized the idea of a visual graph of connected thinking.
          Sleipnir points that same instinct at a live codebase instead of a note vault: the
          planning graph is generated from the real source tree, not drawn by hand.
        </p>
        <p>
          Solid nodes are what's built. Dashed, hollow nodes are what's only proposed. Click a
          node to select it; double-click to jump straight to the source. It's not a metaphor
          for the architecture — it is the architecture.
        </p>
        <ImagePlaceholder label="Graph view screenshot" />
      </section>

      {/* 5. The AI collaborator */}
      <section>
        <h2>An agent that works inside the plan</h2>
        <p>
          Sleipnir ships with an AI coding agent that participates in the same pipeline as
          everyone else. It can propose plans and stage code — but it is never an unsupervised
          code-writer. Everything it stages is reviewed inside the graph before it lands,
          exactly like a change from anyone else on the team.
        </p>
        <ImagePlaceholder label="Agent panel screenshot" />
      </section>

      {/* 6. From roadmap to sprint */}
      <section>
        <h2>From roadmap to sprint</h2>
        <p>
          Because every change starts as a roadmap tied to real research and a real dependency
          graph, that same roadmap doubles as sprint-planning material. Estimates and
          priorities get grounded in what the codebase actually looks like today, instead of
          what someone remembers it looking like.
        </p>
      </section>

      {/* 7. Who it's for */}
      <section>
        <h2>Who it's for</h2>
        <p>
          Technical designers and engineers who live in a tool for long, focused sessions — not
          a mass-market app, a precision instrument. If you think in systems and want your
          planning tool to know what your codebase actually contains, Sleipnir is built for
          you.
        </p>
      </section>

      {/* 8. Closing */}
      <section>
        <p style={{ fontSize: 18, fontStyle: 'italic' }}>
          Research grounds the idea. The pipeline carries it. Sleipnir is what carries it
          through.
        </p>
        <ImagePlaceholder label="Closing image" height={200} />
      </section>
    </article>
  );
}
