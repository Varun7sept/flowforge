import { useState, useCallback, useEffect } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const TEMPLATES = [
  {
    name: 'Order Processing',
    description: 'E-commerce order fulfillment flow',
    steps: [
      { name: 'Charge Card', x: 100, y: 150, deps: [] },
      { name: 'Check Inventory', x: 320, y: 80, deps: ['Charge Card'] },
      { name: 'Reserve Stock', x: 320, y: 220, deps: ['Charge Card'] },
      { name: 'Ship Order', x: 540, y: 150, deps: ['Check Inventory', 'Reserve Stock'] },
      { name: 'Send Email', x: 760, y: 150, deps: ['Ship Order'] },
    ],
  },
  {
    name: 'Data Pipeline',
    description: 'ETL data processing workflow',
    steps: [
      { name: 'Fetch Data', x: 100, y: 150, deps: [] },
      { name: 'Validate', x: 320, y: 80, deps: ['Fetch Data'] },
      { name: 'Transform', x: 320, y: 220, deps: ['Fetch Data'] },
      { name: 'Load to DB', x: 540, y: 150, deps: ['Validate', 'Transform'] },
      { name: 'Notify Team', x: 760, y: 150, deps: ['Load to DB'] },
    ],
  },
  {
    name: 'Document Verification',
    description: 'KYC document verification pipeline',
    steps: [
      { name: 'Upload Doc', x: 100, y: 150, deps: [] },
      { name: 'OCR Extract', x: 320, y: 150, deps: ['Upload Doc'] },
      { name: 'Verify Provider', x: 540, y: 80, deps: ['OCR Extract'] },
      { name: 'Fraud Check', x: 540, y: 220, deps: ['OCR Extract'] },
      { name: 'Approve/Reject', x: 760, y: 150, deps: ['Verify Provider', 'Fraud Check'] },
    ],
  },
]

const nodeStyle = {
  background: '#1e1b4b',
  border: '1px solid #4c1d95',
  borderRadius: 10,
  padding: '10px 16px',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 500,
  minWidth: 130,
  textAlign: 'center',
}

function buildGraph(steps) {
  const idMap = {}
  const nodes = steps.map((s, i) => {
    const id = s.id || `step-${i}`
    idMap[s.name] = id
    return {
      id,
      data: { label: s.name },
      position: { x: s.position_x || s.x || 100 + i * 200, y: s.position_y || s.y || 150 },
      style: nodeStyle,
    }
  })

  const edges = []
  steps.forEach((s, i) => {
    const sid = s.id || `step-${i}`
    const deps = s.depends_on || s.deps || []
    deps.forEach(dep => {
      const sourceId = idMap[dep] || dep
      edges.push({
        id: `e-${sourceId}-${sid}`,
        source: sourceId,
        target: sid,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
        style: { stroke: '#7c3aed', strokeWidth: 2 },
      })
    })
  })

  return { nodes, edges, idMap }
}

