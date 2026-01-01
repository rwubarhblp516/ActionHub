import React from 'react';
import { ExportConfig, AnimationItem } from '../types';
import { RESOLUTION_PRESETS, FPS_PRESETS } from '../constants';
import { Settings, Film, Clock, Monitor, Download } from 'lucide-react';

interface ExportPanelProps {
  config: ExportConfig;
  onUpdate: (cfg: Partial<ExportConfig>) => void;
  selectedCount: number;
  isExporting: boolean;
  onStartExport: () => void;
  onCancelExport: () => void;
  totalItems: number;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  config,
  onUpdate,
  selectedCount,
  isExporting,
  onStartExport,
  onCancelExport,
  totalItems
}) => {
  
  const handleResolutionPreset = (width: number, height: number) => {
    onUpdate({ width, height });
  };

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col shadow-xl z-10">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold flex items-center gap-2 text-white">
          <Settings size={20} className="text-indigo-400" />
          导出设置
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Resolution Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Monitor size={16} />
            <span>分辨率 (Resolution)</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {RESOLUTION_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handleResolutionPreset(p.width, p.height)}
                className={`text-xs py-2 px-2 rounded border transition-colors ${
                  config.width === p.width && config.height === p.height
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
                <span className="absolute left-2 top-1.5 text-xs text-gray-500">W</span>
                <input 
                    type="number" 
                    value={config.width}
                    onChange={(e) => onUpdate({ width: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded py-1 pl-6 pr-2 text-sm text-right focus:border-indigo-500 outline-none"
                />
            </div>
            <span className="text-gray-500">×</span>
            <div className="relative flex-1">
                <span className="absolute left-2 top-1.5 text-xs text-gray-500">H</span>
                <input 
                    type="number" 
                    value={config.height}
                    onChange={(e) => onUpdate({ height: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded py-1 pl-6 pr-2 text-sm text-right focus:border-indigo-500 outline-none"
                />
            </div>
          </div>
        </div>

        {/* FPS Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Film size={16} />
            <span>帧率 (FPS)</span>
          </div>
          <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
            {FPS_PRESETS.map((fps) => (
              <button
                key={fps}
                onClick={() => onUpdate({ fps })}
                className={`flex-1 py-1 text-sm rounded ${
                  config.fps === fps 
                  ? 'bg-gray-700 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
                }`}
              >
                {fps}
              </button>
            ))}
          </div>
        </div>

        {/* Duration Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Clock size={16} />
            <span>时长 (秒)</span>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="range" 
              min="1" max="60" step="0.5"
              value={config.duration}
              onChange={(e) => onUpdate({ duration: Number(e.target.value) })}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="w-12 text-right font-mono text-sm bg-gray-900 px-1 py-0.5 rounded border border-gray-700">
                {config.duration}s
            </span>
          </div>
        </div>

        {/* Background Color */}
        <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-medium text-gray-300">
                <span>背景颜色</span>
                <span className="font-mono text-xs text-gray-400">{config.backgroundColor}</span>
            </div>
            <div className="flex gap-2">
                <input 
                    type="color" 
                    value={config.backgroundColor}
                    onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                    className="h-8 w-full bg-transparent cursor-pointer rounded overflow-hidden" 
                />
            </div>
        </div>
      </div>

      {/* Export Action */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <div className="text-xs text-gray-400 mb-2 flex justify-between">
            <span>已选动画: {selectedCount} / {totalItems}</span>
            <span>预估大小: ~{(config.width * config.height * config.fps * config.duration * 0.0000001).toFixed(1)} MB/个</span>
        </div>
        
        {isExporting ? (
             <button
             onClick={onCancelExport}
             className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-900/20"
           >
             <span className="animate-pulse">停止导出</span>
           </button>
        ) : (
            <button
            disabled={selectedCount === 0}
            onClick={onStartExport}
            className={`w-full font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
                selectedCount === 0 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-900/20'
            }`}
            >
            <Download size={20} />
            <span>开始导出 ({selectedCount})</span>
            </button>
        )}
      </div>
    </div>
  );
};
