import React, { useState, useCallback, useRef } from 'react';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { PreviewArea } from './components/PreviewArea';
import { ExportPanel } from './components/ExportPanel';
import { AnimationItem, ExportConfig, ExportProgress } from './types';
import { DEFAULT_CONFIG } from './constants';
import { groupFilesByDirectory } from './services/spineLoader';
import { SpineRenderer } from './services/spineRenderer';
import { CanvasRecorder } from './services/recorder';

const App: React.FC = () => {
  // State
  const [items, setItems] = useState<AnimationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_CONFIG);
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  
  // Refs for logic
  const rendererRef = useRef<SpineRenderer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Handlers ---

  const handleFilesUpload = useCallback((files: FileList) => {
    const newItems = groupFilesByDirectory(files);
    setItems(prev => {
      // Merge avoid duplicates by ID (though new uploads get new random IDs)
      return [...prev, ...newItems];
    });
  }, []);

  const handleSelect = useCallback((id: string, multi: boolean) => {
    // Set active for preview
    setActiveItemId(id);

    setSelectedIds(prev => {
      const newSet = new Set(multi ? prev : []);
      if (newSet.has(id)) {
        if (multi) newSet.delete(id); // Toggle off if multi
        else newSet.add(id); // Keep on if single (force select)
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(items.map(i => i.id)));
    }
  }, [items, selectedIds]);

  const handleDelete = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeItemId === id) setActiveItemId(null);
  }, [activeItemId]);

  const updateConfig = useCallback((cfg: Partial<ExportConfig>) => {
    setConfig(prev => ({ ...prev, ...cfg }));
  }, []);

  // --- Export Logic ---

  const processExportQueue = async () => {
    if (!rendererRef.current) return;
    
    setIsExporting(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const queue = items.filter(i => selectedIds.has(i.id));
    const total = queue.length;

    // Reset statuses
    setItems(prev => prev.map(item => 
      selectedIds.has(item.id) ? { ...item, status: 'waiting' } : item
    ));

    try {
      for (let i = 0; i < queue.length; i++) {
        if (signal.aborted) break;

        const item = queue[i];
        
        // Update UI: Current item exporting
        setProgress({ current: i + 1, total, currentName: item.name });
        setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'exporting' } : p));
        setActiveItemId(item.id); // Show in preview while exporting

        // 1. Load Asset
        const animations = await rendererRef.current.load(item.files);
        // Use first animation by default if none selected in metadata
        const animToPlay = animations.length > 0 ? animations[0] : null;

        if (animToPlay) {
          // 2. Setup Renderer for Export (Force Resolution)
          rendererRef.current.resize(config.width, config.height);
          rendererRef.current.setAnimation(animToPlay);
          
          // Wait a frame for setup
          await new Promise(r => setTimeout(r, 100));

          // 3. Record
          const recorder = new CanvasRecorder(rendererRef.current.canvas, config.fps);
          recorder.start(config.fps, config.width, config.height);

          // Wait for duration
          // In a real app, we would tick the renderer manually by a fixed time step here
          // instead of relying on real-time `setTimeout`.
          // For this demo, setTimeout is sufficient.
          await new Promise(resolve => setTimeout(resolve, config.duration * 1000));

          // 4. Stop & Download
          const blob = await recorder.stop();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          CanvasRecorder.download(blob, `${item.name}_${animToPlay}_${timestamp}.webm`);

          setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'completed' } : p));
        } else {
          console.warn(`No animation found for ${item.name}`);
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed' } : p));
        }

        // Small pause between items
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setIsExporting(false);
      setProgress(null);
      // Reset renderer size to visual container
      // (Requires resize event trigger or storing container dim, skipping for simplicity)
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExporting(false);
  };

  const activeItem = items.find(i => i.id === activeItemId) || null;

  return (
    <Layout>
      {/* File List */}
      <Sidebar 
        items={items} 
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onFilesUpload={handleFilesUpload}
        onDelete={handleDelete}
      />

      {/* Main Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <PreviewArea 
          activeItem={activeItem}
          config={config}
          onUpdateConfig={updateConfig}
          onRendererReady={(r) => { rendererRef.current = r; }}
        />
        
        {/* Bottom Progress Bar (only visible when exporting) */}
        {isExporting && progress && (
             <div className="h-12 bg-gray-800 border-t border-gray-700 flex items-center px-6 gap-4 animate-in slide-in-from-bottom">
                <span className="text-sm font-medium text-white whitespace-nowrap">
                    正在导出: {progress.currentName}
                </span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                </div>
                <span className="text-sm text-gray-400 font-mono">
                    {progress.current} / {progress.total}
                </span>
             </div>
        )}
      </div>

      {/* Configuration Panel */}
      <ExportPanel 
        config={config} 
        onUpdate={updateConfig}
        selectedCount={selectedIds.size}
        isExporting={isExporting}
        onStartExport={processExportQueue}
        onCancelExport={handleCancelExport}
        totalItems={items.length}
      />
    </Layout>
  );
};

export default App;
