# How to Research

This tab is a doc graph, not a code graph — drop `.md` files anywhere under
`src/01_research/` and Sleipnir scans them into nodes here automatically, the
same way the DSM tab scans your components. No registration step, no config:
save a file, it shows up.

## Getting started

- **Just write a doc.** A single `.md` file at the top level (like this one)
  becomes a node right away.
- **Group related docs in a folder** once you have more than one on a topic —
  e.g. `personas/`, `proposals/`, `demographics/`. Each folder's own
  `README.md` becomes that group's summary node.
- **Link things together** by referencing another doc's filename in your
  Markdown — Sleipnir doesn't auto-detect cross-links yet, but keeping
  filenames descriptive makes the graph easier to read at a glance.

## What belongs here

Anything that informs a decision but isn't itself implementation: user
research, personas, competitive analysis, design rationale, proposals,
meeting notes worth keeping. If it's runnable code, it belongs in a
Component or Prototype library instead — this tab (and Validation, its
sibling) are the two places reserved for pure documentation.

## What's already in this project

- `personas/` — user personas for this project's domain
- `demographics/` — audience/analytics summaries
- `proposals/` — research proposals and writeups
- `analytics/` — analytics data and reports
- `test-documentation/` — test plans, results, methodologies

Treat these as an example of how a research section fills in over time, not a
required structure — a fresh Sleipnir project starts with just this file.