export default function WorkflowEditor({ workflow, onExecute, onBack }) {
  const [name, setName] = useState(workflow?.name || '')
  const [description, setDescription] = useState(workflow?.description || '')
  const [steps, setSteps] = useState(workflow?.steps || [])
  const [newStepName, setNewStepName] = useState('')
  const [newStepDeps, setNewStepDeps] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [savedWorkflow, setSavedWorkflow] = useState(workflow || null)
  const [running, setRunning] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // fetch full workflow with steps when opening an existing one
  useEffect(() => {
    if (workflow?.id) {
      axios.get(`${API}/workflows/${workflow.id}`).then(r => {
        setName(r.data.name)
        setDescription(r.data.description || '')
        setSteps(r.data.steps || [])
        setSavedWorkflow(r.data)
      })
    }
  }, [workflow?.id])

  useEffect(() => {
    if (steps.length > 0) {
      const { nodes: n, edges: e } = buildGraph(steps)
      setNodes(n)
      setEdges(e)
    }
  }, [steps])

  const onConnect = useCallback(params => setEdges(eds => addEdge(params, eds)), [])

  function loadTemplate(tpl) {
    setName(tpl.name)
    setDescription(tpl.description)
    const mapped = tpl.steps.map(s => ({
      name: s.name,
      depends_on: s.deps,
      position_x: s.x,
      position_y: s.y,
    }))
    setSteps(mapped)
    setSavedWorkflow(null)
  }

  function addStep() {
    if (!newStepName.trim()) return
    // if user didn't specify deps, auto-depend on the last step
    let deps = newStepDeps ? newStepDeps.split(',').map(d => d.trim()).filter(Boolean) : []
    if (deps.length === 0 && steps.length > 0) {
      deps = [steps[steps.length - 1].name]
    }
    setSteps(prev => [...prev, { name: newStepName.trim(), depends_on: deps, position_x: 100 + prev.length * 200, position_y: 150 }])
    setNewStepName('')
    setNewStepDeps('')
    setSavedWorkflow(null)
  }

  function removeStep(idx) {
    setSteps(prev => prev.filter((_, i) => i !== idx))
    setSavedWorkflow(null)
  }

  async function generateWithAI() {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const res = await axios.post(`${API}/ai/generate-steps`, { description: aiPrompt })
      const generated = res.data.steps.map((s, i) => ({
        name: s.name,
        depends_on: s.depends_on || [],
        position_x: 80 + i * 200,
        position_y: s.depends_on?.length > 0 ? (i % 2 === 0 ? 100 : 260) : 180,
      }))
      setSteps(generated)
      if (!name) setName(aiPrompt.slice(0, 40))
      setSavedWorkflow(null)
    } catch (e) {
      alert('AI error: ' + e.message)
    } finally {
      setAiLoading(false)
    }
  }

  async function save() {
    if (!name.trim()) return alert('Please enter a workflow name')
    if (steps.length === 0) return alert('Add at least one step')
    setSaving(true)
    try {
      const payload = { name, description, steps: steps.map(s => ({ ...s, depends_on: s.depends_on || [] })) }
      const res = await axios.post(`${API}/workflows`, payload)
      setSavedWorkflow(res.data)
      alert('Workflow saved!')
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function run() {
    if (steps.length === 0) return alert('Add at least one step first')
    setRunning(true)
    try {
      // auto-save if not saved yet
      let wf = savedWorkflow
      if (!wf) {
        const wfName = name.trim() || 'Untitled Workflow'
        const payload = {
          name: wfName,
          description,
          steps: steps.map(s => ({ ...s, depends_on: s.depends_on || [] })),
        }
        const saved = await axios.post(`${API}/workflows`, payload)
        wf = saved.data
        setSavedWorkflow(wf)
        setName(wfName)
      }
      const res = await axios.post(`${API}/workflows/${wf.id}/run`)
      onExecute(res.data, wf)
    } catch (e) {
      alert('Run failed: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={onBack}>← Back</button>
          <h1 className="page-title">{savedWorkflow ? savedWorkflow.name : 'New Workflow'}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn-primary" onClick={run} disabled={running || steps.length === 0}>
            {running ? 'Starting...' : '▶ Run'}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <div className="canvas-panel">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background color="#2d3748" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="side-panel">
          <div className="panel-card">
            <h3>Details</h3>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="My Workflow" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this do?" />
            </div>
          </div>

          {/* AI Step Generator */}
          <div className="panel-card" style={{ border: '1px solid #4c1d95' }}>
            <h3 style={{ color: '#a78bfa' }}>🤖 AI Generator</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Describe your workflow in plain English
            </p>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={3}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="e.g. Process a new employee onboarding with background verification"
                style={{ resize: 'none' }}
              />
            </div>
            <button
              className="btn-primary"
              style={{ width: '100%', background: aiLoading ? '#4c1d95' : '#7c3aed' }}
              onClick={generateWithAI}
              disabled={aiLoading || !aiPrompt.trim()}
            >
              {aiLoading ? '🤖 Generating...' : '✨ Generate Steps'}
            </button>
          </div>

          <div className="panel-card">
            <h3>Templates</h3>
            {TEMPLATES.map(t => (
              <button key={t.name} className="template-btn" onClick={() => loadTemplate(t)}>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{t.description}</div>
              </button>
            ))}
          </div>

          <div className="panel-card">
            <h3>Steps ({steps.length})</h3>
            <div className="step-list" style={{ marginBottom: 12 }}>
              {steps.map((s, i) => (
                <div key={i} className="step-item">
                  <div>
                    <div className="step-name">{s.name}</div>
                    {(s.depends_on || []).length > 0 && (
                      <div className="step-dep">depends on: {(s.depends_on || []).join(', ')}</div>
                    )}
                  </div>
                  <button className="delete-btn" onClick={() => removeStep(i)}>×</button>
                </div>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Step Name</label>
              <input className="form-input" value={newStepName} onChange={e => setNewStepName(e.target.value)} placeholder="e.g. Send Email" onKeyDown={e => e.key === 'Enter' && addStep()} />
            </div>
            <div className="form-group">
              <label className="form-label">Depends On (comma-separated)</label>
              <input className="form-input" value={newStepDeps} onChange={e => setNewStepDeps(e.target.value)} placeholder="e.g. Charge Card, Validate" />
            </div>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={addStep}>+ Add Step</button>
          </div>
        </div>
      </div>
    </div>
  )
}
