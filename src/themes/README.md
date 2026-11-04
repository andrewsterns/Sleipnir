# Sleipnir: Modular Theming Architecture (Numeric Standard)

Sleipnir uses a **Context-Based Numeric Token** system. This streamlines theme definitions by using a predictable numbering system for variants and states.

## 1. Core Principles
- **Predictable Scales:** Semantic tokens use a 1-6 scale (e.g., `--bg-1`, `--bg-2`) instead of descriptive names.
- **Cascading Overrides:** Themes are applied via CSS classes (e.g., `.theme-houseplant`).
- **Standardized Fallbacks:** Components use CSS variables with intelligent fallbacks.

## 2. Mandatory Numeric Tokens
Every theme **must** implement the following token groups:

### 2.1 Surfaces & Layouts
- `--bg-1`: Main application background (Base).
- `--bg-2`: Primary container background (Surface).
- `--bg-3`: Hover/Elevated background (Surface Elevated).

### 2.2 Information & Typography
- `--text-1`: Primary text color (High contrast).
- `--text-2`: Secondary/de-emphasized text (Muted).
- `--text-3`: Brand/Highlight text (Accent).

### 2.3 Structural (Borders & Shape)
- `--border-1`: Default border color.
- `--border-2`: Highlighted border color (Accent).
- `--border-w`: Thickness of the border (e.g., 1px or 4px).
- `--radius-1`: Corner rounding (e.g., 32px or 4px).
- `--shadow-1`: Standard multi-layered shadow.
- `--clip-1`: CSS clip-path for advanced shapes (default 'none').

### 2.4 Action Units (Component Palettes)
Tokens follow a 1-4 scale: `[Name]-1` (BG), `[Name]-2` (Text), `[Name]-3` (Border), `[Name]-4` (Shadow).

- **Primary:** `--primary-1` to `--primary-4`.
- **Secondary:** `--secondary-1` to `--secondary-4`.
- **Ghost:** `--ghost-1` to `--ghost-4`.
- **Accent:** `--accent-1` to `--accent-4`.

## 3. Advanced Shapes (The Layering Standard)
Themes with a non-standard `--clip-1` must implement the `::before`/`::after` layering strategy on elements with the `.themed-surface` class.

```css
.theme-[name] .themed-surface {
  position: relative;
  background: transparent !important;
  border: none !important;
}
.theme-[name] .themed-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--border-1);
  clip-path: var(--clip-1);
  z-index: -2;
}
.theme-[name] .themed-surface::after {
  content: "";
  position: absolute;
  inset: var(--border-w);
  background: var(--bg-2);
  clip-path: var(--clip-1);
  z-index: -1;
}
```
