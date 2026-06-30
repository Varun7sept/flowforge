import { useEffect, useState, useRef, useMemo } from 'react'
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/^http/, 'ws')

const STATUS_COLORS = {
  pending:   { bg: '#1e293b', border: '#475569', text: '#94a3b8' },
  running:   { bg: '#1e3a5f', border: '#3b82f6', text: '#60a5fa' },
  retrying:  { bg: '#431407', border: '#ea580c', text: '#fb923c' },
  completed: { bg: '#14532d', border: '#16a34a', text: '#4ade80' },
  failed:    { bg: '#450a0a', border: '#dc2626', text: '#f87171' },
}

const STATUS_ICON = { pending: '○', running: '●', retrying: '↺', completed: '✓', failed: '✗' }

function nodeStyle(status) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending
  return {
    background: c.bg,
    border: `2px solid ${c.border}`,
    borderRadius: 10,
    padding: '10px 16px',
    color: c.text,
    fontSize: 13,
    fontWeight: 500,
    minWidth: 130,
    textAlign: 'center',
  }
}

export default function ExecutionView({ execution, workflow, onBack }) {
  // single source of truth: map of stepId → stepExecution
  const [stepMap, setStepMap] = useState({})
  const [execStatus, setExecStatus] = useState(execution.status)
  const [logs, setLogs] = useState([])
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const logRef = useRef(null)

  async function analyzeFailure(se) {
    setAiLoading(true)
    setAiAnalysis(null)
    try {
      const res = await axios.post(`${API}/ai/analyze-failure`, {
        step_name: se.step_name,
        log: se.log,
      })
      setAiAnalysis({ step: se.step_name, ...res.data })
    } catch (e) {
      setAiAnalysis({ step: se.step_name, reason: 'AI unavailable', suggestion: e.message })
    } finally {
      setAiLoading(false)
    }
  }

  // build edges once (they never change)
  const edges = useMemo(() => {
    if (!workflow?.steps) return []
    const idMap = {}
    workflow.steps.forEach(s => { idMap[s.name] = s.id })
    const result = []
    workflow.steps.forEach(s => {
      ;(s.depends_on || []).forEach(dep => {
        const sourceId = idMap[dep] || dep
        result.push({
          id: `e-${sourceId}-${s.id}`,
          source: sourceId,
          target: s.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
          style: { stroke: '#7c3aed', strokeWidth: 2 },
          animated: true,
        })
      })
    })
    return result
  }, [workflow])

  // build nodes from stepMap every time stepMap changes
  const nodes = useMemo(() => {
    if (!workflow?.steps) return []
    return workflow.steps.map((s, i) => {
      const se = stepMap[s.id]
      const status = se?.status || 'pending'
      const icon = STATUS_ICON[status]
      return {
        id: s.id,
        data: { label: `${icon} ${s.name}` },
        position: { x: s.position_x || 100 + i * 200, y: s.position_y || 150 },
        style: nodeStyle(status),
      }
    })
  }, [workflow, stepMap])

  // fetch initial execution state
  useEffect(() => {
    axios.get(`${API}/executions/${execution.id}`).then(r => {
      const map = {}
      ;(r.data.steps || []).forEach(se => { map[se.step_id] = se })
      setStepMap(map)
      setExecStatus(r.data.status)
    })
  }, [execution.id])

  // WebSocket for live updates
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/executions/${execution.id}/ws`)

    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data)

      if (event.type === 'step_updated' && event.step_exec) {
        const se = event.step_exec
        const icon = STATUS_ICON[se.status] || '○'

        setStepMap(prev => ({ ...prev, [se.step_id]: se }))

        setLogs(prev => [...prev, {
          time: new Date().toLocaleTimeString(),
          text: `${icon} ${se.step_name} — ${se.status}${se.retries > 0 ? ` (retry ${se.retries}/3)` : ''}`,
          status: se.status,
        }])
      }

      if (event.type === 'execution_finished' && event.execution) {
        setExecStatus(event.execution.status)
        const icon = event.execution.status === 'completed' ? '🎉' : '❌'
        setLogs(prev => [...prev, {
          time: new Date().toLocaleTimeString(),
          text: `${icon} Workflow ${event.execution.status}!`,
          status: event.execution.status,
        }])
      }
    }

    return () => ws.close()
  }, [execution.id])

  // auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const statusColor = STATUS_COLORS[execStatus] || STATUS_COLORS.pending
  const stepList = Object.values(stepMap)

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={onBack}>← Back</button>
          <h1 className="page-title">Live Execution — {workflow?.name}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#0f1117', borderRadius: 8 }}>
          {execStatus === 'running' && <span className="spinner" />}
          <span className="badge" style={{ background: statusColor.bg, color: statusColor.text }}>
            {execStatus.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>ID: {execution.id?.slice(0, 8)}...</span>
        </div>
      </div>

      <div className="execution-layout">
        {/* Live DAG — nodes change color as steps run */}
        <div className="dag-view">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background color="#2d3748" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="log-panel">
          {/* Step status list */}
          {stepList.length > 0 && (
            <>
              <h3>Steps</h3>
              <div className="step-executions">
                {stepList.map(se => (
                  <div key={se.id} className="step-exec-item">
                    <div>
                      <div className="step-exec-name">{se.step_name}</div>
                      {se.retries > 0 && (
                        <div className="step-exec-meta">Retried {se.retries}x</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`badge badge-${se.status}`}>
                        {se.status === 'running' && <span className="spinner" style={{ marginRight: 4 }} />}
                        {STATUS_ICON[se.status]} {se.status}
                      </span>
                      {se.status === 'failed' && (
                        <button
                          onClick={() => analyzeFailure(se)}
                          style={{ background: '#4c1d95', border: 'none', borderRadius: 4, color: '#a78bfa', fontSize: 11, padding: '3px 7px', cursor: 'pointer' }}
                        >
                          🤖 Why?
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Failure Analysis Result */}
              {(aiLoading || aiAnalysis) && (
                <div style={{ background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', marginBottom: 8 }}>
                    🤖 AI Analysis — {aiAnalysis?.step}
                  </div>
                  {aiLoading ? (
                    <div style={{ color: '#64748b', fontSize: 12 }}>Analyzing failure...</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 6 }}>
                        <span style={{ color: '#f87171' }}>❌ Reason: </span>{aiAnalysis.reason}
                      </div>
                      <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                        <span style={{ color: '#4ade80' }}>✅ Fix: </span>{aiAnalysis.suggestion}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Live event log */}
          <h3>Live Events</h3>
          <div className="log-list" ref={logRef}>
            {logs.length === 0 ? (
              <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                {execStatus === 'running' ? 'Waiting for events...' : 'No events yet — run the workflow!'}
              </div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className={`log-entry ${l.status}`}>
                  <span className="log-time">{l.time}</span>
                  {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
