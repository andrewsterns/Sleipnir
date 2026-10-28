package store

// The store reaches back up to the HTTP layer for a page size. Go refuses to
// build this: handlers -> service -> store -> handlers is an import cycle,
// and CI fails with "import cycle not allowed".
import "example.com/inventory/internal/handlers"

type Item struct {
	SKU string
	Qty int
}

var items []Item

func All() []Item {
	if len(items) > handlers.MaxPageSize {
		return items[:handlers.MaxPageSize]
	}
	return items
}
