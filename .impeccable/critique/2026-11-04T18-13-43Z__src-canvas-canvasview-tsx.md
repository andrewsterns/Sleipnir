---
target: canvas information architecture and user journey
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\andre\\Sleipnir - Copy\\src\\canvas\\CanvasView.tsx"
target_fingerprint: "sha256:c79cab60f579878c86c990a93756bd5717671c32d06edb144545379ba38b199b"
target_path: "C:\\Users\\andre\\Sleipnir - Copy\\src\\canvas\\CanvasView.tsx"
timestamp: 2026-11-04T18-13-43Z
slug: src-canvas-canvasview-tsx
---
Method: dual-agent (A: design review · B: detector scan)

## Design health: 22/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Sketch mode filters the list to "Layers (1)" silently; two sketch-bar wordings |
| 2 | Match with the real world | 2 | "Sketch" = every top-level layer incl. UI frames; "Object" where users expect Part |
| 3 | User control and freedom | 3 | Deleting a sketch silently deletes its parts |
| 4 | Consistency and standards | 1 | Board/canvas/sketch/layer/"Planes" overlap; two Fit buttons; Figma props on a sphere |
| 5 | Error prevention | 2 | Delete-board next to picker; no warning before cascade delete |
| 6 | Recognition rather than recall | 2 | No way to start a sketch from the 3D toolbox |
| 7 | Flexibility and efficiency | 3 | R/S key meaning flips with a toggle, not the document |
| 8 | Aesthetic and minimalist design | 3 | "Front · empty / Top · empty / Side · empty" on every board |
| 9 | Error recovery | 2 | No broken state; things deleted instead of flagged |
| 10 | Help and documentation | 2 | Sketch/part/plane never explained on first meeting |

## Design specificity
Visual layer specific (quiet, neutral, Helvetica). IA is a Figma file and an Onshape part studio sharing one document, list and inspector.
Detector: 40 x design-system-color; 15 not real problems (7 test fixtures, 6 hue strip, 2 board content colours); 25 real (status colours #e07a7a/#e0a040/#6fa8dc off DESIGN.md, no theme variables; --accent never defined).

## Priority issues
- [P0] One word for too many things; naming the 2D document "sketch" collides with sketches-on-planes (Onshape meaning). Fix: distinct words for 2D document vs drawing-on-a-plane.
- [P1] One document mixes UI work and 3D part work. Fix: two document types; 2D frames enter 3D only by being placed on a plane.
- [P1] Too many context switches (picker, tabs, 2D/3D toggle, Front button, two Fits). Fix: drop the toggle; document type picks the view; Front view button + sketch mode cover 2D needs.
- [P2] 3D list organised by plane, not by what was built. Fix: parts first with steps, then unused sketches with plane as secondary text, then planes collapsed.
- [P2→P1] Silent cascade delete. Fix: mark broken steps (Onshape's red feature), Re-pick sketch / Delete step.

## Persona red flags
Alex: plane sorting breaks at scale; no reuse of a profile across models; key meanings flip with toggle; silent cascade delete.
Jordan: empty planes + "+ Sketch" in a Figma-looking tool; 2D/3D look like two documents; tab named "Planes".
UI engineer (Figma + Onshape): button listed under "Front" as a sketch; copy vs link unclear; "Environment" reads as lighting/dev env.

## Minor observations
Trash icon beside picker; section headings same weight as rows; part and sketch share a name; 2D toggle tooltip needs 20 words.

## Questions to consider
Parts (Onshape) or UI depth (Spline)? Who is told when a placed frame breaks a face reference? Will parts from two 3D documents ever combine?
