---
description: "Design something on Sleipnir's Canvas board as editable frames."
argument-hint: "<what to design>"
---

The user wants this designed on the Canvas board: $ARGUMENTS

1. Read the spec format: `node .sleipnir/canvas.mjs spec-help`.
2. Design ONE root frame for it — a page is one frame with nested sections. Size it
   like the real thing and lay it out with vertical/horizontal stacks, gap and padding.
3. Write the spec to a temporary JSON file (or pipe it) and build it:

       node .sleipnir/canvas.mjs build --root . --spec <file>

4. Report the board and frame it landed on. It stays an editable design; the user can
   refine it in Sleipnir and turn it into code there. Do not write source files.
