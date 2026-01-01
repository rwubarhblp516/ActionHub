import React, { useState, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { PreviewArea } from './components/PreviewArea';
import { ExportPanel } from './components/ExportPanel';
import { AssetPanel } from './components/AssetPanel';
import { EditorPanel, PanelDivider } from './components/EditorPanel';
import { AnimationItem, ExportConfig, ExportProgress } from './types';
import { DEFAULT_CONFIG } from './constants';
import { groupFilesByDirectory } from './services/spineLoader';
import { SpineRenderer } from './services/spineRenderer';
import { CanvasRecorder } from './services/recorder';
import { ExportManager, OffscreenRenderTask } from './services/offscreenRenderer';
import {
  Activity,
  Play,
  Square,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const App: React.FC = () => {
  // --- Core State ---
  const [items, setItems] = useState<AnimationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_CONFIG);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  // --- Layout State ---
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);
  const [bottomHeight, setBottomHeight] = useState(240);

  // Refs
  const rendererRef = useRef<SpineRenderer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Handlers ---
  const handleFilesUpload = useCallback((files: FileList) => {
    const newItems = groupFilesByDirectory(files);
    setItems(prev => [...prev, ...newItems]);
  }, []);

  const handleSelect = useCallback((id: string, multi: boolean) => {
    setActiveItemId(id);
    setSelectedIds(prev => {
      const newSet = new Set(multi ? prev : []);
      if (newSet.has(id) && multi) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(selectedIds.size === items.length ? new Set() : new Set(items.map(i => i.id)));
  }, [items, selectedIds]);

  const handleDelete = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (activeItemId === id) setActiveItemId(null);
  }, [activeItemId]);

  const updateConfig = useCallback((cfg: Partial<ExportConfig>) => setConfig(prev => ({ ...prev, ...cfg })), []);

  const processExportQueue = async () => {
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    if (selectedItems.length === 0) return;

    setIsExporting(true);
    abortControllerRef.current = new AbortController();

    try {
      const { processExportWithOffscreen } = await import('./services/exportProcessor');

      await processExportWithOffscreen(
        selectedItems,
        config,
        {
          onProgress: (current, total, currentName) => {
            setProgress({ current, total, currentName });
          },
          onItemStatusChange: (itemId, status) => {
            setItems(prev => prev.map(item =>
              item.id === itemId ? { ...item, status } : item
            ));
          }
        },
        abortControllerRef.current.signal
      );
    } catch (error) {
      console.error("导出失败:", error);
      alert(`渲染失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const activeItem = items.find(i => i.id === activeItemId) || null;

  const resetLayout = () => {
    setLeftWidth(260);
    setRightWidth(300);
    setBottomHeight(240);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0b14] text-gray-200 font-sans overflow-hidden select-none relative">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90%] h-[50%] bg-indigo-500/10 blur-[150px] rounded-full opacity-50" />
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/15 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[120px] rounded-full"
        />
      </div>

      {/* Toolbar */}
      <div className="h-16 z-20 bg-black/60 backdrop-blur-3xl border-b border-white/10 flex items-center px-8 justify-between shrink-0 shadow-2xl">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-500 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              <Activity size={22} className="text-black" strokeWidth={3} />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-black uppercase tracking-[0.2em] text-white leading-none">Spine Studio</span>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.25em] mt-1.5">Professional Production</span>
            </div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <button onClick={resetLayout} className="group flex items-center gap-2.5 text-[10px] text-white/60 hover:text-white transition-all uppercase font-black tracking-widest">
            <RefreshCw size={13} className="text-indigo-400 group-hover:rotate-180 transition-transform duration-700" />
            重置空间
          </button>
        </div>

        <div className="flex items-center gap-6">
          <AnimatePresence mode="wait">
            {isExporting ? (
              <motion.button
                key="stop"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={() => abortControllerRef.current?.abort()}
                className="flex items-center gap-3 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl shadow-red-500/20"
              >
                <Square size={14} fill="currentColor" />
                停止渲染
              </motion.button>
            ) : (
              <motion.button
                key="play"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={processExportQueue}
                disabled={selectedIds.size === 0}
                className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl ${selectedIds.size === 0 ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' : 'bg-white text-black hover:bg-gray-100 hover:scale-[1.05] active:scale-95 shadow-white/10'
                  }`}
              >
                <Play size={14} fill="currentColor" className={selectedIds.size === 0 ? '' : 'text-indigo-600'} />
                批量渲染输出 ({selectedIds.size})
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 relative z-10">
        {/* Left Sidebar */}
        <div className="flex flex-col shrink-0 min-h-0" style={{ width: leftWidth }}>
          <EditorPanel title="项目资产 (Library)" flex={1} minWidth={180}>
            <Sidebar
              items={items}
              activeId={activeItemId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectAll={handleSelectAll}
              onImport={handleFilesUpload}
              onDelete={handleDelete}
            />
          </EditorPanel>
        </div>

        <PanelDivider onDrag={(dx) => setLeftWidth(prev => Math.max(180, prev + dx))} />

        {/* Middle Column */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Viewport */}
          <div className="flex-1 flex flex-col min-h-0 relative group">
            <EditorPanel title="Studio 实时渲染视口 (Viewport)" flex={1}>
              <div className="flex-1 flex flex-col min-h-0">
                <PreviewArea
                  activeItem={activeItem}
                  config={config}
                  onUpdateConfig={updateConfig}
                  onRendererReady={(r) => { rendererRef.current = r; }}
                />
              </div>

              {/* Floating Overlay Info */}
              <div className="absolute bottom-6 right-6 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0 z-30">
                <div className="bg-[#0b0c10]/90 backdrop-blur-2xl px-6 py-4 rounded-3xl border border-white/10 shadow-2xl flex items-center gap-5">
                  <div className="w-1 h-12 bg-indigo-500 rounded-full" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">渲染核心参数</span>
                    <span className="text-[14px] text-white font-mono font-medium">{config.width}x{config.height} <span className="text-white/40 px-1">/</span> {config.fps}fps</span>
                    <span className="text-[10px] text-white/50 mt-1 uppercase font-bold tracking-tighter">Real-time WebGL Pipeline</span>
                  </div>
                </div>
              </div>
            </EditorPanel>
          </div>

          <PanelDivider vertical onDrag={(dy) => setBottomHeight(prev => Math.max(100, prev - dy))} />

          {/* Bottom Asset Inspector */}
          <div style={{ height: bottomHeight }} className="shrink-0 flex flex-col min-h-0">
            <EditorPanel title="资产看板 / 依赖映射 (Pipeline Inspector)" flex={1}>
              <AssetPanel activeItem={activeItem} />
            </EditorPanel>
          </div>
        </div>

        <PanelDivider onDrag={(dx) => setRightWidth(prev => Math.max(200, prev - dx))} />

        {/* Right Sidebar */}
        <div className="flex flex-col shrink-0 min-h-0" style={{ width: rightWidth }}>
          <EditorPanel title="输出属性与参数" flex={1} minWidth={200}>
            <ExportPanel
              config={config}
              onUpdate={updateConfig}
              selectedCount={selectedIds.size}
              isExporting={isExporting}
              onStartExport={processExportQueue}
              onCancelExport={() => abortControllerRef.current?.abort()}
              totalItems={items.length}
            />
          </EditorPanel>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-10 bg-black/60 backdrop-blur-3xl border-t border-white/10 flex items-center px-8 justify-between shrink-0 z-20">
        <div className="flex items-center gap-6 text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>核心环境就绪</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <span>队列总数: {items.length}</span>
          <span>已选: {selectedIds.size}</span>
        </div>

        <AnimatePresence>
          {isExporting && progress && (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="flex items-center gap-6"
            >
              <span className="text-[10px] font-black text-white/90 uppercase tracking-[0.2em] animate-pulse">正在处理: {progress.currentName}</span>
              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden p-[2px]">
                <motion.div
                  className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-white/60">{progress.current} / {progress.total}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
