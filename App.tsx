import React, { useState, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { PreviewArea } from './components/PreviewArea';
import { ExportPanel } from './components/ExportPanel';
import { AssetPanel } from './components/AssetPanel';
import { EditorPanel, PanelDivider, PanelMenuItem } from './components/EditorPanel';
import { ActionTemplatePanel } from './components/ActionTemplatePanel';
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
  RefreshCw,
  PanelsTopLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LAYOUT_STORAGE_KEY = 'actionhub.layout.v1';

type LayoutStateV1 = {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  showLeft: boolean;
  showRight: boolean;
  showBottom: boolean;
  assetDock: 'bottom' | 'right';
  rightTab: 'export' | 'template' | 'asset';
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const isRightTab = (v: unknown): v is LayoutStateV1['rightTab'] => v === 'export' || v === 'template' || v === 'asset';
const isAssetDock = (v: unknown): v is LayoutStateV1['assetDock'] => v === 'bottom' || v === 'right';

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
  const [rightTab, setRightTab] = useState<'export' | 'template' | 'asset'>('export');
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [assetDock, setAssetDock] = useState<'bottom' | 'right'>('bottom');

  // Refs
  const rendererRef = useRef<SpineRenderer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const layoutHydratedRef = useRef(false);

  // --- Handlers ---
  const handleFilesUpload = useCallback((files: FileList) => {
    const newItems = groupFilesByDirectory(files);
    setItems(prev => {
      const updated = [...prev, ...newItems];
      // 自动全选新导入的资产
      setSelectedIds(prevSelected => {
        const next = new Set(prevSelected);
        newItems.forEach(item => next.add(item.id));
        return next;
      });
      return updated;
    });
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
  const handleAnimationsLoaded = useCallback((itemId: string, animationNames: string[]) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const prevNames = item.animationNames || [];
      if (prevNames.length === animationNames.length && prevNames.every((v, i) => v === animationNames[i])) {
        return item;
      }
      return { ...item, animationNames };
    }));
  }, []);

  // --- Persist Layout ---
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const next: LayoutStateV1 = {
        leftWidth: clampNumber(parsed.leftWidth, 180, 800, 260),
        rightWidth: clampNumber(parsed.rightWidth, 200, 900, 300),
        bottomHeight: clampNumber(parsed.bottomHeight, 100, 600, 240),
        showLeft: Boolean(parsed.showLeft),
        showRight: Boolean(parsed.showRight),
        showBottom: Boolean(parsed.showBottom),
        assetDock: isAssetDock(parsed.assetDock) ? parsed.assetDock : 'bottom',
        rightTab: isRightTab(parsed.rightTab) ? parsed.rightTab : 'export',
      };
      if (next.assetDock !== 'right' && next.rightTab === 'asset') {
        next.rightTab = 'export';
      }

      setLeftWidth(next.leftWidth);
      setRightWidth(next.rightWidth);
      setBottomHeight(next.bottomHeight);
      setShowLeft(next.showLeft);
      setShowRight(next.showRight);
      setAssetDock(next.assetDock);
      setRightTab(next.rightTab);

      // 兼容：如果看板停靠到右侧，底部栏应隐藏
      setShowBottom(next.assetDock === 'right' ? false : next.showBottom);
    } catch (e) {
      console.warn('布局缓存读取失败，将使用默认布局:', e);
    } finally {
      // 避免首次 mount 时把默认布局写回覆盖缓存：推迟到本轮 effects 之后再允许写入
      Promise.resolve().then(() => { layoutHydratedRef.current = true; });
    }
  }, []);

  React.useEffect(() => {
    if (!layoutHydratedRef.current) return;
    try {
      const payload: LayoutStateV1 = {
        leftWidth,
        rightWidth,
        bottomHeight,
        showLeft,
        showRight,
        showBottom,
        assetDock,
        rightTab,
      };
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 忽略：隐身窗口/存储不可用等情况
    }
  }, [leftWidth, rightWidth, bottomHeight, showLeft, showRight, showBottom, assetDock, rightTab]);

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
    setShowLeft(true);
    setShowRight(true);
    setShowBottom(true);
    setAssetDock('bottom');
    setRightTab('export');
  };

  const focusPreview = () => {
    setShowLeft(false);
    setShowRight(false);
    setShowBottom(false);
  };

  const dockAssetToRight = () => {
    setAssetDock('right');
    setShowBottom(false);
    setShowRight(true);
    setRightTab('asset');
  };

  const dockAssetToBottom = () => {
    setAssetDock('bottom');
    setShowBottom(true);
    if (rightTab === 'asset') setRightTab('export');
  };

  const rightPanelMenuItems: PanelMenuItem[] = [
    { label: '隐藏右侧栏', onClick: () => setShowRight(false) },
    ...(assetDock === 'right'
      ? [{ label: '还原看板到底部', onClick: dockAssetToBottom }]
      : [{ label: '合并看板到右侧', onClick: dockAssetToRight }]),
    { label: '专注预览', onClick: focusPreview },
    { label: '重置布局', onClick: resetLayout },
  ];

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
          <button
            onClick={focusPreview}
            className="group flex items-center gap-2.5 text-[10px] text-white/60 hover:text-white transition-all uppercase font-black tracking-widest"
            title="隐藏左右与底部面板，专注预览"
          >
            <PanelsTopLeft size={13} className="text-indigo-400" />
            专注预览
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl p-1.5">
            <button
              onClick={() => setShowLeft(v => !v)}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showLeft ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title={showLeft ? '隐藏左侧栏' : '显示左侧栏'}
            >
              左
            </button>
            <button
              onClick={() => {
                if (assetDock === 'right') {
                  dockAssetToBottom();
                } else {
                  setShowBottom(v => !v);
                }
              }}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showBottom ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title={assetDock === 'right' ? '还原看板到底部' : (showBottom ? '隐藏底部栏' : '显示底部栏')}
            >
              底
            </button>
            <button
              onClick={() => setShowRight(v => !v)}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showRight ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title={showRight ? '隐藏右侧栏' : '显示右侧栏'}
            >
              右
            </button>
          </div>
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
        {showLeft && (
          <>
            <div className="flex flex-col shrink-0 min-h-0" style={{ width: leftWidth }}>
              <EditorPanel
                title="项目资产 (Library)"
                flex={1}
                minWidth={180}
                menuItems={[
                  { label: '隐藏左侧栏', onClick: () => setShowLeft(false) },
                  { label: '专注预览', onClick: focusPreview },
                  { label: '重置布局', onClick: resetLayout },
                ]}
              >
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
          </>
        )}

        {/* Middle Column */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Viewport */}
          <div className="flex-1 flex flex-col min-h-0 relative group">
            <EditorPanel
              title="Studio 实时渲染视口 (Viewport)"
              flex={1}
              menuItems={[
                { label: showLeft ? '隐藏左侧栏' : '显示左侧栏', onClick: () => setShowLeft(v => !v) },
                { label: showRight ? '隐藏右侧栏' : '显示右侧栏', onClick: () => setShowRight(v => !v) },
                {
                  label: assetDock === 'right'
                    ? '还原看板到底部'
                    : (showBottom ? '隐藏底部栏' : '显示底部栏'),
                  onClick: () => {
                    if (assetDock === 'right') dockAssetToBottom();
                    else setShowBottom(v => !v);
                  }
                },
                { label: '专注预览', onClick: focusPreview },
                { label: '重置布局', onClick: resetLayout },
              ]}
            >
              <div className="flex-1 flex flex-col min-h-0">
                <PreviewArea
                  activeItem={activeItem}
                  config={config}
                  onUpdateConfig={updateConfig}
                  onRendererReady={(r) => { rendererRef.current = r; }}
                  onAnimationsLoaded={handleAnimationsLoaded}
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

          {showBottom && (
            <>
              <PanelDivider vertical onDrag={(dy) => setBottomHeight(prev => Math.max(100, prev - dy))} />

              {/* Bottom Asset Inspector */}
              <div style={{ height: bottomHeight }} className="shrink-0 flex flex-col min-h-0">
                <EditorPanel
                  title="资产看板 / 依赖映射 (Pipeline Inspector)"
                  flex={1}
                  menuItems={[
                    { label: '隐藏底部栏', onClick: () => setShowBottom(false) },
                    { label: '合并到右侧栏', onClick: dockAssetToRight },
                    { label: '重置布局', onClick: resetLayout },
                  ]}
                >
                  <AssetPanel activeItem={activeItem} />
            </EditorPanel>
          </div>
            </>
          )}
        </div>

        {showRight && (
          <>
            <PanelDivider onDrag={(dx) => setRightWidth(prev => Math.max(200, prev - dx))} />

            {/* Right Sidebar */}
            <div className="flex flex-col shrink-0 min-h-0" style={{ width: rightWidth }}>
              <EditorPanel
                title={rightTab === 'export' ? '输出属性与参数' : rightTab === 'template' ? '动作模板制作' : '资产看板'}
                flex={1}
                minWidth={200}
                menuItems={rightPanelMenuItems}
              >
                <div className="h-full flex flex-col">
                  <div className="px-6 pt-4 pb-3 flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRightTab('export')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'export'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      导出
                    </button>
                    <button
                      onClick={() => setRightTab('template')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'template'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      模板
                    </button>
                    <button
                      onClick={() => {
                        if (assetDock !== 'right') dockAssetToRight();
                        else setRightTab('asset');
                      }}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'asset'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                      title={assetDock === 'right' ? '查看资产看板' : '合并资产看板到右侧'}
                    >
                      看板
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col">
                    {rightTab === 'export' ? (
                      <ExportPanel
                        config={config}
                        onUpdate={updateConfig}
                        selectedCount={selectedIds.size}
                        isExporting={isExporting}
                        onStartExport={processExportQueue}
                        onCancelExport={() => abortControllerRef.current?.abort()}
                        totalItems={items.length}
                      />
                    ) : rightTab === 'template' ? (
                      <ActionTemplatePanel
                        activeItem={activeItem}
                        animationNames={activeItem?.animationNames || []}
                        manifest={config.naming.manifest}
                        defaults={{
                          view: config.naming.view,
                          category: config.naming.defaultCategory,
                          dir: config.naming.defaultDir,
                          type: config.naming.defaultType,
                        }}
                        disabled={isExporting}
                        onUpdateManifest={(m) => updateConfig({ naming: { ...config.naming, manifest: m } })}
                      />
                    ) : (
                      <AssetPanel activeItem={activeItem} />
                    )}
                  </div>
                </div>
              </EditorPanel>
            </div>
          </>
        )}
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
