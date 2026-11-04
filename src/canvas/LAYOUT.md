# Canvas: what goes where

One rule for the canvas, in 2D and in 3D, so a new tool or setting has an
obvious home and nothing lives in two places. It follows Figma for 2D and
Onshape for 3D, in Figma's words.

| Area | Holds | Never |
|---|---|---|
| **Left panel** | What's in the scene: sketches with their layer trees, objects with their feature lists (document/objects.ts). Adding a new sketch to that list (+ Sketch). | Shaping anything. No drawing or 3D tools. |
| **Toolbox** | Every tool that draws or shapes, grouped by what it acts on (below). One toolbox, showing the groups for the view you're in. | Settings. A tool starts work; it doesn't hold the values. |
| **Right panel** | The settings of whatever is selected: a layer's fill, stroke and layout, a sketch's plane, a feature's depth or axis, a point's position. | Creating things. It tunes what exists. |
| **View controls** | How you look, not what's there: the 2D/3D switch, Persp / Front / Top / Side, Fit, zoom. Top bar and the 3D view's corner. | Anything that changes the board. |

A tool belongs to exactly one area. If something seems to need two homes, it's
two things: "+ Sketch" (left panel) adds an entry to the list; "Rectangle"
(toolbox) draws inside one.

## The toolbox

Grouped by what each tool acts on, in this order. Figma's keys apply while a
sketch is open; Blender's apply in 3D and on objects. A `?` overlay lists
both.

| Group | 2D (Figma) | 3D (Onshape, in Figma's words) | Keys |
|---|---|---|---|
| Select | Move / select | Select, with edit-mode picks: points, edges, faces | V · Tab, 1 / 2 / 3 |
| Draw | Frame, Rectangle, Ellipse, Polygon, Pen, Text | Sketch (opens a sketch on a plane or face) | F, R, O, P, T |
| Shape | — | Extrude, Revolve, Sweep, Loft, Combine, Plane | E (extrude) |
| Starter shapes | — | Box, Cylinder, Sphere, Cone, Torus, Polygon | |
| Transform | (handles on the selection) | Move, Rotate, Scale | G, R, S in 3D |
| Sculpt | — | Brushes (3D creation plan) | |

Starter shapes aren't a different kind of thing: each is a sketch plus a
feature (a sphere is a half circle revolved, a polygon an n-gon extruded), so
it edits exactly like one you built.

### Names, Figma ↔ Onshape

| Here | Figma | Onshape |
|---|---|---|
| Sketch | Frame | Sketch |
| Object | — | Part |
| Feature list | Layers | Feature list |
| Front / Top / Side | — | Front / Top / Right plane |
| Extrude | — | Extrude |
| Combine | Boolean groups | Boolean |
| Right panel | Design panel | Feature dialog |

## Today, and what moves

- The 2D toolbar (board/CanvasToolbar.tsx) is the Select and Draw groups. The
  3D groups join it ("The toolbox in 3D" step) from one registry
  (board/toolbox.ts), so the two views can't drift.
- The 3D view's Move / Rotate / Scale switch is the Transform group and moves
  into the toolbox; Persp / Front / Top / Side and Fit stay as view controls.
- The inspector's Solid section is the right panel's feature settings until the
  feature inspector replaces it.
- The board picker at the top of the left panel stays its one search and board
  switcher; + Sketch sits under it.
