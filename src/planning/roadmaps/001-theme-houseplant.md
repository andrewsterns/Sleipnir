# Plan: Theme: Houseplant (Brutalist-Minimalist Grayscale)

## 1. Context & Research (Citations: 01_research/)
- **Source:** User specification (Direct Mission: "Houseplant").
- **Persona:** IBCS_MISSION_ALPHA (E5 Cyber Network Defender / E3 Patriot Operator).
- **Goal:** Create a high-contrast, brutalist-retro interface that maximizes readability using a strict grayscale palette and specialized typography.
- **Design Theory:** Combining **Brutalist** (raw, bold borders, visible grids) with **Retro-Sci-Fi** (monospace fonts, high-contrast UI) and **Minimalism** (no unnecessary colors).

## 2. Component Design (Citations: 02_components/)
- **Affected:** `src/02_components/themes/houseplant.css`
- **Affected:** `src/02_components/themes/index.ts` (Theme manager).
- **Proposed:** A CSS variable-driven theme that overrides primary UI tokens.
  - **Colors (Grayscale Ink Ramp):**
    - `--houseplant-100`: #000000 (100% Gray/Black)
    - `--houseplant-80`:  #333333 (80%)
    - `--houseplant-60`:  #666666 (60%)
    - `--houseplant-40`:  #999999 (40%)
    - `--houseplant-30`:  #b3b3b3 (30%)
    - `--houseplant-20`:  #cccccc (20%)
    - `--houseplant-12`:  #e0e0e0 (12%)
    - `--houseplant-9`:   #e8e8e8 (9%)
    - `--houseplant-5`:   #f2f2f2 (5%)
    - `--houseplant-3`:   #f7f7f7 (3%)
    - `--houseplant-white` #ffffff (0%)
  - **Typography:**
    - `font-family: 'Space Grotesque', sans-serif;` (Headlines/Main UI)
    - `font-family: 'Atkinson Hyperlegible Mono', monospace;` (Data/Logic/Code)

## 3. Execution Targets (Directories)
- **Theme Logic:** `src/02_components/themes/`
- **Asset Integration:** `src/main.tsx` (Global CSS import)
- **Sandbox/Demo:** `src/03_prototypes/HouseplantShowcase/`
- **Component Library Integration:** `src/02_components/DesignSystem/DesignLibrary.view.tsx` (Add theme toggle)

## 4. Task Roadmap
- [x] **Step 1:** Create `src/02_components/themes/houseplant.css` with color ramp and font imports.
- [x] **Step 2:** Add theme switching logic and `ThemeProvider` to the `02_components/themes/` directory.
- [x] **Step 3:** Refactor core components (`Button`, `Counter`) to use CSS semantic variables.
- [ ] **Step 4:** Create `src/02_components/themes/README.md` documenting the modular, nested theme architecture.
- [ ] **Step 5:** Build a "Side-by-Side" comparison view in `src/02_components/DesignSystem/DesignLibrary.view.tsx` to demonstrate component reuse across themes.
- [ ] **Step 6:** Build `src/03_prototypes/HouseplantShowcase/` as a full-page mission sandbox for the theme.

## 5. Success Criteria
- [x] Visual: High-contrast brutalist borders and grayscale ramp are functional.
- [x] Typography: Space Grotesque and Atkinson Mono are rendered.
- [x] System: Theme supports global switching AND local `ThemeProvider` overrides.
- [ ] Comparison: App shows identical components side-by-side in different themes.

