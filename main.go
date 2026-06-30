package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/varun/flowforge/backend/api"
	"github.com/varun/flowforge/backend/db"
	"github.com/varun/flowforge/backend/ws"
)

func main() {
	database, err := db.Connect()
	if err != nil {
		log.Fatal("db connect failed:", err)
	}
	defer database.Close()

	if err := database.Ping(); err != nil {
		log.Fatal("db ping failed:", err)
	}

	hub := ws.NewHub()
	h := api.NewHandler(database, hub)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Post("/workflows", h.CreateWorkflow)
	r.Get("/workflows", h.ListWorkflows)
	r.Get("/workflows/{id}", h.GetWorkflow)
	r.Post("/workflows/{id}/run", h.RunWorkflow)
	r.Get("/workflows/{id}/executions", h.ListExecutions)
	r.Get("/executions/{id}", h.GetExecution)
	r.Get("/executions/{id}/ws", h.ExecutionWS)

	// AI endpoints
	r.Post("/ai/generate-steps", h.AIGenerateSteps)
	r.Post("/ai/analyze-failure", h.AIAnalyzeFailure)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("FlowForge backend running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
