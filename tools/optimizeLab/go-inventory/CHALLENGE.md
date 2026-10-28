# Challenge: go-inventory (Go) — a pipeline failure

CI is red: `go build ./...` fails with

    package example.com/inventory/cmd/server
        imports example.com/inventory/internal/handlers
        imports example.com/inventory/internal/service
        imports example.com/inventory/internal/store
        imports example.com/inventory/internal/handlers: import cycle not allowed

    node ../../agentSkills/vendor/analyze.mjs report --root .

## Planted problems

1. **The cycle that breaks the build.** `internal/store` imports `internal/handlers` for
   `MaxPageSize`. The analyzer should report the loop and the upward import that closes it,
   so the failure is mapped to the one edge to remove. Fix: move `MaxPageSize` to
   `internal/config` (or pass the limit into `store.All`).
2. **Dead package.** `internal/legacy` is imported by nothing.

This is the "map a failing pipeline onto the graph" case: the error names packages; the
graph names the exact import to delete and what else depends on it (blast radius).
