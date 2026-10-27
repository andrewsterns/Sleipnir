---
description: "Design a component on the Canvas board; Sleipnir writes its code."
argument-hint: "<what to build>"
---

The user wants this built as a component: $ARGUMENTS

1. Read the spec format: `node .sleipnir/canvas.mjs spec-help`.
2. Design it as ONE root frame — the component's own box, laid out with stacks, gap and
   padding — and pick a PascalCase component name.
3. Build it as a component (add `--svg` for an icon or illustration made only of shapes):

       node .sleipnir/canvas.mjs build --root . --spec <file> --component <Name>

4. Report it. Sleipnir turns it into a component and writes the React code into
   `.components/<name>/<name>.tsx` as soon as the board is open — do not write that file
   yourself.
