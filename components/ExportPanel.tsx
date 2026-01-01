import React from 'react';
import { ExportConfig } from '../types';
import { RESOLUTION_PRESETS, FPS_PRESETS } from '../constants';
import { Settings, Film, Clock, Monitor, Download, Palette, Layers, ChevronRight, Zap, Loader2 } from 'lucide-react';

interface ExportPanelProps {
  config: ExportConfig;
  onUpdate: (cfg: Partial<ExportConfig>) => void;
  selectedCount: number;
  isExporting: boolean;
  onStartExport: () => void;
  onCancelExport: () => void;
  totalItems: number;
  hideHeader?: boolean;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  config,
  onUpdate,
  selectedCount,
  isExporting,
  onStartExport,
  onCancelExport,
  totalItems,
  hideHeader = false
}) => {

  const handleResolutionPreset = (width: number, height: number) => {
    onUpdate({ width, height });
  };

  return (
    <div className="w-full h-full bg-transparent flex flex-col">
      <div className="flex flex-col gap-1 px-6 border-l-4 border-indigo-500 mb-6 shrink-0">
        <span className="text-[10px] text-indigo-400 uppercase font-black tracking-[0.25em]">渲染参数配置</span>
        <h2 className="text-2xl font-black text-white tracking-tighter">输出设置</h2>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="flex flex-col gap-10 pb-12 px-6">
          {/* Section: Resolution */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                <Monitor size={16} className="text-indigo-400" />
              </div>
              <span className="text-[11px] text-white font-black uppercase tracking-widest px-1">输出分辨率 (Resolution)</span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-1">
              {[
                { label: 'HD 720p', w: 1280, h: 720 },
                { label: 'Full HD 1080p', w: 1920, h: 1080 },
                { label: '2K QHD', w: 2560, h: 1440 },
                { label: '4K UHD', w: 3840, h: 2160 },
              ].map((res) => (
                <button
                  key={res.label}
                  onClick={() => onUpdate({ width: res.w, height: res.h })}
                  className={`py-4 rounded-[20px] text-[10px] font-black uppercase tracking-tight transition-all border-2 ${config.width === res.w
                    ? 'bg-white text-black border-white shadow-xl shadow-white/10 scale-[1.02]'
                    : 'bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.08] hover:border-white/20 hover:text-white'
                    }`}
                >
                  {res.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 bg-white/[0.05] rounded-2xl border border-white/10 p-4 flex items-center gap-4 group focus-within:border-indigo-500/50 transition-colors">
                <span className="text-[10px] text-indigo-400 font-extrabold uppercase">W</span>
                <input
                  type="number"
                  value={config.width}
                  onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 0 })}
                  className="bg-transparent text-white font-mono text-[13px] w-full focus:outline-none focus:text-indigo-300 font-bold"
                />
              </div>
              <span className="text-white/20 text-xl font-light">/</span>
              <div className="flex-1 bg-white/[0.05] rounded-2xl border border-white/10 p-4 flex items-center gap-4 group focus-within:border-indigo-500/50 transition-colors">
                <span className="text-[10px] text-indigo-400 font-extrabold uppercase">H</span>
                <input
                  type="number"
                  value={config.height}
                  onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 0 })}
                  className="bg-transparent text-white font-mono text-[13px] w-full focus:outline-none focus:text-indigo-300 font-bold"
                />
              </div>
            </div>
          </div>

          {/* Section: Frame Rate */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                <Zap size={16} className="text-indigo-400" />
              </div>
              <span className="text-[11px] text-white font-black uppercase tracking-widest px-1">动态速率 (Frame Rate)</span>
            </div>
            <div className="flex bg-black/40 backdrop-blur-md rounded-[20px] p-1.5 border border-white/10 shadow-inner">
              {[24, 30, 60].map((fps) => (
                <button
                  key={fps}
                  onClick={() => onUpdate({ fps })}
                  className={`flex-1 py-3.5 rounded-[16px] text-[11px] font-black transition-all ${config.fps === fps
                    ? 'bg-white/15 text-white border border-white/20 shadow-2xl scale-[1.02]'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          {/* Section: Duration */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                  <Clock size={16} className="text-indigo-400" />
                </div>
                <span className="text-[11px] text-white font-black uppercase tracking-widest px-1">支持时长 (Duration)</span>
              </div>
              <div className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30">
                <span className="text-[12px] font-mono text-indigo-300 font-black">{config.duration}s</span>
              </div>
            </div>
            <div className="px-2">
              <input
                type="range"
                min="1"
                max="60"
                value={config.duration}
                onChange={(e) => onUpdate({ duration: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:bg-white/20 transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Section: Background */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                  <Palette size={16} className="text-indigo-400" />
                </div>
                <span className="text-[11px] text-white font-black uppercase tracking-widest px-1">画布底色 (Canvas)</span>
              </div>

              <button
                onClick={() => onUpdate({ backgroundColor: config.backgroundColor === 'transparent' ? '#0b0c10' : 'transparent' })}
                className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${config.backgroundColor === 'transparent'
                    ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                    : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                  }`}
              >
                {config.backgroundColor === 'transparent' ? 'Alpha Enabled' : 'Use Transparency'}
              </button>
            </div>

            <div
              onClick={() => {
                if (config.backgroundColor === 'transparent') return;
                const input = document.getElementById('canvas-color-picker') as HTMLInputElement;
                if (input) input.click();
              }}
              className={`flex items-center gap-4 p-4 rounded-3xl border transition-all shadow-lg relative overflow-hidden ${config.backgroundColor === 'transparent'
                  ? 'bg-black/20 border-white/5 cursor-not-allowed opacity-60'
                  : 'bg-white/[0.04] border-white/10 hover:border-white/20 cursor-pointer group active:scale-[0.98]'
                }`}
            >
              <input
                id="canvas-color-picker"
                type="color"
                value={config.backgroundColor === 'transparent' ? '#000000' : config.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="absolute -top-10 -left-10 opacity-0 pointer-events-none"
              />

              <div className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl shrink-0">
                {config.backgroundColor === 'transparent' ? (
                  <div className="absolute inset-0 bg-white/10" style={{ backgroundImage: 'conic-gradient(#333 0.25turn, #444 0.25turn 0.5turn, #333 0.5turn 0.75turn, #444 0.75turn)', backgroundSize: '10px 10px' }} />
                ) : (
                  <div
                    className="w-full h-full group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: config.backgroundColor }}
                  />
                )}
              </div>

              <div className="flex flex-col flex-1 gap-1">
                <span className="text-[12px] text-white font-mono font-black uppercase tracking-wider">
                  {config.backgroundColor === 'transparent' ? 'TRANSPARENT' : config.backgroundColor}
                </span>
                <span className="text-[9px] text-white/50 font-black uppercase tracking-[0.2em]">
                  {config.backgroundColor === 'transparent' ? 'Alpha Channel Output' : 'Hex Color Pipeline'}
                </span>
              </div>

              {config.backgroundColor !== 'transparent' && (
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                  <ChevronRight size={18} className="text-white/30 group-hover:text-white" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Export Action Block */}
      <div className="pt-8 px-6 border-t border-white/10 flex flex-col gap-6 bg-transparent shrink-0">
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-white/50 font-black uppercase tracking-widest">Selected Assets</span>
            <span className="text-xl text-white font-black leading-none">{selectedCount} <span className="text-white/20 text-sm">/ {totalItems}</span></span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] text-white/50 font-black uppercase tracking-widest">Est. Payload</span>
            <span className="text-[14px] text-indigo-400 font-mono font-black leading-none">~31.2 MB</span>
          </div>
        </div>

        <button
          onClick={onStartExport}
          disabled={isExporting || selectedCount === 0}
          className={`
                            w-full py-6 rounded-[32px] flex items-center justify-center gap-4 transition-all relative overflow-hidden group shadow-2xl
                            ${isExporting || selectedCount === 0
              ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
              : 'bg-white text-black font-black uppercase text-[12px] tracking-[0.25em] hover:bg-gray-100 hover:scale-[1.02] active:scale-[0.97] shadow-white/10'
            }
                        `}
        >
          {isExporting ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <Download size={20} strokeWidth={3} />
          )}
          <span>{isExporting ? "正在渲染管线..." : "开始转换并生产"}</span>
        </button>
      </div>
    </div>
  );
};
