# Canvas: what goes where

One rule for the canvas, so a new tool or setting has an obvious home and
nothing lives in two places. 2D follows Figma, 3D follows Onshape, and both
use the words below.

## Words

One word per concept, in every label, tooltip, doc and agent instruction.

| Concept | Word | Not |
|---|---|---|
| A 2D document: frames, layers, components; it emits code | **Sketch** | board, canvas, page |
| A 3D document: planes, sketches on them, parts | **Environment** | model, scene, board |
| A sketch inside an environment, standing on a plane or face | **Sketch** — *placed* (a link to a Sketch document) or *local* (drawn there) | layer, profile |
| A solid an environment builds | **Part** | object, body |
| One step that builds a part | **Feature** (Extrude 1, Revolve 1) | step, operation |
| Where a sketch stands | **Plane**: Front, Top, Side, or a custom plane | Right, "placed freely" |
| Putting a sketch into an environment | **Place**; making it a local copy: **Unlink** | import, embed |
| Editing a sketch face on | **Sketch mode**: Edit sketch, Finish sketch | Done, 2D |
| A quick-start solid | **Starter shape** | primitive |
| The app rail's area | **Canvas** (never a document) | |

The document decides the view: a Sketch opens in 2D, an Environment in 3D.
There's no 2D/3D switch; 2D work inside an environment is sketch mode.

## Areas

| Area | Holds | Never |
|---|---|---|
| **Left panel** | What's in the document. A Sketch: its layer tree. An Environment: its parts (each with its features and the sketches they use), then sketches not used yet, then planes. The picker on top holds every sketch and environment, like plans. + Sketch adds a sketch to an environment. | Shaping anything. No drawing or 3D tools. |
| **Toolbox** | Every tool that draws or shapes, grouped by what it acts on (below), showing the groups for the document you're in. | Settings. A tool starts work; it doesn't hold the values. |
| **Right panel** | The settings of whatever is selected: a layer's fill, stroke and layout; a sketch's plane; a feature's depth or axis (and Remove); a part's appearance — fill, stroke, smoothness; a point's type. Only what applies — no layout settings on a part. With nothing selected, the document's own settings: an environment's display mode (Shaded / Edges / Wire / X-ray), as Figma shows the page's. | Creating things, or choosing a tool. It tunes what exists. |
| **View controls** | How you look, not what's there: the axis gizmo (click an axis to look straight down it, the middle for perspective), Fit and zoom in the top bar. | Anything that changes the document. |

A tool belongs to exactly one area. If something seems to need two homes, it's
two things: "+ Sketch" (left panel) adds an entry to the list; "Rectangle"
(toolbox) draws inside one.

## The toolbox

Grouped by what each tool acts on, in this order. Figma's keys apply in a
Sketch and in sketch mode; Blender's apply in an Environment. A `?` overlay
lists the keys of the document you're in.

| Group | Sketch (Figma) | Environment (Onshape, in Figma's words) | Keys |
|---|---|---|---|
| Select | Move / select | Select, with edit-mode picks: points, edges, faces | V · Tab, 1 / 2 / 3 |
| Draw | Frame, Rectangle, Ellipse, Polygon, Pen, Text | Sketch (on a plane, a face, or from a Sketch document) | F, R, O, P, T |
| Shape | — | Extrude, Revolve, Sweep, Loft, Combine, Plane | E (extrude, with the hotkeys step) |
| Starter shapes | — | Box, Cylinder, Sphere, Cone, Torus, Polygon | |
| Transform | (handles on the selection) | Move, Rotate, Scale handles | G, R, S (anywhere, with any handles) |
| Sculpt | — | Brushes (3D creation plan) | |

G, R and S are Blender's: press one, move the mouse, X / Y / Z to lock an
axis, type a number for an exact amount, Ctrl to snap; Enter or a click keeps
it, Esc or a right-click puts it back, and either way it's one undo step. On a
part the whole part moves, by its own placement, so its sketch keeps its plane
(a laptop's lid swings on its hinge without letting go of Front). On picked
points, edges and faces the move goes through the editing rules
(modeling/geometry/editBody.ts): pulling a box's top face deepens its extrude,
pushing a side moves that side of its sketch. Points and edges move freely in
X, Y and Z: an upright edge moved within the plane edits the sketch, and
anything else moves just those corners, kept on the feature (Reset in the right
panel puts them back). G on one flat face pushes and pulls along it until an
axis is chosen. E on one flat face, or the toolbox's Extrude with one picked,
grows new material out of just that face: a sketch of its outline on the face,
extruded as a new feature of the part. The toolbox's handles make the same
moves with the mouse (modeling/viewport/modalTransform.ts).

Starter shapes aren't a different kind of thing: each is a sketch plus a
feature (a sphere is a half circle revolved, a polygon an n-gon extruded), so
it edits exactly like one you built.

### Names, Figma ↔ Onshape

| Here | Figma | Onshape |
|---|---|---|
| Sketch (document) | File | — |
| Environment | — | Part Studio |
| Sketch (in an environment) | Frame | Sketch |
| Part | — | Part |
| Feature | — | Feature |
| Front / Top / Side | — | Front / Top / Right plane |
| Place / Unlink | Instance / Detach | Derived / — |
| Combine | Boolean groups | Boolean |
| Right panel | Design panel | Feature dialog |

## Today, and what moves

The "Sketches and Environments" plan moves the canvas from one kind of board
holding everything to the two documents above. Until its steps land:

- The picker lists Sketches and Environments; a Sketch opens in 2D, an
  Environment in 3D, and its sketch mode is the only 2D inside it. An
  environment saved before the kinds may still hold UI frames: they show on
  their planes until placing (step 4) moves them into sketches of their own.
- One toolbox (board/CanvasToolbar.tsx), drawn from one registry
  (board/toolbox.ts), following the document: a Sketch has Figma's tools
  only; an environment has Select, Sketch (+ Sketch's choices), the shaping
  tools, starter shapes and Move / Rotate / Scale; its sketch mode has the
  drawing tools and the shaping tools. Keys follow the same split: Figma's in
  a Sketch and in sketch mode, Blender's (G / R / S) in the 3D view. One Fit,
  the top bar's, fits whichever view shows; the zoom percent is the board's.
- A shaping tool that can't act on the selection says why in place of its
  hint ("Select one shape first"); Loft and Combine say they aren't built yet.
- Deleting what something depends on never deletes it: a feature whose sketch
  or path is gone, a sketch whose face is gone and a placement whose Sketch was
  deleted stay, marked broken with why. A broken sketch's right panel offers
  Re-pick face; a broken feature's Re-pick and Delete sit on its row's menu.
- A feature's settings are a dialog in the right panel (panels/FeatureSection.tsx),
  Onshape's way: click its row in Parts (or select its sketch) to open it —
  depth and One way / Reverse / Both sides, axis, angle and steps, the path,
  and how a later feature meets the part (Add, Subtract, Intersect; the first
  one starts the part). Changes show at once; OK or Enter keeps them as one
  undo step, Cancel or Esc puts them back, picking anything else keeps them.
  Smoothness stays with Fill and Stroke, as how a part looks.
- Drag a feature's row to reorder the part's features; it rebuilds in the new
  order. A part's row menu (right-click or ⋯) deletes the part, leaving its
  sketches. A part moved as a whole says so under Part, with Reset.
