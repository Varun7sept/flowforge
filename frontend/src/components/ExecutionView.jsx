import { useEffect, useState, useRef } from 'react'
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

const STATUS_ICON = { pending: '○', running: '●', retrying: '↺', completed: '✓', failed: '✗' }

export default function ExecutionView({ execution, workflow, onBack }) {
  const [exec, setExec] = useState(execution)
  const [logs, setLogs] = useState([])
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const wsRef = useRef(null)
  const logRef = useRef(null)

  // build initial graph from workflow steps
  useEffect(() => {
    if (!workflow?.steps) return
    const stepStatusMap = {}
    ;(exec.steps || []).forEach(se => { stepStatusMap[se.step_id] = se.status })

    const n = (workflow.steps || []).map((s, i) => ({
      id: s.id,
      data: { label: `${STATUS_ICON[stepStatusMap[s.id] || 'pending']} ${s.name}` },
      position: { x: s.position_x || 100 + i * 200, y: s.position_y || 150 },
      style: nodeStyle(stepStatusMap[s.id] || 'pending'),
    }))

    const idMap = {}
    workflow.steps.forEach(s => { idMap[s.name] = s.id })

    const e = []
    workflow.steps.forEach(s => {
      ;(s.depends_on || []).forEach(dep => {
        const sourceId = idMap[dep] || dep
        e.push({
          id: `e-${sourceId}-${s.id}`,
          source: sourceId,
          target: s.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
          style: { stroke: '#7c3aed', strokeWidth: 2 },
        })
      })
    })

    setNodes(n)
    setEdges(e)
  }, [workflow, exec.steps])

  // connect WebSocket for live updates
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/executions/${exec.id}/ws`)
    wsRef.current = ws

    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data)

      if (event.type === 'step_updated' && event.step_exec) {
        const se = event.step_exec
        const icon = STATUS_ICON[se.status] || '○'

        setNodes(prev => prev.map(n =>
          n.id === se.step_id
            ? { ...n, data: { label: `${icon} ${se.step_name}` }, style: nodeStyle(se.status) }
            : n
        ))

        setExec(prev => ({
          ...prev,
          steps: prev.steps
            ? prev.steps.map(s => s.step_id === se.step_id ? se : s)
            : [se],
        }))

        setLogs(prev => [...prev, {
          time: new Date().toLocaleTimeString(),
          text: `${icon} ${se.step_name} — ${se.status}${se.retries > 0 ? ` (retry ${se.retries}/3)` : ''}`,
          status: se.status,
        }])
      }

      if (event.type === 'execution_finished' && event.execution) {
        setExec(prev => ({ ...prev, status: event.execution.status }))
        setLogs(prev => [...prev, {
          time: new Date().toLocaleTimeString(),
          text: `Workflow ${event.execution.status === 'completed' ? '🎉 completed!' : '❌ failed'}`,
          status: event.execution.status,
        }])
      }
    }

    return () => ws.close()
  }, [exec.id])

  // auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  // fetch full execution state on mount
  useEffect(() => {
    axios.get(`${API}/executions/${exec.id}`).then(r => setExec(r.data))
  }, [])

  const statusColor = STATUS_COLORS[exec.status] || STATUS_COLORS.pending

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={onBack}>← Back</button>
          <h1 className="page-title">Live Execution</h1>
        </div>
        <div className="execution-status" style={{ margin: 0, padding: '8px 16px' }}>
          {exec.status === 'running' && <span className="spinner" />}
          <span className="badge" style={{ background: statusColor.bg, color: statusColor.text }}>
            {exec.status.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>ID: {exec.id?.slice(0, 8)}...</span>
        </div>
      </div>

      <div className="execution-layout">
        <div className="dag-view">
          <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
            <Background color="#2d3748" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="log-panel">
          <h3>Live Logs</h3>

          <div className="step-executions">
            {(exec.steps || []).map(se => (
              <div key={se.id} className="step-exec-item">
                <div>
                  <div className="step-exec-name">{se.step_name}</div>
                  {se.retries > 0 && <div className="step-exec-meta">Retries: {se.retries}/3</div>}
                </div>
                <span className={`badge badge-${se.status}`}>
                  {se.status === 'running' && <span className="spinner" style={{ marginRight: 4 }} />}
                  {se.status}
                </span>
              </div>
            ))}
          </div>

          <h3>Events</h3>
          <div className="log-list" ref={logRef}>
            {logs.length === 0 ? (
              <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                Waiting for events...
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
