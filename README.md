# ⚙ FlowForge

> AI-Powered Visual Workflow Orchestration Engine

FlowForge lets you define multi-step workflows with dependencies, run them, and watch each step execute live on a visual graph — with AI that generates workflows from plain English and analyzes failures automatically.

**Live Demo:** [flowforge.onrender.com](https://flowforge.onrender.com)

---

## ✨ Features

### 🎨 Visual DAG Editor
- Drag-and-drop workflow builder with a visual canvas
- Define steps and dependencies between them
- 3 built-in templates (Order Processing, Data Pipeline, Document Verification)

### ▶ Live Execution
- Steps execute in parallel when dependencies are met
- Nodes change color in real time as steps run
  - ⬜ Grey = Pending
  - 🔵 Blue = Running
  - 🟢 Green = Completed
  - 🔴 Red = Failed
  - 🟠 Orange = Retrying
- Automatic retry with exponential backoff (3 attempts)
- Live event log on the right panel

### 🤖 AI Step Generator
- Describe your workflow in plain English
- AI (Groq Llama 3) generates steps with dependencies automatically
- Example: *"Process a new employee onboarding with background check"* → 6 steps with proper dependencies

### 🔍 GitHub Repo Analyzer
- Paste any public GitHub repo URL
- AI reads the codebase and generates a workflow diagram of how the code flows
- Works with any language (Go, Python, JavaScript, Java, etc.)

### 🧠 AI Failure Analyzer
- When a step fails, click **🤖 Why?**
- AI explains the reason in plain English
- Suggests a concrete fix

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Go (chi router, goroutines) |
| Database | PostgreSQL |
| Real-time | WebSockets (gorilla/websocket) |
| Frontend | React + React Flow |
| AI | Groq API (Llama 3.3 70B) |
| Deploy | Render |

---

## 🏗 Architecture

```
┌─────────────────────────────────────┐
│         React Frontend              │
│  DAG Editor │ Live Execution │ AI   │
└──────────────┬──────────────────────┘
               │ REST + WebSocket
┌──────────────▼──────────────────────┐
│          Go Backend                 │
│  Workflow API │ Execution Engine    │
│  Retry Logic  │ WebSocket Hub       │
│  AI Endpoints │ GitHub Fetcher      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         PostgreSQL                  │
│  workflows │ steps │ executions     │
│  step_executions                    │
└─────────────────────────────────────┘
```

---

## 🚀 Running Locally

### Prerequisites
- Go 1.21+
- Node.js 18+
- PostgreSQL
- Groq API Key (free at [console.groq.com](https://console.groq.com))

### Backend

```bash
# Clone the repo
git clone https://github.com/Varun7sept/flowforge.git
cd flowforge

# Set up database
psql -U postgres -c "CREATE DATABASE flowforge;"
psql -U postgres -d flowforge -f backend/db/schema.sql

# Run backend
DATABASE_URL="postgres://postgres:yourpassword@localhost:5432/flowforge?sslmode=disable" \
GROQ_API_KEY="your_groq_key" \
go run main.go
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/workflows` | List all workflows |
| POST | `/workflows` | Create a workflow |
| GET | `/workflows/:id` | Get workflow with steps |
| POST | `/workflows/:id/run` | Start execution |
| GET | `/executions/:id` | Get execution status |
| GET | `/executions/:id/ws` | WebSocket for live updates |
| POST | `/ai/generate-steps` | AI generate steps from text |
| POST | `/ai/analyze-repo` | AI analyze GitHub repo |
| POST | `/ai/analyze-failure` | AI explain step failure |

---

## 🎯 Key Engineering Decisions

**Parallel execution with goroutines**
Steps with no pending dependencies run concurrently using Go goroutines, with a mutex to safely track completion state.

**WebSocket for real-time updates**
A hub pattern broadcasts step status changes to all connected clients instantly — no polling needed.

**Exponential backoff retries**
Failed steps retry up to 3 times with delays of 1s, 4s, 9s to handle transient failures gracefully.

**AI-powered everything**
Groq's Llama 3.3 70B handles step generation, repo analysis, and failure diagnosis — all via structured JSON prompts for reliable parsing.

---

## 📸 Screenshots

### Workflow List
Clean dashboard showing all your workflows

### DAG Editor with AI Generator
Visual canvas + AI that builds workflows from plain English

### Live Execution
Watch steps turn green in real time as they complete

### GitHub Repo Analyzer
Paste any GitHub URL → AI draws the code flow

---

## 🔮 Future Improvements

- [ ] Real HTTP step executor (call actual APIs)
- [ ] Scheduled workflows (cron-based triggers)
- [ ] Webhook triggers (run on GitHub push, etc.)
- [ ] Execution history analytics dashboard
- [ ] Multi-user support with authentication
- [ ] Conditional branching (if/else paths)

---

## 👨‍💻 Author

**Varun Banda**
- GitHub: [@Varun7sept](https://github.com/Varun7sept)
- Built as a portfolio project to demonstrate distributed systems, Go concurrency, and AI integration

---

*Built with ❤️ using Go, React, and Groq AI*
