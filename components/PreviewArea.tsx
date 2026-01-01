import React, { useEffect, useRef, useState } from 'react';
import { AnimationItem, ExportConfig } from '../types';
import { SpineRenderer } from '../services/spineRenderer';
import { Maximize, ZoomIn, ZoomOut, Crosshair, Play, Loader2, AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

interface PreviewAreaProps {
  activeItem: AnimationItem | null;
  config: ExportConfig;
  onUpdateConfig: (cfg: Partial<ExportConfig>) => void;
  onRendererReady: (renderer: SpineRenderer) => void;
}

// 候选 CDN 列表，按优先级排序
const SPINE_CDN_URLS = [
    // jsDelivr 通常在国内速度较快且稳定
    "https://cdn.jsdelivr.net/npm/spine-ts@3.8.75/dist/spine-webgl.js",
    // 备用版本 (3.8.99 是 3.8 系列的最后一个版本，通常向下兼容)
    "https://cdn.jsdelivr.net/npm/spine-ts@3.8.99/dist/spine-webgl.js",
    // unpkg 备用
    "https://unpkg.com/spine-ts@3.8.75/dist/spine-webgl.js"
];

export const PreviewArea: React.FC<PreviewAreaProps> = ({ 
  activeItem, 
  config, 
  onUpdateConfig,
  onRendererReady 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SpineRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animations, setAnimations] = useState<string[]>([]);
  const [currentAnim, setCurrentAnim] = useState<string>('');
  
  const [spineState, setSpineState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMessage, setLoadingMessage] = useState('正在初始化...');

  // 动态脚本加载器
  useEffect(() => {
    // 如果已经加载过，不再重复加载
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
            script.onerror = () => reject(new Error(`Failed to load ${url}`));
            document.body.appendChild(script);
        });
    };

    const initSpine = async () => {
        for (let i = 0; i < SPINE_CDN_URLS.length; i++) {
            if (!isMounted) return;
            const url = SPINE_CDN_URLS[i];
            setLoadingMessage(`正在加载引擎 (尝试源 ${i + 1}/${SPINE_CDN_URLS.length})...`);
            
            try {
                await loadScript(url);
                // 简单的验证
                // @ts-ignore
                if (typeof window.spine !== 'undefined') {
                    if (isMounted) setSpineState('ready');
                    return;
                }
            } catch (e) {
                console.warn(`Source ${url} failed, trying next...`);
            }
        }
        if (isMounted) setSpineState('error');
    };

    initSpine();

    return () => { isMounted = false; };
  }, []);

  const handleRetryLoad = () => {
    setSpineState('loading');
    // 强制刷新页面是解决脚本加载问题最简单的方法
    window.location.reload();
  };

  // Initialize Renderer once Spine is ready
  useEffect(() => {
    if (spineState !== 'ready' || !canvasRef.current || rendererRef.current) return;

    try {
      const renderer = new SpineRenderer(canvasRef.current);
      rendererRef.current = renderer;
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

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
        if (containerRef.current && rendererRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            rendererRef.current.resize(width, height);
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial
    return () => window.removeEventListener('resize', handleResize);
  }, [spineState]);

  // Update Renderer Settings
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setBackgroundColor(config.backgroundColor);
    rendererRef.current.setScale(config.scale);
  }, [config.backgroundColor, config.scale, spineState]);

  // Load Asset when active item changes
  useEffect(() => {
    const loadAsset = async () => {
      if (activeItem && rendererRef.current) {
        setAnimations([]);
        try {
          const anims = await rendererRef.current.load(activeItem.files);
          setAnimations(anims);
          if (anims.length > 0) {
              setCurrentAnim(anims[0]);
              rendererRef.current.setAnimation(anims[0]);
          }
        } catch (e) {
          console.error("Load failed", e);
          // 可以在这里添加 Toast 提示加载失败
        }
      }
    };
    loadAsset();
  }, [activeItem, spineState]);

  return (
    <div className="flex-1 flex flex-col relative bg-gray-950 overflow-hidden">
      {/* Top Toolbar: Animations & Controls */}
      <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">当前动画</span>
            <div className="relative group">
                <select 
                value={currentAnim}
                onChange={(e) => {
                    setCurrentAnim(e.target.value);
                    rendererRef.current?.setAnimation(e.target.value);
                }}
                disabled={!activeItem || animations.length === 0}
                className="appearance-none bg-gray-700 text-white text-sm border border-gray-600 hover:border-indigo-500 rounded px-3 py-1 pr-8 min-w-[160px] focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {animations.length === 0 ? (
                        <option>等待加载...</option>
                    ) : (
                        animations.map(a => <option key={a} value={a} className="bg-gray-800">{a}</option>)
                    )}
                </select>
                {/* Custom arrow icon */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-lg border border-gray-700/50">
            {/* Visual Helpers Toggle */}
            <button className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="显示中心线">
                <Crosshair size={16} />
            </button>
            <div className="h-4 w-px bg-gray-700 mx-1"></div>
            
            <button 
                onClick={() => onUpdateConfig({ scale: Math.max(0.1, config.scale - 0.1) })}
                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                title="缩小"
            >
                <ZoomOut size={16} />
            </button>
            <span className="text-xs w-10 text-center text-gray-300 font-mono select-none">{Math.round(config.scale * 100)}%</span>
            <button 
                onClick={() => onUpdateConfig({ scale: Math.min(3.0, config.scale + 1) })}
                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                title="放大"
            >
                <ZoomIn size={16} />
            </button>
            <button 
                onClick={() => onUpdateConfig({ scale: 1.0 })}
                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-indigo-400 ml-1 transition-colors" 
                title="重置 100%"
            >
                <Maximize size={16} />
            </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="flex-1 relative bg-gray-900 overflow-hidden flex items-center justify-center">
        {/* Grid Background Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
        <div 
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
            backgroundSize: '200px 200px'
          }}
        />
        
        {/* Center Crosshair (Visual helper) */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
            <div className="w-full h-px bg-indigo-500 absolute"></div>
            <div className="h-full w-px bg-indigo-500 absolute"></div>
        </div>

        {/* The WebGL Canvas */}
        <canvas 
            ref={canvasRef} 
            className="block shadow-2xl shadow-black/50"
            // Style handles visual size, internal resolution handled by resize logic
            style={{ maxWidth: '100%', maxHeight: '100%', outline: 'none' }}
        />
        
        {spineState === 'loading' && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 backdrop-blur-sm z-50 text-gray-400">
                <Loader2 className="animate-spin text-indigo-500 mb-2" size={32} />
                <p>{loadingMessage}</p>
             </div>
        )}

        {spineState === 'error' && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 backdrop-blur-sm z-50 text-gray-400">
                <WifiOff className="text-red-500 mb-4" size={48} />
                <p className="text-xl font-bold text-gray-200 mb-2">Spine 引擎加载失败</p>
                <div className="bg-gray-800 p-4 rounded-lg mb-6 max-w-md text-sm text-left border border-gray-700">
                    <p className="mb-2 text-red-300">无法连接到 CDN 服务器。</p>
                    <p className="text-gray-400 mb-2">我们尝试了以下源但都失败了：</p>
                    <ul className="list-disc list-inside text-gray-500 text-xs font-mono mb-2">
                        <li>cdn.jsdelivr.net (3.8.75)</li>
                        <li>cdn.jsdelivr.net (3.8.99)</li>
                        <li>unpkg.com</li>
                    </ul>
                    <p className="text-gray-400">请检查您的网络连接。</p>
                </div>
                <button 
                    onClick={handleRetryLoad}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg shadow-indigo-500/20"
                >
                    <RefreshCw size={18} />
                    重新加载页面
                </button>
             </div>
        )}

        {spineState === 'ready' && !activeItem && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm z-10 text-gray-400 select-none">
                 <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4 shadow-lg border border-gray-700">
                    <Play className="text-gray-600 fill-current ml-1" size={32} />
                 </div>
                <p className="text-lg font-medium text-gray-300">准备就绪</p>
                <p className="text-sm text-gray-500 mt-2">请从左侧列表选择动画进行预览</p>
            </div>
        )}
      </div>
    </div>
  );
};