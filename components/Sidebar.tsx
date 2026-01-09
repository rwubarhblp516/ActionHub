import React, { useRef } from 'react';
import { AnimationItem } from '../types';
import {
  FolderOpen,
  FileCode,
  Database,
  Check,
  X,
  FileBox,
  Trash2,
  CheckSquare,
  Square,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  items: AnimationItem[];
  activeId: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onImport: (files: FileList) => void;
  onDelete: (id: string) => void;
  onSelectAll: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  activeId,
  selectedIds,
  onSelect,
  onImport,
  onDelete,
  onSelectAll
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImport(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const allSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="flex flex-col h-full bg-transparent p-5 gap-6">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-1 pr-6">
        <span className="text-[10px] text-indigo-400 uppercase font-black tracking-[0.2em]">工程资源管线</span>
        <h2 className="text-2xl font-black text-white tracking-tighter">资产目录</h2>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="p-6 rounded-[32px] bg-white hover:bg-gray-100 transition-all cursor-pointer group relative overflow-hidden shadow-2xl shadow-white/20 active:scale-[0.98]"
      >
        <div className="flex items-center justify-between relative z-10">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-black/50 font-black uppercase tracking-widest">导入文件</span>
            <span className="text-[15px] text-black font-extrabold">导入工程文件夹</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FolderOpen size={20} className="text-indigo-600" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 text-[10px] font-black text-white/60 uppercase tracking-widest">
        <span>资产总计: {items.length}</span>
        {items.length > 0 && (
          <button
            onClick={onSelectAll}
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            {allSelected ? <CheckSquare size={14} className="text-indigo-400" /> : <Square size={14} />}
            <span>全选项目</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar -mr-4 pr-4">
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {items.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[40px] bg-white/[0.02] backdrop-blur-md"
              >
                <div className="w-16 h-16 rounded-3xl bg-white/[0.05] flex items-center justify-center mb-6">
                  <Database size={24} className="text-white/40" />
                </div>
                <span className="text-[11px] text-white/60 font-black uppercase tracking-widest text-center px-8 leading-relaxed">
                  导入骨骼动画导出目录<br />
                  <span className="text-white/40 text-[9px] font-bold">(包含 .json/.skel 与 .atlas)</span>
                </span>
              </motion.div>
            ) : (
              items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => onSelect(item.id, e.metaKey || e.ctrlKey)}
                  className={`
                                        group relative p-5 rounded-[28px] cursor-pointer transition-all border backdrop-blur-md
                                        ${selectedIds.has(item.id)
                      ? 'bg-white/15 border-white/30 shadow-2xl scale-[1.02]'
                      : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                    }
                                    `}
                >
                  <div className="flex items-center gap-4">
                    <div className={`
                                            w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg
                                            ${selectedIds.has(item.id) ? 'bg-indigo-500 shadow-indigo-500/30' : 'bg-white/5 group-hover:bg-white/10'}
                                        `}>
                      <FileCode size={20} className={selectedIds.has(item.id) ? 'text-white' : 'text-white/60'} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-[13px] font-black truncate transition-colors ${selectedIds.has(item.id) ? 'text-white' : 'text-white/90 group-hover:text-white'}`}>
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${selectedIds.has(item.id) ? 'text-white/70' : 'text-white/40'}`}>
                          运行时 3.8
                        </span>
                        {item.kind === 'assembly' && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 text-[8px] font-black uppercase tracking-widest border border-indigo-500/30">
                            装配预览
                          </span>
                        )}
                        {item.kind === 'template' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-[8px] font-black uppercase tracking-widest border border-emerald-500/30">
                            模板
                          </span>
                        )}
                        {item.status === 'completed' && <Check className="text-emerald-400" size={12} strokeWidth={3} />}
                        {item.status === 'exporting' && <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
