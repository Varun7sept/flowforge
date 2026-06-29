package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type Workflow struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	Steps       []Step    `json:"steps,omitempty"`
}

type Step struct {
	ID         uuid.UUID      `json:"id"`
	WorkflowID uuid.UUID      `json:"workflow_id"`
	Name       string         `json:"name"`
	DependsOn  pq.StringArray `json:"depends_on"`
	PositionX  float64        `json:"position_x"`
	PositionY  float64        `json:"position_y"`
}

type Execution struct {
	ID         uuid.UUID      `json:"id"`
	WorkflowID uuid.UUID      `json:"workflow_id"`
	Status     string         `json:"status"`
	StartedAt  *time.Time     `json:"started_at"`
	FinishedAt *time.Time     `json:"finished_at"`
	CreatedAt  time.Time      `json:"created_at"`
	Steps      []StepExecution `json:"steps,omitempty"`
}

type StepExecution struct {
	ID          uuid.UUID  `json:"id"`
	ExecutionID uuid.UUID  `json:"execution_id"`
	StepID      uuid.UUID  `json:"step_id"`
	StepName    string     `json:"step_name,omitempty"`
	Status      string     `json:"status"`
	Retries     int        `json:"retries"`
	StartedAt   *time.Time `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
	Log         string     `json:"log"`
}

// WSEvent is sent over WebSocket to the UI
type WSEvent struct {
	Type        string        `json:"type"`
	ExecutionID uuid.UUID     `json:"execution_id"`
	StepExec    *StepExecution `json:"step_exec,omitempty"`
	Execution   *Execution    `json:"execution,omitempty"`
}
