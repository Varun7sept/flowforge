package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/varun/flowforge/backend/ai"
	"github.com/varun/flowforge/backend/engine"
	"github.com/varun/flowforge/backend/models"
	"github.com/varun/flowforge/backend/ws"
)

type Handler struct {
	db       *sql.DB
	hub      *ws.Hub
	executor *engine.Executor
}

func NewHandler(db *sql.DB, hub *ws.Hub) *Handler {
	return &Handler{
		db:       db,
		hub:      hub,
		executor: engine.NewExecutor(db, hub),
	}
}

// POST /workflows
func (h *Handler) CreateWorkflow(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string        `json:"name"`
		Description string        `json:"description"`
		Steps       []models.Step `json:"steps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	wf := models.Workflow{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		CreatedAt:   time.Now(),
	}

	_, err := h.db.Exec(`INSERT INTO workflows (id, name, description) VALUES ($1, $2, $3)`,
		wf.ID, wf.Name, wf.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for i := range req.Steps {
		req.Steps[i].WorkflowID = wf.ID
		if req.Steps[i].ID == uuid.Nil {
			req.Steps[i].ID = uuid.New()
		}
		_, err := h.db.Exec(`INSERT INTO steps (id, workflow_id, name, depends_on, position_x, position_y) VALUES ($1,$2,$3,$4,$5,$6)`,
			req.Steps[i].ID, wf.ID, req.Steps[i].Name,
			pq.Array(req.Steps[i].DependsOn),
			req.Steps[i].PositionX, req.Steps[i].PositionY)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	wf.Steps = req.Steps
	json.NewEncoder(w).Encode(wf)
}

// GET /workflows
func (h *Handler) ListWorkflows(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, name, description, created_at FROM workflows ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var workflows []models.Workflow
	for rows.Next() {
		var wf models.Workflow
		rows.Scan(&wf.ID, &wf.Name, &wf.Description, &wf.CreatedAt)
		workflows = append(workflows, wf)
	}
	json.NewEncoder(w).Encode(workflows)
}

// GET /workflows/{id}
func (h *Handler) GetWorkflow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wfID, err := uuid.Parse(id)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var wf models.Workflow
	err = h.db.QueryRow(`SELECT id, name, description, created_at FROM workflows WHERE id=$1`, wfID).
		Scan(&wf.ID, &wf.Name, &wf.Description, &wf.CreatedAt)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	rows, _ := h.db.Query(`SELECT id, workflow_id, name, depends_on, position_x, position_y FROM steps WHERE workflow_id=$1`, wfID)
	defer rows.Close()
	for rows.Next() {
		var s models.Step
		rows.Scan(&s.ID, &s.WorkflowID, &s.Name, &s.DependsOn, &s.PositionX, &s.PositionY)
		wf.Steps = append(wf.Steps, s)
	}

	json.NewEncoder(w).Encode(wf)
}

// POST /workflows/{id}/run
func (h *Handler) RunWorkflow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wfID, err := uuid.Parse(id)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(`SELECT id, workflow_id, name, depends_on, position_x, position_y FROM steps WHERE workflow_id=$1`, wfID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var steps []models.Step
	for rows.Next() {
		var s models.Step
		rows.Scan(&s.ID, &s.WorkflowID, &s.Name, &s.DependsOn, &s.PositionX, &s.PositionY)
		steps = append(steps, s)
	}

	exec := models.Execution{
		ID:         uuid.New(),
		WorkflowID: wfID,
		Status:     "pending",
		CreatedAt:  time.Now(),
	}
	h.db.Exec(`INSERT INTO executions (id, workflow_id, status) VALUES ($1, $2, $3)`, exec.ID, exec.WorkflowID, exec.Status)

	go h.executor.Run(r.Context(), exec, steps)

	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(exec)
}

// GET /executions/{id}
func (h *Handler) GetExecution(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	execID, err := uuid.Parse(id)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var exec models.Execution
	err = h.db.QueryRow(`SELECT id, workflow_id, status, started_at, finished_at, created_at FROM executions WHERE id=$1`, execID).
		Scan(&exec.ID, &exec.WorkflowID, &exec.Status, &exec.StartedAt, &exec.FinishedAt, &exec.CreatedAt)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	rows, _ := h.db.Query(`
		SELECT se.id, se.execution_id, se.step_id, s.name, se.status, se.retries, se.started_at, se.finished_at, se.log
		FROM step_executions se JOIN steps s ON se.step_id = s.id
		WHERE se.execution_id=$1`, execID)
	defer rows.Close()
	for rows.Next() {
		var se models.StepExecution
		rows.Scan(&se.ID, &se.ExecutionID, &se.StepID, &se.StepName, &se.Status, &se.Retries, &se.StartedAt, &se.FinishedAt, &se.Log)
		exec.Steps = append(exec.Steps, se)
	}

	json.NewEncoder(w).Encode(exec)
}

// GET /executions/{id}/ws
func (h *Handler) ExecutionWS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	execID, err := uuid.Parse(id)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	h.hub.ServeWS(w, r, execID)
}

// GET /workflows/{id}/executions
func (h *Handler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wfID, err := uuid.Parse(id)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(`SELECT id, workflow_id, status, started_at, finished_at, created_at FROM executions WHERE workflow_id=$1 ORDER BY created_at DESC`, wfID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var execs []models.Execution
	for rows.Next() {
		var exec models.Execution
		rows.Scan(&exec.ID, &exec.WorkflowID, &exec.Status, &exec.StartedAt, &exec.FinishedAt, &exec.CreatedAt)
		execs = append(execs, exec)
	}
	json.NewEncoder(w).Encode(execs)
}

// POST /ai/generate-steps
// Body: {"description": "process a new user signup"}
func (h *Handler) AIGenerateSteps(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Description == "" {
		http.Error(w, "description is required", http.StatusBadRequest)
		return
	}

	result, err := ai.GenerateSteps(req.Description)
	if err != nil {
		http.Error(w, "AI error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(result)
}

// POST /ai/analyze-failure
// Body: {"step_name": "Load to DB", "log": "..."}
func (h *Handler) AIAnalyzeFailure(w http.ResponseWriter, r *http.Request) {
	var req struct {
		StepName string `json:"step_name"`
		Log      string `json:"log"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	result, err := ai.AnalyzeFailure(req.StepName, req.Log)
	if err != nil {
		http.Error(w, "AI error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(result)
}
