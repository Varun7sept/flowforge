package engine

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varun/flowforge/backend/models"
	"github.com/varun/flowforge/backend/ws"
)

const maxRetries = 3

type Executor struct {
	db  *sql.DB
	hub *ws.Hub
}

func NewExecutor(db *sql.DB, hub *ws.Hub) *Executor {
	return &Executor{db: db, hub: hub}
}

func (e *Executor) Run(ctx context.Context, execution models.Execution, steps []models.Step) {
	now := time.Now()
	e.db.Exec(`UPDATE executions SET status='running', started_at=$1 WHERE id=$2`, now, execution.ID)
	execution.Status = "running"
	execution.StartedAt = &now
	e.hub.Broadcast(execution.ID, models.WSEvent{Type: "execution_started", ExecutionID: execution.ID, Execution: &execution})

	// track completed steps by name
	completed := map[string]bool{}
	failed := false
	var mu sync.Mutex

	// create step executions
	stepExecs := map[uuid.UUID]models.StepExecution{}
	for _, s := range steps {
		se := models.StepExecution{
			ID:          uuid.New(),
			ExecutionID: execution.ID,
			StepID:      s.ID,
			StepName:    s.Name,
			Status:      "pending",
		}
		e.db.Exec(`INSERT INTO step_executions (id, execution_id, step_id, status, retries, log) VALUES ($1,$2,$3,$4,$5,$6)`,
			se.ID, se.ExecutionID, se.StepID, se.Status, 0, "")
		stepExecs[s.ID] = se
	}

	remaining := make([]models.Step, len(steps))
	copy(remaining, steps)

	for len(remaining) > 0 && !failed {
		var ready []models.Step
		var notReady []models.Step

		mu.Lock()
		for _, s := range remaining {
			if allDepsCompleted(s, completed) {
				ready = append(ready, s)
			} else {
				notReady = append(notReady, s)
			}
		}
		mu.Unlock()

		if len(ready) == 0 {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		remaining = notReady

		var wg sync.WaitGroup
		for _, s := range ready {
			wg.Add(1)
			go func(step models.Step) {
				defer wg.Done()
				se := stepExecs[step.ID]
				success := e.runStep(ctx, execution.ID, &se)
				stepExecs[step.ID] = se

				mu.Lock()
				if success {
					completed[step.Name] = true
				} else {
					failed = true
				}
				mu.Unlock()
			}(s)
		}
		wg.Wait()
	}

	finishedAt := time.Now()
	finalStatus := "completed"
	if failed {
		finalStatus = "failed"
	}
	e.db.Exec(`UPDATE executions SET status=$1, finished_at=$2 WHERE id=$3`, finalStatus, finishedAt, execution.ID)
	execution.Status = finalStatus
	execution.FinishedAt = &finishedAt
	e.hub.Broadcast(execution.ID, models.WSEvent{Type: "execution_finished", ExecutionID: execution.ID, Execution: &execution})
}

func (e *Executor) runStep(ctx context.Context, executionID uuid.UUID, se *models.StepExecution) bool {
	now := time.Now()
	se.Status = "running"
	se.StartedAt = &now
	se.Log = fmt.Sprintf("[%s] Step started\n", now.Format(time.RFC3339))

	e.db.Exec(`UPDATE step_executions SET status='running', started_at=$1, log=$2 WHERE id=$3`, now, se.Log, se.ID)
	e.hub.Broadcast(executionID, models.WSEvent{Type: "step_updated", ExecutionID: executionID, StepExec: se})

	for attempt := 1; attempt <= maxRetries; attempt++ {
		// simulate work: 1-3 seconds
		time.Sleep(time.Duration(1+rand.Intn(3)) * time.Second)

		// 20% failure chance per attempt (to demo retries)
		success := rand.Float32() > 0.2

		if success {
			finished := time.Now()
			se.Status = "completed"
			se.FinishedAt = &finished
			se.Log += fmt.Sprintf("[%s] Step completed successfully (attempt %d)\n", finished.Format(time.RFC3339), attempt)
			e.db.Exec(`UPDATE step_executions SET status='completed', finished_at=$1, retries=$2, log=$3 WHERE id=$4`,
				finished, attempt-1, se.Log, se.ID)
			e.hub.Broadcast(executionID, models.WSEvent{Type: "step_updated", ExecutionID: executionID, StepExec: se})
			return true
		}

		se.Retries = attempt
		se.Log += fmt.Sprintf("[%s] Attempt %d failed, retrying...\n", time.Now().Format(time.RFC3339), attempt)
		se.Status = "retrying"
		e.db.Exec(`UPDATE step_executions SET status='retrying', retries=$1, log=$2 WHERE id=$3`, attempt, se.Log, se.ID)
		e.hub.Broadcast(executionID, models.WSEvent{Type: "step_updated", ExecutionID: executionID, StepExec: se})

		// exponential backoff
		backoff := time.Duration(attempt*attempt) * time.Second
		time.Sleep(backoff)
	}

	finished := time.Now()
	se.Status = "failed"
	se.FinishedAt = &finished
	se.Log += fmt.Sprintf("[%s] Step failed after %d retries\n", finished.Format(time.RFC3339), maxRetries)
	e.db.Exec(`UPDATE step_executions SET status='failed', finished_at=$1, log=$2 WHERE id=$3`, finished, se.Log, se.ID)
	e.hub.Broadcast(executionID, models.WSEvent{Type: "step_updated", ExecutionID: executionID, StepExec: se})
	return false
}

func allDepsCompleted(step models.Step, completed map[string]bool) bool {
	for _, dep := range step.DependsOn {
		if !completed[dep] {
			return false
		}
	}
	return true
}
