import { useState } from 'react'
import './App.css'
import Prototypes from './03_prototypes/Prototypes'
import DSM from './02_components/showcase/DSM.view'

const TABS = [
  { id: 'prototypes', label: 'Prototypes', component: <Prototypes />, icon: '🚀' },
  { id: 'dsm', label: 'DSM', component: <DSM />, icon: '🎨' },
]

function App() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-900/20">
            S
          </div>
          <h1 className="text-xl font-bold tracking-tighter uppercase">Sleipnir</h1>
          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">v0.1.0-alpha</span>
        </div>

        <nav className="flex space-x-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center space-x-2 ${
                activeTab === t.id
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-inner'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Project</span>
            <span className="text-xs font-mono text-blue-400">IBCS_MISSION_ALPHA</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgba(30,58,138,0.1),transparent)]">
        {TABS.find((t) => t.id === activeTab)?.component}
      </main>

      {/* Footer Status Bar */}
      <footer className="h-8 border-t border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            <span>SYSTEM_ONLINE</span>
          </span>
          <span>LATENCY: 24MS</span>
        </div>
        <div className="flex items-center space-x-4 uppercase tracking-widest">
          <span>Agent-Optimized-Environment</span>
          <span className="text-blue-500/50">#ResearchDriven</span>
        </div>
      </footer>
    </div>
  )
}

export default App
