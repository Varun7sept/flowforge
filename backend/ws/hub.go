package ws

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/varun/flowforge/backend/models"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	mu      sync.RWMutex
	clients map[uuid.UUID]map[*websocket.Conn]bool
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[uuid.UUID]map[*websocket.Conn]bool),
	}
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, executionID uuid.UUID) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	h.mu.Lock()
	if h.clients[executionID] == nil {
		h.clients[executionID] = make(map[*websocket.Conn]bool)
	}
	h.clients[executionID][conn] = true
	h.mu.Unlock()

	// keep alive until client disconnects
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}

	h.mu.Lock()
	delete(h.clients[executionID], conn)
	h.mu.Unlock()
}

func (h *Hub) Broadcast(executionID uuid.UUID, event models.WSEvent) {
	data, _ := json.Marshal(event)

	h.mu.RLock()
	defer h.mu.RUnlock()

	for conn := range h.clients[executionID] {
		conn.WriteMessage(websocket.TextMessage, data)
	}
}
