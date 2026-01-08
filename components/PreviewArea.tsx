import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AnimationItem, ExportConfig } from '../types';
import { SpineRenderer } from '../services/spineRenderer';
import { Maximize, ZoomIn, ZoomOut, Crosshair, Play, Loader2, AlertCircle, RefreshCw, WifiOff, ChevronLeft, ChevronRight, FileText, Layers } from 'lucide-react';
import { ProgressBar } from './ProgressBar';
import { normalizeCanonicalName } from '../services/actionHubNaming';

interface PreviewAreaProps {
  activeItem: AnimationItem | null;
  config: ExportConfig;
  onUpdateConfig: (cfg: Partial<ExportConfig>) => void;
  onRendererReady: (renderer: SpineRenderer) => void;
  onAnimationsLoaded?: (itemId: string, animationNames: string[]) => void;
}

// Spine 3.8 运行时 CDN 列表
const SPINE_CDN_URLS = [
  "/libs/spine-webgl.js", // 本地版本优先
  "https://fastly.jsdelivr.net/gh/EsotericSoftware/spine-runtimes@3.8/spine-ts/build/spine-webgl.js",
  "https://jsd.cdn.zzko.cn/gh/EsotericSoftware/spine-runtimes@3.8/spine-ts/build/spine-webgl.js"
];

