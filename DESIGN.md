---
name: Sleipnir
description: A desktop workbench for research-driven UI design with a built-in AI coding agent
colors:
  bg-primary: "#080808"
  bg-secondary: "#0e0e0e"
  bg-tertiary: "#131313"
  text-primary: "#e8e8e8"
  text-secondary: "#9a9a9a"
  text-tertiary: "#4a4a4a"
  border-hairline: "rgba(255,255,255,0.07)"
  border-emphasis: "rgba(255,255,255,0.16)"
  accent-scan: "#dce8f0"
  danger-tomato: "#e74c3c"
  warning-gold: "#faad14"
  info-cyan: "#4f85ff"
typography:
  body:
    fontFamily: "Sometype Mono, Courier New, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Sometype Mono, Courier New, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
  micro-label:
    fontFamily: "Sometype Mono, Courier New, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.12em"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.none}"
    padding: "6px 8px"
  list-row-active:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "6px 8px"
  hover-icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    size: "28px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-tertiary}"
    typography: "{typography.label}"
    padding: "8px 12px"
  tab-active:
    backgroundColor: "rgba(255,255,255,0.05)"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    padding: "8px 12px"
---

# Design System: Sleipnir

## 1. Overview

**Creative North Star: "The Tactical HUD"**

Sleipnir reads like a heads-up display for building UI, not a consumer app.
Near-monochrome white-on-black, sharp near-zero corners, translucent
layered panels stacked by opacity rather than lifted by shadow, one mono
typeface throughout. It's built for people who live in it for hours —
scanning file trees, editing components, watching an AI agent plan and
generate code, reviewing a Git diff — moving fast between many small,
information-dense panels rather than reading long-form content.

This system explicitly rejects consumer-SaaS softness: no pastel palette,
no rounded cards-on-cards, no cheerful copy, no drop-shadow-heavy
elevation, nothing skeuomorphic or glassy. But density is not an excuse for
illegibility — the HUD is precise, not cramped. Text stays comfortably
readable and every clickable icon keeps a real, comfortable hit target,
even inside the densest sidebar list.

**Key Characteristics:**
- Near-monochrome dark surface; color is reserved for status meaning (scan/warn/critical/track), never decoration
- Sharp corners (0–4px) everywhere — no soft "friendly" radii
- One mono family (Sometype Mono) carries body, label, and code text alike
- Depth from translucent layering + hairline borders, not drop shadows
- Every interactive row/button gets a real hover state and a real click target, regardless of how dense the surrounding list is

## 2. Colors

Near-monochrome by design — the palette is mostly a white-on-black value
ramp, with a handful of desaturated status hues reserved for meaning, never
decoration.

### Primary
- **HUD White** (`#e8e8e8`): primary text, primary icon color, active-state fills at low opacity. This is the closest thing to an "accent" — brightness, not hue, is the emphasis language.

### Neutral
- **Void Black** (`#080808`): base app background.
- **Panel Black** (`#0e0e0e`): first layer up — docks, rails, the main content shell.
- **Raised Black** (`#131313`): second layer up — hover fills, popovers, nested surfaces.
- **Secondary Grey** (`#9a9a9a`): secondary text — labels, metadata, inactive tab text.
- **Tertiary Grey** (`#4a4a4a`): tertiary/dim text — section eyebrows, placeholder-weight labels, disabled state.
- **Hairline** (`rgba(255,255,255,0.07)`) / **Emphasis Border** (`rgba(255,255,255,0.16)`): the only two border weights. No third.

### Status accents (used sparingly, only where they carry real meaning)
- **Scan** (`#dce8f0`) — nominal/operational state.
- **Danger** (`#e74c3c`), **Warning** (`#faad14`), **Info** (`#4f85ff`) — inherited from the base theme for diagnostics, errors, and confirmations; never used decoratively inside the tactical surfaces.

### Named Rules
**The Brightness-Not-Hue Rule.** Emphasis in the HUD comes from *how bright* something is (text-1 vs text-2 vs text-3, or a translucent white fill), not from introducing a new color. Reach for a status hue only when the thing being shown genuinely has a status.

## 3. Typography

**Body/Label/Mono Font:** Sometype Mono (with Courier New, monospace fallback) — one family for everything, no separate display face.

**Character:** A single monospaced voice throughout reinforces the instrument-panel read: every label, row, and code snippet shares the same rhythm, so the eye never has to recalibrate between panels.

### Hierarchy
- **Body** (400, 0.875rem/14px, 1.5 line-height): editor content, form fields, primary reading text.
- **Label** (400, 0.75rem/12px, 1.4 line-height, 0.06em tracking): the default size for list-item text, row labels, tab labels, button labels — this is the floor for anything a user reads to make a selection.
- **Micro-label** (500, 0.6875rem/11px, 1.3 line-height, 0.12em tracking, uppercase): section headers only (PLANS, NODES, ARCHIVED) — never body content, never anything the user needs to read continuously.

