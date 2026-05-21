import React, { useState } from 'react';
import { Icon } from '../../../01_atoms/Icon/Icon';
import { Typography } from '../../../01_atoms/Typography/Typography';
import { cn } from '../../../../utils/cn';

interface FillPanelProps {
  color?: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  onUpdate: (updates: { color?: string; backgroundGradient?: string; backgroundImage?: string }) => void;
}

export const FillPanel: React.FC<FillPanelProps> = ({ 
  color = '#ffffff', 
  backgroundGradient = '', 
  backgroundImage = '', 
  onUpdate 
}) => {
  const [activeTab, setActiveTab] = useState<'solid' | 'gradient' | 'image'>(
    backgroundImage ? 'image' : backgroundGradient ? 'gradient' : 'solid'
  );

  // Parse gradient stops (simple version for the UI)
  const parseGradient = (grad: string) => {
    if (!grad) return { angle: 180, stops: [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 100 }] };
    const stopsMatch = grad.match(/(rgba?\(.*?\)|#[a-fA-F0-9]+)\s+(\d+)%/g) || [];
    const angleMatch = grad.match(/(\d+)deg/);
    
    let stops = stopsMatch.map(s => {
      const posMatch = s.match(/(\d+)%/);
      const colorMatch = s.match(/(rgba?\(.*?\)|#[a-fA-F0-9]+)/);
      return { 
        color: colorMatch ? colorMatch[1] : '#ffffff', 
        position: posMatch ? parseInt(posMatch[1]) : 0 
      };
    });

    if (stops.length === 0) {
      stops = [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 100 }];
    }

    return {
      angle: angleMatch ? parseInt(angleMatch[1]) : 180,
      stops
    };
  };

  const handleGradientUpdate = (angle: number, stops: {color: string, position: number}[]) => {
    const gradString = `linear-gradient(${angle}deg, ${stops.map(s => `${s.color} ${s.position}%`).join(', ')})`;
    onUpdate({ backgroundGradient: gradString, backgroundImage: '', color: stops[0]?.color || color });
  };

  const onDropImage = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUpdate({ backgroundImage: event.target.result as string, backgroundGradient: '', color: 'transparent' });
          setActiveTab('image');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex bg-[var(--bg-3)] rounded p-0.5 border border-[var(--border-1)]">
        {(['solid', 'gradient', 'image'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-1 rounded text-[8px] font-black uppercase transition-all",
              activeTab === tab ? "bg-[var(--bg-1)] text-[var(--accent-1)] shadow-sm" : "text-[var(--text-3)] opacity-50 hover:opacity-100"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'solid' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded border border-[var(--border-1)] shadow-inner relative overflow-hidden"
              style={{ backgroundColor: color }}
            >
              <input 
                type="color" 
                value={color.startsWith('#') ? color : '#ffffff'} 
                onChange={(e) => onUpdate({ color: e.target.value, backgroundGradient: '', backgroundImage: '' })}
                className="absolute inset-0 opacity-0 cursor-pointer scale-150"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Typography variant="xs" weight="black" className="text-[8px] opacity-40 uppercase">Hex_Value</Typography>
              <input 
                type="text"
                value={color}
                onChange={(e) => onUpdate({ color: e.target.value, backgroundGradient: '', backgroundImage: '' })}
                className="w-full bg-[var(--bg-3)] border border-[var(--border-1)] rounded px-2 py-1 text-[10px] font-mono text-[var(--text-1)] outline-none focus:border-[var(--accent-1)]"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gradient' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="h-4 w-full rounded border border-[var(--border-1)]" style={{ background: backgroundGradient || 'linear-gradient(180deg, #ffffff 0%, #000000 100%)' }} />
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Typography variant="xs" weight="black" className="text-[8px] opacity-40 uppercase">Angle</Typography>
              <Typography variant="xs" className="text-[10px] font-mono">{parseGradient(backgroundGradient || 'linear-gradient(180deg, #fff 0%, #000 100%)').angle}°</Typography>
            </div>
            <input 
              type="range" min="0" max="360" 
              value={parseGradient(backgroundGradient || 'linear-gradient(180deg, #fff 0%, #000 100%)').angle}
              onChange={(e) => {
                const { stops } = parseGradient(backgroundGradient || 'linear-gradient(180deg, #fff 0%, #000 100%)');
                handleGradientUpdate(parseInt(e.target.value), stops);
              }}
              className="w-full h-1 bg-[var(--bg-3)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-1)]"
            />
          </div>

          <div className="p-2 border border-[var(--border-1)] rounded bg-black/5 flex flex-col gap-2">
            <Typography variant="xs" weight="black" className="text-[8px] opacity-40 uppercase mb-1">Stops</Typography>
            {parseGradient(backgroundGradient || 'linear-gradient(180deg, #ffffff 0%, #000000 100%)').stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2">
                <input 
                  type="color" 
                  value={stop.color.startsWith('#') ? stop.color : '#ffffff'} 
                  onChange={(e) => {
                    const grad = parseGradient(backgroundGradient || 'linear-gradient(180deg, #fff 0%, #000 100%)');
                    const newStops = [...grad.stops];
                    newStops[i].color = e.target.value;
                    handleGradientUpdate(grad.angle, newStops);
                  }}
                  className="w-4 h-4 rounded-full border-none p-0 cursor-pointer overflow-hidden" 
                />
                <input 
                  type="range" min="0" max="100" 
                  value={stop.position}
                  onChange={(e) => {
                    const grad = parseGradient(backgroundGradient || 'linear-gradient(180deg, #fff 0%, #000 100%)');
                    const newStops = [...grad.stops];
                    newStops[i].position = parseInt(e.target.value);
                    handleGradientUpdate(grad.angle, newStops);
                  }}
                  className="flex-1 h-1 bg-[var(--bg-3)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-1)]"
                />
                <Typography variant="xs" className="text-[8px] font-mono w-6 text-right">{stop.position}%</Typography>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'image' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropImage}
            className={cn(
              "w-full h-32 rounded border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all relative overflow-hidden group",
              backgroundImage ? "border-[var(--accent-1)]" : "border-[var(--border-1)] hover:border-[var(--accent-1)]/50 bg-black/5"
            )}
          >
            {backgroundImage ? (
              <>
                <img src={backgroundImage} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                <div className="z-10 bg-[var(--bg-1)]/80 p-2 rounded border border-[var(--border-1)] shadow-xl scale-75">
                  <Typography variant="xs" weight="black" className="text-[8px] uppercase text-[var(--accent-1)]">Image_Loaded</Typography>
                </div>
                <button 
                  onClick={() => onUpdate({ backgroundImage: '' })}
                  className="absolute top-2 right-2 p-1 bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Icon name="click" size={10} />
                </button>
              </>
            ) : (
              <>
                <Icon name="player-play" size={24} className="opacity-20 rotate-90" />
                <div className="text-center">
                  <Typography variant="xs" weight="black" className="text-[8px] opacity-40 uppercase">Drop_Image_Stream</Typography>
                  <Typography variant="xs" className="text-[7px] opacity-20 uppercase tracking-tighter">or click to upload</Typography>
                </div>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          onUpdate({ backgroundImage: event.target.result as string, backgroundGradient: '', color: 'transparent' });
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
