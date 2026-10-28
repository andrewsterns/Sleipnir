package handlers

import (
	"encoding/json"
	"net/http"

	"example.com/inventory/internal/service"
)

// MaxPageSize is read by the store too — which is how the cycle started.
const MaxPageSize = 100

func Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/items", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(service.ListItems())
	})
	return mux
}
