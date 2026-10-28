# Challenge: rust-engine (Rust)

    node ../../agentSkills/vendor/analyze.mjs report --root .

## Planted problems

1. **A module tangle.** `util.rs` uses `engine::World`, and `engine/render.rs` uses
   `util::describe_body` — engine → render → util → engine. Rust compiles it (cycles inside
   one crate are allowed) but the modules can't be separated. Fix: move `describe_body` next
   to the renderer, or move `describe` into `engine`.
2. **A hub.** `math.rs` (`Vec2`) is used by nearly everything — keep it small and stable.
3. **Dead file.** `src/old_ai.rs` is never declared with `mod`, so it isn't compiled at all.
4. **Hot-path complexity (for the measurement loop).** `physics::integrate` is O(n²) per
   step. Benchmark 10,000 bodies with criterion before and after a spatial grid.
