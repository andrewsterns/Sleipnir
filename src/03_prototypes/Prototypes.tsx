// Prototypes.tsx
import React from 'react';
import { CounterPrototype } from './CounterPrototype/CounterPrototype';

export default function Prototypes() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Prototype Sandbox</h2>
        <p className="text-slate-400 font-mono text-sm uppercase tracking-widest">Experimental Feature Lab</p>
      </header>

      <div className="grid grid-cols-1 gap-12">
        <section>
          <div className="flex items-center space-x-2 mb-4 border-b border-slate-800 pb-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <h3 className="text-lg font-bold text-slate-200">Mission Component: Counter</h3>
          </div>
          <CounterPrototype />
        </section>
        
        {/* New Prototypes will be added here */}
      </div>
    </div>
  );
}