export const PreviewArea: React.FC<PreviewAreaProps> = ({
  activeItem,
  config,
  onUpdateConfig,
  onRendererReady,
  onAnimationsLoaded
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SpineRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animations, setAnimations] = useState<string[]>([]);
  const [currentAnim, setCurrentAnim] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  const [setupPose, setSetupPose] = useState<boolean>(false);

  const [spineState, setSpineState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMessage, setLoadingMessage] = useState('正在初始化...');

  const resizeToContainer = useCallback(() => {
    if (!containerRef.current || !rendererRef.current || !canvasRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // 使用 devicePixelRatio 提升清晰度，并保证 WebGL viewport 与 CSS 尺寸同步，避免拖拽布局时“拉伸变形”
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.floor(rect.width);
    const cssH = Math.floor(rect.height);
    const pixelW = Math.max(1, Math.floor(rect.width * dpr));
    const pixelH = Math.max(1, Math.floor(rect.height * dpr));

    canvasRef.current.style.width = `${cssW}px`;
    canvasRef.current.style.height = `${cssH}px`;
    rendererRef.current.resize(pixelW, pixelH);
  }, []);

  // 动态加载 Spine 3.8 运行时
  useEffect(() => {
    // @ts-ignore
    if (typeof window.spine !== 'undefined') {
      setSpineState('ready');
      return;
    }

    let isMounted = true;

    const loadScript = (url: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`加载失败: ${url}`));
        document.body.appendChild(script);
      });
    };

    const initSpine = async () => {
      for (let i = 0; i < SPINE_CDN_URLS.length; i++) {
        if (!isMounted) return;
        const url = SPINE_CDN_URLS[i];
        setLoadingMessage(`正在加载引擎 (源 ${i + 1}/${SPINE_CDN_URLS.length})...`);

        try {
          await loadScript(url);
          // @ts-ignore
          if (typeof window.spine !== 'undefined') {
            if (isMounted) setSpineState('ready');
            return;
          }
        } catch (e) {
          console.warn(`${url} 加载失败，尝试下一个...`);
        }
      }
      if (isMounted) setSpineState('error');
    };

    initSpine();
    return () => { isMounted = false; };
  }, []);

  const handleRetryLoad = () => {
    setSpineState('loading');
    window.location.reload();
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportManifestTemplate = () => {
    if (!activeItem || animations.length === 0) return;

    const assetKey = activeItem.files.basePath || activeItem.name;
    const mappings: Record<string, any> = {};
    animations.forEach(anim => {
      const key = `${assetKey}::${anim}`;
      const suggestedName = normalizeCanonicalName(
        anim.includes('/') ? anim : `${config.naming.defaultCategory}/${anim}`
      );
      mappings[key] = { name: suggestedName };
    });

    const manifest = {
      version: '1.0',
      generated_date: new Date().toISOString(),
      defaults: {
        view: config.naming.view,
        category: config.naming.defaultCategory,
        dir: config.naming.defaultDir,
        type: config.naming.defaultType,
      },
      mappings,
    };

    downloadJson(manifest, `manifest_${activeItem.name}.json`);
  };

  // Initialize Renderer once Spine is ready
  useEffect(() => {
    if (spineState !== 'ready' || !canvasRef.current || rendererRef.current) return;

    try {
      const renderer = new SpineRenderer(canvasRef.current);
      rendererRef.current = renderer;

      // 立即应用初始配置
      const previewBg = config.backgroundColor === 'transparent' ? 'transparent' : config.backgroundColor;
      renderer.setBackgroundColor(previewBg);
      renderer.setScale(config.scale);
      renderer.setTargetFPS(config.fps); // 设置初始帧率

      // 立即设置正确的 canvas 尺寸（面板拖拽不会触发 window resize，因此后续使用 ResizeObserver 持续同步）
      resizeToContainer();

      renderer.start();
      onRendererReady(renderer);
    } catch (e) {
      console.error("Failed to initialize SpineRenderer", e);
      // 如果初始化失败，可能是因为脚本加载了但版本不对，或者 WebGL 不支持
      setLoadingMessage("引擎初始化失败: WebGL 可能不可用");
      setSpineState('error');
    }

    // Cleanup
    return () => {
      rendererRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spineState]);

  // Handle Resize (包括面板拖拽导致的容器尺寸变化)
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    // ResizeObserver 能覆盖 PanelDivider 改变布局但不触发 window resize 的情况
    const ro = new ResizeObserver(() => resizeToContainer());
    ro.observe(el);
    resizeToContainer();

    return () => ro.disconnect();
  }, [resizeToContainer, spineState]);

  // Update Renderer Settings
  useEffect(() => {
    if (!rendererRef.current) return;
    // Ensure the preview can show the grid if chose transparent or if we want clarity
    const previewBg = config.backgroundColor === 'transparent' ? 'transparent' : config.backgroundColor;
    rendererRef.current.setBackgroundColor(previewBg);
    rendererRef.current.setScale(config.scale);
    rendererRef.current.setTargetFPS(config.fps);
    rendererRef.current.setDebugEnabled(showSkeleton);
  }, [config.backgroundColor, config.scale, config.fps, showSkeleton]);

  // Load Asset when active item changes
  useEffect(() => {
    const loadAsset = async () => {
      if (!activeItem) {
        setAnimations([]);
        setCurrentAnim('');
        setSetupPose(false);
        return;
      }
      if (!rendererRef.current || spineState !== 'ready') return;

      console.log("PreviewArea: Loading asset", activeItem.name);
      setAnimations([]);
      try {
        const anims = await rendererRef.current.load(activeItem.files);
        setAnimations(anims);
        onAnimationsLoaded?.(activeItem.id, anims);
        if (anims.length > 0) {
          const defaultAnim = anims[0];
          setCurrentAnim(defaultAnim);
          rendererRef.current.setAnimation(defaultAnim);
          setSetupPose(false);
          console.log("PreviewArea: Set default animation", defaultAnim);
        }
      } catch (e) {
        console.error("PreviewArea: Load failure", e);
      }
    };
    loadAsset();
  }, [activeItem?.id, spineState]);

  // 键盘快捷键: 左右箭头切换动画
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeItem || animations.length === 0) return;

      const currentIndex = animations.indexOf(currentAnim);

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : animations.length - 1;
        const prevAnim = animations[prevIndex];
        setCurrentAnim(prevAnim);
        rendererRef.current?.setAnimation(prevAnim);
        setSetupPose(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIndex = currentIndex < animations.length - 1 ? currentIndex + 1 : 0;
        const nextAnim = animations[nextIndex];
        setCurrentAnim(nextAnim);
        rendererRef.current?.setAnimation(nextAnim);
        setSetupPose(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeItem, animations, currentAnim]);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      {/* Top Toolbar: Studio Controls */}
      <div className="h-14 bg-black/70 backdrop-blur-3xl border-b border-white/10 flex items-center px-6 justify-between shrink-0 z-20 shadow-xl">
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/60 uppercase font-black tracking-[0.25em]">当前动画 (Current Animation)</span>
            <div className="relative group">
              <select
                value={currentAnim}
                onChange={(e) => {
                  setCurrentAnim(e.target.value);
                  rendererRef.current?.setAnimation(e.target.value);
                  setSetupPose(false);
                }}
                disabled={!activeItem || animations.length === 0}
                className="appearance-none bg-white/[0.08] text-white text-[11px] font-black border border-white/20 hover:border-white/30 rounded-lg px-4 py-1.5 pr-10 min-w-[220px] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed group-hover:bg-white/[0.12] shadow-inner"
              >
                {animations.length === 0 ? (
                  <option className="bg-neutral-950">暂无工程资产</option>
                ) : (
                  animations.map(a => <option key={a} value={a} className="bg-neutral-950">{a}</option>)
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 group-hover:text-white/80 transition-colors">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-white/10 mx-2" />

          {/* Stats Display */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/60 uppercase font-black tracking-[0.25em]">视口同步状态 (Sync)</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/90">实时渲染引擎就绪</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/[0.05] p-1.5 rounded-xl border border-white/10 shadow-inner">
          <button
            onClick={() => {
              const next = !showSkeleton;
              setShowSkeleton(next);
              rendererRef.current?.setDebugEnabled(next);
            }}
            disabled={!activeItem}
            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${showSkeleton
              ? 'bg-indigo-500 text-white'
              : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="骨骼/包围盒调试预览"
          >
            <Layers size={14} className={showSkeleton ? 'text-white' : 'text-indigo-400'} />
            骨架
          </button>

          <button
            onClick={() => {
              const next = !setupPose;
              setSetupPose(next);
              rendererRef.current?.setSetupPoseMode(next);
              if (!next && currentAnim) {
                rendererRef.current?.setAnimation(currentAnim);
              }
            }}
            disabled={!activeItem}
            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${setupPose
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Setup Pose（用于骨架/绑定检查）"
          >
            Setup
          </button>

          <button
            onClick={handleExportManifestTemplate}
            disabled={!activeItem || animations.length === 0}
            className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            title="导出当前资产的 manifest 模板（动作模板映射）"
          >
            <FileText size={14} className="text-indigo-400" />
            Manifest
          </button>

          <div className="w-px h-5 bg-white/10 mx-1"></div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateConfig({ scale: Math.max(0.1, config.scale - 0.1) })}
              className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-all active:scale-95 group"
              title="缩小"
            >
              <ZoomOut size={16} className="group-hover:scale-110 transition-transform" />
            </button>

            <div className="px-3 min-w-[60px] text-center border-x border-white/5">
              <span className="text-[11px] text-white font-mono font-black select-none tracking-tighter">{Math.round(config.scale * 100)}%</span>
            </div>

            <button
              onClick={() => onUpdateConfig({ scale: Math.min(5.0, config.scale + 0.1) })}
              className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-all active:scale-95 group"
              title="放大"
            >
              <ZoomIn size={16} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>

          <div className="w-px h-5 bg-white/10 mx-1"></div>

          <button
            onClick={() => onUpdateConfig({ scale: 1.0 })}
            className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-indigo-400 transition-all active:scale-90"
            title="重置缩放"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Canvas 视口区域 */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{
          backgroundColor: config.backgroundColor === 'transparent' ? undefined : config.backgroundColor,
          // 透明时显示棋盘格背景以便清晰看到透明效果
          backgroundImage: config.backgroundColor === 'transparent'
            ? 'linear-gradient(45deg, #1a1b26 25%, transparent 25%), linear-gradient(-45deg, #1a1b26 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1b26 75%), linear-gradient(-45deg, transparent 75%, #1a1b26 75%)'
            : undefined,
          backgroundSize: config.backgroundColor === 'transparent' ? '20px 20px' : undefined,
          backgroundPosition: config.backgroundColor === 'transparent' ? '0 0, 0 10px, 10px -10px, -10px 0px' : undefined
        }}
      >
        {/* Playback Controls Overlay */}
        {spineState === 'ready' && activeItem && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-full z-40 shadow-2xl">
            {/* 动画切换按钮 */}
            <button
              onClick={() => {
                const currentIndex = animations.indexOf(currentAnim);
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : animations.length - 1;
                const prevAnim = animations[prevIndex];
                setCurrentAnim(prevAnim);
                rendererRef.current?.setAnimation(prevAnim);
                setSetupPose(false);
              }}
              disabled={animations.length <= 1}
              className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title="上一个动画 (←)"
            >
              <ChevronLeft size={16} />
            </button>

            {/* 播放/暂停按钮 */}
            <button
              onClick={() => {
                const newPlayingState = !isPlaying;
                setIsPlaying(newPlayingState);
                rendererRef.current?.setPaused(!newPlayingState);
              }}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-white/20"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <span className="w-3 h-3 bg-black rounded-[1px]" />
              ) : (
                <Play size={18} className="ml-1 fill-black" />
              )}
            </button>

            {/* 动画切换按钮 */}
            <button
              onClick={() => {
                const currentIndex = animations.indexOf(currentAnim);
                const nextIndex = currentIndex < animations.length - 1 ? currentIndex + 1 : 0;
                const nextAnim = animations[nextIndex];
                setCurrentAnim(nextAnim);
                rendererRef.current?.setAnimation(nextAnim);
                setSetupPose(false);
              }}
              disabled={animations.length <= 1}
              className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title="下一个动画 (→)"
            >
              <ChevronRight size={16} />
            </button>

            <div className="w-px h-6 bg-white/10" />

            {/* 帧率设置 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/50 font-black uppercase tracking-wider">帧率:</span>
              {[24, 30, 60].map(fps => (
                <button
                  key={fps}
                  onClick={() => {
                    onUpdateConfig({ fps });
                    if (rendererRef.current && typeof rendererRef.current.setTargetFPS === 'function') {
                      rendererRef.current.setTargetFPS(fps);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${config.fps === fps
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                >
                  {fps}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-white/10" />

            {/* Simple Progress Bar */}
            <ProgressBar renderer={rendererRef.current} />
          </div>
        )}

        {/* WebGL Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ outline: 'none' }}
        />

        {spineState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl z-50 text-white/70">
            <div className="relative">
              <Loader2 className="animate-spin text-indigo-500 mb-10" size={64} strokeWidth={1} />
              <div className="absolute inset-0 animate-ping opacity-30 bg-indigo-500 rounded-full scale-150 blur-3xl" />
            </div>
            <p className="text-[13px] font-black tracking-[0.4em] uppercase opacity-90">{loadingMessage}</p>
          </div>
        )}

        {spineState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl z-50 p-12 overflow-y-auto">
            <div className="w-28 h-28 rounded-[48px] bg-red-500/10 flex items-center justify-center mb-12 border border-red-500/20 shadow-2xl shadow-red-500/20">
              <WifiOff className="text-red-500" size={56} />
            </div>
            <p className="text-4xl font-black text-white mb-6 tracking-tight">连接协议异常</p>
            <p className="text-white/60 max-w-sm text-center mb-12 text-base leading-relaxed">环境初始化过程中发生冲突，无法稳定加载 Spine WebGL 运行时环境。</p>

            <button
              onClick={handleRetryLoad}
              className="group flex items-center gap-5 bg-white text-black px-12 py-6 rounded-3xl transition-all font-black uppercase text-[12px] tracking-widest hover:scale-105 active:scale-95 shadow-2xl shadow-white/20"
            >
              <RefreshCw size={20} className="group-hover:rotate-180 transition-transform duration-700" />
              重新建立协议连接
            </button>
          </div>
        )}

        {spineState === 'ready' && !activeItem && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 select-none">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex flex-col items-center"
            >
              <div className="w-32 h-32 rounded-[48px] bg-gradient-to-br from-indigo-500/30 to-transparent flex items-center justify-center mb-12 shadow-2xl border border-white/20 backdrop-blur-2xl group-hover:scale-110 transition-transform">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/40 flex items-center justify-center border border-indigo-500/30">
                  <Play className="text-indigo-300 fill-indigo-300/40 translate-x-1" size={42} strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-4xl font-black text-white mb-6 tracking-tight">等待资产管道就绪</h3>
              <div className="flex items-center gap-5 bg-white/[0.06] px-8 py-3.5 rounded-full border border-white/10 shadow-2xl backdrop-blur-md">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_15px_rgba(52,211,153,0.8)]" />
                <span className="text-[12px] font-black uppercase tracking-[0.25em] text-white/90">请从左侧资源管线选取一个动画项目</span>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};
