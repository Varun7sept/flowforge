import { useState, useMemo } from 'react'
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const nodeStyle = {
  background: '#1e1b4b',
  border: '2px solid #7c3aed',
  borderRadius: 10,
  padding: '10px 18px',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 500,
  minWidth: 140,
  textAlign: 'center',
}

const EXAMPLES = [
  'https://github.com/Varun7sept/flowforge',
  'https://github.com/gin-gonic/gin',
  'https://github.com/gofiber/fiber',
]

function buildGraph(steps) {
  const idMap = {}
  steps.forEach((s, i) => { idMap[s.name] = `step-${i}` })

  const nodes = steps.map((s, i) => ({
    id: `step-${i}`,
    data: { label: s.name },
    position: {
      x: 100 + (i % 4) * 220,
      y: 100 + Math.floor(i / 4) * 140,
    },
    style: nodeStyle,
  }))

  const edges = []
  steps.forEach((s, i) => {
    ;(s.depends_on || []).forEach(dep => {
      const sourceId = idMap[dep]
      if (sourceId) {
        edges.push({
          id: `e-${sourceId}-step-${i}`,
          source: sourceId,
          target: `step-${i}`,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
          style: { stroke: '#7c3aed', strokeWidth: 2 },
        })
      }
    })
  })

  return { nodes, edges }
}

export default function RepoAnalyzer({ onBack }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const { nodes, edges } = useMemo(() => {
    if (!result?.steps) return { nodes: [], edges: [] }
    return buildGraph(result.steps)
  }, [result])

  async function analyze() {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await axios.post(`${API}/ai/analyze-repo`, { github_url: url.trim() })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data || e.message || 'Failed to analyze repo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={onBack}>← Back</button>
          <h1 className="page-title">🔍 GitHub Repo Analyzer</h1>
        </div>
      </div>

      {/* Input Section */}
      <div style={{ background: '#1a1d2e', border: '1px solid #4c1d95', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>
          Paste any public GitHub repo URL — AI will read the code and generate a workflow diagram showing how it works.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="form-input"
            style={{ flex: 1, fontSize: 14 }}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            onKeyDown={e => e.key === 'Enter' && analyze()}
          />
          <button
            className="btn-primary"
            style={{ minWidth: 140, background: loading ? '#4c1d95' : '#7c3aed' }}
            onClick={analyze}
            disabled={loading || !url.trim()}
          >
            {loading ? '🤖 Analyzing...' : '🔍 Analyze Repo'}
          </button>
        </div>

        {/* Example repos */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#475569' }}>Try:</span>
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => setUrl(ex)}
              style={{ fontSize: 11, background: '#0f1117', border: '1px solid #2d3748', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}
            >
              {ex.replace('https://github.com/', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <div style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Reading the codebase...</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>Fetching files → Analyzing code flow → Building diagram</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #dc2626', borderRadius: 8, padding: 16, color: '#f87171', fontSize: 14 }}>
          ❌ {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                📦 {result.repo_name}
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                {result.steps?.length} steps identified by AI
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                onClick={() => { setResult(null); setUrl('') }}
              >
                Analyze Another
              </button>
            </div>
          </div>

          {/* DAG */}
          <div style={{ height: 420, background: '#1a1d2e', border: '1px solid #2d3748', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
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

          {/* Step list */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {result.steps?.map((s, i) => (
              <div key={i} style={{ background: '#1a1d2e', border: '1px solid #2d3748', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ background: '#4c1d95', color: '#a78bfa', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                </div>
                {s.depends_on?.length > 0 && (
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    after: {s.depends_on.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
