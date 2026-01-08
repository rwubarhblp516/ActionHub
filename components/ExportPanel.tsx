import React, { useRef, useState } from 'react';
import { ExportConfig } from '../types';
import { RESOLUTION_PRESETS, FPS_PRESETS } from '../constants';
import { Settings, Film, Clock, Monitor, Download, Palette, Layers, ChevronRight, Zap, Loader2, FileText, X } from 'lucide-react';

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
  const [manifestError, setManifestError] = useState<string | null>(null);
  const manifestInputRef = useRef<HTMLInputElement | null>(null);

  const manifestMappingsCount = Object.keys(config.naming.manifest?.mappings || {}).length;

  const loadManifestFile = async (file: File) => {
    setManifestError(null);
    try {
      const text = await file.text();
      const manifest = JSON.parse(text);
      onUpdate({
        naming: {
          ...config.naming,
          manifest
        }
      });
    } catch (e) {
      setManifestError(e instanceof Error ? e.message : String(e));
    }
  };

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
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-white font-black uppercase tracking-widest">输出分辨率</span>
                <span className="text-[9px] text-white/40 font-bold">渲染质量取决于原始资产尺寸</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-1">
              {[
                { label: '方形 720', w: 720, h: 720 },
                { label: '方形 1080', w: 1080, h: 1080 },
                { label: '竖屏 720x1280', w: 720, h: 1280 },
                { label: '竖屏 1080x1920', w: 1080, h: 1920 },
              ].map((res) => (
                <button
                  key={res.label}
                  onClick={() => onUpdate({ width: res.w, height: res.h })}
                  className={`py-4 rounded-[20px] text-[10px] font-black uppercase tracking-tight transition-all border-2 ${config.width === res.w && config.height === res.h
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
                <span className="text-[10px] text-indigo-400 font-extrabold uppercase">宽</span>
                <input
                  type="number"
                  value={config.width}
                  onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 0 })}
                  className="bg-transparent text-white font-mono text-[13px] w-full focus:outline-none focus:text-indigo-300 font-bold"
                />
              </div>
              <span className="text-white/20 text-xl font-light">/</span>
              <div className="flex-1 bg-white/[0.05] rounded-2xl border border-white/10 p-4 flex items-center gap-4 group focus-within:border-indigo-500/50 transition-colors">
                <span className="text-[10px] text-indigo-400 font-extrabold uppercase">高</span>
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
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-white font-black uppercase tracking-widest">输出帧率</span>
                <span className="text-[9px] text-white/40 font-bold">与预览播放帧率同步</span>
              </div>
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
                  {fps} 帧/秒
                </button>
              ))}
            </div>
          </div>

          {/* Section: Video Format */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                <Film size={16} className="text-indigo-400" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-white font-black uppercase tracking-widest">导出格式</span>
                <span className="text-[9px] text-white/40 font-bold">编码器与兼容性</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
                {[
                { value: 'png-sequence', label: 'PNG 序列（推荐）', desc: '兼容常见逐帧后处理流程' },
                { value: 'jpg-sequence', label: 'JPG 序列', desc: '文件更小' },
                { value: 'mp4-h264', label: 'MP4 (H.264)', desc: '真正的MP4,通用格式' },
                { value: 'webm-vp9', label: 'WebM (VP9)', desc: '高质量视频' },
                { value: 'webm-vp8', label: 'WebM (VP8)', desc: '兼容性好' },
              ].map((fmt) => (
                <button
                  key={fmt.value}
                  onClick={() => {
                    if (fmt.value === 'jpg-sequence') {
                      onUpdate({ format: fmt.value as any, spritePackaging: 'sequence' });
                    } else {
                      onUpdate({ format: fmt.value as any });
                    }
                  }}
                  className={`py-3 px-4 rounded-[16px] text-left transition-all border ${config.format === fmt.value
                    ? 'bg-white/15 text-white border-white/20 shadow-lg'
                    : 'bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.08] hover:border-white/20'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black">{fmt.label}</span>
                      <span className="text-[9px] text-white/40 font-bold">{fmt.desc}</span>
                    </div>
                    {config.format === fmt.value && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Sprite Packaging */}
          {(config.format === 'png-sequence' || config.format === 'jpg-sequence') && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                  <Layers size={16} className="text-indigo-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-white font-black uppercase tracking-widest">精灵图打包</span>
                  <span className="text-[9px] text-white/40 font-bold">图集可显著减少文件数量</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdate({ spritePackaging: 'atlas' })}
                  disabled={config.format !== 'png-sequence'}
                  className={`flex-1 py-3 rounded-[16px] text-[11px] font-black transition-all border ${config.spritePackaging === 'atlas'
                    ? 'bg-white/15 text-white border-white/20 shadow-lg'
                    : 'bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.08] hover:border-white/20'
                    } ${config.format !== 'png-sequence' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={config.format !== 'png-sequence' ? '图集需要 PNG 以支持透明通道' : '打包为 PNG 图集 + JSON'}
                >
                  图集 (PNG+JSON)
                </button>
                <button
                  onClick={() => onUpdate({ spritePackaging: 'sequence' })}
                  className={`flex-1 py-3 rounded-[16px] text-[11px] font-black transition-all border ${config.spritePackaging === 'sequence'
                    ? 'bg-white/15 text-white border-white/20 shadow-lg'
                    : 'bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.08] hover:border-white/20'
                    }`}
                  title="保留每帧一个文件"
                >
                  序列帧
                </button>
              </div>

              {config.spritePackaging === 'atlas' && config.format === 'png-sequence' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">图集最大尺寸</span>
                    <select
                      value={config.atlasMaxSize}
                      onChange={(e) => onUpdate({ atlasMaxSize: parseInt(e.target.value, 10) || 2048 })}
                      className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    >
                      {[1024, 2048, 4096].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">边距</span>
                    <input
                      type="number"
                      min={0}
                      max={64}
                      value={config.atlasPadding}
                      onChange={(e) => onUpdate({ atlasPadding: parseInt(e.target.value, 10) || 0 })}
                      className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/10">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">裁切</span>
                      <span className="text-[9px] text-white/40 font-bold">裁掉透明边缘以减小图集</span>
                    </div>
                    <button
                      onClick={() => onUpdate({ atlasTrim: !config.atlasTrim })}
                      className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${config.atlasTrim
                        ? 'bg-indigo-500 text-white border-indigo-400'
                        : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                        }`}
                    >
                      {config.atlasTrim ? '开' : '关'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section: ActionHub Naming */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                  <Layers size={16} className="text-indigo-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-white font-black uppercase tracking-widest">命名规范</span>
                  <span className="text-[9px] text-white/40 font-bold">导出目录 + 元数据/派生</span>
                </div>
              </div>

              <button
                onClick={() => onUpdate({ naming: { ...config.naming, enabled: !config.naming.enabled } })}
                className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${config.naming.enabled
                  ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                  : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                  }`}
              >
                {config.naming.enabled ? '已启用' : '已停用'}
              </button>
            </div>

            <div className={`flex flex-col gap-4 p-4 rounded-3xl border bg-white/[0.03] ${config.naming.enabled ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">视角</span>
                  <select
                    value={config.naming.view}
                    onChange={(e) => onUpdate({ naming: { ...config.naming, view: e.target.value as any } })}
                    disabled={!config.naming.enabled}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-40"
                  >
                    <option value="VIEW_SIDE">侧视</option>
                    <option value="VIEW_TOP">俯视</option>
                    <option value="VIEW_ISO45">45度</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">默认分类</span>
                  <input
                    value={config.naming.defaultCategory}
                    onChange={(e) => onUpdate({ naming: { ...config.naming, defaultCategory: e.target.value } })}
                    disabled={!config.naming.enabled}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-40"
                    placeholder="如：locomotion / combat / misc"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">默认方向</span>
                  <select
                    value={config.naming.defaultDir}
                    onChange={(e) => onUpdate({ naming: { ...config.naming, defaultDir: e.target.value as any } })}
                    disabled={!config.naming.enabled}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-40"
                  >
                    <option value="none">无</option>
                    <option value="LR">左右</option>
                    <option value="4dir">四方向</option>
                    <option value="8dir">八方向</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">默认类型</span>
                  <select
                    value={config.naming.defaultType}
                    onChange={(e) => onUpdate({ naming: { ...config.naming, defaultType: e.target.value as any } })}
                    disabled={!config.naming.enabled}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-40"
                  >
                    <option value="once">单次</option>
                    <option value="loop">循环</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">清单（可选）</span>
                  <span className="text-[9px] text-white/40 font-bold">
                    映射键：`资产名::动画名`（或直接 `动画名`）
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={manifestInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) loadManifestFile(f);
                      e.currentTarget.value = '';
                    }}
                  />

                  <button
                    onClick={() => manifestInputRef.current?.click()}
                    disabled={!config.naming.enabled}
                    className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    title="导入清单文件"
                  >
                    <FileText size={14} className="text-indigo-400" />
                    导入
                  </button>

                  {config.naming.manifest && (
                    <button
                      onClick={() => onUpdate({ naming: { ...config.naming, manifest: undefined } })}
                      disabled={!config.naming.enabled}
                      className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="清除清单"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-white/50">清单：{config.naming.manifest ? '已加载' : '无'}</span>
                <span className="text-indigo-400 font-mono">{config.naming.manifest ? `${manifestMappingsCount} 条映射` : ''}</span>
              </div>

              {manifestError && (
                <div className="text-[10px] font-bold text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                  清单解析失败: {manifestError}
                </div>
              )}
            </div>
          </div>

          {/* Section: Background */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/10 shadow-lg">
                  <Palette size={16} className="text-indigo-400" />
                </div>
                <span className="text-[11px] text-white font-black uppercase tracking-widest px-1">画布底色</span>
              </div>

              <button
                onClick={() => onUpdate({ backgroundColor: config.backgroundColor === 'transparent' ? '#00FF00' : 'transparent' })}
                className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${config.backgroundColor === 'transparent'
                  ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                  : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                  }`}
              >
                {config.backgroundColor === 'transparent' ? '透明：已开启' : '启用透明'}
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
                  {config.backgroundColor === 'transparent' ? '透明' : config.backgroundColor}
                </span>
                <span className="text-[9px] text-white/50 font-black uppercase tracking-[0.2em]">
                  {config.backgroundColor === 'transparent' ? '输出透明通道' : '纯色背景'}
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
            <span className="text-[10px] text-white/50 font-black uppercase tracking-widest">已选资产</span>
            <span className="text-xl text-white font-black leading-none">{selectedCount} <span className="text-white/20 text-sm">/ {totalItems}</span></span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] text-white/50 font-black uppercase tracking-widest">预计体积</span>
            <span className="text-[14px] text-indigo-400 font-mono font-black leading-none">~31.2 兆字节</span>
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
