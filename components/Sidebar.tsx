import React, { useRef } from 'react';
import { AnimationItem } from '../types';
import { FolderUp, Check, X, FileBox, Trash2, CheckSquare, Square, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  items: AnimationItem[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onFilesUpload: (files: FileList) => void;
  onDelete: (id: string) => void;
  onSelectAll: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  items, 
  selectedIds, 
  onSelect, 
  onFilesUpload,
  onDelete,
  onSelectAll
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesUpload(e.target.files);
    }
    // Reset to allow re-uploading same files if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const allSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col h-full shadow-xl z-10">
      {/* Header & Upload */}
      <div className="p-4 border-b border-gray-700 space-y-4">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          Spine 导出大师
        </h1>
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95"
        >
          <FolderUp size={20} />
          <span>导入动画文件夹</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          // @ts-ignore - webkitdirectory is standard but not in default React types
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFileChange}
        />
      </div>

      {/* List Actions */}
      <div className="px-4 py-2 bg-gray-800/50 flex justify-between items-center text-sm text-gray-400">
        <span>共 {items.length} 个动画</span>
        {items.length > 0 && (
            <button 
                onClick={onSelectAll}
                className="flex items-center gap-1 hover:text-indigo-400 transition-colors"
            >
                {allSelected ? <CheckSquare size={16}/> : <Square size={16}/>}
                <span>全选</span>
            </button>
        )}
      </div>

      {/* Animation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={clsx(
                "group relative flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors border border-transparent",
                selectedIds.has(item.id) 
                  ? "bg-indigo-900/40 border-indigo-500/50" 
                  : "hover:bg-gray-700/50"
              )}
              onClick={(e) => {
                // Multi-select with Cmd/Ctrl
                onSelect(item.id, e.metaKey || e.ctrlKey);
              }}
            >
              {/* Status Indicator */}
              <div className="shrink-0">
                {item.status === 'completed' && <Check className="text-green-400" size={18} />}
                {item.status === 'failed' && <X className="text-red-400" size={18} />}
                {item.status === 'exporting' && (
                  <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                )}
                {item.status === 'waiting' && <div className="w-2 h-2 rounded-full bg-gray-500 ml-1" />}
                {item.status === 'idle' && <FileBox className="text-gray-500" size={18} />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="font-medium text-sm truncate text-gray-200" title={item.name}>
                  {item.name}
                </div>
                
                {/* File Details: Skeleton Type & Image Count */}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                   <span className="truncate max-w-[120px]" title={item.files.skeleton?.name}>
                     {item.files.skeleton?.name}
                   </span>
                   <span className="w-0.5 h-3 bg-gray-600"></span>
                   <span className="flex items-center gap-1" title={`${item.files.images.length} images detected`}>
                     <ImageIcon size={10} />
                     {item.files.images.length}
                   </span>
                </div>
              </div>

              {/* Delete Button (visible on hover) */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-all"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {items.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">
            <p>暂无动画</p>
            <p className="mt-2 text-xs opacity-60">请点击上方按钮或拖拽文件夹</p>
            <p className="mt-1 text-[10px] opacity-40">支持包含 .skel/.atlas/.png 的文件夹</p>
          </div>
        )}
      </div>
    </div>
  );
};