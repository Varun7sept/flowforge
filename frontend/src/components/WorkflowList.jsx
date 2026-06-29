import { useEffect, useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function WorkflowList({ onOpen, onNewWorkflow }) {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/workflows`)
      .then(r => setWorkflows(r.data || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty-state"><h2>Loading...</h2></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Workflows</h1>
        <button className="btn-primary" onClick={onNewWorkflow}>+ New Workflow</button>
      </div>

      {workflows.length === 0 ? (
        <div className="empty-state">
          <h2>No workflows yet</h2>
          <p>Create your first workflow to get started</p>
          <br />
          <button className="btn-primary" onClick={onNewWorkflow}>+ Create Workflow</button>
        </div>
      ) : (
        <div className="workflow-grid">
          {workflows.map(wf => (
            <div key={wf.id} className="workflow-card" onClick={() => onOpen(wf)}>
              <div className="card-title">{wf.name}</div>
              <div className="card-desc">{wf.description || 'No description'}</div>
              <div className="card-meta">Created {new Date(wf.created_at).toLocaleDateString()}</div>
              <div className="card-actions">
                <button className="btn-primary" onClick={e => { e.stopPropagation(); onOpen(wf) }}>
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
