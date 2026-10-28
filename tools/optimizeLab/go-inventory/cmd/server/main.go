package main

import (
	"log"
	"net/http"

	"example.com/inventory/internal/handlers"
)

func main() {
	log.Fatal(http.ListenAndServe(":8080", handlers.Routes()))
}
