package service

import "example.com/inventory/internal/store"

type Item = store.Item

func ListItems() []Item {
	return store.All()
}
