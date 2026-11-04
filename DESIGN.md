---
name: Sleipnir
description: A desktop workbench for research-driven UI design with a built-in AI coding agent
colors:
  bg-primary: "#0b0b0c"
  bg-secondary: "#161617"
  bg-tertiary: "#212123"
  text-primary: "#f5f5f7"
  text-secondary: "#a1a1a6"
  text-tertiary: "#7c7c82"
  border-hairline: "rgba(255,255,255,0.08)"
  border-emphasis: "rgba(255,255,255,0.16)"
  light-bg-primary: "#ffffff"
  light-bg-secondary: "#f5f5f7"
  light-bg-tertiary: "#e8e8ed"
  light-text-primary: "#1d1d1f"
  light-text-secondary: "#56565b"
  light-text-tertiary: "#6e6e73"
  danger-tomato: "#e74c3c"
  warning-gold: "#faad14"
  info-blue: "#5b9dff"
typography:
  body:
    fontFamily: "Sleipnir Sans (Helvetica Neue), Helvetica, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Sleipnir Sans (Helvetica Neue), Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  section-label:
    fontFamily: "Sleipnir Sans (Helvetica Neue), Helvetica, Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  code:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  control: "8px"
  float: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0 8px"
  list-row-active:
    backgroundColor: "rgba(245,245,247,0.12)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0 8px"
  button-primary:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.bg-primary}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  hover-icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    size: "28px"
  field:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  menu:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.float}"
    padding: "4px"
---

# Design System: Sleipnir

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

Sleipnir is a precision tool finished to the level of Apple's and Google's own
software: neutral black and white, one Helvetica voice, soft 8px controls, and
nothing on screen that is there for show. It is built for people who live in it
for hours, scanning file trees, editing components, watching an agent plan and
generate code, reviewing a diff, so the chrome recedes and the work leads.

The system replaced an earlier "Tactical HUD" look (monospace everywhere,
violet-tinted charcoal, wide-tracked ALL-CAPS labels, outline hovers). Treat
that look as retired: no mono for UI chrome, no ALL-CAPS, no wide tracking.

**Key Characteristics:**
- Pure neutral greys; colour appears only where it carries status meaning
- Helvetica Neue for every piece of UI, pinned weight by weight; mono only for code
- Sentence case everywhere (acronyms like AI, 2D, 3D and file names excepted)
- Soft, restrained corners: 8px controls, 12px floating surfaces, panels edge-to-edge
- Hover and selection as quiet ink washes, never outlines or inverted fills

## 2. Colors

A neutral value ramp with no hue in the greys, defined twice (dark default, light
sibling) under the same token names in `tactical.css` and `light.css`.

### Neutral (dark, default)
- **Ground** (`#0b0b0c`): `--bg-1`, the app background.
- **Raised** (`#161617`): `--bg-2`, fields, menus, cards.
- **Pressed** (`#212123`): `--bg-3`, hover and pressed fills.
- **Ink** (`#f5f5f7`) / **Secondary** (`#a1a1a6`) / **Tertiary** (`#7c7c82`): `--text-1/2/3`; all ≥4.5:1 on the ground.
- **Hairline** (`rgba(255,255,255,0.08)`) / **Emphasis** (`rgba(255,255,255,0.16)`): the only two border weights.

### Neutral (light)
- `#ffffff` / `#f5f5f7` / `#e8e8ed` grounds; `#1d1d1f` / `#56565b` / `#6e6e73` ink.

### Status (used only where something has a status)
- Danger, warning, info and the graph's status hues (`--graph-*`) keep their meaning; never decoration.

### Named Rules
**The Ink-Wash Rule.** Every interactive state is the theme's ink at low alpha
(`rgba(var(--item-ink), a)`): 6–8% on hover, 12% on selection, 22% for text
selection. It inverts with the theme on its own.

**The One Prominent Action Rule.** The primary button is a solid ink fill with
ground-coloured text (white button, black label in dark). One per surface.