### Named Rules
**The 12px Floor Rule.** Interactive/selectable list text (file names, tab labels, row labels, node names) never goes below Label size (12px). Micro-label (11px, uppercase, tracked) is reserved for section headers precisely because tracking + uppercase + all-caps buys back legibility at that size — it is not a general-purpose "make it smaller" size.

## 4. Elevation

Flat by default, translucent by necessity. There is no drop-shadow-based elevation scale for panels — depth comes from stacking `bg-1` → `bg-2` → `bg-3` (each a slightly lighter, slightly more opaque black) plus a 1px hairline border. Shadows are reserved for the few surfaces that genuinely detach from the page flow: dropdown menus and modals, where something needs to visually float above everything else.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 24px rgba(0,0,0,0.5)`): dropdown menus, popovers — the one place a real shadow earns its place.
- **Modal** (`box-shadow: 0 14px 36px -18px rgba(0,0,0,0.95)`): modal dialogs.

### Named Rules
**The Layering-Not-Lifting Rule.** A panel becomes "closer" to the user by getting brighter and more opaque (bg-1 → bg-3), not by casting a shadow. Reach for a shadow only when a surface is meant to float free of the layout entirely.

## 5. Components

### List rows (file tree, Planning's PLANS/NODES sidebar)
- **Shape:** no radius; full-bleed rectangular rows.
- **Default:** transparent background, Secondary Grey text, Label size (12px) minimum.
- **Active:** `rgba(255,255,255,0.08)` background fill, HUD White text.
- **Hover:** row background lifts to `rgba(255,255,255,0.03–0.06)`; any hover-revealed icon button becomes visible.
- **Internal padding:** rows keep a real ~6–8px vertical tap area even though the row text itself is 12px — the *row*, not just the *text*, is the click target.

### Hover icon buttons (per-row actions: Play, Add-to-Plan, new file/folder, archive/remove)
- **Size:** the icon itself stays small (11–13px) for visual density, but its clickable button box is a fixed **28×28px** minimum — icon size and hit-target size are two separate numbers, not one.
- **Shape:** transparent background at rest, `rgba(255,255,255,0.06–0.1)` on its own hover, 2px radius.
- **Visibility:** appears on row hover (or when the row is the active-path ancestor); never permanently visible in a dense list, so it doesn't compete with the row's primary label.

### Tabs (WorkspaceHeader's tab strip)
- **Shape:** no radius; bottom-border indicator (2px, HUD White) marks the active tab.
- **Default:** Tertiary Grey label, Label size (12px).
- **Active:** HUD White label, `rgba(255,255,255,0.05)` background wash.
- **Internal padding:** 8px vertical / 12px horizontal — enough that adjacent tabs don't crowd each other's click area.

### Section headers (PLANS, NODES, ARCHIVED, root-folder labels)
- **Style:** Micro-label size (11px), uppercase, 0.12em tracking, Secondary Grey (not Tertiary — headers need to outrank the rows beneath them, see Named Rule below).

### Named Rules
**The Two-Number Button Rule.** Every hover icon button has an icon size and a hit-target size, and they are never the same number. A 12px icon can sit inside a 28px click box; shrinking the box to match the icon is the single most common cause of "this feels too small to click."

## 6. Do's and Don'ts

### Do:
- **Do** keep interactive list/row text at 12px (Label) minimum — never 9–11px raw pixel values.
- **Do** give every hover-revealed icon button a real ~28×28px click box, even when the icon inside it is 11–12px.
- **Do** use brightness/opacity steps (text-1/2/3, bg-1/2/3) for hierarchy before reaching for a new color.
- **Do** reserve uppercase + heavy tracking for true section headers, not general-purpose small text.
- **Do** keep borders to the two defined weights (hairline / emphasis) — no third ad hoc border color.

### Don't:
- **Don't** hardcode raw `fontSize: 9` / `10` / `11` inline pixel values for anything the user selects or reads continuously — that's the current inconsistency this system is correcting.
- **Don't** size a hover button's clickable area to match its icon's visual size — pad the box, don't shrink the target.
- **Don't** introduce drop-shadow elevation on docked/inline panels — shadows are for overlays (dropdowns, modals) only.
- **Don't** use rounded/soft radii (>4px), pastel colors, or gradient fills — reserved consumer-SaaS language this product explicitly rejects.
- **Don't** add a third border weight or a new gray outside the text-1/2/3 ramp "for one component" — extend the ramp deliberately or don't.
