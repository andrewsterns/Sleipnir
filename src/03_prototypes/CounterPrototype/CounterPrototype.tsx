import React, { useState } from 'react';

/**
 * CounterPrototype
 * 
 * This is an experimental version of the Counter component.
 * It does not strictly follow the Atomic Design structure or MVVM yet.
 * Once the "vibe" is confirmed, it should be refactored into atoms/molecules/viewmodels.
 */
export const CounterPrototype: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="p-8 bg-slate-900 rounded-xl border-2 border-dashed border-blue-500/30">
      <h2 className="text-xl font-bold text-blue-400 mb-4">Prototype: Experimental Counter</h2>
      <p className="text-sm text-slate-400 mb-4 italic font-mono">
        SYSTEM_VIBE_COUNT: {count}
      </p>
      <div className="flex gap-2">
        <button 
          onClick={() => setCount(c => c + 1)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
        >
          Increment
        </button>
        <button 
          onClick={() => setCount(0)}
          className="px-4 py-2 bg-slate-800 text-blue-400 border border-blue-500/20 rounded hover:bg-slate-700 transition-all"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