## 3. Typography

**UI face:** `--font-ui`: `'Sleipnir Sans'` (Helvetica Neue mapped per weight by
PostScript name in `fonts/fonts.css`), then `'Helvetica Neue'`, Helvetica, Arial.
**Code face:** `--font-mono`: ui-monospace, SF Mono, Cascadia Mono, Consolas.

Local Helvetica Neue installs often mislabel weights (HelveticaNeue-Roman reports
500), which is why the face is pinned by PostScript name instead of trusting the
family.

### Hierarchy
- **Body** (400, 13px, 1.5): list rows, menu items, buttons, editor chrome.
- **Label** (400, 12px): field text, secondary rows, metadata.
- **Section label** (600, 11px, 0.04em, sentence case, `--text-3`): sidebar section headers such as "Steps (2)".
- **Code** (mono, 12px): the code editor, terminal, diff lines, agent tool commands.

### Named Rules
**The Sentence-Case Rule.** No label is set in ALL-CAPS, by string or by
`text-transform`. Acronyms (AI, 2D, 3D) and file names (`CLAUDE.md`) keep their own case.

**The Mono-Means-Code Rule.** Monospace appears only where the user reads code
or a command. Paths, hashes and labels in chrome are Helvetica.

## 4. Elevation

Docked panels are flat, separated by hairlines. Floating surfaces (menus,
popovers, dropdowns, modals) lift with `--shadow-1`: a soft offset shadow plus a
1px ink ring, so the edge reads on both grounds.

## 5. Components

### Buttons (`UIKit/Button`)
- **Shape:** `--radius-control` (8px); Helvetica 500 at 12.5–15px; padding 6/12, 8/14, 10/18 by size.
- **primary:** solid ink, ground text; hover mixes 14% toward the ground.
- **secondary:** 8% ink wash; hover 13%.
- **outline:** emphasis hairline; hover `--bg-3`.
- **ghost:** `--text-2` at rest; 7% ink wash and full ink on hover.

### Icon buttons (`UIKit/IconButton`, NavRail)
- 28px hit box regardless of glyph size, `--radius-2` (6px), `--text-2` at rest, 8% ink wash and full ink on hover.
- NavRail is a column of 32px icon pills; the active view sits on a 12% wash. Names live in tooltips.

### List rows (`UIKit/ListRow`, `.srow`)
- 26px tall, 13px Helvetica, inset 6px from the panel edge with a 6px radius, like a macOS sidebar.
- Hover: 6% ink wash. Selected: 12% ink wash, full ink. Graph neighbours: a faint 28% ink outline.

### Fields (`UIKit/Field`, Search, Dropdown trigger)
- `--bg-2` fill, hairline border, 8px radius; border strengthens on hover, focus adds a 3px 10% ink ring.

### Menus (`UIKit/Dropdown`, `UIKit/ContextMenu`)
- `--bg-2`, 12px radius, 4px inner padding, `--shadow-1`; rows are 28px, 6px-radius pills with a `--bg-3` hover. Submenu chevrons and checkmarks are drawn icons, not glyphs.

### Browser surfaces (`index.css`)
- Text selection, caret, focus ring and scrollbars (rounded 16% ink thumb) all come from the ink token.

## 6. Do's and Don'ts

### Do:
- **Do** use `var(--font-ui)` for UI text and `var(--font-mono)` only for code.
- **Do** write labels in sentence case.
- **Do** express hover and selection as ink washes from `--item-ink`.
- **Do** keep controls at `--radius-control` and floating surfaces at `--radius-float`.
- **Do** give every icon button a 28px hit box, whatever the glyph size.

### Don't:
- **Don't** set any label in ALL-CAPS or add `text-transform: uppercase`.
- **Don't** track text wider than 0.04em.
- **Don't** use monospace as a "technical" costume for chrome.
- **Don't** invert a row to a solid ink fill to show selection, or outline it on hover.
- **Don't** add hue to the neutral ramp or a third border weight.
