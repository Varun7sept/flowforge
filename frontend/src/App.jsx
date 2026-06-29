import { useState } from 'react'
import WorkflowList from './components/WorkflowList'
import WorkflowEditor from './components/WorkflowEditor'
import ExecutionView from './components/ExecutionView'
import './App.css'

export default function App() {
  const [view, setView] = useState('list')
  const [selectedWorkflow, setSelectedWorkflow] = useState(null)
  const [selectedExecution, setSelectedExecution] = useState(null)

  function openWorkflow(wf) {
    setSelectedWorkflow(wf)
    setView('editor')
  }

  function openExecution(exec, wf) {
    setSelectedExecution(exec)
    setSelectedWorkflow(wf)
    setView('execution')
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">⚙ FlowForge</span>
          <span className="tagline">Visual Workflow Orchestration</span>
        </div>
        <nav>
          <button className={view === 'list' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('list')}>
            Workflows
          </button>
          {selectedWorkflow && (
            <button className={view === 'editor' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('editor')}>
              {selectedWorkflow.name}
            </button>
          )}
        </nav>
      </header>

      <main className="main">
        {view === 'list' && (
          <WorkflowList onOpen={openWorkflow} onNewWorkflow={() => { setSelectedWorkflow(null); setView('editor') }} />
        )}
        {view === 'editor' && (
          <WorkflowEditor workflow={selectedWorkflow} onExecute={openExecution} onBack={() => setView('list')} />
        )}
        {view === 'execution' && (
          <ExecutionView execution={selectedExecution} workflow={selectedWorkflow} onBack={() => setView('editor')} />
        )}
      </main>
    </div>
  )
}
