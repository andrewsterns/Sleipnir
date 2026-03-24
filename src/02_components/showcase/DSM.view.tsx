// DSM.tsx
import React from 'react';
import { Button } from '../atoms/Button/Button';

export default function DSM() {
  return (
    <div className="p-6 max-w-7xl mx-auto text-slate-100">
      <header className="mb-12">
        <h2 className="text-3xl font-bold text-white mb-2">Design System Master (DSM)</h2>
        <p className="text-slate-400 font-mono text-sm uppercase tracking-widest">Singular Component Library • v1.0.0</p>
      </header>

      <div className="space-y-16">
        {/* Atoms Section */}
        <section>
          <div className="flex items-center space-x-2 mb-8 border-b border-slate-800 pb-2">
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20 uppercase tracking-tighter">Atoms</span>
            <h3 className="text-xl font-bold text-slate-200 uppercase tracking-tighter">Functional Primitives</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Button Component Showcase */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Button</h4>
              <div className="p-8 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-center">
                <Button variant="primary">Primary Action</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="primary" isLoading>Loading State</Button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Button Sizes</h4>
              <div className="p-8 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-end">
                <Button size="sm">Small</Button>
                <Button size="md">Medium Default</Button>
                <Button size="lg">Large Scale</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Molecules Section */}
        <section>
          <div className="flex items-center space-x-2 mb-8 border-b border-slate-800 pb-2 opacity-50">
            <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded border border-green-500/20 uppercase tracking-tighter">Molecules</span>
            <h3 className="text-xl font-bold text-slate-200 uppercase tracking-tighter">Composite Elements</h3>
          </div>
          <p className="text-slate-500 italic text-sm font-mono">NO_MOLECULES_DEFINED_YET</p>
        </section>
      </div>
    </div>
  );
}
